import type { BodyWeight, ProteinEntry, Settings, StepDay, Waist, Workout } from '../db'
import { bodyVerdict } from './body'
import { doneSets, weeklyRate, type ExerciseMap } from './engine'
import { dateKey, fmtSigned } from './format'
import { proteinByDay, proteinGoal } from './protein'

/**
 * The weekly check-in: looks back over the last 7 days and names the one
 * change that would help most. The checks run in a fixed order (show up,
 * eat enough protein, get the calories right, unstick lifts, then fill in
 * missing data), and the first that fails is the advice.
 */

export type Tone = 'good' | 'warn' | 'neutral'

export interface CheckRow {
  key: 'workouts' | 'protein' | 'weight' | 'waist' | 'lifts' | 'steps'
  label: string
  value: string
  tone: Tone
}

export interface CheckIn {
  focus: { title: string; detail: string; tone: Tone }
  rows: CheckRow[]
}

const DAY = 86_400_000
export const WEEKLY_WORKOUTS = 3

/** The 7 whole days before today, as YYYY-MM-DD. */
export function lastSevenDays(now: number) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now)
    d.setDate(d.getDate() - 7 + i)
    return dateKey(d)
  })
}

// ---------------------------------------------------------------------------
// Lifts

interface LiftSession {
  top: number
  /** Reps of each set at the top weight, best first. */
  reps: number[]
  deload: boolean
}

/** Better than last time: heavier, or more reps at the same weight (comparing the same number of sets). */
export function progressed(prev: LiftSession, cur: LiftSession) {
  if (cur.top !== prev.top) return cur.top > prev.top
  const n = Math.min(prev.reps.length, cur.reps.length)
  const sum = (r: number[]) => r.slice(0, n).reduce((a, b) => a + b, 0)
  return sum(cur.reps) > sum(prev.reps)
}

export type LiftStatus = 'up' | 'stuck' | 'flat' | 'new'

/**
 * Each exercise trained in the last two weeks: going up over the last six
 * weeks, or stuck (three sessions in a row without beating the one before,
 * not counting a planned deload).
 */
export function liftTrends(workouts: Workout[], now: number) {
  const byExercise = new Map<string, (LiftSession & { at: number })[]>()
  for (const w of workouts) {
    if (w.finishedAt === null || w.startedAt < now - 42 * DAY || w.startedAt > now) continue
    for (const we of w.exercises) {
      const sets = doneSets(we)
      if (!sets.length) continue
      const top = Math.max(...sets.map((s) => s.weight))
      const list = byExercise.get(we.exerciseId) ?? []
      list.push({
        at: w.startedAt,
        top,
        reps: sets
          .filter((s) => s.weight === top)
          .map((s) => s.reps)
          .sort((a, b) => b - a),
        deload: we.targetRule === 'deload',
      })
      byExercise.set(we.exerciseId, list)
    }
  }
  const out: { exerciseId: string; status: LiftStatus }[] = []
  for (const [exerciseId, raw] of byExercise) {
    const s = raw.sort((a, b) => a.at - b.at)
    if (s[s.length - 1].at < now - 14 * DAY) continue
    let status: LiftStatus
    if (s.length < 2) status = 'new'
    else {
      const last3 = s.slice(-3)
      const stalled =
        s.length >= 4 && last3.every((cur, i) => !progressed(s[s.length - 4 + i], cur)) && !last3.some((x) => x.deload)
      status = stalled ? 'stuck' : progressed(s[0], s[s.length - 1]) ? 'up' : 'flat'
    }
    out.push({ exerciseId, status })
  }
  return out
}

// ---------------------------------------------------------------------------

export function weeklyCheckIn(opts: {
  now: number
  workouts: Workout[]
  exMap: ExerciseMap
  settings: Settings
  /** Sorted by date, oldest first. */
  bodyweights: BodyWeight[]
  waists: Waist[]
  protein: ProteinEntry[]
  steps: StepDay[]
}): CheckIn {
  const { now, workouts, exMap, settings, bodyweights, waists } = opts
  const days = lastSevenDays(now)
  const rows: CheckRow[] = []

  // Workouts in the last 7 days.
  const trained = workouts.filter((w) => w.finishedAt !== null && w.startedAt > now - 7 * DAY && w.startedAt <= now).length
  rows.push({
    key: 'workouts',
    label: 'Workouts',
    value: `${trained} of ${WEEKLY_WORKOUTS}`,
    tone: trained >= WEEKLY_WORKOUTS ? 'good' : trained === 2 ? 'neutral' : 'warn',
  })

  // Protein: only days with something logged count. An unlogged day isn't a zero.
  const goal = proteinGoal(settings, bodyweights).grams
  const perDay = proteinByDay(opts.protein)
  const logged = days.map((d) => perDay.get(d) ?? 0).filter((g) => g > 0)
  const avgProtein = logged.length ? Math.round(logged.reduce((a, b) => a + b, 0) / logged.length) : 0
  const proteinKnown = logged.length >= 4
  rows.push({
    key: 'protein',
    label: 'Protein',
    value: proteinKnown ? `${avgProtein} of ${goal} g` : `${logged.length} of 7 days logged`,
    tone: !proteinKnown ? 'neutral' : avgProtein >= goal * 0.9 ? 'good' : avgProtein >= goal * 0.8 ? 'neutral' : 'warn',
  })

  // Weight and waist.
  const body = bodyVerdict(bodyweights, waists, now)
  const rate = weeklyRate(bodyweights)
  rows.push({
    key: 'weight',
    label: 'Weight',
    value: rate === null ? 'Not enough weigh-ins' : `${fmtSigned(rate, 2)} ${settings.unit} a week`,
    tone: body.weightPct === null ? 'neutral' : body.tone,
  })
  const wu = settings.unit === 'kg' ? 'cm' : 'in'
  const perMonth = body.waistPerWeek === null ? null : (body.waistPerWeek * 30) / 7 / (settings.unit === 'kg' ? 1 : 2.54)
  rows.push({
    key: 'waist',
    label: 'Waist',
    value: perMonth === null ? (waists.length ? 'Measure again' : 'Not measured yet') : `${fmtSigned(perMonth)} ${wu} a month`,
    tone: perMonth === null ? 'neutral' : body.waistPerWeek! <= -0.2 ? 'good' : body.action === 'eat-less' ? 'warn' : 'neutral',
  })

  // Lifts.
  const lifts = liftTrends(workouts, now)
  const up = lifts.filter((l) => l.status === 'up').length
  const stuck = lifts.filter((l) => l.status === 'stuck')
  const judged = lifts.filter((l) => l.status !== 'new').length
  rows.push({
    key: 'lifts',
    label: 'Lifts',
    value: !judged ? 'Too early to tell' : stuck.length ? `${up} up, ${stuck.length} stuck` : `${up} of ${judged} going up`,
    tone: stuck.length ? 'warn' : judged && up >= judged / 2 ? 'good' : 'neutral',
  })

  // Steps.
  const stepMap = new Map(opts.steps.map((s) => [s.date, s.steps]))
  const stepDays = days.map((d) => stepMap.get(d)).filter((n): n is number => n !== undefined)
  const avgSteps = stepDays.length ? Math.round(stepDays.reduce((a, b) => a + b, 0) / stepDays.length) : 0
  const stepsKnown = stepDays.length >= 3
  rows.push({
    key: 'steps',
    label: 'Steps',
    value: stepsKnown ? `${avgSteps.toLocaleString()} a day` : 'Not logged',
    tone: !stepsKnown ? 'neutral' : avgSteps >= settings.stepGoal ? 'good' : avgSteps >= settings.stepGoal * 0.75 ? 'neutral' : 'warn',
  })

  // The one thing to change, first match wins.
  const focus = ((): CheckIn['focus'] => {
    if (trained < 2) {
      return {
        tone: 'warn',
        title: trained ? 'Get 3 workouts in this week' : 'Get back in the gym',
        detail: `You trained ${trained ? 'once' : 'zero times'} in the last 7 days. Three full-body sessions a week is what everything else builds on.`,
      }
    }
    if (proteinKnown && avgProtein < goal * 0.8) {
      const gap = Math.round((goal - avgProtein) / 5) * 5
      return {
        tone: 'warn',
        title: 'Eat more protein',
        detail: `You averaged ${avgProtein} g a day against ${goal} g. Add about ${gap} g a day: a shake or a can of tuna is 25 g. Without it, training can't build much muscle.`,
      }
    }
    if (body.action === 'eat-more') return { tone: 'warn', title: 'Eat a bit more', detail: body.text }
    if (body.action === 'eat-less') {
      return { tone: 'warn', title: 'Eat a little less', detail: `${body.text} One snack or sugary drink is about that much.` }
    }
    if (stuck.length) {
      const name = exMap.get(stuck[0].exerciseId)?.name ?? 'A lift'
      return {
        tone: 'warn',
        title: `Unstick ${name}`,
        detail: `No progress in 3 sessions. Swap it for a similar exercise (⋯ → Swap during the workout): a fresh movement usually gets you moving again. Sleeping 7+ hours helps too.`,
      }
    }
    if (!proteinKnown) {
      const today = perDay.get(dateKey(new Date(now))) ?? 0
      return {
        tone: 'neutral',
        title: 'Log your protein',
        detail: today
          ? `Good start: ${today} g in today. Keep tapping the tile after each meal, so next week's check-in can tell whether you're eating enough to grow.`
          : `You logged ${logged.length} of the last 7 days. Tap the protein tile after each meal, so next week's check-in can tell whether you're eating enough to grow.`,
      }
    }
    if (body.action === 'measure' || body.action === 'weigh') {
      return { tone: 'neutral', title: body.action === 'weigh' ? 'Weigh in more often' : 'Measure your waist', detail: body.text }
    }
    if (trained < WEEKLY_WORKOUTS) {
      return {
        tone: 'warn',
        title: 'Add a third workout',
        detail: 'Two sessions last week. A third is 50% more training for one more hour, and your muscles recover in time for it.',
      }
    }
    if (stepsKnown && avgSteps < settings.stepGoal * 0.75) {
      return {
        tone: 'warn',
        title: 'Walk more',
        detail: `You averaged ${avgSteps.toLocaleString()} steps against ${settings.stepGoal.toLocaleString()}. A 20-minute walk is about 2,000 steps, and burns fat without cutting into recovery.`,
      }
    }
    return {
      tone: 'good',
      title: 'Keep going',
      detail: "Everything's on track. Same plan next week: add a rep wherever you can.",
    }
  })()

  return { focus, rows }
}
