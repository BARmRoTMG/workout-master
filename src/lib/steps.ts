import { db, type StepDay } from '../db'
import { dateKey } from './format'

/**
 * Steps come from Apple Health through an iPhone Shortcut, because web apps
 * can't read Health directly. The Shortcut copies today's total to the
 * clipboard and the app pastes it. The parser is deliberately strict so a
 * random clipboard (a link, a code, a phone number) never becomes a step count.
 */

export const SHORTCUT_NAME = 'Workout Steps'
export const SHORTCUT_URL = `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}`

const MAX_STEPS = 100_000

export interface StepReading {
  date: string
  steps: number
}

// A number with thousands groups ("8,432", "8.432", "8 432") and an optional
// decimal part, or a plain number ("8432", "8432.0").
const NUM_RE = /\d{1,3}(?:[ ,.  ']\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?/g
const GROUPED_RE = /^(\d{1,3}(?:[ ,.  ']\d{3})+)([.,]\d+)?$/

function toSteps(token: string): number | null {
  const grouped = token.match(GROUPED_RE)
  const v = grouped
    ? Number(grouped[1].replace(/\D/g, '') + (grouped[2] ? '.' + grouped[2].slice(1) : ''))
    : Number(token.replace(',', '.'))
  if (!Number.isFinite(v)) return null
  const n = Math.round(v)
  return n >= 1 && n <= MAX_STEPS ? n : null
}

/** A lone number, optionally with a word around it ("8,432 steps", "Schritte: 8.432"). */
function loneNumber(text: string): number | null {
  const tokens = text.match(NUM_RE) ?? []
  if (tokens.length !== 1) return null
  const rest = text.replace(tokens[0], '')
  if (rest.length > 24 || !/^[\s\p{L}:.]*$/u.test(rest)) return null
  return toSteps(tokens[0])
}

function validDate(d: string, today: string) {
  const [, m, day] = d.split('-').map(Number)
  return m >= 1 && m <= 12 && day >= 1 && day <= 31 && d <= today
}

/**
 * Reads step counts from clipboard text. Accepts a single number (today's
 * total) or lines of "YYYY-MM-DD <number>". Returns null if it doesn't look
 * like step data.
 */
export function parseStepsText(text: string, today: string): StepReading[] | null {
  const t = text.trim()
  if (!t || t.length > 2000) return null

  const byDate = new Map<string, number>()
  for (const line of t.split(/\r?\n/)) {
    const m = line.match(/(\d{4}-\d{2}-\d{2})[^\d]+(.+)$/)
    if (!m || !validDate(m[1], today)) continue
    const n = loneNumber(m[2].trim())
    if (n !== null) byDate.set(m[1], n)
  }
  if (byDate.size) return [...byDate].map(([date, steps]) => ({ date, steps })).sort((a, b) => a.date.localeCompare(b.date))

  const n = loneNumber(t)
  return n === null ? null : [{ date: today, steps: n }]
}

export async function saveSteps(readings: StepReading[], source: StepDay['source']) {
  const at = Date.now()
  await db.steps.bulkPut(readings.map((r) => ({ ...r, at, source })))
}

/**
 * Pastes steps from the clipboard. Resolves to what was saved, or null when
 * the clipboard can't be read (permission refused, iOS paste bubble dismissed)
 * or doesn't hold a step count.
 */
export async function pasteStepsFromClipboard(): Promise<StepReading[] | null> {
  let text: string
  try {
    text = await navigator.clipboard.readText()
  } catch {
    return null
  }
  const readings = parseStepsText(text, dateKey())
  if (!readings) return null
  await saveSteps(readings, 'health')
  return readings
}

export const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
