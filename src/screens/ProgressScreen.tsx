import { useState } from 'react'
import { LineChart } from '../components/LineChart'
import { ConfirmButton, Meter, NumInput } from '../components/ui'
import { db, type BodyWeight, type Settings } from '../db'
import { useBodyweights, useExerciseMap, useNow, useSettings, useWorkouts } from '../hooks'
import { bestSet, e1rm, exerciseHistory, trendLine, weeklyRate, weeklySets } from '../lib/engine'
import { dateKey, fmtW, relativeDay } from '../lib/format'
import { MUSCLE_LABEL, MUSCLES } from '../lib/muscles'

export function ProgressScreen() {
  const workouts = useWorkouts()
  const exMap = useExerciseMap()
  const settings = useSettings()
  const entries = useBodyweights()
  const now = useNow(60_000)
  if (!workouts || !entries) return <div className="page" />

  const weekly = weeklySets(workouts, exMap, now)
  const target = settings.weeklySetTarget
  const lifts = [...new Set(workouts.filter((w) => w.finishedAt !== null).flatMap((w) => w.exercises.map((e) => e.exerciseId)))]
    .map((id) => {
      const sessions = exerciseHistory(workouts, id)
      const first = bestSet(sessions[sessions.length - 1]?.sets ?? [])
      const last = bestSet(sessions[0]?.sets ?? [])
      return { id, ex: exMap.get(id), sessions, first, last }
    })
    .filter((l) => l.ex && l.sessions.length)
    .sort((a, b) => b.sessions[0].date - a.sessions[0].date)

  return (
    <div className="page">
      <header className="page-head">
        <span className="eyebrow">Bigger and leaner</span>
        <h1 className="display">Progress</h1>
      </header>

      <BodyWeightCard entries={entries} settings={settings} />

      <section className="card">
        <div className="row between">
          <h2 className="h2">Sets per muscle · last 7 days</h2>
        </div>
        <p className="muted small">
          Aim for at least {target} hard sets a week per muscle (up to ~20). Exercises that also work a muscle count as
          half a set.
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

      <section className="card">
        <h2 className="h2">Lifts</h2>
        {!lifts.length && <p className="muted small">Your exercises show up here after your first workout.</p>}
        <ul className="lifts">
          {lifts.map(({ id, ex, sessions, first, last }) => {
            const weighted = !!last && last.weight > 0
            const change = first && last && weighted ? e1rm(last.weight, last.reps) / e1rm(first.weight, first.reps) - 1 : 0
            return (
              <li key={id}>
                <a href={`#/exercise/${id}`}>
                  <span>{ex!.name}</span>
                  <small className="muted">
                    {sessions.length} session{sessions.length === 1 ? '' : 's'} · last {relativeDay(sessions[0].date).toLowerCase()}
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
    </div>
  )
}

function BodyWeightCard({ entries, settings }: { entries: BodyWeight[]; settings: Settings }) {
  const today = dateKey()
  const [date, setDate] = useState(today)
  const existing = entries.find((e) => e.date === date)
  const [value, setValue] = useState<number | null>(null)
  const [showAll, setShowAll] = useState(false)
  const unit = settings.unit

  const trend = trendLine(entries)
  const rate = weeklyRate(entries)
  const current = trend[trend.length - 1]?.avg
  const pct = rate !== null && current ? (rate / current) * 100 : null
  const toX = (d: string) => Date.parse(d + 'T12:00:00')

  const save = async () => {
    if (!value) return
    const prior = await db.bodyweights.where('date').equals(date).first()
    if (prior?.id) await db.bodyweights.update(prior.id, { weight: value })
    else await db.bodyweights.add({ date, weight: value })
    setValue(null)
  }

  return (
    <section className="card">
      <h2 className="h2">Body weight</h2>
      <div className="row gap wrap">
        <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} aria-label="Date" />
        <NumInput
          decimal
          label="Body weight"
          value={value}
          onChange={setValue}
          placeholder={existing ? fmtW(existing.weight) : unit}
          className="wide-num"
        />
        <button type="button" className="btn primary" disabled={!value} onClick={save}>
          {existing ? 'Update' : 'Save'}
        </button>
      </div>

      {current !== undefined && (
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
      <RateAdvice pct={pct} />

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
              <i className="key-dot" /> Daily weigh-ins
            </span>
          </div>
        </>
      )}

      {entries.length > 0 && (
        <>
          <button type="button" className="link-btn" onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Hide entries' : `All entries (${entries.length})`}
          </button>
          {showAll && (
            <table className="log">
              <tbody>
                {[...entries].reverse().map((e) => (
                  <tr key={e.id}>
                    <th>{e.date}</th>
                    <td>
                      {fmtW(e.weight)} {unit}
                    </td>
                    <td className="end">
                      <ConfirmButton className="link-btn danger" confirm="Delete?" onConfirm={() => db.bodyweights.delete(e.id!)}>
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
  if (pct === null) {
    return <p className="muted small">Log your weight most mornings. The weekly rate shows up after a week.</p>
  }
  let text: string
  let tone: string
  if (pct > 0.25) {
    text = 'Going up. If the goal is to lean out, trim portions a little and keep protein high.'
    tone = 'warn'
  } else if (pct >= -0.25) {
    text = 'Holding steady. Fine for building muscle while slowly recomposing. For faster fat loss, eat a little less.'
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
