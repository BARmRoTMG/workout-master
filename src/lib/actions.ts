import { DEFAULT_FOR, type Exercise } from '../data/exercises'
import { db, loadSettings, newUid, type Workout, type WorkoutExercise } from '../db'
import { exerciseHistory, nextTarget, orderExercises, setsFor, setsFromTarget, type ExerciseMap, type SuggestedItem } from './engine'

export async function startWorkout(items: SuggestedItem[] = []): Promise<number> {
  const active = await db.workouts.filter((w) => w.finishedAt === null).first()
  if (active?.id) return active.id
  return db.workouts.add({
    startedAt: Date.now(),
    finishedAt: null,
    exercises: items.map((it) => ({
      uid: newUid(),
      exerciseId: it.exercise.id,
      reason: it.reason,
      targetNote: it.target.note,
      targetRule: it.target.rule,
      // The target already has one rep goal per set, extra sets for priority muscles included.
      sets: setsFromTarget(it.target, it.target.reps.length),
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
  const count = setsFor(exercise, settings)
  const target = nextTarget(exercise, exerciseHistory(workouts, exercise.id, before), count, settings.unit, settings.setsPerExercise)
  return {
    uid: newUid(),
    exerciseId: exercise.id,
    targetNote: target.note,
    targetRule: target.rule,
    sets: setsFromTarget(target, count),
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

/**
 * Ticks a set. Its weight carries to the sets still to do (a weight change
 * mid-exercise usually sticks) and its reps fill any blank rep targets.
 */
export async function completeSet(workoutId: number, uid: string, index: number) {
  await updateExercise(workoutId, uid, (we) => {
    const s = we.sets[index]
    if (!s) return
    s.done = true
    for (const next of we.sets.slice(index + 1)) {
      if (next.done) continue
      if (s.weight !== null) next.weight = s.weight
      if (next.reps === null) next.reps = s.reps
    }
  })
}

/**
 * A finished workout for a session done before the app was installed (or
 * forgotten): yesterday evening, pre-filled with the plan's exercises and
 * blank sets to type into.
 */
export async function logPastWorkout(exMap: ExerciseMap): Promise<number> {
  const settings = await loadSettings()
  const start = new Date()
  start.setDate(start.getDate() - 1)
  start.setHours(18, 0, 0, 0)
  const exercises = orderExercises(
    settings.planMuscles.map((m) => exMap.get(DEFAULT_FOR[m])).filter((e): e is Exercise => !!e),
    settings.priorityMuscles,
  )
  return db.workouts.add({
    startedAt: start.getTime(),
    finishedAt: start.getTime() + 3_600_000,
    exercises: exercises.map(({ exercise }) => ({
      uid: newUid(),
      exerciseId: exercise.id,
      sets: Array.from({ length: setsFor(exercise, settings) }, () => ({ weight: null, reps: null, done: true })),
    })),
  }) as Promise<number>
}

/** After editing a finished workout: drop sets with no reps and empty exercises. Deletes it if nothing is left. */
export async function tidyWorkout(id: number): Promise<boolean> {
  const w = await db.workouts.get(id)
  if (!w) return false
  w.exercises = w.exercises
    .map((e) => ({ ...e, sets: e.sets.filter((s) => (s.reps ?? 0) > 0).map((s) => ({ ...s, done: true })) }))
    .filter((e) => e.sets.length)
  if (!w.exercises.length) {
    await db.workouts.delete(id)
    return false
  }
  await db.workouts.put(w)
  return true
}

/**
 * Removes finished workouts with nothing logged, e.g. a "log a past workout"
 * that was opened and then left without typing anything.
 */
export async function dropEmptyWorkouts() {
  await db.workouts
    .filter((w) => w.finishedAt !== null && !w.exercises.some((e) => e.sets.some((x) => (x.reps ?? 0) > 0)))
    .delete()
}
