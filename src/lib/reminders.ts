import type { BodyWeight, ProteinEntry, Settings, StepDay, Waist, Workout } from '../db'
import { suggestWorkout, type ExerciseMap } from './engine'
import { dateKey } from './format'
import { MUSCLE_LABEL } from './muscles'
import { proteinByDay, proteinGoal } from './protein'
import type { AlertIn, NotifyPrefs } from './push'
import { waistDue } from './waist'

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
 * The next weigh-in, workout, steps, protein and check-in reminders. Each
 * repeats on the server, so they keep coming even if the app isn't opened;
 * whenever it is, they are worked out again (a weigh-in today moves that one
 * to tomorrow). A repeat reuses its text, so anything about today alone goes
 * in a one-off alert instead.
 */
export function dailyAlerts(opts: {
  prefs: NotifyPrefs
  now: number
  workouts: Workout[]
  exMap: ExerciseMap
  settings: Settings
  bodyweights: BodyWeight[]
  steps: StepDay[]
  protein: ProteinEntry[]
  waists: Waist[]
  url: (route: string) => string
}): AlertIn[] {
  const { prefs, now, workouts, exMap, settings } = opts
  const today = dateKey(new Date(now))
  const out: AlertIn[] = []

  if (prefs.weigh) {
    out.push({
      at: nextDaily(now, prefs.weigh, opts.bodyweights.some((b) => b.date === today)),
      title: 'Weigh in',
      body: waistDue(opts.waists, now)
        ? 'Before breakfast, after the bathroom. Your waist is due too (once a week).'
        : 'Before breakfast, after the bathroom. The 7-day average does the rest.',
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

  if (prefs.protein) {
    const goal = proteinGoal(settings, opts.bodyweights).grams
    const got = proteinByDay(opts.protein).get(today) ?? 0
    const tonight = atLocal(now, 0, prefs.protein)
    if (tonight > now && got < goal) {
      out.push({
        at: tonight,
        title: 'Protein',
        body: got ? `${got} of ${goal} g so far. ${goal - got} g to go.` : `Nothing logged yet today. Your target is ${goal} g.`,
        tag: 'protein',
        url: opts.url(''),
        ttl: TTL,
      })
    }
    out.push({
      at: atLocal(now, 1, prefs.protein),
      title: 'Protein',
      body: `How much did you get today? Your target is ${goal} g.`,
      tag: 'protein',
      url: opts.url(''),
      ttl: TTL,
      repeat: DAY,
    })
  }

  if (prefs.checkin) {
    const toSunday = (7 - new Date(now).getDay()) % 7
    let at = atLocal(now, toSunday, prefs.checkin)
    if (at <= now) at = atLocal(now, toSunday + 7, prefs.checkin)
    out.push({
      at,
      title: 'Weekly check-in',
      body: 'How your week went, and the one thing to change next week.',
      tag: 'checkin',
      url: opts.url(''),
      ttl: 12 * 3600,
      repeat: 7 * DAY,
    })
  }

  return out
}
