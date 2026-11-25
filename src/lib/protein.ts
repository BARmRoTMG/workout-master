import { db, type BodyWeight, type ProteinEntry, type Settings } from '../db'
import { trendLine } from './engine'
import { dateKey } from './format'

/**
 * Protein: the part of eating that decides whether training turns into
 * muscle. Logged as rough amounts per meal; no food database.
 */

/** Grams per kg of body weight: the middle of the 1.6–2.2 g/kg range that supports muscle gain. */
export const PROTEIN_PER_KG = 1.8
const KG_PER_LB = 0.45359237
/** Until there's a weigh-in to base it on. */
export const PROTEIN_FALLBACK = 120

export interface ProteinGoal {
  grams: number
  /** True when set by hand rather than worked out from body weight. */
  manual: boolean
  /** The target body weight gives (1.8 g/kg of the 7-day average), or null before any weigh-in. */
  fromWeight: number | null
}

/** `bodyweights` sorted by date, oldest first. */
export function proteinGoal(settings: Pick<Settings, 'unit' | 'proteinTarget'>, bodyweights: BodyWeight[]): ProteinGoal {
  const trend = trendLine(bodyweights)
  const avg = trend[trend.length - 1]?.avg
  const kg = avg ? (settings.unit === 'kg' ? avg : avg * KG_PER_LB) : null
  const fromWeight = kg ? Math.round((kg * PROTEIN_PER_KG) / 5) * 5 : null
  if (settings.proteinTarget) return { grams: settings.proteinTarget, manual: true, fromWeight }
  return { grams: fromWeight ?? PROTEIN_FALLBACK, manual: false, fromWeight }
}

/** Total grams per date. */
export function proteinByDay(entries: ProteinEntry[]) {
  const out = new Map<string, number>()
  for (const e of entries) out.set(e.date, (out.get(e.date) ?? 0) + e.grams)
  return out
}

export async function addProtein(grams: number, now = Date.now()): Promise<number> {
  return db.protein.add({ date: dateKey(new Date(now)), grams: Math.round(grams), at: now }) as Promise<number>
}

export async function removeProtein(id: number) {
  await db.protein.delete(id)
}

/** Rough protein in everyday portions, so a meal can be logged without weighing it. */
export const FOODS: { name: string; amount: string; grams: number }[] = [
  { name: 'Chicken breast', amount: '150 g cooked', grams: 45 },
  { name: 'Lean beef', amount: '150 g cooked', grams: 40 },
  { name: 'Salmon', amount: '150 g cooked', grams: 33 },
  { name: 'Tuna', amount: '1 can', grams: 25 },
  { name: 'Protein shake', amount: '1 scoop', grams: 25 },
  { name: 'Cottage cheese', amount: '200 g', grams: 22 },
  { name: 'Greek yogurt', amount: '200 g', grams: 20 },
  { name: 'Tofu', amount: '150 g firm', grams: 20 },
  { name: 'Eggs', amount: '3 large', grams: 18 },
  { name: 'Lentils or beans', amount: '1 cup cooked', grams: 17 },
  { name: 'Milk', amount: '250 ml glass', grams: 8 },
]
