import type { BodyWeight, Settings, StepDay, Workout } from '../db'
import { suggestWorkout, type ExerciseMap } from './engine'
import { dateKey } from './format'
import { MUSCLE_LABEL } from './muscles'
import type { AlertIn, NotifyPrefs } from './push'

const DAY = 86_400_000
/** A reminder that couldn't be delivered (phone off) is dropped after this long. */
const TTL = 3 * 3600

/** Local time `hhmm` ("08:00"), `days` days from today. */
export function atLocal(now: number, days: number, hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(now)
  d.setDate(d.getDate() + days)
  d.setHours(h || 0, m || 0, 0, 0)
  return d.getTime()
}

/** Today at that time, unless it has passed or today is already done; then tomorrow. */
function nextDaily(now: number, hhmm: string, doneToday: boolean) {
  const today = atLocal(now, 0, hhmm)
  return today > now && !doneToday ? today : atLocal(now, 1, hhmm)
}

function joinNames(names: string[]) {
  return names.length < 3 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * The next weigh-in, workout and steps reminders. Each repeats daily on the
 * server, so they keep coming even if the app isn't opened; whenever it is,
 * they are worked out again (a weigh-in today moves that one to tomorrow).
 */
export function dailyAlerts(opts: {
  prefs: NotifyPrefs
  now: number
  workouts: Workout[]
  exMap: ExerciseMap
  settings: Settings
  bodyweights: BodyWeight[]
  steps: StepDay[]
  url: (route: string) => string
}): AlertIn[] {
  const { prefs, now, workouts, exMap, settings } = opts
  const today = dateKey(new Date(now))
  const out: AlertIn[] = []

  if (prefs.weigh) {
    out.push({
      at: nextDaily(now, prefs.weigh, opts.bodyweights.some((b) => b.date === today)),
      title: 'Weigh in',
      body: 'Before breakfast, after the bathroom. The 7-day average does the rest.',
      tag: 'weigh',
      url: opts.url(''),
      ttl: TTL,
      repeat: DAY,
    })
  }

  if (prefs.steps) {
    out.push({
      at: nextDaily(now, prefs.steps, opts.steps.some((s) => s.date === today)),
      title: 'Steps',
      body: "Bring in today's steps from Apple Health.",
      tag: 'steps',
      url: opts.url(''),
      ttl: TTL,
      repeat: DAY,
    })
  }

  if (prefs.train && settings.planMuscles.length) {
    // The first day at the reminder time with enough muscles recovered, skipping today if you've trained.
    const trainedToday = workouts.some((w) => dateKey(new Date(w.startedAt)) === today)
    for (let d = 0; d <= 7; d++) {
      const at = atLocal(now, d, prefs.train)
      if (at <= now || (d === 0 && trainedToday)) continue
      const s = suggestWorkout({ workouts, exMap, settings, now: at })
      if (s.restDay && d < 7) continue
      const ready = settings.planMuscles.filter((m) => !s.recovering.some((r) => r.muscle === m))
      const what =
        ready.length === settings.planMuscles.length ? 'Full body is' : `${joinNames(ready.map((m) => MUSCLE_LABEL[m]))} are`
      out.push({
        at,
        title: 'Time to train',
        body: `${what} ready. About ${s.minutes} min.`,
        tag: 'train',
        url: opts.url(''),
        ttl: TTL,
        repeat: DAY,
      })
      break
    }
  }

  return out
}
