import { useState } from 'react'
import {
  go,
  useBodyweights,
  useExerciseMap,
  useNow,
  useProtein,
  useSettings,
  useSteps,
  useWaists,
  useWorkouts,
} from '../hooks'
import { weeklyCheckIn, type CheckIn } from '../lib/checkin'
import { dateKey } from '../lib/format'

/** The check-in, worked out from everything logged. Null while loading. */
export function useCheckIn(): CheckIn | null {
  const workouts = useWorkouts()
  const exMap = useExerciseMap()
  const settings = useSettings()
  const bodyweights = useBodyweights()
  const waists = useWaists()
  const protein = useProtein()
  const steps = useSteps()
  const now = useNow(60_000)
  if (!workouts || !bodyweights || !waists || !protein || !steps) return null
  return weeklyCheckIn({
    now,
    workouts,
    exMap,
    settings,
    bodyweights,
    waists,
    protein,
    steps,
  })
}

const SEEN_KEY = 'checkin-seen'

/** The Sunday that starts this check-in week (today, if it's Sunday). */
function thisSunday(now: number) {
  const d = new Date(now)
  d.setDate(d.getDate() - d.getDay())
  return dateKey(d)
}

function readSeen() {
  try {
    return localStorage.getItem(SEEN_KEY)
  } catch {
    return null
  }
}

/**
 * On Today: the first time, then each Sunday until dismissed (it stays up to
 * Tuesday). It's always on the Progress screen too.
 */
export function TodayCheckIn() {
  const check = useCheckIn()
  const now = useNow(60_000)
  const [seen, setSeen] = useState(readSeen)
  const sunday = thisSunday(now)
  const due = seen === null || (seen < sunday && new Date(now).getDay() <= 2)
  if (!check || !due) return null
  const dismiss = () => {
    try {
      localStorage.setItem(SEEN_KEY, sunday)
    } catch {
      // Not remembered; it shows again next time.
    }
    setSeen(sunday)
  }
  return <CheckInCard check={check} onDismiss={dismiss} compact />
}

const MARK = { good: '✓', warn: '!', neutral: '·' } as const

/** `compact` (on Today) shows just the one change; the full week is on Progress. */
export function CheckInCard({
  check,
  onDismiss,
  compact,
}: {
  check: CheckIn
  onDismiss?: () => void
  compact?: boolean
}) {
  const { focus, rows } = check
  return (
    <section className={'card checkin' + (compact ? ' compact' : '')}>
      <div className="row between">
        <span className="eyebrow">Weekly check-in{compact ? '' : ' · last 7 days'}</span>
        {onDismiss && (
          <button type="button" className="text-link" onClick={onDismiss}>
            Got it
          </button>
        )}
      </div>
      <div className={'checkin-focus ' + focus.tone}>
        <span className="eyebrow">{focus.tone === 'good' ? 'Verdict' : 'Change this week'}</span>
        <h2>{focus.title}</h2>
        <p>{focus.detail}</p>
        {compact && (
          <button type="button" className="text-link" onClick={() => go('progress')}>
            See your week
          </button>
        )}
      </div>
      {!compact && (
        <ul className="checkin-rows">
          {rows.map((r) => (
            <li key={r.key} className={r.tone}>
              <i aria-hidden="true">{MARK[r.tone]}</i>
              <span>{r.label}</span>
              <b>{r.value}</b>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
