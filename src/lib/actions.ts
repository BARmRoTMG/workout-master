import type { Exercise } from '../data/exercises'
import { db, loadSettings, newUid, type Workout, type WorkoutExercise } from '../db'
import { exerciseHistory, nextTarget, setsFromTarget, type SuggestedItem } from './engine'

export async function startWorkout(items: SuggestedItem[] = []): Promise<number> {
  const active = await db.workouts.filter((w) => w.finishedAt === null).first()
  if (active?.id) return active.id
  const { setsPerExercise } = await loadSettings()
  return db.workouts.add({
    startedAt: Date.now(),
    finishedAt: null,
    exercises: items.map((it) => ({
      uid: newUid(),
      exerciseId: it.exercise.id,
      reason: it.reason,
      targetNote: it.target.note,
      targetRule: it.target.rule,
      sets: setsFromTarget(it.target, setsPerExercise),
    })),
  }) as Promise<number>
}

export async function updateWorkout(id: number, change: (w: Workout) => void) {
  await db.transaction('rw', db.workouts, async () => {
    const w = await db.workouts.get(id)
    if (!w) return
    change(w)
    await db.workouts.put(w)
  })
}

export async function updateExercise(id: number, uid: string, change: (we: WorkoutExercise) => void) {
  await updateWorkout(id, (w) => {
    const we = w.exercises.find((e) => e.uid === uid)
    if (we) change(we)
  })
}

/** A new exercise entry with targets from your history before this workout. */
export async function makeEntry(exercise: Exercise, before: number): Promise<WorkoutExercise> {
  const settings = await loadSettings()
  const workouts = await db.workouts.toArray()
  const target = nextTarget(
    exercise,
    exerciseHistory(workouts, exercise.id, before),
    settings.setsPerExercise,
    settings.unit,
  )
  return {
    uid: newUid(),
    exerciseId: exercise.id,
    targetNote: target.note,
    targetRule: target.rule,
    sets: setsFromTarget(target, settings.setsPerExercise),
  }
}

/** Drops unticked sets and empty exercises, then stamps the finish time. Deletes an empty workout. */
export async function finishWorkout(id: number): Promise<boolean> {
  const w = await db.workouts.get(id)
  if (!w) return false
  w.exercises = w.exercises
    .map((e) => ({ ...e, sets: e.sets.filter((s) => s.done && (s.reps ?? 0) > 0) }))
    .filter((e) => e.sets.length)
  if (!w.exercises.length) {
    await db.workouts.delete(id)
    return false
  }
  // A workout logged after the fact (start moved back by hours) gets a nominal one-hour length.
  const now = Date.now()
  w.finishedAt = now - w.startedAt > 4 * 3_600_000 ? w.startedAt + 3_600_000 : Math.max(now, w.startedAt + 60_000)
  await db.workouts.put(w)
  return true
}
