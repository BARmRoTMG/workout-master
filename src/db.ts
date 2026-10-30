import Dexie, { type EntityTable } from 'dexie'
import type { Exercise } from './data/exercises'
import type { Muscle } from './lib/muscles'

export type Unit = 'kg' | 'lb'

export interface SetEntry {
  weight: number | null
  reps: number | null
  done: boolean
}

export interface WorkoutExercise {
  /** Unique within the workout, so the same exercise can appear twice. */
  uid: string
  exerciseId: string
  sets: SetEntry[]
  /** Why the suggestion engine put it here, e.g. "Big compound lift - do it fresh". */
  reason?: string
  /** What progression rule produced the targets, e.g. "+2.5 kg - you hit 12 on every set". */
  targetNote?: string
  targetRule?: 'first' | 'increase' | 'repeat' | 'deload' | 'bodyweight'
}

export interface Workout {
  id?: number
  startedAt: number
  finishedAt: number | null
  exercises: WorkoutExercise[]
}

export interface BodyWeight {
  id?: number
  /** Local date, YYYY-MM-DD. One entry per day. */
  date: string
  weight: number
}

export interface Settings {
  unit: Unit
  planMuscles: Muscle[]
  setsPerExercise: number
  restCompound: number
  restIsolation: number
  weeklySetTarget: number
  barWeight: number
}

export const DEFAULT_SETTINGS: Settings = {
  unit: 'kg',
  planMuscles: ['chest', 'back', 'shoulders', 'quads', 'hamstrings', 'biceps', 'triceps'],
  setsPerExercise: 3,
  restCompound: 120,
  restIsolation: 90,
  weeklySetTarget: 10,
  barWeight: 20,
}

interface KV {
  key: string
  value: unknown
}

export const db = new Dexie('workout-master') as Dexie & {
  workouts: EntityTable<Workout, 'id'>
  bodyweights: EntityTable<BodyWeight, 'id'>
  customExercises: EntityTable<Exercise, 'id'>
  kv: EntityTable<KV, 'key'>
}

db.version(1).stores({
  workouts: '++id, startedAt',
  bodyweights: '++id, &date',
  customExercises: 'id',
  kv: 'key',
})

export async function loadSettings(): Promise<Settings> {
  const row = await db.kv.get('settings')
  return { ...DEFAULT_SETTINGS, ...(row?.value as Partial<Settings> | undefined) }
}

export async function saveSettings(patch: Partial<Settings>) {
  const current = await loadSettings()
  await db.kv.put({ key: 'settings', value: { ...current, ...patch } })
}

export function newUid() {
  return Math.random().toString(36).slice(2, 10)
}
