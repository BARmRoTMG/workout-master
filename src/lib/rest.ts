import { useSyncExternalStore } from 'react'

/**
 * The rest timer stores an end time rather than counting down, so it stays
 * correct when the phone locks or the app is backgrounded. The end beep is
 * scheduled on the audio clock up front, which keeps playing on platforms
 * that throttle JavaScript timers in the background.
 */

export interface RestState {
  endAt: number
  duration: number
}

const KEY = 'rest-timer'
let state: RestState | null = read()
const listeners = new Set<() => void>()

function read(): RestState | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as RestState | null
    return s && s.endAt > Date.now() ? s : null
  } catch {
    return null
  }
}

function set(next: RestState | null) {
  state = next
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next))
    else localStorage.removeItem(KEY)
  } catch {
    // Storage unavailable: the timer still works for this session.
  }
  scheduleBeep()
  listeners.forEach((l) => l())
}

export function useRest() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

export function startRest(seconds: number) {
  unlockAudio()
  set({ endAt: Date.now() + seconds * 1000, duration: seconds })
}

export function addRest(seconds: number) {
  if (!state) return
  const endAt = Math.max(Date.now(), state.endAt + seconds * 1000)
  set({ endAt, duration: Math.max(1, state.duration + seconds) })
}

export function stopRest() {
  set(null)
}

// ---------------------------------------------------------------------------
// Audio

let ctx: AudioContext | null = null
let scheduled: OscillatorNode[] = []

function unlockAudio() {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    ctx = null
  }
}

function scheduleBeep() {
  scheduled.forEach((o) => {
    try {
      o.stop()
    } catch {
      // Already stopped.
    }
  })
  scheduled = []
  if (!ctx || !state) return
  const at = ctx.currentTime + Math.max(0, (state.endAt - Date.now()) / 1000)
  for (let i = 0; i < 3; i++) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = i === 2 ? 1320 : 880
    gain.gain.setValueAtTime(0.0001, at + i * 0.22)
    gain.gain.exponentialRampToValueAtTime(0.35, at + i * 0.22 + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + i * 0.22 + 0.18)
    osc.connect(gain).connect(ctx.destination)
    osc.start(at + i * 0.22)
    osc.stop(at + i * 0.22 + 0.2)
    scheduled.push(osc)
  }
}
