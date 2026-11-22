import { describe, expect, it } from 'vitest'
import { phases, position, PREP, totalSeconds, type IntervalRun } from './intervals'

const config = { work: 40, rest: 20, rounds: 3 }
const run = (over: Partial<IntervalRun> = {}): IntervalRun => ({ config, startedAt: 0, pausedAt: null, pausedMs: 0, ...over })

describe('interval phases', () => {
  it('counts down, then alternates work and rest with no rest after the last round', () => {
    expect(phases(config).map((p) => `${p.kind}${p.round}:${p.start}+${p.len}`)).toEqual([
      'prep1:0+5',
      'work1:5+40',
      'rest1:45+20',
      'work2:65+40',
      'rest2:105+20',
      'work3:125+40',
    ])
    expect(totalSeconds(config)).toBe(3 * 40 + 2 * 20)
  })

  it('skips rest phases when rest is zero', () => {
    expect(phases({ work: 30, rest: 0, rounds: 2 }).map((p) => p.kind)).toEqual(['prep', 'work', 'work'])
  })

  it('finds the phase and time left from the clock', () => {
    const at = (s: number) => position(run(), s * 1000)
    expect(at(0)).toMatchObject({ phase: { kind: 'prep' }, left: PREP })
    expect(at(10)).toMatchObject({ phase: { kind: 'work', round: 1 }, left: 35 })
    expect(at(50)).toMatchObject({ phase: { kind: 'rest', round: 1 }, left: 15 })
    expect(at(165).phase).toBeNull()
    expect(at(164.5).phase).toMatchObject({ kind: 'work', round: 3 })
  })

  it('stops the clock while paused and picks up where it left off', () => {
    const paused = run({ pausedAt: 10_000 })
    expect(position(paused, 999_000)).toMatchObject({ phase: { kind: 'work' }, left: 35 })
    // Resumed at 100 s after 90 s paused: 20 s in, i.e. 15 s into work.
    const resumed = run({ pausedMs: 90_000 })
    expect(position(resumed, 110_000)).toMatchObject({ phase: { kind: 'work', round: 1 }, left: 25 })
  })
})
