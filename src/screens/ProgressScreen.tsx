import { useEffect, useState } from 'react'
import { LineChart } from '../components/LineChart'
import { StepsChart } from '../components/StepsChart'
import { ConfirmButton, Icon, Meter } from '../components/ui'
import { db, type BodyWeight, type Settings, type StepDay, type Workout } from '../db'
import { go, useBodyweights, useExerciseMap, useNow, useSettings, useSteps, useWorkouts } from '../hooks'
import { dropEmptyWorkouts, logPastWorkout } from '../lib/actions'
import { bestSet, doneSets, e1rm, exerciseHistory, trendLine, weeklyRate, weeklySets, type ExerciseMap } from '../lib/engine'
import { dateKey, fmtDuration, fmtW, relativeDay } from '../lib/format'
import { MUSCLE_LABEL, MUSCLES } from '../lib/muscles'

export function ProgressScreen() {
  const workouts = useWorkouts()
  const exMap = useExerciseMap()
  const settings = useSettings()
  const entries = useBodyweights()
  const steps = useSteps()
  const now = useNow(60_000)
  useEffect(() => void dropEmptyWorkouts(), [])
  if (!workouts || !entries || !steps) return <div className="page" />
  const finished = workouts.filter((w) => w.finishedAt !== null)

  return (
    <div className="page">
      <header className="page-head">
        <div className="row between">
          <span className="eyebrow">Bigger and leaner</span>
          <button type="button" className="icon-btn" onClick={() => go('settings')} aria-label="Settings">
            <Icon name="settings" />
          </button>
        </div>
        <h1 className="display">Progress</h1>
      </header>

      <BodyWeightCard entries={entries} settings={settings} />
      <StepsCard steps={steps} goal={settings.stepGoal} now={now} />
      <LiftsCard workouts={finished} exMap={exMap} />
      <VolumeCard workouts={workouts} exMap={exMap} now={now} target={settings.weeklySetTarget} />
      <WorkoutsCard workouts={finished} exMap={exMap} now={now} />
    </div>
  )
}

// ---------------------------------------------------------------------------

function BodyWeightCard({ entries, settings }: { entries: BodyWeight[]; settings: Settings }) {
  const [showAll, setShowAll] = useState(false)
  const unit = settings.unit
  const trend = trendLine(entries)
  const rate = weeklyRate(entries)
  const current = trend[trend.length - 1]?.avg
  const pct = rate !== null && current ? (rate / current) * 100 : null
  const toX = (d: string) => Date.parse(d + 'T12:00:00')

  return (
    <section className="card">
      <h2 className="h2">Body weight</h2>
      {current === undefined ? (
        <p className="muted small">Weigh in from the Today screen each morning. The trend shows up here.</p>
      ) : (
        <div className="stats">
          <div>
            <b>{current.toFixed(1)}</b>
            <small>7-day avg ({unit})</small>
          </div>
          <div>
            <b>{rate === null ? '–' : `${rate > 0 ? '+' : ''}${fmtW(Number(rate.toFixed(2)))}`}</b>
            <small>Per week</small>
          </div>
          <div>
            <b>{pct === null ? '–' : `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`}</b>
            <small>Of body weight</small>
          </div>
        </div>
      )}
      {current !== undefined && <RateAdvice pct={pct} />}

      {entries.length > 1 && (
        <>
          <LineChart
            line={trend.map((t) => ({ x: toX(t.date), y: t.avg }))}
            dots={entries.map((e) => ({ x: toX(e.date), y: e.weight }))}
            label="Body weight, 7-day average"
            formatY={(v) => fmtW(Number(v.toFixed(1)))}
            formatX={(v) => new Date(v).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
            tooltip={(i) =>
              `${new Date(toX(entries[i].date)).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · ${fmtW(entries[i].weight)} · avg ${trend[i].avg.toFixed(1)}`
            }
          />
          <div className="legend">
            <span>
              <i className="key-line" /> 7-day average
            </span>
            <span>
              <i className="key-dot" /> Weigh-ins
            </span>
          </div>
        </>
      )}

      {entries.length > 0 && (
        <>
          <button type="button" className="text-link muted" onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Hide weigh-ins' : `All weigh-ins (${entries.length})`}
          </button>
          {showAll && (
            <table className="log">
              <tbody>
                {[...entries].reverse().map((e) => (
                  <tr key={e.id}>
                    <th>{new Date(e.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</th>
                    <td>
                      {fmtW(e.weight)} {unit}
                    </td>
                    <td className="end">
                      <ConfirmButton className="text-link danger" confirm="Delete?" onConfirm={() => db.bodyweights.delete(e.id!)}>
                        ×
                      </ConfirmButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  )
}

function RateAdvice({ pct }: { pct: number | null }) {
  if (pct === null) return <p className="muted small">The weekly rate shows up after about a week of weigh-ins.</p>
  let text: string
  let tone: string
  if (pct > 0.25) {
    text = 'Going up. If the goal is to lean out, trim portions a little and keep protein high.'
    tone = 'warn'
  } else if (pct >= -0.25) {
    text = 'Holding steady. Fine for building muscle while slowly recomposing. For faster fat loss, eat a little less or walk more.'
    tone = 'neutral'
  } else if (pct >= -1) {
    text = 'Losing at a muscle-friendly pace (0.25–1% a week). Keep protein high and keep adding reps.'
    tone = 'good'
  } else {
    text = 'Dropping faster than 1% a week, which risks losing muscle. Consider eating a bit more.'
    tone = 'warn'
  }
  return <p className={'advice ' + tone}>{text}</p>
}

// ---------------------------------------------------------------------------

function StepsCard({ steps, goal, now }: { steps: StepDay[]; goal: number; now: number }) {
  const byDate = new Map(steps.map((s) => [s.date, s.steps]))
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now)
    d.setDate(d.getDate() - 13 + i)
    const date = dateKey(d)
    return { date, steps: byDate.get(date) ?? null }
  })
  const week = days.slice(-7).filter((d) => d.steps !== null) as { date: string; steps: number }[]
  const avg = week.length ? Math.round(week.reduce((s, d) => s + d.steps, 0) / week.length) : null
  const met = week.filter((d) => d.steps >= goal).length

  return (
    <section className="card">
      <h2 className="h2">Steps</h2>
      {!steps.length ? (
        <p className="muted small">Tap the steps tile on the Today screen to bring them in from Apple Health, or type them.</p>
      ) : (
        <>
          <div className="stats">
            <div>
              <b>{avg === null ? '–' : avg.toLocaleString()}</b>
              <small>Daily avg, 7 days</small>
            </div>
            <div>
              <b>
                {met}/{week.length || 0}
              </b>
              <small>Days at goal</small>
            </div>
            <div>
              <b>{goal >= 1000 ? `${goal / 1000}k` : goal}</b>
              <small>Goal</small>
            </div>
          </div>
          <StepsChart days={days} goal={goal} />
          <p className="muted small">Walking more is the easiest way to burn extra fat without cutting into recovery.</p>
        </>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------

function LiftsCard({ workouts, exMap }: { workouts: Workout[]; exMap: ExerciseMap }) {
  const lifts = [...new Set(workouts.flatMap((w) => w.exercises.map((e) => e.exerciseId)))]
    .map((id) => {
      const sessions = exerciseHistory(workouts, id)
      const first = bestSet(sessions[sessions.length - 1]?.sets ?? [])
      const last = bestSet(sessions[0]?.sets ?? [])
      return { id, ex: exMap.get(id), sessions, first, last }
    })
    .filter((l) => l.ex && l.sessions.length)
    .sort((a, b) => b.sessions[0].date - a.sessions[0].date)

  return (
    <section className="card">
      <h2 className="h2">Strength</h2>
      {!lifts.length && <p className="muted small">Your lifts show up here after your first workout.</p>}
      <ul className="lifts">
        {lifts.map(({ id, ex, sessions, first, last }) => {
          const weighted = !!last && last.weight > 0
          const change = first && last && weighted ? e1rm(last.weight, last.reps) / e1rm(first.weight, first.reps) - 1 : 0
          return (
            <li key={id}>
              <a href={`#/exercise/${id}`}>
                <span>{ex!.name}</span>
                <small className="muted">
                  {sessions.length} session{sessions.length === 1 ? '' : 's'} · {relativeDay(sessions[0].date).toLowerCase()}
                </small>
              </a>
              <span className="lift-best">
                {last ? `${last.weight ? fmtW(last.weight) + '×' : ''}${last.reps}` : ''}
                {sessions.length > 1 && weighted && (
                  <small className={change > 0 ? 'up' : change < 0 ? 'down' : 'muted'}>
                    {change > 0 ? '+' : ''}
                    {Math.round(change * 100)}%
                  </small>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function VolumeCard({ workouts, exMap, now, target }: { workouts: Workout[]; exMap: ExerciseMap; now: number; target: number }) {
  const weekly = weeklySets(workouts, exMap, now)
  const trained = MUSCLES.filter((m) => weekly[m] > 0)
  if (!trained.length) return null
  return (
    <section className="card">
      <h2 className="h2">Sets per muscle · last 7 days</h2>
      <p className="muted small">
        Growth needs roughly {target}–20 hard sets per muscle each week. The line marks {target}.
      </p>
      <div className="volume">
        {MUSCLES.map((m) => {
          const v = weekly[m]
          return (
            <div key={m} className="vol-row">
              <span>{MUSCLE_LABEL[m]}</span>
              <Meter value={v} max={Math.max(20, v)} marker={target} tone={v >= target ? 'met' : ''} />
              <b>{fmtW(v)}</b>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------

function WorkoutsCard({ workouts, exMap, now }: { workouts: Workout[]; exMap: ExerciseMap; now: number }) {
  const [all, setAll] = useState(false)
  const shown = all ? workouts : workouts.slice(0, 6)
  return (
    <section className="card">
      <div className="row between">
        <h2 className="h2">Workouts</h2>
        <button type="button" className="text-link" onClick={async () => go(`workout/${await logPastWorkout(exMap)}/edit`)}>
          + Log a past one
        </button>
      </div>
      {!workouts.length && <p className="muted small">Finished workouts show up here.</p>}
      <ul className="history">
        {shown.map((w) => {
          const sets = w.exercises.flatMap(doneSets)
          const d = new Date(w.startedAt)
          return (
            <li key={w.id}>
              <a href={`#/workout/${w.id}`} className="hist">
                <span className="hist-date">
                  <b>{d.getDate()}</b>
                  <span>{d.toLocaleDateString(undefined, { month: 'short' })}</span>
                </span>
                <span className="hist-body">
                  <span className="row between">
                    <span className="eyebrow">{relativeDay(w.startedAt, now)}</span>
                    <span className="muted small">
                      {fmtDuration((w.finishedAt ?? w.startedAt) - w.startedAt)} · {sets.length} sets
                    </span>
                  </span>
                  <span className="hist-names">{w.exercises.map((e) => exMap.get(e.exerciseId)?.name ?? '?').join(' · ')}</span>
                </span>
              </a>
            </li>
          )
        })}
      </ul>
      {workouts.length > 6 && (
        <button type="button" className="text-link muted" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${workouts.length}`}
        </button>
      )}
    </section>
  )
}
