import { useState } from 'react'
import { StepsTile, WeightTile } from '../components/Daily'
import { Icon } from '../components/ui'
import type { Settings, Workout } from '../db'
import { go, useActiveWorkout, useExerciseMap, useNow, useSettings, useWorkouts } from '../hooks'
import { logPastWorkout, startWorkout } from '../lib/actions'
import { suggestWorkout, type SuggestedItem, type Target } from '../lib/engine'
import { dateKey, fmtClock, fmtW, pad2, relativeDay } from '../lib/format'
import { family, MUSCLE_LABEL, type Muscle } from '../lib/muscles'

export function TodayScreen() {
  const workouts = useWorkouts()
  const exMap = useExerciseMap()
  const settings = useSettings()
  const active = useActiveWorkout()
  const [anyway, setAnyway] = useState(false)
  const [starting, setStarting] = useState(false)
  const now = useNow(30_000)

  if (!workouts || active === undefined) return <div className="page" />

  const finished = workouts.filter((w) => w.finishedAt !== null)
  const s = suggestWorkout({ workouts, exMap, settings, now, includeRecovering: anyway })
  const resting = !active && s.restDay && !anyway
  const sets = s.items.reduce((n, it) => n + it.target.reps.length, 0)

  const start = async () => {
    setStarting(true)
    const id = await startWorkout(s.items)
    go(`workout/${id}`)
  }

  let title = 'Full body'
  let sub = `${s.items.length} lifts · ${sets} sets · about ${s.minutes} min`
  if (active) {
    title = 'Workout on'
    sub = 'Pick up where you left off'
  } else if (resting) {
    title = 'Rest day'
    sub = `Muscles grow while they recover. Walk instead: ${settings.stepGoal.toLocaleString()} steps.`
  } else if (!s.items.length) {
    sub = 'Choose muscles for your plan in Settings.'
  }

  return (
    <div className="page today">
      <header className="hero">
        <div className="row between">
          <span className="eyebrow">{new Date(now).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          <WeekDots workouts={finished} now={now} />
        </div>
        <h1 className="display xl">{title}</h1>
        <p className="hero-sub">{sub}</p>
      </header>

      <div className="tiles">
        <StepsTile settings={settings} />
        <WeightTile settings={settings} />
      </div>

      {active ? (
        <ActivePlan workout={active} />
      ) : resting ? (
        <RecoveringNote s={s.recovering} resting />
      ) : (
        <>
          <PlanList items={s.items} settings={settings} />
          <RecoveringNote s={s.recovering} />
        </>
      )}

      {!finished.length && !active && (
        <button
          type="button"
          className="text-link"
          onClick={async () => go(`workout/${await logPastWorkout(exMap)}/edit`)}
        >
          Trained before installing? Log that workout
        </button>
      )}

      <InstallHint />

      <div className="dock">
        {active ? (
          <ContinueButton workout={active} />
        ) : resting ? (
          <button type="button" className="go-btn quiet" onClick={() => setAnyway(true)}>
            Train anyway
          </button>
        ) : (
          <button type="button" className="go-btn" onClick={start} disabled={starting || !s.items.length}>
            <Icon name="play" size={22} />
            <span>Start workout</span>
          </button>
        )}
      </div>
    </div>
  )
}

function ContinueButton({ workout }: { workout: Workout }) {
  const now = useNow()
  return (
    <button type="button" className="go-btn live" onClick={() => go(`workout/${workout.id}`)}>
      <span className="live-pill">Live</span>
      <span>Continue</span>
      <span className="go-clock">{fmtClock((now - workout.startedAt) / 1000)}</span>
    </button>
  )
}

function targetText(t: Target, unit: string) {
  const n = t.reps.length
  if (t.weight === null) return `${n} sets · pick a weight`
  const reps = t.reps.every((r) => r === t.reps[0]) ? `${t.reps[0]}` : t.reps.join('/')
  if (!t.weight) return `${n} × ${reps}`
  return `${n} × ${reps} · ${fmtW(t.weight)} ${unit}`
}

function PlanList({ items, settings }: { items: SuggestedItem[]; settings: Settings }) {
  if (!items.length) return null
  return (
    <ol className="plan">
      {items.map((it, i) => (
        <li key={it.exercise.id} className={`fam-${family(it.exercise.primary)}`}>
          <span className="ord">{pad2(i + 1)}</span>
          <span className="plan-name">{it.exercise.name}</span>
          <span className="plan-target">
            {it.target.rule === 'increase' && <b className="up">▲ </b>}
            {it.target.rule === 'deload' && <b className="down">▼ </b>}
            {targetText(it.target, settings.unit)}
          </span>
        </li>
      ))}
    </ol>
  )
}

function ActivePlan({ workout }: { workout: Workout }) {
  const exMap = useExerciseMap()
  return (
    <ol className="plan">
      {workout.exercises.map((e, i) => {
        const done = e.sets.filter((s) => s.done).length
        const ex = exMap.get(e.exerciseId)
        return (
          <li key={e.uid} className={(ex ? `fam-${family(ex.primary)}` : '') + (done === e.sets.length && done ? ' complete' : '')}>
            <span className="ord">{done === e.sets.length && done ? '✓' : pad2(i + 1)}</span>
            <span className="plan-name">{ex?.name ?? 'Exercise'}</span>
            <span className="plan-target">
              {done}/{e.sets.length} sets
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function RecoveringNote({ s, resting }: { s: { muscle: Muscle; freshness: number }[]; resting?: boolean }) {
  if (!s.length) return null
  const names = s.map((r) => MUSCLE_LABEL[r.muscle].toLowerCase())
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]
  return (
    <p className={'recovering' + (resting ? ' big' : '')}>
      {resting ? 'Still recovering: ' : 'Skipping today, still recovering: '}
      <b>{list}</b>.
    </p>
  )
}

/** Mon–Sun, filled on days you trained. */
function WeekDots({ workouts, now }: { workouts: Workout[]; now: number }) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  const trained = new Set(workouts.map((w) => dateKey(new Date(w.startedAt))))
  const today = dateKey(new Date(now))
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    return d
  })
  const count = days.filter((d) => trained.has(dateKey(d))).length
  const last = workouts[0]
  return (
    <span
      className="week-dots"
      aria-label={`${count} workouts this week${last ? `, last ${relativeDay(last.startedAt, now).toLowerCase()}` : ''}`}
    >
      {days.map((d) => {
        const k = dateKey(d)
        return <i key={k} className={(trained.has(k) ? 'on' : '') + (k === today ? ' is-today' : '')} title={d.toLocaleDateString(undefined, { weekday: 'long' })} />
      })}
    </span>
  )
}

function InstallHint() {
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone
  if (standalone) return null
  return (
    <p className="install-hint">
      <b>Install it:</b> on iPhone tap Share → Add to Home Screen. It opens full screen and works offline at the gym.
    </p>
  )
}
