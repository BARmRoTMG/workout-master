import { describe, expect, it } from 'vitest'
import { LIBRARY } from '../data/exercises'
import { DEFAULT_SETTINGS, type Workout } from '../db'
import {
  muscleFreshness,
  nextTarget,
  orderExercises,
  personalRecords,
  platesPerSide,
  suggestWorkout,
  trendLine,
  weeklyRate,
  weeklySets,
  type Session,
} from './engine'

const exMap = new Map(LIBRARY.map((e) => [e.id, e]))
const ex = (id: string) => exMap.get(id)!
const HOUR = 3_600_000
const NOW = Date.parse('2026-10-31T18:00:00Z')

const session = (date: number, sets: [number, number][]): Session => ({
  workoutId: date,
  date,
  sets: sets.map(([weight, reps]) => ({ weight, reps })),
})

function workout(hoursAgo: number, items: [string, [number, number][]][], id = hoursAgo): Workout {
  const startedAt = NOW - hoursAgo * HOUR
  return {
    id,
    startedAt,
    finishedAt: startedAt + HOUR,
    exercises: items.map(([exerciseId, sets], i) => ({
      uid: String(i),
      exerciseId,
      sets: sets.map(([weight, reps]) => ({ weight, reps, done: true })),
    })),
  }
}

describe('nextTarget', () => {
  const bench = ex('dumbbell-bench-press') // 8–12, dumbbell (+2 kg)
  const squat = ex('barbell-back-squat') // 6–10, barbell lower (+5 kg)

  it('asks for a starting weight the first time', () => {
    const t = nextTarget(bench, [], 3, 'kg')
    expect(t.rule).toBe('first')
    expect(t.weight).toBeNull()
  })

  it('adds a rep per set while under the top of the range', () => {
    const t = nextTarget(bench, [session(1, [[20, 10], [20, 9], [20, 8]])], 3, 'kg')
    expect(t).toMatchObject({ rule: 'repeat', weight: 20, reps: [11, 10, 9] })
  })

  it('never targets above the top of the range', () => {
    const t = nextTarget(bench, [session(1, [[20, 12], [20, 12], [20, 11]])], 3, 'kg')
    expect(t.reps).toEqual([12, 12, 12])
  })

  it('adds weight once every set hits the top of the range', () => {
    const t = nextTarget(bench, [session(1, [[20, 12], [20, 12], [20, 12]])], 3, 'kg')
    expect(t).toMatchObject({ rule: 'increase', weight: 22, reps: [8, 8, 8] })
    const s = nextTarget(squat, [session(1, [[60, 10], [60, 10], [60, 10]])], 3, 'kg')
    expect(s.weight).toBe(65)
  })

  it('only counts sets at the top weight', () => {
    // Back-off set at a lighter weight doesn't block the increase.
    const t = nextTarget(bench, [session(1, [[20, 12], [20, 12], [20, 12], [16, 15]])], 3, 'kg')
    expect(t.rule).toBe('increase')
  })

  it('does not increase when fewer sets than planned were done', () => {
    const t = nextTarget(bench, [session(1, [[20, 12], [20, 12]])], 3, 'kg')
    expect(t.rule).toBe('repeat')
  })

  it('deloads after missing the bottom of the range twice at the same weight', () => {
    const t = nextTarget(squat, [session(2, [[100, 5], [100, 4]]), session(1, [[100, 5], [100, 5]])], 3, 'kg')
    expect(t).toMatchObject({ rule: 'deload', weight: 90, reps: [6, 6, 6] })
  })

  it('does not deload after a single bad session', () => {
    const t = nextTarget(squat, [session(2, [[100, 5]]), session(1, [[95, 8]])], 3, 'kg')
    expect(t.rule).toBe('repeat')
  })

  it('progresses bodyweight exercises by reps', () => {
    const t = nextTarget(ex('pull-up'), [session(1, [[0, 6], [0, 5], [0, 4]])], 3, 'kg')
    expect(t).toMatchObject({ rule: 'bodyweight', weight: 0, reps: [7, 6, 5] })
  })

  it('uses pound increments', () => {
    const t = nextTarget(squat, [session(1, [[135, 10], [135, 10], [135, 10]])], 3, 'lb')
    expect(t.weight).toBe(145)
  })
})

describe('orderExercises', () => {
  const names = (ids: string[]) =>
    orderExercises(ids.map(ex)).map((o) => o.exercise.id)

  it('puts compounds first, alternating lower and upper, arms then abs last', () => {
    expect(
      names([
        'cable-crunch',
        'dumbbell-curl',
        'triceps-pushdown',
        'lat-pulldown',
        'dumbbell-shoulder-press',
        'dumbbell-romanian-deadlift',
        'dumbbell-bench-press',
        'leg-press',
      ]),
    ).toEqual([
      'leg-press',
      'dumbbell-bench-press',
      'dumbbell-romanian-deadlift',
      'lat-pulldown',
      'dumbbell-shoulder-press',
      'triceps-pushdown',
      'dumbbell-curl',
      'cable-crunch',
    ])
  })

  it('puts isolation for big muscles after all compounds', () => {
    expect(names(['leg-extension', 'lateral-raise', 'barbell-bench-press'])).toEqual([
      'barbell-bench-press',
      'leg-extension',
      'lateral-raise',
    ])
  })
})

describe('recovery and volume', () => {
  const fullBody = (hoursAgo: number) =>
    workout(hoursAgo, [
      ['leg-press', [[100, 10], [100, 10], [100, 10]]],
      ['dumbbell-bench-press', [[20, 10], [20, 10], [20, 10]]],
      ['triceps-pushdown', [[20, 12], [20, 12], [20, 12]]],
    ])

  it('marks muscles fatigued right after training and recovered later', () => {
    const fresh = muscleFreshness([fullBody(1)], exMap, NOW)
    expect(fresh.chest).toBeLessThan(50)
    expect(fresh.back).toBe(100)
    const later = muscleFreshness([fullBody(73)], exMap, NOW)
    expect(later.chest).toBe(100)
  })

  it('counts secondary muscles as half a set', () => {
    const sets = weeklySets([fullBody(24)], exMap, NOW)
    expect(sets.chest).toBe(3)
    expect(sets.triceps).toBe(4.5)
    expect(sets.glutes).toBe(1.5)
  })

  it('ignores workouts older than a week', () => {
    expect(weeklySets([fullBody(24 * 8)], exMap, NOW).chest).toBe(0)
  })
})

describe('suggestWorkout', () => {
  it('suggests the default full body in order when there is no history', () => {
    const s = suggestWorkout({ workouts: [], exMap, settings: DEFAULT_SETTINGS, now: NOW })
    expect(s.restDay).toBe(false)
    expect(s.items.map((i) => i.exercise.id)).toEqual([
      'leg-press',
      'dumbbell-bench-press',
      'dumbbell-romanian-deadlift',
      'lat-pulldown',
      'dumbbell-shoulder-press',
      'triceps-pushdown',
      'dumbbell-curl',
    ])
  })

  it('reuses the exercise you did last time for a muscle', () => {
    const s = suggestWorkout({
      workouts: [workout(72, [['barbell-bench-press', [[60, 8]]]])],
      exMap,
      settings: DEFAULT_SETTINGS,
      now: NOW,
    })
    expect(s.items.some((i) => i.exercise.id === 'barbell-bench-press')).toBe(true)
    expect(s.items.some((i) => i.exercise.id === 'dumbbell-bench-press')).toBe(false)
  })

  it('recommends rest the day after a full-body session', () => {
    const w = workout(20, [
      ['leg-press', [[100, 10], [100, 10], [100, 10]]],
      ['dumbbell-bench-press', [[20, 10], [20, 10], [20, 10]]],
      ['dumbbell-romanian-deadlift', [[20, 10], [20, 10], [20, 10]]],
      ['lat-pulldown', [[40, 10], [40, 10], [40, 10]]],
      ['dumbbell-shoulder-press', [[14, 10], [14, 10], [14, 10]]],
    ])
    const s = suggestWorkout({ workouts: [w], exMap, settings: DEFAULT_SETTINGS, now: NOW })
    expect(s.restDay).toBe(true)
    expect(s.recovering.map((r) => r.muscle)).toContain('chest')
  })
})

describe('personalRecords', () => {
  it('flags a heavier best set than any earlier session', () => {
    const old = workout(96, [['barbell-bench-press', [[60, 8]]]], 1)
    const now = workout(1, [['barbell-bench-press', [[62.5, 8]]]], 2)
    const prs = personalRecords(now, [old, now])
    expect(prs).toHaveLength(1)
    expect(prs[0].set).toEqual({ weight: 62.5, reps: 8 })
  })

  it('does not flag the first ever session', () => {
    const now = workout(1, [['barbell-bench-press', [[60, 8]]]])
    expect(personalRecords(now, [now])).toHaveLength(0)
  })
})

describe('body weight', () => {
  const entries = Array.from({ length: 15 }, (_, i) => ({
    date: `2026-10-${String(i + 1).padStart(2, '0')}`,
    weight: 90 - i * 0.1,
  }))

  it('fits the weekly rate', () => {
    expect(weeklyRate(entries)).toBeCloseTo(-0.7, 5)
  })

  it('needs at least a week of data', () => {
    expect(weeklyRate(entries.slice(0, 4))).toBeNull()
  })

  it('averages the trailing 7 days', () => {
    const t = trendLine(entries)
    expect(t[0].avg).toBe(90)
    expect(t[6].avg).toBeCloseTo(89.7, 5)
  })
})

describe('platesPerSide', () => {
  it('loads a kg bar', () => {
    expect(platesPerSide(100, 20, 'kg')).toEqual([25, 15])
    expect(platesPerSide(62.5, 20, 'kg')).toEqual([20, 1.25])
  })

  it('returns null for weights that cannot be loaded', () => {
    expect(platesPerSide(15, 20, 'kg')).toBeNull()
    expect(platesPerSide(61, 20, 'kg')).toBeNull()
  })
})
