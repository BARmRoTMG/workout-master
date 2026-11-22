import { describe, expect, it } from 'vitest'
import { LIBRARY } from '../data/exercises'
import { DEFAULT_SETTINGS, type Workout } from '../db'
import { dateKey } from './format'
import type { NotifyPrefs } from './push'
import { atLocal, dailyAlerts } from './reminders'

const exMap = new Map(LIBRARY.map((e) => [e.id, e]))
const prefs: NotifyPrefs = { id: 'x', timers: true, weigh: '08:00', train: '17:00', steps: '21:00' }
// 7 am local time, so this works in any time zone.
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

const base = { prefs, now: NOW, workouts: [] as Workout[], exMap, settings: DEFAULT_SETTINGS, bodyweights: [], steps: [], url: (r: string) => 'https://app/#/' + r }
const find = (list: ReturnType<typeof dailyAlerts>, tag: string) => list.find((a) => a.tag === tag)

describe('daily reminders', () => {
  it('schedules each for later today, repeating daily', () => {
    const list = dailyAlerts(base)
    expect(find(list, 'weigh')!.at).toBe(atLocal(NOW, 0, '08:00'))
    expect(find(list, 'steps')!.at).toBe(atLocal(NOW, 0, '21:00'))
    expect(find(list, 'train')!.at).toBe(atLocal(NOW, 0, '17:00'))
    expect(find(list, 'train')!.body).toMatch(/^Full body is ready/)
    expect(list.every((a) => a.repeat === 24 * HOUR)).toBe(true)
  })

  it('moves a reminder to tomorrow once it is done today or its time has passed', () => {
    const today = dateKey(new Date(NOW))
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
    const list = dailyAlerts({ ...base, prefs: { ...prefs, weigh: null, steps: null } })
    expect(list.map((a) => a.tag)).toEqual(['train'])
  })
})
