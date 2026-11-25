import type { BodyWeight, Waist } from '../db'
import { daysBetween, trendLine, weeklyRate } from './engine'
import { dateKey } from './format'
import { daysSinceWaist, waistRate } from './waist'

/**
 * What weight and waist say together. The one place that turns them into
 * advice, used by the Progress screen and the weekly check-in alike.
 */

export type BodyAction = 'keep' | 'eat-less' | 'eat-more' | 'measure' | 'weigh'

export interface BodyVerdict {
  tone: 'good' | 'warn' | 'neutral'
  action: BodyAction
  text: string
  /** Weight change per week as % of body weight; null until about a week of weigh-ins. */
  weightPct: number | null
  /** Waist change in cm per week; null until two measurements a week apart (or if the last is old). */
  waistPerWeek: number | null
}

/** Waist slope this many cm/week or more downward counts as shrinking (about 1 cm a month). */
const SHRINKING = -0.2

/** Both sorted by date, oldest first. */
export function bodyVerdict(bodyweights: BodyWeight[], waists: Waist[], now = Date.now()): BodyVerdict {
  const rate = weeklyRate(bodyweights)
  const avg = trendLine(bodyweights).at(-1)?.avg
  const weightPct = rate !== null && avg ? (rate / avg) * 100 : null
  const stale = (daysSinceWaist(waists, now) ?? Infinity) > 21
  const waistPerWeek = stale ? null : waistRate(waists)
  // How long the recent waist measurements cover: "not shrinking" needs a couple of weeks to mean anything.
  const recent = waists.filter((w) => daysBetween(w.date, dateKey(new Date(now))) <= 42)
  const waistSpan = recent.length > 1 ? daysBetween(recent[0].date, recent[recent.length - 1].date) : 0
  const shrinking = waistPerWeek !== null && waistPerWeek <= SHRINKING
  const v = (tone: BodyVerdict['tone'], action: BodyAction, text: string): BodyVerdict => ({
    tone,
    action,
    text,
    weightPct,
    waistPerWeek,
  })

  if (weightPct === null) return v('neutral', 'weigh', 'Weigh in most mornings. The trend shows up after about a week.')
  if (weightPct < -1) {
    return v('warn', 'eat-more', 'Dropping faster than 1% a week, which risks losing muscle. Eat a bit more.')
  }
  if (weightPct > 0.25) {
    if (shrinking) return v('good', 'keep', "Weight is going up while your waist shrinks: that's muscle. Keep going.")
    if (waistPerWeek !== null) {
      return v('warn', 'eat-less', "Weight is climbing and your waist isn't shrinking, so some of it is fat. Eat about 200 calories less a day.")
    }
    return v('warn', 'measure', "Weight is climbing. Measure your waist each week: if it's growing too, eat a bit less.")
  }
  if (weightPct < -0.25) {
    return v('good', 'keep', 'Losing at a muscle-friendly pace. Keep protein high and keep adding reps.')
  }
  // Holding steady.
  if (shrinking) {
    return v('good', 'keep', "Weight is steady while your waist shrinks: you're losing fat and building muscle. Keep going.")
  }
  if (waistPerWeek !== null && waistSpan >= 14) {
    return v(
      'warn',
      'eat-less',
      'Weight and waist are both standing still. To lose the belly, eat about 200 calories less a day, or walk 3,000 more steps.',
    )
  }
  return v('neutral', 'measure', "Weight is steady. Measure your waist weekly to see whether you're swapping fat for muscle.")
}
