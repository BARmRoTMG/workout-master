import { useSyncExternalStore } from 'react'
import { fmtClock } from './format'
import { appUrl, registerTimerAlerts, syncTimers, type TimedAlert } from './push'
import { scheduleTones, unlockAudio, type Tone } from './sound'

/**
 * Interval timer: a short get-ready countdown, then work and rest phases for a
 * number of rounds. Like the rest timer it stores times, not a countdown, so
 * it survives the phone locking or the app reloading.
 */

export interface IntervalConfig {
  /** Seconds. */
  work: number
  rest: number
  rounds: number
}

export interface IntervalRun {
  config: IntervalConfig
  startedAt: number
  /** Set while paused. */
  pausedAt: number | null
  /** Total time spent paused so far, ms. */
  pausedMs: number
}

export type PhaseKind = 'prep' | 'work' | 'rest'

export interface Phase {
  kind: PhaseKind
  round: number
  /** Offset from the start, seconds. */
  start: number
  len: number
}

export const PREP = 5

export const PRESETS: { name: string; config: IntervalConfig }[] = [
  { name: 'Tabata', config: { work: 20, rest: 10, rounds: 8 } },
  { name: 'Circuit', config: { work: 40, rest: 20, rounds: 8 } },
  { name: 'Plank', config: { work: 45, rest: 30, rounds: 3 } },
]

export function phases(c: IntervalConfig): Phase[] {
  const out: Phase[] = [{ kind: 'prep', round: 1, start: 0, len: PREP }]
  let t = PREP
  for (let r = 1; r <= c.rounds; r++) {
    out.push({ kind: 'work', round: r, start: t, len: c.work })
    t += c.work
    if (r < c.rounds && c.rest > 0) {
      out.push({ kind: 'rest', round: r, start: t, len: c.rest })
      t += c.rest
    }
  }
  return out
}

/** Work and rest time, without the get-ready countdown. */
export function totalSeconds(c: IntervalConfig) {
  return c.rounds * c.work + Math.max(0, c.rounds - 1) * c.rest
}

export function elapsedMs(run: IntervalRun, now: number) {
  return Math.max(0, (run.pausedAt ?? now) - run.startedAt - run.pausedMs)
}

export interface Position {
  /** Null once every round is done. */
  phase: Phase | null
  index: number
  /** Seconds left in this phase. */
  left: number
  /** Seconds left overall, get-ready included. */
  totalLeft: number
}

export function position(run: IntervalRun, now: number): Position {
  const list = phases(run.config)
  const t = elapsedMs(run, now) / 1000
  const end = list[list.length - 1].start + list[list.length - 1].len
  for (let i = 0; i < list.length; i++) {
    const p = list[i]
    if (t < p.start + p.len) return { phase: p, index: i, left: p.start + p.len - t, totalLeft: end - t }
  }
  return { phase: null, index: list.length, left: 0, totalLeft: 0 }
}

/** Wall-clock time a phase starts (or, for index === phases.length, the whole run ends). */
function boundaryAt(run: IntervalRun, list: Phase[], index: number) {
  const offset = index < list.length ? list[index].start : list[list.length - 1].start + list[list.length - 1].len
  return run.startedAt + run.pausedMs + offset * 1000
}

// ---------------------------------------------------------------------------
// State

const RUN_KEY = 'interval-run'
const CONFIG_KEY = 'interval-config'
const listeners = new Set<() => void>()
let run: IntervalRun | null = readRun()

function readJSON<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null
  } catch {
    return null
  }
}

function readRun(): IntervalRun | null {
  const r = readJSON<IntervalRun>(RUN_KEY)
  // A finished run from long ago isn't worth showing.
  if (r && r.pausedAt === null && position(r, Date.now()).phase === null) {
    const list = phases(r.config)
    if (Date.now() - boundaryAt(r, list, list.length) > 30 * 60_000) return null
  }
  return r
}

export function lastConfig(): IntervalConfig {
  return readJSON<IntervalConfig>(CONFIG_KEY) ?? PRESETS[1].config
}

export function saveConfig(c: IntervalConfig) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(c))
  } catch {
    // Not remembered; fine.
  }
}

function set(next: IntervalRun | null) {
  run = next
  try {
    if (next) localStorage.setItem(RUN_KEY, JSON.stringify(next))
    else localStorage.removeItem(RUN_KEY)
  } catch {
    // Storage unavailable: still runs for this session.
  }
  schedule()
  syncTimers()
  listeners.forEach((l) => l())
}

export function useIntervalRun() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => run,
  )
}

export function startIntervals(config: IntervalConfig) {
  unlockAudio()
  saveConfig(config)
  set({ config, startedAt: Date.now(), pausedAt: null, pausedMs: 0 })
}

export function pauseIntervals() {
  if (run && run.pausedAt === null) set({ ...run, pausedAt: Date.now() })
}

export function resumeIntervals() {
  unlockAudio()
  if (run && run.pausedAt !== null) set({ ...run, pausedMs: run.pausedMs + Date.now() - run.pausedAt, pausedAt: null })
}

export function stopIntervals() {
  set(null)
}

export function isRunning(r: IntervalRun | null, now: number) {
  return !!r && r.pausedAt === null && position(r, now).phase !== null
}

// ---------------------------------------------------------------------------
// Beeps and notifications at each change

/** Upcoming phase changes: what starts, and when. */
function upcoming(r: IntervalRun, now: number) {
  const list = phases(r.config)
  const out: { at: number; next: Phase | null; prev: Phase }[] = []
  for (let i = 1; i <= list.length; i++) {
    const at = boundaryAt(r, list, i)
    if (at > now) out.push({ at, next: list[i] ?? null, prev: list[i - 1] })
  }
  return out
}

function schedule() {
  const now = Date.now()
  if (!run || run.pausedAt !== null) {
    scheduleTones('iv', [])
    return
  }
  const tones: Tone[] = []
  for (const { at, next, prev } of upcoming(run, now)) {
    // 3-2-1 before each change, if the phase is long enough to hear it.
    if (prev.len >= 4) for (const s of [3, 2, 1]) tones.push({ at: at - s * 1000, freq: 660, dur: 0.09, gain: 0.25 })
    if (!next) tones.push(...[0, 1, 2].map((i) => ({ at: at + i * 220, freq: [880, 1100, 1320][i], dur: 0.2 })))
    else tones.push({ at, freq: next.kind === 'work' ? 990 : 520, dur: 0.5 })
  }
  scheduleTones('iv', tones)
}

registerTimerAlerts('iv', (): TimedAlert[] => {
  if (!run || run.pausedAt !== null) return []
  const { rounds, rest } = run.config
  const url = appUrl('timer')
  return upcoming(run, Date.now()).map(({ at, next }) => ({
    at,
    tag: 'iv',
    url,
    ...(next === null
      ? { title: 'Intervals done', body: `${rounds} round${rounds === 1 ? '' : 's'}, ${fmtClock(totalSeconds(run!.config))}. Nice work.` }
      : next.kind === 'work'
        ? { title: `Go · round ${next.round} of ${rounds}`, body: `${run!.config.work} s of work` }
        : { title: 'Rest', body: `${rest} s, then round ${next.round + 1} of ${rounds}` }),
  }))
})

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && schedule())
}
