import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { ExercisePicker } from '../components/ExercisePicker'
import { RestBar } from '../components/RestBar'
import { ConfirmButton, Icon, MuscleTag, NumInput, PlateStack, type IconName } from '../components/ui'
import type { Exercise } from '../data/exercises'
import { db, type Settings, type Workout, type WorkoutExercise } from '../db'
import { go, useExerciseMap, useNow, useSettings, useWakeLock, useWorkouts } from '../hooks'
import { finishWorkout, makeEntry, updateExercise, updateWorkout } from '../lib/actions'
import {
  doneSets,
  exerciseHistory,
  orderExercises,
  personalRecords,
  restFor,
  type ExerciseMap,
} from '../lib/engine'
import { fmtClock, fmtDay, fmtDuration, fmtW, pad2, relativeDay, toLocalInput } from '../lib/format'
import type { Muscle } from '../lib/muscles'
import { startRest, stopRest } from '../lib/rest'

type Picker = { mode: 'add' } | { mode: 'swap'; uid: string; muscle: Muscle }

export function WorkoutScreen({ id }: { id: number }) {
  const workout = useLiveQuery(async () => (await db.workouts.get(id)) ?? null, [id])
  const workouts = useWorkouts()
  const exMap = useExerciseMap()
  const settings = useSettings()
  const [picker, setPicker] = useState<Picker | null>(null)
  const live = workout?.finishedAt === null
  useWakeLock(live)

  if (workout === undefined || !workouts) return <div className="page" />
  if (workout === null) {
    return (
      <div className="page">
        <p className="muted pad">This workout no longer exists.</p>
        <button type="button" className="btn ghost" onClick={() => go('')}>
          Back to today
        </button>
      </div>
    )
  }

  const recommended = orderExercises(
    workout.exercises.map((e) => exMap.get(e.exerciseId)).filter((e): e is Exercise => !!e),
  ).map((o) => o.exercise.id)
  const outOfOrder = workout.exercises.some((e, i) => exMap.has(e.exerciseId) && e.exerciseId !== recommended[i])

  const sortIntoOrder = () =>
    updateWorkout(id, (w) => {
      w.exercises.sort((a, b) => recommended.indexOf(a.exerciseId) - recommended.indexOf(b.exerciseId))
    })

  const onPick = async (ex: Exercise) => {
    const p = picker
    setPicker(null)
    if (!p) return
    const entry = await makeEntry(ex, workout.startedAt)
    await updateWorkout(id, (w) => {
      if (p.mode === 'add') w.exercises.push(entry)
      else {
        const i = w.exercises.findIndex((e) => e.uid === p.uid)
        if (i >= 0) w.exercises[i] = entry
      }
    })
  }

  return (
    <div className={'page workout' + (live ? ' is-live' : '')}>
      {live ? <LiveHeader workout={workout} /> : <DoneHeader workout={workout} workouts={workouts} exMap={exMap} />}

      <label className="when">
        <span className="eyebrow">{live ? 'Started' : 'Date'}</span>
        <input
          type="datetime-local"
          value={toLocalInput(workout.startedAt)}
          onChange={(e) => {
            const t = new Date(e.target.value).getTime()
            if (!Number.isFinite(t)) return
            void updateWorkout(id, (w) => {
              if (w.finishedAt !== null) w.finishedAt += t - w.startedAt
              w.startedAt = t
            })
          }}
        />
      </label>

      {outOfOrder && workout.exercises.length > 1 && (
        <button type="button" className="hint-btn" onClick={sortIntoOrder}>
          <Icon name="sort" size={18} />
          <span>
            <b>Sort into recommended order</b>
            <small>Compounds first, big muscles before small, arms and abs last</small>
          </span>
        </button>
      )}

      <ol className="ex-list">
        {workout.exercises.map((entry, i) => (
          <ExerciseCard
            key={entry.uid}
            workoutId={id}
            workout={workout}
            workouts={workouts}
            entry={entry}
            index={i}
            exercise={exMap.get(entry.exerciseId)}
            settings={settings}
            live={live}
            onSwap={(muscle) => setPicker({ mode: 'swap', uid: entry.uid, muscle })}
          />
        ))}
      </ol>

      <button type="button" className="btn ghost wide add-ex" onClick={() => setPicker({ mode: 'add' })}>
        <Icon name="plus" size={18} /> Add exercise
      </button>

      {live ? (
        <ConfirmButton
          className="btn ghost danger wide"
          confirm="Tap again to discard this workout"
          onConfirm={async () => {
            stopRest()
            await db.workouts.delete(id)
            go('', true)
          }}
        >
          Discard workout
        </ConfirmButton>
      ) : (
        <ConfirmButton
          className="btn ghost danger wide"
          confirm="Tap again to delete for good"
          onConfirm={async () => {
            await db.workouts.delete(id)
            go('history', true)
          }}
        >
          Delete workout
        </ConfirmButton>
      )}

      {picker && (
        <ExercisePicker
          title={picker.mode === 'add' ? 'Add exercise' : 'Swap exercise'}
          muscle={picker.mode === 'swap' ? picker.muscle : undefined}
          onPick={onPick}
          onClose={() => setPicker(null)}
        />
      )}
      {live && <RestBar />}
    </div>
  )
}

// ---------------------------------------------------------------------------

function LiveHeader({ workout }: { workout: Workout }) {
  const now = useNow()
  const all = workout.exercises.flatMap((e) => e.sets)
  const done = all.filter((s) => s.done).length
  const unticked = all.length - done

  const finish = async () => {
    stopRest()
    const kept = await finishWorkout(workout.id!)
    go(kept ? `workout/${workout.id}` : '', true)
  }

  return (
    <header className="live-head">
      <button type="button" className="icon-btn" onClick={() => go('')} aria-label="Back to today">
        <Icon name="back" />
      </button>
      <div className="live-clock">
        <span className="live-pill">Live</span>
        <span className="clock">{fmtClock((now - workout.startedAt) / 1000)}</span>
        <small>
          {done}/{all.length} sets
        </small>
      </div>
      {unticked > 0 && done > 0 ? (
        <ConfirmButton
          className="btn primary"
          confirm={`Skip ${unticked} unticked?`}
          onConfirm={finish}
        >
          Finish
        </ConfirmButton>
      ) : (
        <button type="button" className="btn primary" onClick={finish} disabled={!done}>
          Finish
        </button>
      )}
    </header>
  )
}

function DoneHeader({ workout, workouts, exMap }: { workout: Workout; workouts: Workout[]; exMap: ExerciseMap }) {
  const sets = workout.exercises.flatMap(doneSets)
  const volume = sets.reduce((s, x) => s + x.weight * x.reps, 0)
  const prs = personalRecords(workout, workouts)
  return (
    <header className="done-head">
      <div className="row between">
        <button type="button" className="icon-btn" onClick={() => go('history')} aria-label="Back to history">
          <Icon name="back" />
        </button>
        <span className="eyebrow">{relativeDay(workout.startedAt)}</span>
      </div>
      <h1 className="display">{fmtDay(workout.startedAt)}</h1>
      <div className="stats">
        <div>
          <b>{fmtDuration((workout.finishedAt ?? workout.startedAt) - workout.startedAt)}</b>
          <small>Duration</small>
        </div>
        <div>
          <b>{sets.length}</b>
          <small>Sets</small>
        </div>
        <div>
          <b>{Math.round(volume).toLocaleString()}</b>
          <small>Volume</small>
        </div>
      </div>
      {prs.length > 0 && (
        <div className="prs">
          <span className="eyebrow">New bests</span>
          {prs.map((pr) => (
            <div key={pr.exerciseId} className="pr">
              <span>{exMap.get(pr.exerciseId)?.name ?? pr.exerciseId}</span>
              <b>
                {fmtW(pr.set.weight)} × {pr.set.reps}
              </b>
              <small>
                was {fmtW(pr.previous.weight)} × {pr.previous.reps}
              </small>
            </div>
          ))}
        </div>
      )}
    </header>
  )
}

// ---------------------------------------------------------------------------

const RULE_ICON: Record<NonNullable<WorkoutExercise['targetRule']>, IconName> = {
  first: 'plus',
  increase: 'arrowUp',
  repeat: 'equal',
  deload: 'arrowDown',
  bodyweight: 'arrowUp',
}

function ExerciseCard({
  workoutId,
  workout,
  workouts,
  entry,
  index,
  exercise,
  settings,
  live,
  onSwap,
}: {
  workoutId: number
  workout: Workout
  workouts: Workout[]
  entry: WorkoutExercise
  index: number
  exercise: Exercise | undefined
  settings: Settings
  live: boolean
  onSwap: (muscle: Muscle) => void
}) {
  const [menu, setMenu] = useState(false)
  const last = exerciseHistory(workouts, entry.exerciseId, workout.startedAt)[0]
  const unit = settings.unit
  const change = (fn: (we: WorkoutExercise) => void) => updateExercise(workoutId, entry.uid, fn)
  const move = (delta: number) =>
    updateWorkout(workoutId, (w) => {
      const i = w.exercises.findIndex((e) => e.uid === entry.uid)
      const j = i + delta
      if (i < 0 || j < 0 || j >= w.exercises.length) return
      ;[w.exercises[i], w.exercises[j]] = [w.exercises[j], w.exercises[i]]
    })

  const toggle = (i: number) =>
    change((we) => {
      const s = we.sets[i]
      s.done = !s.done
      if (s.done) {
        // Carry the weight forward to later sets that are still blank.
        for (const next of we.sets.slice(i + 1)) {
          if (next.done) break
          if (next.weight === null) next.weight = s.weight
          if (next.reps === null) next.reps = s.reps
        }
        if (live) startRest(restFor(exercise, settings))
      }
    })

  const current = entry.sets.find((s) => !s.done) ?? entry.sets[entry.sets.length - 1]
  const allDone = entry.sets.length > 0 && entry.sets.every((s) => s.done)

  return (
    <li className={'ex-card' + (allDone ? ' complete' : '')}>
      <div className="ex-head">
        <span className="ord">{pad2(index + 1)}</span>
        <div className="ex-title">
          <a href={`#/exercise/${entry.exerciseId}`}>{exercise?.name ?? 'Unknown exercise'}</a>
          <div className="tags">
            {exercise && <MuscleTag muscle={exercise.primary} />}
            {exercise && (
              <span className="tag plain">
                {exercise.repMin}–{exercise.repMax} reps
              </span>
            )}
          </div>
        </div>
        <button type="button" className="icon-btn" onClick={() => setMenu(!menu)} aria-label="Exercise options">
          <Icon name={menu ? 'x' : 'more'} />
        </button>
      </div>

      {menu && (
        <div className="ex-menu">
          {exercise && (
            <button type="button" onClick={() => onSwap(exercise.primary)}>
              <Icon name="swap" size={18} /> Swap
            </button>
          )}
          <button type="button" onClick={() => move(-1)}>
            <Icon name="up" size={18} /> Up
          </button>
          <button type="button" onClick={() => move(1)}>
            <Icon name="down" size={18} /> Down
          </button>
          <ConfirmButton
            className="danger"
            confirm="Remove?"
            onConfirm={() =>
              updateWorkout(workoutId, (w) => {
                w.exercises = w.exercises.filter((e) => e.uid !== entry.uid)
              })
            }
          >
            <Icon name="trash" size={18} /> Remove
          </ConfirmButton>
        </div>
      )}

      {live && (entry.reason || entry.targetNote) && (
        <div className="coach">
          {entry.targetNote && (
            <p className={'target-note rule-' + (entry.targetRule ?? 'repeat')}>
              <Icon name={RULE_ICON[entry.targetRule ?? 'repeat']} size={16} />
              {entry.targetNote}
            </p>
          )}
          {entry.reason && <p className="reason">{entry.reason}</p>}
        </div>
      )}

      {last && (
        <p className="last">
          <span>Last time · {relativeDay(last.date)}</span>
          {last.sets.map((s, i) => (
            <b key={i}>
              {s.weight ? `${fmtW(s.weight)}×` : ''}
              {s.reps}
            </b>
          ))}
        </p>
      )}

      <div className="sets" role="table">
        <div className="set-row head" role="row">
          <span>Set</span>
          <span>{exercise?.equipment === 'bodyweight' ? `+${unit}` : unit}</span>
          <span />
          <span>Reps</span>
          <span />
        </div>
        {entry.sets.map((s, i) => (
          <div className={'set-row' + (s.done ? ' done' : '')} role="row" key={i}>
            <span className="set-n">{i + 1}</span>
            <NumInput
              decimal
              label={`Set ${i + 1} weight`}
              value={s.weight}
              placeholder={unit}
              onChange={(v) => change((we) => void (we.sets[i].weight = v))}
            />
            <span className="times">×</span>
            <NumInput
              label={`Set ${i + 1} reps`}
              value={s.reps}
              placeholder={exercise ? `${exercise.repMin}–${exercise.repMax}` : 'reps'}
              onChange={(v) => change((we) => void (we.sets[i].reps = v))}
            />
            <button
              type="button"
              className="tick"
              aria-label={s.done ? `Untick set ${i + 1}` : `Tick set ${i + 1}`}
              aria-pressed={s.done}
              disabled={!s.done && !s.reps}
              onClick={() => toggle(i)}
            >
              <Icon name="check" size={22} />
            </button>
          </div>
        ))}
      </div>

      <div className="ex-foot">
        <button
          type="button"
          className="btn ghost small"
          onClick={() =>
            change((we) => {
              const prev = we.sets[we.sets.length - 1]
              we.sets.push({ weight: prev?.weight ?? null, reps: prev?.reps ?? null, done: false })
            })
          }
        >
          <Icon name="plus" size={16} /> Set
        </button>
        {entry.sets.length > 0 && (
          <button
            type="button"
            className="btn ghost small"
            onClick={() => change((we) => void we.sets.pop())}
          >
            Remove last set
          </button>
        )}
        {live && exercise?.equipment === 'barbell' && current?.weight ? (
          <PlateStack weight={current.weight} bar={settings.barWeight} unit={unit} />
        ) : null}
      </div>
    </li>
  )
}
