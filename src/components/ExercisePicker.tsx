import { useMemo, useState } from 'react'
import { EQUIPMENT_LABEL, type Equipment, type Exercise, type ExerciseKind } from '../data/exercises'
import { db } from '../db'
import { useExerciseMap } from '../hooks'
import { MUSCLE_LABEL, MUSCLES, type Muscle } from '../lib/muscles'
import { Icon, NumInput, Sheet } from './ui'

export function ExercisePicker({
  title,
  onPick,
  onClose,
  muscle,
}: {
  title: string
  onPick: (ex: Exercise) => void
  onClose: () => void
  /** Start filtered to this muscle, e.g. when swapping. */
  muscle?: Muscle
}) {
  const exMap = useExerciseMap()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Muscle | null>(muscle ?? null)
  const [creating, setCreating] = useState(false)

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = [...exMap.values()].filter(
      (e) => (!filter || e.primary === filter) && (!q || e.name.toLowerCase().includes(q)),
    )
    return MUSCLES.map((m) => [m, list.filter((e) => e.primary === m)] as const).filter(([, l]) => l.length)
  }, [exMap, query, filter])

  if (creating) {
    return (
      <Sheet title="New exercise" onClose={onClose}>
        <CustomExerciseForm
          initialName={query}
          initialMuscle={filter ?? 'chest'}
          onCancel={() => setCreating(false)}
          onCreate={onPick}
        />
      </Sheet>
    )
  }

  return (
    <Sheet title={title} onClose={onClose}>
      <label className="search">
        <Icon name="search" size={18} />
        <input
          type="search"
          placeholder="Search exercises"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="chips scroll-x">
        <button type="button" className={'chip' + (filter ? '' : ' on')} onClick={() => setFilter(null)}>
          All
        </button>
        {MUSCLES.map((m) => (
          <button
            type="button"
            key={m}
            className={'chip' + (filter === m ? ' on' : '')}
            onClick={() => setFilter(filter === m ? null : m)}
          >
            {MUSCLE_LABEL[m]}
          </button>
        ))}
      </div>
      {groups.map(([m, list]) => (
        <section key={m} className="pick-group">
          <h3 className="eyebrow">{MUSCLE_LABEL[m]}</h3>
          {list.map((e) => (
            <button type="button" key={e.id} className="pick-row" onClick={() => onPick(e)}>
              <span>{e.name}</span>
              <small>
                {EQUIPMENT_LABEL[e.equipment]} · {e.repMin}–{e.repMax}
                {e.custom ? ' · custom' : ''}
              </small>
            </button>
          ))}
        </section>
      ))}
      {!groups.length && <p className="muted center pad">No match.</p>}
      <button type="button" className="btn ghost wide" onClick={() => setCreating(true)}>
        <Icon name="plus" size={18} /> Create {query ? `“${query}”` : 'a custom exercise'}
      </button>
    </Sheet>
  )
}

function CustomExerciseForm({
  initialName,
  initialMuscle,
  onCancel,
  onCreate,
}: {
  initialName: string
  initialMuscle: Muscle
  onCancel: () => void
  onCreate: (ex: Exercise) => void
}) {
  const [name, setName] = useState(initialName)
  const [primary, setPrimary] = useState<Muscle>(initialMuscle)
  const [kind, setKind] = useState<ExerciseKind>('isolation')
  const [equipment, setEquipment] = useState<Equipment>('machine')
  const [repMin, setRepMin] = useState<number | null>(10)
  const [repMax, setRepMax] = useState<number | null>(15)
  const valid = name.trim() && repMin && repMax && repMin <= repMax

  const save = async () => {
    if (!valid) return
    const ex: Exercise = {
      id: 'custom-' + Date.now().toString(36),
      name: name.trim(),
      primary,
      secondary: [],
      kind,
      equipment,
      repMin: repMin!,
      repMax: repMax!,
      custom: true,
    }
    await db.customExercises.add(ex)
    onCreate(ex)
  }

  return (
    <div className="form">
      <label className="field">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Smith Machine Squat" />
      </label>
      <label className="field">
        <span>Main muscle</span>
        <select value={primary} onChange={(e) => setPrimary(e.target.value as Muscle)}>
          {MUSCLES.map((m) => (
            <option key={m} value={m}>
              {MUSCLE_LABEL[m]}
            </option>
          ))}
        </select>
      </label>
      <div className="field">
        <span>Type</span>
        <div className="seg">
          {(['compound', 'isolation'] as const).map((k) => (
            <button type="button" key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
              {k === 'compound' ? 'Compound (multi-joint)' : 'Isolation'}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>Equipment</span>
        <select value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment)}>
          {Object.entries(EQUIPMENT_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <div className="field">
        <span>Rep range</span>
        <div className="row gap">
          <NumInput label="Minimum reps" value={repMin} onChange={setRepMin} />
          <span className="muted">to</span>
          <NumInput label="Maximum reps" value={repMax} onChange={setRepMax} />
        </div>
      </div>
      <div className="row gap end">
        <button type="button" className="btn ghost" onClick={onCancel}>
          Back
        </button>
        <button type="button" className="btn primary" disabled={!valid} onClick={save}>
          Add exercise
        </button>
      </div>
    </div>
  )
}
