import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { LIBRARY } from './data/exercises'
import { DEFAULT_SETTINGS, db, loadSettings, type Workout } from './db'
import type { ExerciseMap } from './lib/engine'

// ---------------------------------------------------------------------------
// Hash routing: #/history/12 → ['history', '12']

export function useRoute() {
  const hash = useSyncExternalStore(
    (l) => {
      window.addEventListener('hashchange', l)
      return () => window.removeEventListener('hashchange', l)
    },
    () => location.hash,
  )
  return useMemo(() => hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean), [hash])
}

export function go(path: string, replace = false) {
  const hash = '#/' + path.replace(/^\//, '')
  if (replace) {
    history.replaceState(null, '', hash)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    location.hash = hash
  }
  window.scrollTo(0, 0)
}

// ---------------------------------------------------------------------------
// Data

export function useSettings() {
  return useLiveQuery(loadSettings) ?? DEFAULT_SETTINGS
}

export function useExerciseMap(): ExerciseMap {
  const custom = useLiveQuery(() => db.customExercises.toArray())
  return useMemo(() => new Map([...LIBRARY, ...(custom ?? [])].map((e) => [e.id, e])), [custom])
}

/** All workouts, newest first. Undefined while loading. */
export function useWorkouts(): Workout[] | undefined {
  return useLiveQuery(() => db.workouts.orderBy('startedAt').reverse().toArray())
}

export function useActiveWorkout() {
  return useLiveQuery(async () => (await db.workouts.filter((w) => w.finishedAt === null).first()) ?? null)
}

export function useBodyweights() {
  return useLiveQuery(() => db.bodyweights.orderBy('date').toArray())
}

// ---------------------------------------------------------------------------
// Misc

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

/** Keep the screen on while a workout is running. Silently does nothing where unsupported. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    const request = async () => {
      try {
        lock = await navigator.wakeLock.request('screen')
        if (cancelled) void lock.release()
      } catch {
        // Denied (e.g. low battery); not essential.
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request()
    }
    void request()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release()
    }
  }, [active])
}
