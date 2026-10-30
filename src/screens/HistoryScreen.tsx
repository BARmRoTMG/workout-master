import { go, useExerciseMap, useWorkouts } from '../hooks'
import { doneSets } from '../lib/engine'
import { fmtDuration, relativeDay } from '../lib/format'

export function HistoryScreen() {
  const workouts = useWorkouts()
  const exMap = useExerciseMap()
  if (!workouts) return <div className="page" />
  const finished = workouts.filter((w) => w.finishedAt !== null)

  return (
    <div className="page">
      <header className="page-head">
        <span className="eyebrow">{finished.length} workouts logged</span>
        <h1 className="display">History</h1>
      </header>
      {!finished.length && (
        <div className="card empty">
          <p>No workouts yet. Finish one and it shows up here.</p>
          <p className="muted small">
            Already trained before installing? Start an empty workout and change its date at the top.
          </p>
        </div>
      )}
      <ul className="history">
        {finished.map((w) => {
          const sets = w.exercises.flatMap(doneSets)
          const d = new Date(w.startedAt)
          return (
            <li key={w.id}>
              <button type="button" className="card hist" onClick={() => go(`workout/${w.id}`)}>
                <div className="hist-date">
                  <b>{d.getDate()}</b>
                  <span>{d.toLocaleDateString(undefined, { month: 'short' })}</span>
                </div>
                <div className="hist-body">
                  <div className="row between">
                    <span className="eyebrow">{relativeDay(w.startedAt)}</span>
                    <span className="muted small">
                      {fmtDuration((w.finishedAt ?? w.startedAt) - w.startedAt)} · {sets.length} sets
                    </span>
                  </div>
                  <p>{w.exercises.map((e) => exMap.get(e.exerciseId)?.name ?? '?').join(' · ')}</p>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
