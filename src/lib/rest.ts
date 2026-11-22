import { useSyncExternalStore } from 'react'
import { appUrl, registerTimerAlerts, syncTimers } from './push'
import { goTones, scheduleTones, unlockAudio } from './sound'

/**
 * The rest timer stores an end time rather than counting down, so it stays
 * correct when the phone locks or the app is backgrounded. The end beep is
 * scheduled on the audio clock up front, and the push server gets a "rest
 * over" notification in case the app isn't on screen when it ends.
 */

export interface RestState {
  endAt: number
  duration: number
  /** What's next, for the notification, e.g. "Bench Press · set 2 of 3". */
  next?: string
  /** App route to open from the notification. */
  route?: string
}

const KEY = 'rest-timer'
let state: RestState | null = read()
const listeners = new Set<() => void>()

function read(): RestState | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as RestState | null
    return s && s.endAt > Date.now() ? s : null
  } catch {
    return null
  }
}

function set(next: RestState | null) {
  state = next
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next))
    else localStorage.removeItem(KEY)
  } catch {
    // Storage unavailable: the timer still works for this session.
  }
  beep()
  syncTimers()
  listeners.forEach((l) => l())
}

function beep() {
  scheduleTones('rest', state ? goTones(state.endAt) : [])
}

export function useRest() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

export function startRest(seconds: number, next?: string, route?: string) {
  unlockAudio()
  set({ endAt: Date.now() + seconds * 1000, duration: seconds, next, route })
}

export function addRest(seconds: number) {
  if (!state) return
  const endAt = Math.max(Date.now(), state.endAt + seconds * 1000)
  set({ ...state, endAt, duration: Math.max(1, state.duration + seconds) })
}

export function stopRest() {
  set(null)
}

registerTimerAlerts('rest', () =>
  state
    ? [
        {
          at: state.endAt,
          title: 'Rest over',
          body: state.next ? `Next: ${state.next}` : 'Time for your next set.',
          tag: 'rest',
          url: appUrl(state.route ?? ''),
        },
      ]
    : [],
)

// Audio pauses while the app is in the background; line the beep up again on return.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && beep())
}
