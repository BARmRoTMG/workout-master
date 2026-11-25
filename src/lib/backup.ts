import { db, loadSettings, type BodyWeight, type ProteinEntry, type StepDay, type Waist, type Workout } from '../db'
import type { Exercise } from '../data/exercises'
import { dateKey } from './format'

interface Backup {
  app: 'workout-master'
  /** 1 had no steps; 2 adds them; 3 adds protein and waist. All restore. */
  version: 1 | 2 | 3
  exportedAt: string
  settings: unknown
  workouts: Workout[]
  bodyweights: BodyWeight[]
  customExercises: Exercise[]
  steps?: StepDay[]
  protein?: ProteinEntry[]
  waists?: Waist[]
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
    version: 3,
    exportedAt: new Date().toISOString(),
    settings: await loadSettings(),
    workouts: await db.workouts.toArray(),
    bodyweights: await db.bodyweights.toArray(),
    customExercises: await db.customExercises.toArray(),
    steps: await db.steps.toArray(),
    protein: await db.protein.toArray(),
    waists: await db.waists.toArray(),
  }
  download(`workout-backup-${dateKey()}.json`, JSON.stringify(data), 'application/json')
}

/** Replaces everything on this device with the backup's contents. */
export async function importBackup(file: File) {
  const data = JSON.parse(await file.text()) as Partial<Backup>
  if (data.app !== 'workout-master' || !Array.isArray(data.workouts)) {
    throw new Error("That file isn't a Workout Master backup.")
  }
  const tables = [db.workouts, db.bodyweights, db.customExercises, db.kv, db.steps, db.protein, db.waists]
  await db.transaction('rw', tables, async () => {
    await Promise.all([
      db.workouts.clear(),
      db.bodyweights.clear(),
      db.customExercises.clear(),
      db.steps.clear(),
      db.protein.clear(),
      db.waists.clear(),
    ])
    await db.workouts.bulkAdd(data.workouts!)
    await db.bodyweights.bulkAdd(data.bodyweights ?? [])
    await db.customExercises.bulkAdd(data.customExercises ?? [])
    await db.steps.bulkAdd(data.steps ?? [])
    await db.protein.bulkAdd(data.protein ?? [])
    await db.waists.bulkAdd(data.waists ?? [])
    if (data.settings) await db.kv.put({ key: 'settings', value: data.settings })
  })
  return data.workouts.length
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
