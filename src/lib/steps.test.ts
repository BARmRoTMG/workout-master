import { describe, expect, it } from 'vitest'
import { parseStepsText } from './steps'

const today = '2026-11-21'
const one = (steps: number) => [{ date: today, steps }]

describe('parseStepsText', () => {
  it('reads a plain number as today', () => {
    expect(parseStepsText('8432', today)).toEqual(one(8432))
  })

  it('handles thousands separators from any locale', () => {
    expect(parseStepsText('8,432', today)).toEqual(one(8432))
    expect(parseStepsText('8.432', today)).toEqual(one(8432))
    expect(parseStepsText('8 432', today)).toEqual(one(8432))
    expect(parseStepsText('8 432', today)).toEqual(one(8432))
    expect(parseStepsText("12'345", today)).toEqual(one(12345))
  })

  it('rounds decimals and ignores trailing whitespace', () => {
    expect(parseStepsText('8432.0', today)).toEqual(one(8432))
    expect(parseStepsText('8,432.6\n', today)).toEqual(one(8433))
    expect(parseStepsText('1.234,5', today)).toEqual(one(1235))
    expect(parseStepsText('  9001 \r\n', today)).toEqual(one(9001))
  })

  it('allows a word next to the number, in any language', () => {
    expect(parseStepsText('8,432 steps', today)).toEqual(one(8432))
    expect(parseStepsText('Schritte: 8.432', today)).toEqual(one(8432))
    expect(parseStepsText('8432 צעדים', today)).toEqual(one(8432))
  })

  it('reads dated lines', () => {
    const text = '2026-11-19,10234\n2026-11-20, 7.950\n2026-11-21 Schritte: 3 120\n'
    expect(parseStepsText(text, today)).toEqual([
      { date: '2026-11-19', steps: 10234 },
      { date: '2026-11-20', steps: 7950 },
      { date: '2026-11-21', steps: 3120 },
    ])
  })

  it('skips future and impossible dates', () => {
    expect(parseStepsText('2026-11-22,5000', today)).toBeNull()
    expect(parseStepsText('2026-13-01,5000\n2026-11-20,4000', today)).toEqual([{ date: '2026-11-20', steps: 4000 }])
  })

  it('rejects clipboard text that is not a step count', () => {
    expect(parseStepsText('', today)).toBeNull()
    expect(parseStepsText('hello', today)).toBeNull()
    expect(parseStepsText('https://example.com/item/8432', today)).toBeNull()
    expect(parseStepsText('054-1234567', today)).toBeNull()
    expect(parseStepsText('0541234567', today)).toBeNull()
    expect(parseStepsText('0', today)).toBeNull()
    expect(parseStepsText('250000', today)).toBeNull()
    expect(parseStepsText('21 Nov 2026 8,432', today)).toBeNull()
    expect(parseStepsText('Meet at 18:30 for 2 sets', today)).toBeNull()
    expect(parseStepsText('a'.repeat(30) + ' 8432', today)).toBeNull()
  })
})
