import { useEffect, useState } from 'react'
import { CheckInCard, useCheckIn } from '../components/CheckIn'
import { LineChart } from '../components/LineChart'
import { StepsChart } from '../components/StepsChart'
import { ConfirmButton, Icon, Meter } from '../components/ui'
import { db, type BodyWeight, type Settings, type StepDay, type Waist, type Workout } from '../db'
import { go, useBodyweights, useExerciseMap, useNow, useSettings, useSteps, useWaists, useWorkouts } from '../hooks'
import { dropEmptyWorkouts, logPastWorkout } from '../lib/actions'
import { bodyVerdict } from '../lib/body'
import { bestSet, daysBetween, doneSets, e1rm, exerciseHistory, trendLine, weeklyRate, weeklySets, type ExerciseMap } from '../lib/engine'
import { dateKey, fmtDuration, fmtSigned, fmtW, relativeDay } from '../lib/format'
import { MUSCLE_LABEL, MUSCLES, type Muscle } from '../lib/muscles'
import { waistShown, waistUnit } from '../lib/waist'

export function ProgressScreen() {
  const workouts = useWorkouts()
  const exMap = useExerciseMap()
  const settings = useSettings()
  const entries = useBodyweights()
  const steps = useSteps()
  const waists = useWaists()
  const check = useCheckIn()
  const now = useNow(60_000)
  useEffect(() => void dropEmptyWorkouts(), [])
  if (!workouts || !entries || !steps || !waists) return <div className="page" />
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

      {check && finished.length > 0 && <CheckInCard check={check} />}
      <BodyCard entries={entries} waists={waists} settings={settings} />
      <StepsCard steps={steps} goal={settings.stepGoal} now={now} />
      <LiftsCard workouts={finished} exMap={exMap} />
      <VolumeCard workouts={workouts} exMap={exMap} now={now} target={settings.weeklySetTarget} priority={settings.priorityMuscles} />
      <WorkoutsCard workouts={finished} exMap={exMap} now={now} />
    </div>
  )
}

// ---------------------------------------------------------------------------

const dayX = (d: string) => Date.parse(d + 'T12:00:00')
const shortDate = (v: number) => new Date(v).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
/** Weight and waist together: for losing fat while gaining muscle, neither tells the story alone. */
function BodyCard({ entries, waists, settings }: { entries: BodyWeight[]; waists: Waist[]; settings: Settings }) {
  const [showAll, setShowAll] = useState(false)
  const unit = settings.unit
  const wu = waistUnit(unit)
  const trend = trendLine(entries)
  const rate = weeklyRate(entries)
  const current = trend[trend.length - 1]?.avg
  const verdict = bodyVerdict(entries, waists)
  const pct = verdict.weightPct

  // Both charts share one date range so they line up.
  const dates = [...entries.map((e) => e.date), ...waists.map((w) => w.date)].sort()
  const domain: [number, number] | undefined = dates.length ? [dayX(dates[0]), dayX(dates[dates.length - 1])] : undefined

  const lastWaist = waists[waists.length - 1]
  const fourWeeksBack = lastWaist && [...waists].reverse().find((w) => daysBetween(w.date, lastWaist.date) >= 28)
  const base = fourWeeksBack ?? waists[0]
  const change = lastWaist && base && base !== lastWaist ? waistShown(lastWaist.cm, unit) - waistShown(base.cm, unit) : null
  const perWeek = verdict.waistPerWeek === null ? null : unit === 'kg' ? verdict.waistPerWeek : verdict.waistPerWeek / 2.54

  return (
    <section className="card">
      <h2 className="h2">Weight and waist</h2>
      {current === undefined ? (
        <p className="muted small">Weigh in from the Today screen each morning. The trend shows up here.</p>
      ) : (
        <div className="stats">
          <div>
            <b>{current.toFixed(1)}</b>
            <small>7-day avg ({unit})</small>
          </div>
          <div>
            <b>{rate === null ? '–' : fmtSigned(rate, 2)}</b>
            <small>{unit} per week</small>
          </div>
          <div>
            <b>{pct === null ? '–' : `${fmtSigned(pct)}%`}</b>
            <small>Of body weight</small>
          </div>
        </div>
      )}
      <p className={'advice ' + verdict.tone}>{verdict.text}</p>

      {entries.length > 1 && (
        <>
          <LineChart
            line={trend.map((t) => ({ x: dayX(t.date), y: t.avg }))}
            dots={entries.map((e) => ({ x: dayX(e.date), y: e.weight }))}
            xDomain={domain}
            label="Body weight, 7-day average"
            formatY={(v) => fmtW(Number(v.toFixed(1)))}
            formatX={shortDate}
            tooltip={(i) => `${shortDate(dayX(entries[i].date))} · ${fmtW(entries[i].weight)} · avg ${trend[i].avg.toFixed(1)}`}
          />
          <div className="legend">
            <span>
              <i className="key-line" /> Weight, 7-day average
            </span>
            <span>
              <i className="key-dot" /> Weigh-ins
            </span>
          </div>
        </>
      )}

      <div className="stats waist-stats">
        <div>
          <b>{lastWaist ? fmtW(waistShown(lastWaist.cm, unit)) : '–'}</b>
          <small>Waist ({wu})</small>
        </div>
        <div>
          <b>{change === null ? '–' : fmtSigned(change)}</b>
          <small>{base && change !== null ? `Since ${shortDate(dayX(base.date))}` : 'Change'}</small>
        </div>
        <div>
          <b>{perWeek === null ? '–' : fmtSigned(perWeek, 2)}</b>
          <small>{wu} per week</small>
        </div>
      </div>
      {waists.length > 1 ? (
        <LineChart
          line={waists.map((w) => ({ x: dayX(w.date), y: waistShown(w.cm, unit) }))}
          xDomain={domain}
          height={140}
          label={`Waist (${wu})`}
          formatY={(v) => fmtW(Number(v.toFixed(1)))}
          formatX={shortDate}
          tooltip={(i) => `${shortDate(dayX(waists[i].date))} · ${fmtW(waistShown(waists[i].cm, unit))} ${wu}`}
        />
      ) : (
        <p className="muted small">
          Measure your waist once a week when you weigh in. It shows fat coming off even when the scale doesn't move.
        </p>
      )}

      {(entries.length > 0 || waists.length > 0) && (
        <>
          <button type="button" className="text-link muted" onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Hide entries' : `All entries (${entries.length + waists.length})`}
          </button>
          {showAll && (
            <table className="log">
              <tbody>
                {[
                  ...entries.map((e) => ({
                    key: `w${e.id}`,
                    date: e.date,
                    text: `${fmtW(e.weight)} ${unit}`,
                    del: () => void db.bodyweights.delete(e.id!),
                  })),
                  ...waists.map((w) => ({
                    key: `c${w.id}`,
                    date: w.date,
                    text: `Waist ${fmtW(waistShown(w.cm, unit))} ${wu}`,
                    del: () => void db.waists.delete(w.id!),
                  })),
                ]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((r) => (
                    <tr key={r.key}>
                      <th>{new Date(dayX(r.date)).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</th>
                      <td>{r.text}</td>
                      <td className="end">
                        <ConfirmButton className="text-link danger" confirm="Delete?" onConfirm={r.del}>
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

function VolumeCard({
  workouts,
  exMap,
  now,
  target,
  priority,
}: {
  workouts: Workout[]
  exMap: ExerciseMap
  now: number
  target: number
  priority: readonly Muscle[]
}) {
  const weekly = weeklySets(workouts, exMap, now)
  const trained = MUSCLES.filter((m) => weekly[m] > 0)
  if (!trained.length) return null
  return (
    <section className="card">
      <h2 className="h2">Sets per muscle · last 7 days</h2>
      <p className="muted small">
        Growth needs roughly {target}–20 hard sets per muscle each week. The line marks {target}.
        {priority.length > 0 && ' ★ marks your priority muscles, which get extra sets.'}
      </p>
      <div className="volume">
        {MUSCLES.map((m) => {
          const v = weekly[m]
          return (
            <div key={m} className="vol-row">
              <span>
                {MUSCLE_LABEL[m]}
                {priority.includes(m) && <b className="prio-star"> ★</b>}
              </span>
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
