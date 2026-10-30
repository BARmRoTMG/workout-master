import { DEFAULT_FOR, type Exercise } from '../data/exercises'
import type { BodyWeight, Settings, SetEntry, Unit, Workout, WorkoutExercise } from '../db'
import { LOWER_BODY, MUSCLES, MUSCLE_SIZE, RECOVERY_HOURS, type Muscle } from './muscles'

export type ExerciseMap = Map<string, Exercise>

const HOUR = 3_600_000
const DAY = 24 * HOUR

// ---------------------------------------------------------------------------
// Sets and history

export interface DoneSet {
  weight: number
  reps: number
}

export function doneSets(we: WorkoutExercise): DoneSet[] {
  return we.sets
    .filter((s) => s.done && (s.reps ?? 0) > 0)
    .map((s) => ({ weight: s.weight ?? 0, reps: s.reps ?? 0 }))
}

export interface Session {
  workoutId: number
  date: number
  sets: DoneSet[]
}

/** Finished sessions of one exercise, most recent first, optionally only those before a time. */
export function exerciseHistory(workouts: Workout[], exerciseId: string, before = Infinity): Session[] {
  const out: Session[] = []
  for (const w of workouts) {
    if (w.finishedAt === null || w.startedAt >= before) continue
    const sets = w.exercises.filter((e) => e.exerciseId === exerciseId).flatMap(doneSets)
    if (sets.length) out.push({ workoutId: w.id ?? 0, date: w.startedAt, sets })
  }
  return out.sort((a, b) => b.date - a.date)
}

/** Estimated one-rep max (Epley). */
export function e1rm(weight: number, reps: number) {
  return reps <= 1 ? weight : weight * (1 + reps / 30)
}

export function bestSet(sets: DoneSet[]): DoneSet | undefined {
  let best: DoneSet | undefined
  for (const s of sets) {
    if (!best || e1rm(s.weight, s.reps) > e1rm(best.weight, best.reps)) best = s
  }
  return best
}

// ---------------------------------------------------------------------------
// Progression (double progression)

export function incrementFor(ex: Exercise, unit: Unit): number {
  const lower = LOWER_BODY.has(ex.primary)
  switch (ex.equipment) {
    case 'bodyweight':
      return 0
    case 'dumbbell':
      return unit === 'kg' ? 2 : 5
    default:
      return unit === 'kg' ? (lower ? 5 : 2.5) : lower ? 10 : 5
  }
}

export function roundTo(value: number, step: number) {
  return Number((Math.round(value / step) * step).toFixed(2))
}

export interface Target {
  weight: number | null
  /** One rep target per set. */
  reps: (number | null)[]
  rule: 'first' | 'increase' | 'repeat' | 'deload' | 'bodyweight'
  note: string
}

const topWeight = (sets: DoneSet[]) => Math.max(...sets.map((s) => s.weight))

/**
 * Double progression: stay at a weight and add reps until every set reaches the
 * top of the rep range, then add weight and start again at the bottom.
 * Missing the bottom of the range two sessions running triggers a 10% deload.
 */
export function nextTarget(ex: Exercise, history: Session[], setCount: number, unit: Unit): Target {
  const last = history[0]
  if (!last) {
    return {
      weight: null,
      reps: Array(setCount).fill(null),
      rule: 'first',
      note: `First time: pick a weight you can lift ${ex.repMin}–${ex.repMax} times with 1–2 reps to spare`,
    }
  }

  const top = topWeight(last.sets)
  const work = last.sets.filter((s) => s.weight === top)
  const repsAt = (i: number) => (work[i] ?? work[work.length - 1]).reps
  const inc = incrementFor(ex, unit)
  const allAtTop = work.length >= setCount && work.every((s) => s.reps >= ex.repMax)

  if (inc === 0) {
    return {
      weight: top,
      reps: Array.from({ length: setCount }, (_, i) => repsAt(i) + 1),
      rule: 'bodyweight',
      note: allAtTop
        ? `Past ${ex.repMax} reps: add weight or try a harder variation`
        : 'Add a rep to each set',
    }
  }

  if (allAtTop) {
    return {
      weight: roundTo(top + inc, inc / 2),
      reps: Array(setCount).fill(ex.repMin),
      rule: 'increase',
      note: `+${inc} ${unit}: you hit ${ex.repMax} reps on every set last time`,
    }
  }

  const missed = (s: Session) => {
    const t = topWeight(s.sets)
    return t === top && s.sets.some((x) => x.weight === t && x.reps < ex.repMin)
  }
  const prev = history[1]
  if (missed(last) && prev && missed(prev)) {
    let weight = roundTo(top * 0.9, inc / 2)
    if (weight >= top) weight = top - inc
    return {
      weight: Math.max(weight, 0),
      reps: Array(setCount).fill(ex.repMin),
      rule: 'deload',
      note: `Under ${ex.repMin} reps two sessions running: drop ~10% and build back up`,
    }
  }

  return {
    weight: top,
    reps: Array.from({ length: setCount }, (_, i) =>
      Math.min(ex.repMax, Math.max(ex.repMin, repsAt(i) + 1)),
    ),
    rule: 'repeat',
    note: `Same weight: beat last time by a rep (move up once every set hits ${ex.repMax})`,
  }
}

export function setsFromTarget(target: Target, setCount: number): SetEntry[] {
  return Array.from({ length: setCount }, (_, i) => ({
    weight: target.weight,
    reps: target.reps[i] ?? null,
    done: false,
  }))
}

// ---------------------------------------------------------------------------
// Recovery and volume

const zeroes = () => Object.fromEntries(MUSCLES.map((m) => [m, 0])) as Record<Muscle, number>

/** Fatigue added to a muscle by one hard set, in percentage points. Secondary muscles get half. */
const SET_FATIGUE = 20
export const READY_AT = 70

/**
 * 0–100 per muscle. Each hard set adds fatigue that fades linearly over the
 * muscle's recovery window (48–72 h depending on size).
 */
export function muscleFreshness(workouts: Workout[], exMap: ExerciseMap, now: number) {
  const fatigue = zeroes()
  for (const w of workouts) {
    if (w.finishedAt === null) continue
    const hours = (now - w.finishedAt) / HOUR
    if (hours < 0) continue
    const add = (m: Muscle, amount: number) => {
      fatigue[m] += amount * Math.max(0, 1 - hours / RECOVERY_HOURS[MUSCLE_SIZE[m]])
    }
    for (const we of w.exercises) {
      const ex = exMap.get(we.exerciseId)
      const n = doneSets(we).length
      if (!ex || !n) continue
      add(ex.primary, n * SET_FATIGUE)
      for (const m of ex.secondary) add(m, (n * SET_FATIGUE) / 2)
    }
  }
  const out = zeroes()
  for (const m of MUSCLES) out[m] = Math.round(Math.min(100, Math.max(0, 100 - fatigue[m])))
  return out
}

/** Hard sets per muscle over the last `days` days. Secondary muscles count half a set. */
export function weeklySets(workouts: Workout[], exMap: ExerciseMap, now: number, days = 7) {
  const sets = zeroes()
  for (const w of workouts) {
    if (w.finishedAt === null || w.startedAt < now - days * DAY || w.startedAt > now) continue
    for (const we of w.exercises) {
      const ex = exMap.get(we.exerciseId)
      const n = doneSets(we).length
      if (!ex || !n) continue
      sets[ex.primary] += n
      for (const m of ex.secondary) sets[m] += n / 2
    }
  }
  return sets
}

// ---------------------------------------------------------------------------
// Exercise order

const MUSCLE_PRIORITY: Muscle[] = [
  'quads',
  'hamstrings',
  'glutes',
  'chest',
  'back',
  'shoulders',
  'triceps',
  'biceps',
  'calves',
  'abs',
]

/** 0 big compounds, 1 other compounds, 2 isolation for big muscles, 3 arms, 4 calves and abs. */
function tier(ex: Exercise) {
  if (ex.kind === 'compound') return MUSCLE_SIZE[ex.primary] === 'large' ? 0 : 1
  if (ex.primary === 'calves' || ex.primary === 'abs') return 4
  return MUSCLE_SIZE[ex.primary] === 'small' ? 3 : 2
}

function reasonFor(ex: Exercise): string {
  switch (tier(ex)) {
    case 0:
      return "Big compound lift: do it first while you're fresh"
    case 1:
      return ex.primary === 'shoulders'
        ? 'Compound press: after the big lifts, before arms'
        : 'Compound: after the big lifts'
    case 2:
      return 'Isolation: after the compound lifts'
    case 3:
      return ex.primary === 'triceps'
        ? "Late, so tired triceps don't hold back your presses"
        : "Late, so tired biceps don't hold back your rows and pulldowns"
    default:
      return 'Small muscle: finish with it'
  }
}

export interface Ordered {
  exercise: Exercise
  reason: string
}

/**
 * Compounds before isolation, big muscles before small, arms after the lifts
 * they assist, calves and abs last. Within a tier, alternate lower and upper
 * body so each region gets a breather.
 */
export function orderExercises(list: Exercise[]): Ordered[] {
  const out: Exercise[] = []
  for (let t = 0; t <= 4; t++) {
    const group = list
      .filter((ex) => tier(ex) === t)
      .sort((a, b) => MUSCLE_PRIORITY.indexOf(a.primary) - MUSCLE_PRIORITY.indexOf(b.primary))
    const lower = group.filter((ex) => LOWER_BODY.has(ex.primary))
    const upper = group.filter((ex) => !LOWER_BODY.has(ex.primary))
    let wantLower = out.length === 0 || !LOWER_BODY.has(out[out.length - 1].primary)
    while (lower.length || upper.length) {
      const pick = (wantLower && lower.length) || !upper.length ? lower.shift()! : upper.shift()!
      out.push(pick)
      wantLower = !LOWER_BODY.has(pick.primary)
    }
  }
  return out.map((exercise) => ({ exercise, reason: reasonFor(exercise) }))
}

// ---------------------------------------------------------------------------
// Today's suggestion

function lastUsedFor(muscle: Muscle, workouts: Workout[], exMap: ExerciseMap): Exercise | undefined {
  const finished = workouts.filter((w) => w.finishedAt !== null).sort((a, b) => b.startedAt - a.startedAt)
  for (const w of finished) {
    for (const we of w.exercises) {
      const ex = exMap.get(we.exerciseId)
      if (ex?.primary === muscle && doneSets(we).length) return ex
    }
  }
}

export interface SuggestedItem extends Ordered {
  target: Target
}

export interface Suggestion {
  items: SuggestedItem[]
  recovering: { muscle: Muscle; freshness: number }[]
  restDay: boolean
  freshness: Record<Muscle, number>
  weekly: Record<Muscle, number>
  minutes: number
}

export function suggestWorkout(opts: {
  workouts: Workout[]
  exMap: ExerciseMap
  settings: Settings
  now: number
  includeRecovering?: boolean
}): Suggestion {
  const { workouts, exMap, settings, now } = opts
  const freshness = muscleFreshness(workouts, exMap, now)
  const weekly = weeklySets(workouts, exMap, now)
  const plan = settings.planMuscles
  const ready = plan.filter((m) => freshness[m] >= READY_AT)
  const recovering = plan
    .filter((m) => freshness[m] < READY_AT)
    .map((muscle) => ({ muscle, freshness: freshness[muscle] }))

  const chosen: Exercise[] = []
  for (const m of opts.includeRecovering ? plan : ready) {
    const ex = lastUsedFor(m, workouts, exMap) ?? exMap.get(DEFAULT_FOR[m])
    if (ex && !chosen.includes(ex)) chosen.push(ex)
  }

  const items = orderExercises(chosen).map((o) => ({
    ...o,
    target: nextTarget(o.exercise, exerciseHistory(workouts, o.exercise.id), settings.setsPerExercise, settings.unit),
  }))

  return {
    items,
    recovering,
    restDay: ready.length < Math.ceil(plan.length / 2),
    freshness,
    weekly,
    minutes: estimateMinutes(items.map((i) => i.exercise), settings),
  }
}

export function restFor(ex: Exercise | undefined, settings: Settings) {
  return ex?.kind === 'compound' ? settings.restCompound : settings.restIsolation
}

/** Rough session length: each set is ~40 s of work plus rest, plus ~2 min to set up each exercise. */
export function estimateMinutes(exercises: Exercise[], settings: Settings) {
  const secs = exercises.reduce(
    (sum, ex) => sum + settings.setsPerExercise * (40 + restFor(ex, settings)) + 120,
    0,
  )
  return Math.round(secs / 60 / 5) * 5
}

// ---------------------------------------------------------------------------
// Personal records

export interface PR {
  exerciseId: string
  set: DoneSet
  previous: DoneSet
}

/** Exercises in this workout whose best set beats every earlier session by estimated 1RM. */
export function personalRecords(workout: Workout, workouts: Workout[]): PR[] {
  const out: PR[] = []
  const seen = new Set<string>()
  for (const we of workout.exercises) {
    if (seen.has(we.exerciseId)) continue
    seen.add(we.exerciseId)
    const sets = workout.exercises.filter((e) => e.exerciseId === we.exerciseId).flatMap(doneSets)
    const best = bestSet(sets)
    const previous = bestSet(exerciseHistory(workouts, we.exerciseId, workout.startedAt).flatMap((s) => s.sets))
    if (best && previous && best.weight > 0 && e1rm(best.weight, best.reps) > e1rm(previous.weight, previous.reps)) {
      out.push({ exerciseId: we.exerciseId, set: best, previous })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Body weight

const dayNumber = (date: string) => Date.parse(date + 'T00:00:00Z') / DAY

/** Trailing 7-day average for each entry. Entries must be sorted by date ascending. */
export function trendLine(entries: BodyWeight[]) {
  return entries.map((e, i) => {
    const d = dayNumber(e.date)
    let sum = 0
    let n = 0
    for (let j = i; j >= 0 && d - dayNumber(entries[j].date) < 7; j--) {
      sum += entries[j].weight
      n++
    }
    return { date: e.date, avg: sum / n }
  })
}

/**
 * Change per week from a least-squares fit over the last 28 days.
 * Null until there are at least 3 weigh-ins spanning a week.
 */
export function weeklyRate(entries: BodyWeight[]): number | null {
  if (!entries.length) return null
  const end = dayNumber(entries[entries.length - 1].date)
  const pts = entries.filter((e) => end - dayNumber(e.date) <= 28).map((e) => [dayNumber(e.date), e.weight])
  if (pts.length < 3 || end - pts[0][0] < 7) return null
  const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length
  const my = pts.reduce((s, p) => s + p[1], 0) / pts.length
  let num = 0
  let den = 0
  for (const [x, y] of pts) {
    num += (x - mx) * (y - my)
    den += (x - mx) ** 2
  }
  return den ? (num / den) * 7 : null
}

// ---------------------------------------------------------------------------
// Plates

const PLATES: Record<Unit, number[]> = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
  lb: [45, 35, 25, 10, 5, 2.5],
}

/** Plates for one side of the bar, heaviest first. Null when the weight can't be loaded exactly. */
export function platesPerSide(total: number, bar: number, unit: Unit): number[] | null {
  let side = (total - bar) / 2
  if (side < 0) return null
  const out: number[] = []
  for (const p of PLATES[unit]) {
    while (side >= p - 1e-9) {
      out.push(p)
      side -= p
    }
  }
  return side > 1e-6 ? null : out
}
