import { LineChart } from '../components/LineChart'
import { Icon, MuscleTag } from '../components/ui'
import { EQUIPMENT_LABEL } from '../data/exercises'
import { useExerciseMap, useSettings, useWorkouts } from '../hooks'
import { bestSet, e1rm, exerciseHistory, incrementFor } from '../lib/engine'
import { fmtDay, fmtW, relativeDay } from '../lib/format'

export function ExerciseScreen({ id }: { id: string }) {
  const workouts = useWorkouts()
  const exMap = useExerciseMap()
  const settings = useSettings()
  const ex = exMap.get(id)
  if (!workouts) return <div className="page" />
  if (!ex) return <div className="page"><p className="muted pad">Unknown exercise.</p></div>

  const sessions = exerciseHistory(workouts, id)
  const chrono = [...sessions].reverse()
  const weighted = chrono.some((s) => s.sets.some((x) => x.weight > 0))
  const points = chrono.map((s) => {
    const b = bestSet(s.sets)!
    return { x: s.date, y: weighted ? e1rm(b.weight, b.reps) : Math.max(...s.sets.map((x) => x.reps)) }
  })
  const allSets = sessions.flatMap((s) => s.sets)
  const best = bestSet(allSets)
  const heaviest = allSets.length ? Math.max(...allSets.map((s) => s.weight)) : 0
  const unit = settings.unit
  const inc = incrementFor(ex, unit)

  return (
    <div className="page">
      <header className="page-head">
        <button type="button" className="icon-btn" onClick={() => history.back()} aria-label="Back">
          <Icon name="back" />
        </button>
        <h1 className="display small">{ex.name}</h1>
        <div className="tags">
          <MuscleTag muscle={ex.primary} />
          {ex.secondary.map((m) => (
            <MuscleTag key={m} muscle={m} secondary />
          ))}
          <span className="tag plain">{EQUIPMENT_LABEL[ex.equipment]}</span>
          <span className="tag plain">{ex.kind}</span>
        </div>
      </header>

      <section className="card">
        <h2 className="h2">How it progresses</h2>
        <p className="muted small">
          Work in {ex.repMin}–{ex.repMax} reps. Add a rep each session at the same weight. When every set reaches{' '}
          {ex.repMax}, {inc ? `add ${inc} ${unit}` : 'add weight or use a harder variation'} and start again at {ex.repMin}.
        </p>
      </section>

      {sessions.length > 0 ? (
        <>
          <div className="stats card">
            <div>
              <b>{sessions.length}</b>
              <small>Sessions</small>
            </div>
            {weighted && best && (
              <div>
                <b>{fmtW(Math.round(e1rm(best.weight, best.reps)))}</b>
                <small>Est. 1-rep max</small>
              </div>
            )}
            <div>
              <b>{weighted ? `${fmtW(heaviest)}` : Math.max(...allSets.map((s) => s.reps))}</b>
              <small>{weighted ? `Heaviest (${unit})` : 'Most reps'}</small>
            </div>
          </div>

          {points.length > 1 && (
            <section className="card">
              <h2 className="h2">{weighted ? 'Estimated 1-rep max' : 'Best set (reps)'}</h2>
              <p className="muted small">
                {weighted ? 'From your best set each session, so more reps at the same weight also counts.' : ''}
              </p>
              <LineChart
                line={points}
                label={`${ex.name} progress`}
                formatY={(v) => fmtW(Math.round(v))}
                formatX={(v) => new Date(v).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                tooltip={(i) => {
                  const s = chrono[i]
                  const b = bestSet(s.sets)!
                  return `${fmtDay(s.date)} · best ${b.weight ? `${fmtW(b.weight)} × ` : ''}${b.reps}`
                }}
              />
            </section>
          )}

          <section className="card">
            <h2 className="h2">Sessions</h2>
            <table className="log">
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.workoutId + '-' + s.date}>
                    <th>
                      <a href={`#/workout/${s.workoutId}`}>{relativeDay(s.date)}</a>
                    </th>
                    <td>
                      {s.sets.map((x, i) => (
                        <span key={i}>
                          {x.weight ? `${fmtW(x.weight)}×` : ''}
                          {x.reps}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      ) : (
        <div className="card empty">
          <p className="muted">No sessions yet.</p>
        </div>
      )}
    </div>
  )
}
