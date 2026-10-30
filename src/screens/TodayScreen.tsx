import { useState } from 'react'
import { MuscleTag, NumInput, Icon } from '../components/ui'
import { db, type Settings, type Workout } from '../db'
import { go, useActiveWorkout, useBodyweights, useExerciseMap, useNow, useSettings, useWorkouts } from '../hooks'
import { startWorkout } from '../lib/actions'
import { READY_AT, suggestWorkout, type Suggestion, type Target } from '../lib/engine'
import { dateKey, fmtClock, fmtW, pad2, relativeDay } from '../lib/format'
import { MUSCLE_LABEL, MUSCLES } from '../lib/muscles'

export function TodayScreen() {
  const workouts = useWorkouts()
  const exMap = useExerciseMap()
  const settings = useSettings()
  const active = useActiveWorkout()
  const [anyway, setAnyway] = useState(false)
  const now = useNow(60_000)

  if (!workouts || active === undefined) return <div className="page" />

  const finished = workouts.filter((w) => w.finishedAt !== null)
  const s = suggestWorkout({ workouts, exMap, settings, now, includeRecovering: anyway })
  const last = finished[0]

  return (
    <div className="page today">
      <header className="page-head">
        <span className="eyebrow">{new Date(now).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <h1 className="display">Today</h1>
        {last && <p className="muted">Last workout: {relativeDay(last.startedAt, now).toLowerCase()}</p>}
      </header>

      {active ? (
        <ActiveCard workout={active} />
      ) : (
        <SuggestionCard s={s} settings={settings} anyway={anyway} onAnyway={() => setAnyway(true)} isFirst={!finished.length} />
      )}

      <WeighInCard settings={settings} />

      <section className="card">
        <div className="row between">
          <h2 className="h2">Recovery</h2>
          <span className="muted small">ready at {READY_AT}%</span>
        </div>
        <div className="recovery">
          {MUSCLES.map((m) => {
            const f = s.freshness[m]
            return (
              <div key={m} className={'rec' + (f >= READY_AT ? ' ready' : '')}>
                <span>{MUSCLE_LABEL[m]}</span>
                <div className="rec-bar">
                  <i style={{ width: `${f}%` }} />
                </div>
                <b>{f}%</b>
              </div>
            )
          })}
        </div>
      </section>

      <ThisWeek workouts={finished} now={now} />
    </div>
  )
}

function ActiveCard({ workout }: { workout: Workout }) {
  const now = useNow()
  const sets = workout.exercises.flatMap((e) => e.sets)
  return (
    <button type="button" className="card active-card" onClick={() => go(`workout/${workout.id}`)}>
      <span className="live-pill">Live</span>
      <span className="clock">{fmtClock((now - workout.startedAt) / 1000)}</span>
      <span className="muted">
        {sets.filter((x) => x.done).length}/{sets.length} sets · tap to continue
      </span>
    </button>
  )
}

function targetText(t: Target, settings: Settings, repMin: number, repMax: number) {
  const n = t.reps.length
  if (t.weight === null) return `${n} × ${repMin}–${repMax}`
  const reps = t.reps.every((r) => r === t.reps[0]) ? `${t.reps[0]}` : t.reps.join('/')
  if (t.rule === 'bodyweight' && !t.weight) return `${n} × ${reps}`
  return `${n} × ${reps} @ ${fmtW(t.weight)} ${settings.unit}`
}

function SuggestionCard({
  s,
  settings,
  anyway,
  onAnyway,
  isFirst,
}: {
  s: Suggestion
  settings: Settings
  anyway: boolean
  onAnyway: () => void
  isFirst: boolean
}) {
  const [starting, setStarting] = useState(false)
  const start = async (withItems: boolean) => {
    setStarting(true)
    const id = await startWorkout(withItems ? s.items : [])
    go(`workout/${id}`)
  }
  const sets = s.items.length * settings.setsPerExercise

  if (s.restDay && !anyway) {
    return (
      <section className="card rest-day">
        <span className="eyebrow">Suggested</span>
        <h2 className="display small">Rest day</h2>
        <p>
          Most of your plan is still recovering from your last session. Muscle grows while you rest, so take today off
          from lifting.
        </p>
        <p className="muted">
          For fat loss, a 30–45 minute walk or easy cardio works well today without slowing recovery.
        </p>
        <RecoveringList s={s} />
        <div className="row gap">
          <button type="button" className="btn ghost" onClick={onAnyway}>
            Train anyway
          </button>
          <button type="button" className="btn ghost" onClick={() => start(false)} disabled={starting}>
            Empty workout
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="card suggest">
      <div className="row between">
        <span className="eyebrow">Suggested · full body</span>
        <span className="muted small">
          {s.items.length} exercises · {sets} sets · ~{s.minutes} min
        </span>
      </div>
      {isFirst && (
        <p className="muted small">
          Built from your plan in Settings. The order follows the rules: compounds first, alternating legs and upper body,
          arms after the lifts they help with.
        </p>
      )}
      <ol className="plan">
        {s.items.map((it, i) => (
          <li key={it.exercise.id}>
            <span className="ord">{pad2(i + 1)}</span>
            <div>
              <div className="plan-name">
                <a href={`#/exercise/${it.exercise.id}`}>{it.exercise.name}</a>
                {it.target.rule === 'increase' && <span className="up" title="Weight goes up">▲</span>}
                {it.target.rule === 'deload' && <span className="down" title="Lighter this time">▼</span>}
              </div>
              <div className="plan-meta">
                <MuscleTag muscle={it.exercise.primary} />
                <span>{targetText(it.target, settings, it.exercise.repMin, it.exercise.repMax)}</span>
              </div>
              <p className="reason">{it.reason}</p>
            </div>
          </li>
        ))}
      </ol>
      {!s.items.length && <p className="muted">Nothing in your plan is ready. Pick muscles in Settings.</p>}
      <RecoveringList s={s} />
      <div className="row gap">
        <button
          type="button"
          className="btn primary grow"
          onClick={() => start(true)}
          disabled={starting || !s.items.length}
        >
          Start workout
        </button>
        <button type="button" className="btn ghost" onClick={() => start(false)} disabled={starting}>
          Empty
        </button>
      </div>
    </section>
  )
}

function RecoveringList({ s }: { s: Suggestion }) {
  if (!s.recovering.length) return null
  return (
    <p className="recovering">
      <span className="muted small">Still recovering:</span>
      {s.recovering.map((r) => (
        <span key={r.muscle} className="tag plain">
          {MUSCLE_LABEL[r.muscle]} {r.freshness}%
        </span>
      ))}
    </p>
  )
}

function WeighInCard({ settings }: { settings: Settings }) {
  const entries = useBodyweights()
  const today = dateKey()
  const todays = entries?.find((e) => e.date === today)
  const [value, setValue] = useState<number | null>(null)
  if (!entries) return null
  if (todays) {
    return (
      <button type="button" className="card weigh done" onClick={() => go('progress')}>
        <Icon name="check" size={18} />
        <span>
          Weighed in: <b>{fmtW(todays.weight)} {settings.unit}</b>
        </span>
        <span className="muted small">see trend →</span>
      </button>
    )
  }
  const save = async () => {
    if (!value) return
    await db.bodyweights.put({ date: today, weight: value })
  }
  return (
    <section className="card weigh">
      <div>
        <h2 className="h2">Morning weigh-in</h2>
        <p className="muted small">Same time daily, after the bathroom. The 7-day average is what counts.</p>
      </div>
      <div className="row gap">
        <NumInput decimal label="Body weight" value={value} onChange={setValue} placeholder={settings.unit} className="wide-num" />
        <button type="button" className="btn primary" disabled={!value} onClick={save}>
          Save
        </button>
      </div>
    </section>
  )
}

function ThisWeek({ workouts, now }: { workouts: Workout[]; now: number }) {
  const weekStart = new Date(now)
  weekStart.setHours(0, 0, 0, 0)
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })
  const trained = new Set(workouts.map((w) => dateKey(new Date(w.startedAt))))
  const count = days.filter((d) => trained.has(dateKey(d))).length
  return (
    <section className="card">
      <div className="row between">
        <h2 className="h2">This week</h2>
        <span className="muted small">{count} workout{count === 1 ? '' : 's'} · aim for 3</span>
      </div>
      <div className="week">
        {days.map((d) => {
          const k = dateKey(d)
          return (
            <div key={k} className={'day' + (trained.has(k) ? ' on' : '') + (k === dateKey(new Date(now)) ? ' today' : '')}>
              <span>{d.toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
              <i />
            </div>
          )
        })}
      </div>
    </section>
  )
}
