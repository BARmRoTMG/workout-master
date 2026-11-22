/**
 * Beeps scheduled on the audio clock rather than with JavaScript timers, so
 * they land on time even when timers are throttled. iPhone plays them through
 * your music (they mix rather than pause it) and mutes them in silent mode.
 */

export interface Tone {
  /** Wall-clock time to start, ms. */
  at: number
  freq: number
  /** Seconds. */
  dur: number
  gain?: number
}

let ctx: AudioContext | null = null
const scheduled = new Map<string, OscillatorNode[]>()

/** Call from a tap: browsers only let audio start after one. */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext()
    if (ctx.state !== 'running') void ctx.resume()
  } catch {
    ctx = null
  }
}

export function audioReady() {
  return ctx !== null
}

export function cancelTones(group: string) {
  for (const osc of scheduled.get(group) ?? []) {
    try {
      osc.stop()
    } catch {
      // Already stopped.
    }
  }
  scheduled.delete(group)
}

/** Replaces the group's pending tones. Tones already in the past are skipped. */
export function scheduleTones(group: string, tones: Tone[]) {
  cancelTones(group)
  if (!ctx) return
  const now = Date.now()
  const base = ctx.currentTime
  const out: OscillatorNode[] = []
  for (const t of tones) {
    const delay = (t.at - now) / 1000
    if (delay < -0.05) continue
    const at = base + Math.max(0, delay)
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = t.freq
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(t.gain ?? 0.35, at + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + t.dur)
    osc.connect(gain).connect(ctx.destination)
    osc.start(at)
    osc.stop(at + t.dur + 0.02)
    out.push(osc)
  }
  scheduled.set(group, out)
}

/** Three rising beeps: the "go" signal. */
export function goTones(at: number): Tone[] {
  return [0, 1, 2].map((i) => ({ at: at + i * 220, freq: i === 2 ? 1320 : 880, dur: 0.18 }))
}

// iPhone suspends audio while the app is in the background; wake it again on the next tap.
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', () => ctx && ctx.state !== 'running' && void ctx.resume(), { passive: true })
}
