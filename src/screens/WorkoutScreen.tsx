import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { ExercisePicker } from '../components/ExercisePicker'
import { RestBar } from '../components/RestBar'
import { ConfirmButton, Icon, NumInput, PlateStack, Sheet, type IconName } from '../components/ui'
import type { Exercise } from '../data/exercises'
import { db, type Settings, type Workout, type WorkoutExercise } from '../db'
import { go, useExerciseMap, useNow, useSettings, useWakeLock, useWorkouts } from '../hooks'
import { completeSet, finishWorkout, makeEntry, tidyWorkout, updateExercise, updateWorkout } from '../lib/actions'
import { doneSets, exerciseHistory, personalRecords, restFor, type ExerciseMap } from '../lib/engine'
import { fmtClock, fmtDay, fmtDuration, fmtW, pad2, relativeDay, toLocalInput } from '../lib/format'
import { family, MUSCLE_LABEL, type Muscle } from '../lib/muscles'
import { startRest, stopRest } from '../lib/rest'

type Picker = { mode: 'add' } | { mode: 'swap'; uid: string; muscle: Muscle }

export function WorkoutScreen({ id, edit }: { id: number; edit?: boolean }) {
  const workout = useLiveQuery(async () => (await db.workouts.get(id)) ?? null, [id])
  const workouts = useWorkouts()
  const exMap = useExerciseMap()
  const settings = useSettings()

  if (workout === undefined || !workouts) return <div className="page" />
  if (workout === null) {
    return (
      <div className="page">
        <p className="muted pad">This workout no longer exists.</p>
        <button type="button" className="btn ghost" onClick={() => go('', true)}>
          Back to today
        </button>
      </div>
    )
  }
  const props = { workout, workouts, exMap, settings }
  return workout.finishedAt === null ? <LiveWorkout {...props} /> : <WorkoutSummary {...props} startEditing={edit} />
}

interface Props {
  workout: Workout
  workouts: Workout[]
  exMap: ExerciseMap
  settings: Settings
}

const hasOpenSet = (e: WorkoutExercise) => e.sets.some((s) => !s.done)

/** Shared by the live and edit views: add an exercise or swap one. */
function usePicker(workout: Workout, onAdded?: (uid: string) => void) {
  const [picker, setPicker] = useState<Picker | null>(null)
  const onPick = async (ex: Exercise) => {
    const p = picker
    setPicker(null)
    if (!p) return
    const entry = await makeEntry(ex, workout.startedAt)
    if (workout.finishedAt !== null) for (const s of entry.sets) s.done = true
    await updateWorkout(workout.id!, (w) => {
      if (p.mode === 'add') w.exercises.push(entry)
      else {
        const i = w.exercises.findIndex((e) => e.uid === p.uid)
        if (i >= 0) w.exercises[i] = entry
      }
    })
    onAdded?.(entry.uid)
  }
  const sheet = picker && (
    <ExercisePicker
      title={picker.mode === 'add' ? 'Add exercise' : 'Swap exercise'}
      muscle={picker.mode === 'swap' ? picker.muscle : undefined}
      onPick={onPick}
      onClose={() => setPicker(null)}
    />
  )
  return { setPicker, sheet }
}

// ===========================================================================
// Live: one exercise, one set, one big button

function LiveWorkout({ workout, workouts, exMap, settings }: Props) {
  const id = workout.id!
  useWakeLock(true)
  const [focusUid, setFocusUid] = useState<string | null>(null)
  const [picked, setPicked] = useState<number | null>(null)
  const [sheet, setSheet] = useState<'menu' | 'finish' | null>(null)
  const { setPicker, sheet: pickerSheet } = usePicker(workout, (uid) => focusOn(uid))

  const now = useNow(30_000)
  const list = workout.exercises
  const all = list.flatMap((e) => e.sets)
  const doneCount = all.filter((s) => s.done).length
  const everything = all.length > 0 && doneCount === all.length
  const focus = list.find((e) => e.uid === focusUid) ?? (everything ? undefined : list.find(hasOpenSet))
  const focusIndex = focus ? list.indexOf(focus) : -1
  const exercise = focus ? exMap.get(focus.exerciseId) : undefined

  function focusOn(uid: string | null) {
    setFocusUid(uid)
    setPicked(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const finish = async () => {
    stopRest()
    const kept = await finishWorkout(id)
    go(kept ? `workout/${id}` : '', true)
  }

  const onDone = async (index: number) => {
    if (!focus) return
    if (focus.sets[index].done) {
      setPicked(null)
      return
    }
    await completeSet(id, focus.uid, index)
    setPicked(null)
    const leftHere = focus.sets.some((s, i) => !s.done && i !== index)
    const leftAnywhere = list.some((e) => e.uid !== focus.uid && hasOpenSet(e))
    if (leftHere || leftAnywhere) startRest(restFor(exercise, settings))
    else stopRest()
    if (!leftHere) {
      // Next unfinished exercise after this one, wrapping round to any that were skipped.
      const order = [...list.slice(focusIndex + 1), ...list.slice(0, focusIndex)]
      const next = order.find(hasOpenSet)
      setFocusUid(next?.uid ?? null)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <div className="page workout live">
      <LiveHeader workout={workout} done={doneCount} total={all.length} onFinish={() => setSheet('finish')} />

      {!list.length ? (
        <section className="focus empty-focus">
          <h2 className="focus-name">Empty workout</h2>
          <p className="muted">Add the first exercise you're doing.</p>
          <button type="button" className="done-btn" onClick={() => setPicker({ mode: 'add' })}>
            <Icon name="plus" size={24} /> Add exercise
          </button>
        </section>
      ) : focus ? (
        <FocusCard
          key={focus.uid}
          workout={workout}
          workouts={workouts}
          entry={focus}
          index={focusIndex}
          exercise={exercise}
          settings={settings}
          picked={picked}
          onPickSet={setPicked}
          onDone={onDone}
          onMenu={() => setSheet('menu')}
          onNext={() => {
            const order = [...list.slice(focusIndex + 1), ...list.slice(0, focusIndex)]
            focusOn(order.find(hasOpenSet)?.uid ?? null)
          }}
        />
      ) : (
        <section className="focus all-done">
          <span className="big-check">
            <Icon name="check" size={44} />
          </span>
          <h2 className="focus-name">Every set done</h2>
          <p className="muted">
            {doneCount} sets in {fmtDuration(now - workout.startedAt)}. Nice work.
          </p>
          <button type="button" className="done-btn" onClick={finish}>
            Finish workout
          </button>
        </section>
      )}

      {list.length > 0 && (
        <UpNext
          list={list}
          exMap={exMap}
          current={focus?.uid}
          onFocus={(uid) => focusOn(uid)}
          onAdd={() => setPicker({ mode: 'add' })}
        />
      )}

      {sheet === 'menu' && focus && (
        <ExerciseMenu
          workoutId={id}
          entry={focus}
          exercise={exercise}
          onClose={() => setSheet(null)}
          onSwap={() => {
            setSheet(null)
            if (exercise) setPicker({ mode: 'swap', uid: focus.uid, muscle: exercise.primary })
          }}
          onRemoved={() => {
            setSheet(null)
            focusOn(null)
          }}
        />
      )}
      {sheet === 'finish' && (
        <FinishSheet workoutId={id} done={doneCount} total={all.length} onFinish={finish} onClose={() => setSheet(null)} />
      )}
      {pickerSheet}
      <RestBar />
    </div>
  )
}

function LiveHeader({ workout, done, total, onFinish }: { workout: Workout; done: number; total: number; onFinish: () => void }) {
  const now = useNow()
  return (
    <header className="live-head">
      <button type="button" className="icon-btn" onClick={() => go('')} aria-label="Back to today (workout keeps running)">
        <Icon name="down" />
      </button>
      <div className="live-clock">
        <span className="live-pill">Live</span>
        <span className="clock">{fmtClock((now - workout.startedAt) / 1000)}</span>
        <small>
          {done}/{total} sets
        </small>
      </div>
      <button type="button" className="btn small finish-btn" onClick={onFinish}>
        Finish
      </button>
    </header>
  )
}

const RULE_ICON: Record<NonNullable<WorkoutExercise['targetRule']>, IconName> = {
  first: 'plus',
  increase: 'arrowUp',
  repeat: 'equal',
  deload: 'arrowDown',
  bodyweight: 'arrowUp',
}

function FocusCard({
  workout,
  workouts,
  entry,
  index,
  exercise,
  settings,
  picked,
  onPickSet,
  onDone,
  onMenu,
  onNext,
}: {
  workout: Workout
  workouts: Workout[]
  entry: WorkoutExercise
  index: number
  exercise: Exercise | undefined
  settings: Settings
  picked: number | null
  onPickSet: (i: number | null) => void
  onDone: (i: number) => void
  onMenu: () => void
  onNext: () => void
}) {
  const last = exerciseHistory(workouts, entry.exerciseId, workout.startedAt)[0]
  const firstOpen = entry.sets.findIndex((s) => !s.done)
  const idx = picked ?? firstOpen
  const set = idx >= 0 ? entry.sets[idx] : undefined
  const n = entry.sets.length
  const unit = settings.unit
  const bodyweight = exercise?.equipment === 'bodyweight'
  const repMin = exercise?.repMin ?? 8
  const change = (fn: (we: WorkoutExercise) => void) => updateExercise(workout.id!, entry.uid, fn)
  const setReps = (delta: number) =>
    change((we) => {
      const r = we.sets[idx].reps
      we.sets[idx].reps = r === null ? repMin : Math.max(1, r + delta)
    })
  const missingWeight = !!set && !bodyweight && set.weight === null
  const missingReps = !!set && !(set.reps && set.reps > 0)
  const fam = exercise ? family(exercise.primary) : 'core'

  return (
    <section className={`focus fam-${fam}`}>
      <div className="focus-top">
        <span className="eyebrow">
          {pad2(index + 1)} / {pad2(workout.exercises.length)}
          {exercise && ` · ${MUSCLE_LABEL[exercise.primary]}`}
        </span>
        <button type="button" className="icon-btn" onClick={onMenu} aria-label="Exercise options">
          <Icon name="more" />
        </button>
      </div>
      <h2 className="focus-name">{exercise?.name ?? 'Unknown exercise'}</h2>

      {entry.targetNote && (
        <p className={'coach rule-' + (entry.targetRule ?? 'repeat')}>
          <Icon name={RULE_ICON[entry.targetRule ?? 'repeat']} size={16} />
          {entry.targetNote}
        </p>
      )}
      {last && (
        <p className="last">
          <span>Last time</span>
          {last.sets.map((s, i) => (
            <b key={i}>
              {s.weight ? `${fmtW(s.weight)}×` : ''}
              {s.reps}
            </b>
          ))}
        </p>
      )}

      <div className="pills" role="group" aria-label="Sets">
        {entry.sets.map((s, i) => (
          <button
            type="button"
            key={i}
            className={'pill' + (s.done ? ' done' : '') + (i === idx ? ' current' : '')}
            aria-label={s.done ? `Set ${i + 1}: ${fmtW(s.weight)} × ${s.reps}, tap to fix` : `Set ${i + 1}`}
            aria-pressed={i === idx}
            onClick={() => onPickSet(i === firstOpen ? null : i)}
          >
            {s.done ? (
              <>
                <Icon name="check" size={14} />
                <small>
                  {s.weight ? `${fmtW(s.weight)}×` : ''}
                  {s.reps}
                </small>
              </>
            ) : (
              <span>{i + 1}</span>
            )}
          </button>
        ))}
      </div>

      {set ? (
        <>
          <div className="dials">
            <label className={'dial' + (missingWeight ? ' needs' : '')}>
              <span className="dial-label">{bodyweight ? `Added ${unit}` : unit}</span>
              <NumInput
                decimal
                label={`Set ${idx + 1} weight`}
                value={set.weight}
                placeholder={bodyweight ? '0' : '–'}
                onChange={(v) => change((we) => void (we.sets[idx].weight = v))}
                className="dial-num"
              />
            </label>
            <span className="dial-x">×</span>
            <div className={'dial' + (missingReps ? ' needs' : '')}>
              <span className="dial-label">
                Reps{exercise ? ` · ${exercise.repMin}–${exercise.repMax}` : ''}
              </span>
              <div className="rep-step">
                <button type="button" aria-label="One rep fewer" onClick={() => setReps(-1)}>
                  −
                </button>
                <NumInput
                  label={`Set ${idx + 1} reps`}
                  value={set.reps}
                  placeholder="–"
                  onChange={(v) => change((we) => void (we.sets[idx].reps = v))}
                  className="dial-num"
                />
                <button type="button" aria-label="One rep more" onClick={() => setReps(1)}>
                  +
                </button>
              </div>
            </div>
          </div>

          {exercise?.equipment === 'barbell' && set.weight ? (
            <PlateStack weight={set.weight} bar={settings.barWeight} unit={unit} />
          ) : null}

          <button type="button" className="done-btn" disabled={missingWeight || missingReps} onClick={() => onDone(idx)}>
            <Icon name="check" size={26} />
            {set.done ? `Save set ${idx + 1}` : `Done · set ${idx + 1} of ${n}`}
          </button>
          {(missingWeight || missingReps) && (
            <p className="needs-hint">
              {missingWeight
                ? `First time: pick a weight you can lift ${exercise?.repMin ?? 8}–${exercise?.repMax ?? 12} times with 1–2 reps to spare.`
                : 'Enter how many reps you did.'}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="muted">All {n} sets done. Tap a set above to fix it.</p>
          <button type="button" className="done-btn" onClick={onNext}>
            Next exercise
          </button>
        </>
      )}
    </section>
  )
}

function UpNext({
  list,
  exMap,
  current,
  onFocus,
  onAdd,
}: {
  list: WorkoutExercise[]
  exMap: ExerciseMap
  current: string | undefined
  onFocus: (uid: string) => void
  onAdd: () => void
}) {
  return (
    <section className="upnext">
      <h3 className="eyebrow">Today's lifts</h3>
      <ol>
        {list.map((e, i) => {
          const done = e.sets.filter((s) => s.done).length
          const complete = done === e.sets.length && done > 0
          const ex = exMap.get(e.exerciseId)
          return (
            <li key={e.uid}>
              <button
                type="button"
                className={'un-row' + (e.uid === current ? ' current' : '') + (complete ? ' complete' : '') + (ex ? ` fam-${family(ex.primary)}` : '')}
                onClick={() => onFocus(e.uid)}
              >
                <span className="ord">{complete ? <Icon name="check" size={16} /> : pad2(i + 1)}</span>
                <span className="un-name">{ex?.name ?? 'Unknown exercise'}</span>
                <span className="un-sets">
                  {done}/{e.sets.length}
                </span>
              </button>
            </li>
          )
        })}
        <li>
          <button type="button" className="un-row add" onClick={onAdd}>
            <span className="ord">
              <Icon name="plus" size={16} />
            </span>
            <span className="un-name">Add exercise</span>
          </button>
        </li>
      </ol>
    </section>
  )
}

function ExerciseMenu({
  workoutId,
  entry,
  exercise,
  onClose,
  onSwap,
  onRemoved,
}: {
  workoutId: number
  entry: WorkoutExercise
  exercise: Exercise | undefined
  onClose: () => void
  onSwap: () => void
  onRemoved: () => void
}) {
  const change = (fn: (we: WorkoutExercise) => void) => updateExercise(workoutId, entry.uid, fn)
  const openIdx = entry.sets.map((s, i) => (s.done ? -1 : i)).filter((i) => i >= 0)
  return (
    <Sheet title={exercise?.name ?? 'Exercise'} onClose={onClose} fit>
      <div className="menu-list">
        {exercise && (
          <button type="button" onClick={onSwap}>
            <Icon name="swap" /> Swap for another exercise
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            void change((we) => {
              const prev = we.sets[we.sets.length - 1]
              we.sets.push({ weight: prev?.weight ?? null, reps: prev?.reps ?? null, done: false })
            })
            onClose()
          }}
        >
          <Icon name="plus" /> Add a set
        </button>
        {openIdx.length > 0 && entry.sets.length > 1 && (
          <button
            type="button"
            onClick={() => {
              void change((we) => void we.sets.splice(openIdx[openIdx.length - 1], 1))
              onClose()
            }}
          >
            <Icon name="x" /> Drop a set
          </button>
        )}
        {exercise && (
          <a href={`#/exercise/${exercise.id}`}>
            <Icon name="chart" /> History and progress
          </a>
        )}
        <ConfirmButton
          className="danger"
          confirm={
            <>
              <Icon name="trash" /> Tap again to remove
            </>
          }
          onConfirm={async () => {
            await updateWorkout(workoutId, (w) => {
              w.exercises = w.exercises.filter((e) => e.uid !== entry.uid)
            })
            onRemoved()
          }}
        >
          <Icon name="trash" /> Remove from workout
        </ConfirmButton>
      </div>
    </Sheet>
  )
}

function FinishSheet({
  workoutId,
  done,
  total,
  onFinish,
  onClose,
}: {
  workoutId: number
  done: number
  total: number
  onFinish: () => void
  onClose: () => void
}) {
  const left = total - done
  return (
    <Sheet title={done ? 'Finish workout?' : 'Nothing logged yet'} onClose={onClose} fit>
      <p className="muted">
        {done} of {total} sets done.
        {done > 0 && left > 0 && ` The ${left} you haven't ticked won't be saved.`}
      </p>
      <div className="stack">
        {done > 0 && (
          <button type="button" className="btn primary" onClick={onFinish}>
            Save workout
          </button>
        )}
        <button type="button" className="btn ghost" onClick={onClose}>
          Keep going
        </button>
        <ConfirmButton
          className="text-link danger"
          confirm="Tap again to throw this workout away"
          onConfirm={async () => {
            stopRest()
            await db.workouts.delete(workoutId)
            go('', true)
          }}
        >
          Discard workout
        </ConfirmButton>
      </div>
    </Sheet>
  )
}

// ===========================================================================
// Finished: summary, with an edit mode for fixes and back-dated workouts

function WorkoutSummary({ workout, workouts, exMap, settings, startEditing }: Props & { startEditing?: boolean }) {
  const id = workout.id!
  const [editing, setEditing] = useState(!!startEditing)
  const { setPicker, sheet: pickerSheet } = usePicker(workout)
  const sets = workout.exercises.flatMap(doneSets)
  const volume = sets.reduce((s, x) => s + x.weight * x.reps, 0)
  const prs = personalRecords(workout, workouts)
  const now = useNow(30_000)
  const fresh = now - (workout.finishedAt ?? 0) < 5 * 60_000

  const stopEditing = async () => {
    const kept = await tidyWorkout(id)
    setEditing(false)
    if (!kept) go('progress', true)
    else if (startEditing) go(`workout/${id}`, true)
  }

  return (
    <div className={'page summary' + (fresh && !editing ? ' with-dock' : '')}>
      <header className="sum-head">
        <div className="row between">
          <button type="button" className="icon-btn" onClick={() => (editing ? stopEditing() : go('progress'))} aria-label="Back">
            <Icon name="back" />
          </button>
          {editing ? (
            <button type="button" className="btn small primary" onClick={stopEditing}>
              Done
            </button>
          ) : (
            <button type="button" className="btn small ghost" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
        </div>
        <span className="eyebrow">{fresh && !editing ? 'Workout saved' : relativeDay(workout.startedAt)}</span>
        <h1 className="display">{fmtDay(workout.startedAt)}</h1>
      </header>

      {editing ? (
        <label className="when">
          <span className="eyebrow">When</span>
          <input
            type="datetime-local"
            value={toLocalInput(workout.startedAt)}
            max={toLocalInput(now)}
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
      ) : (
        <>
          <div className="stats card">
            <div>
              <b>{fmtDuration((workout.finishedAt ?? workout.startedAt) - workout.startedAt)}</b>
              <small>Time</small>
            </div>
            <div>
              <b>{sets.length}</b>
              <small>Sets</small>
            </div>
            <div>
              <b>{Math.round(volume).toLocaleString()}</b>
              <small>{settings.unit} lifted</small>
            </div>
          </div>
          {prs.length > 0 && (
            <section className="card prs">
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
            </section>
          )}
        </>
      )}

      {editing && workout.exercises.length > 0 && (
        <p className="muted small">Type what you lifted. Sets left without reps are dropped when you tap Done.</p>
      )}

      <ol className="sum-list">
        {workout.exercises.map((e) => {
          const ex = exMap.get(e.exerciseId)
          return editing ? (
            <EditExercise
              key={e.uid}
              workoutId={id}
              entry={e}
              exercise={ex}
              unit={settings.unit}
              onSwap={() => ex && setPicker({ mode: 'swap', uid: e.uid, muscle: ex.primary })}
            />
          ) : (
            <li key={e.uid} className={'sum-ex' + (ex ? ` fam-${family(ex.primary)}` : '')}>
              <a href={`#/exercise/${e.exerciseId}`}>{ex?.name ?? 'Unknown exercise'}</a>
              <span className="sum-sets">
                {doneSets(e).map((s, i) => (
                  <b key={i}>
                    {s.weight ? `${fmtW(s.weight)}×` : ''}
                    {s.reps}
                  </b>
                ))}
              </span>
            </li>
          )
        })}
      </ol>

      {editing && (
        <>
          <button type="button" className="btn ghost wide" onClick={() => setPicker({ mode: 'add' })}>
            <Icon name="plus" size={18} /> Add exercise
          </button>
          <ConfirmButton
            className="text-link danger"
            confirm="Tap again to delete for good"
            onConfirm={async () => {
              await db.workouts.delete(id)
              go('progress', true)
            }}
          >
            Delete workout
          </ConfirmButton>
        </>
      )}

      {fresh && !editing && (
        <div className="dock">
          <button type="button" className="go-btn" onClick={() => go('', true)}>
            Done
          </button>
        </div>
      )}
      {pickerSheet}
    </div>
  )
}

function EditExercise({
  workoutId,
  entry,
  exercise,
  unit,
  onSwap,
}: {
  workoutId: number
  entry: WorkoutExercise
  exercise: Exercise | undefined
  unit: string
  onSwap: () => void
}) {
  const change = (fn: (we: WorkoutExercise) => void) => updateExercise(workoutId, entry.uid, fn)
  return (
    <li className={'edit-ex' + (exercise ? ` fam-${family(exercise.primary)}` : '')}>
      <div className="edit-head">
        <button type="button" className="edit-name" onClick={onSwap} disabled={!exercise}>
          {exercise?.name ?? 'Unknown exercise'}
          <Icon name="swap" size={16} />
        </button>
        <ConfirmButton
          className="icon-btn danger"
          confirm={<Icon name="trash" size={18} />}
          onConfirm={() =>
            updateWorkout(workoutId, (w) => {
              w.exercises = w.exercises.filter((e) => e.uid !== entry.uid)
            })
          }
        >
          <Icon name="x" size={18} />
        </ConfirmButton>
      </div>
      {entry.sets.map((s, i) => (
        <div key={i} className="edit-set">
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
            placeholder="reps"
            onChange={(v) => change((we) => void (we.sets[i].reps = v))}
          />
        </div>
      ))}
      <div className="edit-foot">
        <button
          type="button"
          className="text-link"
          onClick={() =>
            change((we) => {
              const prev = we.sets[we.sets.length - 1]
              we.sets.push({ weight: prev?.weight ?? null, reps: null, done: true })
            })
          }
        >
          + Set
        </button>
        {entry.sets.length > 1 && (
          <button type="button" className="text-link muted" onClick={() => change((we) => void we.sets.pop())}>
            − Set
          </button>
        )}
      </div>
    </li>
  )
}
