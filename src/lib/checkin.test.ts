import { describe, expect, it } from 'vitest'
import { LIBRARY } from '../data/exercises'
import { DEFAULT_SETTINGS, type BodyWeight, type ProteinEntry, type StepDay, type Waist, type Workout } from '../db'
import { bodyVerdict } from './body'
import { liftTrends, progressed, weeklyCheckIn } from './checkin'
import { dateKey } from './format'
import { proteinGoal } from './protein'

const exMap = new Map(LIBRARY.map((e) => [e.id, e]))
const HOUR = 3_600_000
const DAY = 24 * HOUR
// Sunday noon, local time.
const NOW = new Date(2026, 10, 22, 12, 0).getTime()
const ago = (days: number) => dateKey(new Date(NOW - days * DAY))

/** Daily weigh-ins over `days` days, changing by `perWeek` kg a week. */
function weights(days: number, start: number, perWeek: number): BodyWeight[] {
  return Array.from({ length: days }, (_, i) => ({ date: ago(days - 1 - i), weight: start + (perWeek * i) / 7 }))
}

/** Weekly waist measurements, changing by `perWeek` cm a week. */
function waists(weeks: number, start: number, perWeek: number): Waist[] {
  return Array.from({ length: weeks }, (_, i) => ({ date: ago((weeks - 1 - i) * 7), cm: start + perWeek * i }))
}

describe('protein target', () => {
  it('is 1.8 g per kg of the 7-day average weight, rounded to 5 g', () => {
    expect(proteinGoal(DEFAULT_SETTINGS, [{ date: ago(0), weight: 70 }])).toEqual({ grams: 125, manual: false, fromWeight: 125 })
  })

  it('converts from pounds', () => {
    expect(proteinGoal({ ...DEFAULT_SETTINGS, unit: 'lb' }, [{ date: ago(0), weight: 154 }]).grams).toBe(125)
  })

  it('uses a hand-set target, and a fallback before any weigh-in', () => {
    expect(proteinGoal({ ...DEFAULT_SETTINGS, proteinTarget: 150 }, [{ date: ago(0), weight: 70 }])).toEqual({
      grams: 150,
      manual: true,
      fromWeight: 125,
    })
    expect(proteinGoal(DEFAULT_SETTINGS, []).grams).toBe(120)
  })
})

describe('weight and waist verdict', () => {
  const verdict = (bw: BodyWeight[], w: Waist[]) => bodyVerdict(bw, w, NOW)

  it('asks for weigh-ins before saying anything', () => {
    expect(verdict([], []).action).toBe('weigh')
  })

  it('calls a steady weight with a shrinking waist a recomposition', () => {
    const v = verdict(weights(21, 75, 0), waists(4, 90, -0.5))
    expect(v).toMatchObject({ action: 'keep', tone: 'good' })
    expect(v.text).toMatch(/losing fat and building muscle/)
  })

  it('says eat less when weight and waist both stand still for a couple of weeks', () => {
    expect(verdict(weights(21, 75, 0), waists(3, 90, 0)).action).toBe('eat-less')
  })

  it('wants a waist trend before saying eat less on a steady weight', () => {
    expect(verdict(weights(21, 75, 0), waists(1, 90, 0)).action).toBe('measure')
    // Two measurements a week apart give a trend, but not enough to call it flat.
    expect(verdict(weights(21, 75, 0), waists(2, 90, 0)).action).toBe('measure')
  })

  it('never says eat less while weight is coming off', () => {
    expect(verdict(weights(21, 75, -0.4), waists(4, 90, 0)).action).toBe('keep')
    expect(verdict(weights(21, 75, -1.2), waists(4, 90, 0)).action).toBe('eat-more')
  })

  it('treats a climbing weight by what the waist does', () => {
    expect(verdict(weights(21, 75, 0.4), waists(4, 90, 0)).action).toBe('eat-less')
    expect(verdict(weights(21, 75, 0.4), waists(4, 90, -0.4)).action).toBe('keep')
    expect(verdict(weights(21, 75, 0.4), []).action).toBe('measure')
  })
})

// ---------------------------------------------------------------------------

function session(daysAgo: number, items: [string, [number, number][], ('deload' | undefined)?][]): Workout {
  const startedAt = NOW - daysAgo * DAY
  return {
    id: startedAt,
    startedAt,
    finishedAt: startedAt + HOUR,
    exercises: items.map(([exerciseId, sets, rule], i) => ({
      uid: String(i),
      exerciseId,
      targetRule: rule,
      sets: sets.map(([weight, reps]) => ({ weight, reps, done: true })),
    })),
  }
}

describe('lift trends', () => {
  const s = (top: number, reps: number[]) => ({ top, reps, deload: false })

  it('counts more weight, or more reps at the same weight, as progress', () => {
    expect(progressed(s(20, [12, 12, 12]), s(22, [8, 8, 8]))).toBe(true)
    expect(progressed(s(20, [10, 10, 9]), s(20, [10, 10, 10]))).toBe(true)
    expect(progressed(s(20, [10, 10, 10]), s(20, [10, 10, 10]))).toBe(false)
    // Extra sets don't count as beating it: only the same number of sets is compared.
    expect(progressed(s(20, [10, 10, 10]), s(20, [10, 10, 10, 8, 8]))).toBe(false)
  })

  it('marks a lift stuck after three sessions without beating the last', () => {
    const w = [8, 6, 4, 2].map((d) => session(d, [['dumbbell-bench-press', [[20, 10], [20, 10], [20, 9]]]]))
    expect(liftTrends(w, NOW)).toEqual([{ exerciseId: 'dumbbell-bench-press', status: 'stuck' }])
  })

  it('does not call a deload stuck, and sees steady reps as going up', () => {
    const deload = [8, 6, 4, 2].map((d, i) =>
      session(d, [['dumbbell-bench-press', [[20, 10], [20, 10]], i === 2 ? 'deload' : undefined]]),
    )
    expect(liftTrends(deload, NOW)[0].status).not.toBe('stuck')
    const climbing = [8, 6, 4, 2].map((d, i) => session(d, [['leg-press', [[100, 8 + i], [100, 8 + i]]]]))
    expect(liftTrends(climbing, NOW)[0].status).toBe('up')
  })
})

describe('weekly check-in', () => {
  const full = (daysAgo: number, reps: number) =>
    session(daysAgo, [
      ['leg-press', [[100, reps], [100, reps], [100, reps]]],
      ['dumbbell-bench-press', [[20, reps], [20, reps], [20, reps]]],
    ])
  const threeAWeek = [13, 11, 9, 6, 4, 2].map((d, i) => full(d, 8 + Math.floor(i / 2)))
  const protein = (gramsPerDay: number, days: number): ProteinEntry[] =>
    Array.from({ length: days }, (_, i) => ({ date: ago(i + 1), grams: gramsPerDay, at: NOW - (i + 1) * DAY }))
  const steps = (n: number): StepDay[] => Array.from({ length: 7 }, (_, i) => ({ date: ago(i + 1), steps: n, at: 0, source: 'manual' }))
  const base = {
    now: NOW,
    workouts: threeAWeek,
    exMap,
    settings: DEFAULT_SETTINGS,
    bodyweights: weights(21, 70, -0.3),
    waists: waists(4, 88, -0.4),
    protein: protein(130, 7),
    steps: steps(9000),
  }

  it('says keep going when everything is on track', () => {
    const c = weeklyCheckIn(base)
    expect(c.focus).toMatchObject({ title: 'Keep going', tone: 'good' })
    expect(c.rows.map((r) => r.key)).toEqual(['workouts', 'protein', 'weight', 'waist', 'lifts', 'steps'])
    expect(c.rows.find((r) => r.key === 'workouts')!.value).toBe('3 of 3')
  })

  it('puts showing up first', () => {
    expect(weeklyCheckIn({ ...base, workouts: [full(3, 10)], protein: protein(60, 7) }).focus.title).toBe('Get 3 workouts in this week')
  })

  it('asks for more protein when the logged days fall short', () => {
    const c = weeklyCheckIn({ ...base, protein: protein(80, 5) })
    expect(c.focus.title).toBe('Eat more protein')
    expect(c.focus.detail).toMatch(/averaged 80 g a day against 125 g/)
  })

  it("doesn't count unlogged days as zero", () => {
    const c = weeklyCheckIn({ ...base, protein: protein(130, 2) })
    expect(c.focus.title).toBe('Log your protein')
    expect(c.rows.find((r) => r.key === 'protein')!.value).toBe('2 of 7 days logged')
    const started = weeklyCheckIn({ ...base, protein: [{ date: ago(0), grams: 30, at: NOW }] })
    expect(started.focus.detail).toMatch(/^Good start: 30 g in today/)
  })

  it('says eat a little less when weight and waist stand still', () => {
    const c = weeklyCheckIn({ ...base, bodyweights: weights(21, 70, 0), waists: waists(4, 88, 0) })
    expect(c.focus.title).toBe('Eat a little less')
  })

  it('names a stuck lift', () => {
    const stuck = [13, 11, 9, 6, 4, 2].map((d) => full(d, 10))
    expect(weeklyCheckIn({ ...base, workouts: stuck }).focus.title).toBe('Unstick Leg Press')
  })
})
