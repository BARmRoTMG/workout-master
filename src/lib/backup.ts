import { db, loadSettings, type BodyWeight, type Workout } from '../db'
import type { Exercise } from '../data/exercises'
import type { ExerciseMap } from './engine'
import { dateKey, toLocalInput } from './format'

interface Backup {
  app: 'workout-master'
  version: 1
  exportedAt: string
  settings: unknown
  workouts: Workout[]
  bodyweights: BodyWeight[]
  customExercises: Exercise[]
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function exportBackup() {
  const data: Backup = {
    app: 'workout-master',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: await loadSettings(),
    workouts: await db.workouts.toArray(),
    bodyweights: await db.bodyweights.toArray(),
    customExercises: await db.customExercises.toArray(),
  }
  download(`workout-backup-${dateKey()}.json`, JSON.stringify(data), 'application/json')
}

/** Replaces everything on this device with the backup's contents. */
export async function importBackup(file: File) {
  const data = JSON.parse(await file.text()) as Partial<Backup>
  if (data.app !== 'workout-master' || !Array.isArray(data.workouts)) {
    throw new Error("That file isn't a Workout Master backup.")
  }
  await db.transaction('rw', [db.workouts, db.bodyweights, db.customExercises, db.kv], async () => {
    await Promise.all([db.workouts.clear(), db.bodyweights.clear(), db.customExercises.clear()])
    await db.workouts.bulkAdd(data.workouts!)
    await db.bodyweights.bulkAdd(data.bodyweights ?? [])
    await db.customExercises.bulkAdd(data.customExercises ?? [])
    if (data.settings) await db.kv.put({ key: 'settings', value: data.settings })
  })
  return data.workouts.length
}

export async function exportCsv(exMap: ExerciseMap) {
  const { unit } = await loadSettings()
  const rows = [['date', 'exercise', 'set', `weight_${unit}`, 'reps']]
  const workouts = await db.workouts.orderBy('startedAt').toArray()
  for (const w of workouts) {
    if (w.finishedAt === null) continue
    for (const e of w.exercises) {
      e.sets.forEach((s, i) => {
        if (!s.done) return
        rows.push([toLocalInput(w.startedAt).replace('T', ' '), exMap.get(e.exerciseId)?.name ?? e.exerciseId, String(i + 1), String(s.weight ?? 0), String(s.reps ?? 0)])
      })
    }
  }
  const csv = rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n')
  download(`workouts-${dateKey()}.csv`, csv, 'text/csv')
}

/** Converts every stored weight when the unit changes, rounded to sensible plate steps. */
export async function convertUnits(from: 'kg' | 'lb', to: 'kg' | 'lb') {
  if (from === to) return
  const f = to === 'lb' ? 2.20462 : 1 / 2.20462
  const step = to === 'lb' ? 2.5 : 0.5
  const round = (v: number) => Number((Math.round((v * f) / step) * step).toFixed(2))
  await db.transaction('rw', [db.workouts, db.bodyweights, db.kv], async () => {
    await db.workouts.toCollection().modify((w) => {
      for (const e of w.exercises) for (const s of e.sets) if (s.weight !== null) s.weight = round(s.weight)
    })
    await db.bodyweights.toCollection().modify((b) => {
      b.weight = Number((b.weight * f).toFixed(1))
    })
    const settings = await loadSettings()
    await db.kv.put({
      key: 'settings',
      value: { ...settings, unit: to, barWeight: to === 'lb' ? 45 : 20 },
    })
  })
}
