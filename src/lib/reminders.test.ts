import { describe, expect, it } from 'vitest'
import { LIBRARY } from '../data/exercises'
import { DEFAULT_SETTINGS, type BodyWeight, type ProteinEntry, type Waist, type Workout } from '../db'
import { dateKey } from './format'
import type { NotifyPrefs } from './push'
import { atLocal, dailyAlerts } from './reminders'

const exMap = new Map(LIBRARY.map((e) => [e.id, e]))
const prefs: NotifyPrefs = { id: 'x', timers: true, weigh: '08:00', train: '17:00', steps: '21:00', protein: '19:00', checkin: '10:00' }
// Sunday, 7 am local time, so this works in any time zone.
const NOW = new Date(2026, 10, 22, 7, 0).getTime()
const HOUR = 3_600_000

function fullBody(startedAt: number): Workout {
  const ids = ['barbell-bench-press', 'lat-pulldown', 'overhead-press', 'barbell-back-squat', 'romanian-deadlift', 'barbell-curl', 'triceps-pushdown']
  return {
    id: startedAt,
    startedAt,
    finishedAt: startedAt + HOUR,
    exercises: ids
      .filter((id) => exMap.has(id))
      .map((exerciseId, i) => ({ uid: String(i), exerciseId, sets: [1, 2, 3].map(() => ({ weight: 20, reps: 10, done: true })) })),
  }
}

const base = {
  prefs,
  now: NOW,
  workouts: [] as Workout[],
  exMap,
  settings: DEFAULT_SETTINGS,
  bodyweights: [] as BodyWeight[],
  steps: [],
  protein: [] as ProteinEntry[],
  waists: [] as Waist[],
  url: (r: string) => 'https://app/#/' + r,
}
const find = (list: ReturnType<typeof dailyAlerts>, tag: string) => list.find((a) => a.tag === tag)
const all = (list: ReturnType<typeof dailyAlerts>, tag: string) => list.filter((a) => a.tag === tag)
const today = dateKey(new Date(NOW))

describe('daily reminders', () => {
  it('schedules each for later today, repeating daily', () => {
    const list = dailyAlerts(base)
    expect(find(list, 'weigh')!.at).toBe(atLocal(NOW, 0, '08:00'))
    expect(find(list, 'steps')!.at).toBe(atLocal(NOW, 0, '21:00'))
    expect(find(list, 'train')!.at).toBe(atLocal(NOW, 0, '17:00'))
    expect(find(list, 'train')!.body).toMatch(/^Full body is ready/)
    expect(['weigh', 'steps', 'train'].every((t) => find(list, t)!.repeat === 24 * HOUR)).toBe(true)
  })

  it('moves a reminder to tomorrow once it is done today or its time has passed', () => {
    const list = dailyAlerts({ ...base, bodyweights: [{ date: today, weight: 80 }], now: atLocal(NOW, 0, '22:00') })
    expect(find(list, 'weigh')!.at).toBe(atLocal(NOW, 1, '08:00'))
    expect(find(list, 'steps')!.at).toBe(atLocal(NOW, 1, '21:00'))
  })

  it('waits for recovery before the next workout reminder, and skips today after training', () => {
    const trainedThisMorning = fullBody(NOW - HOUR)
    const list = dailyAlerts({ ...base, workouts: [trainedThisMorning] })
    const train = find(list, 'train')!
    expect(train.at).toBeGreaterThanOrEqual(atLocal(NOW, 1, '17:00'))
    // Big muscles need a couple of days.
    expect(train.at).not.toBe(atLocal(NOW, 0, '17:00'))
  })

  it('leaves out reminders that are off', () => {
    const list = dailyAlerts({ ...base, prefs: { ...prefs, weigh: null, steps: null, protein: null, checkin: null } })
    expect(list.map((a) => a.tag)).toEqual(['train'])
  })

  it('asks for the waist with the weigh-in once a week', () => {
    expect(find(dailyAlerts(base), 'weigh')!.body).toMatch(/waist/)
    const twoDaysAgo = dateKey(new Date(NOW - 48 * HOUR))
    expect(find(dailyAlerts({ ...base, waists: [{ date: twoDaysAgo, cm: 88 }] }), 'weigh')!.body).not.toMatch(/waist/)
  })
})

describe('protein reminder', () => {
  const kg = (weight: number): BodyWeight[] => [{ date: today, weight }]

  it("says how far off today's target you are, then repeats a general one from tomorrow", () => {
    const list = all(dailyAlerts({ ...base, bodyweights: kg(70), protein: [{ date: today, grams: 50, at: NOW }] }), 'protein')
    expect(list).toHaveLength(2)
    expect(list[0]).toMatchObject({ at: atLocal(NOW, 0, '19:00'), body: '50 of 125 g so far. 75 g to go.' })
    expect(list[0].repeat).toBeUndefined()
    expect(list[1]).toMatchObject({ at: atLocal(NOW, 1, '19:00'), repeat: 24 * HOUR })
    expect(list[1].body).not.toMatch(/so far/)
  })

  it('skips today once the target is hit', () => {
    const list = all(dailyAlerts({ ...base, bodyweights: kg(70), protein: [{ date: today, grams: 130, at: NOW }] }), 'protein')
    expect(list.map((a) => a.at)).toEqual([atLocal(NOW, 1, '19:00')])
  })

  it('says nothing is logged when nothing is', () => {
    expect(find(dailyAlerts(base), 'protein')!.body).toMatch(/^Nothing logged yet today/)
  })
})

describe('weekly check-in reminder', () => {
  it('comes on Sunday, weekly', () => {
    const a = find(dailyAlerts(base), 'checkin')!
    expect(a.at).toBe(atLocal(NOW, 0, '10:00'))
    expect(a.repeat).toBe(7 * 24 * HOUR)
  })

  it('moves to next Sunday once this one has passed', () => {
    const later = atLocal(NOW, 0, '11:00')
    expect(find(dailyAlerts({ ...base, now: later }), 'checkin')!.at).toBe(atLocal(NOW, 7, '10:00'))
    const wednesday = atLocal(NOW, 3, '12:00')
    expect(find(dailyAlerts({ ...base, now: wednesday }), 'checkin')!.at).toBe(atLocal(NOW, 7, '10:00'))
  })
})
