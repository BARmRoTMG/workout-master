import { db, type Unit, type Waist } from '../db'
import { daysBetween, slopePerWeek } from './engine'
import { dateKey } from './format'

/**
 * Waist measurement: for losing fat while gaining muscle, the scale can sit
 * still while the body changes. The waist shows the fat side of it.
 * Stored in centimetres; shown in inches when the app is set to pounds.
 */

const CM_PER_IN = 2.54

export const waistUnit = (unit: Unit) => (unit === 'kg' ? 'cm' : 'in')

/** Centimetres to the display unit, rounded to what a tape can read. */
export function waistShown(cm: number, unit: Unit) {
  return unit === 'kg' ? Math.round(cm * 2) / 2 : Math.round((cm / CM_PER_IN) * 4) / 4
}

export function waistToCm(value: number, unit: Unit) {
  return unit === 'kg' ? value : value * CM_PER_IN
}

/** Days since the last measurement, or null if there is none. */
export function daysSinceWaist(waists: Waist[], now = Date.now()) {
  const last = waists[waists.length - 1]
  return last ? daysBetween(last.date, dateKey(new Date(now))) : null
}

/** Weekly: due again 6 days after the last one, so the same weekday works. */
export function waistDue(waists: Waist[], now = Date.now()) {
  const d = daysSinceWaist(waists, now)
  return d === null || d >= 6
}

/** Centimetres per week over the last 6 weeks. Null until two measurements at least a week apart. */
export function waistRate(waists: Waist[]) {
  return slopePerWeek(
    waists.map((w) => ({ date: w.date, value: w.cm })),
    42,
    2,
  )
}

export async function saveWaist(cm: number, date = dateKey()) {
  const prior = await db.waists.where('date').equals(date).first()
  if (prior?.id) await db.waists.update(prior.id, { cm })
  else await db.waists.add({ date, cm })
}
