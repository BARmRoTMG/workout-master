import { useEffect, useRef } from 'react'
import { useNow } from '../hooks'
import { fmtClock } from '../lib/format'
import { addRest, stopRest, useRest } from '../lib/rest'

/** Countdown pinned to the bottom of the live workout. */
export function RestBar() {
  const rest = useRest()
  const now = useNow(250)
  const buzzed = useRef<number | null>(null)
  const remaining = rest ? (rest.endAt - now) / 1000 : 0
  const over = rest !== null && remaining <= 0

  useEffect(() => {
    if (!over || !rest || buzzed.current === rest.endAt) return
    buzzed.current = rest.endAt
    navigator.vibrate?.([200, 100, 200])
    const t = setTimeout(stopRest, 5000)
    return () => clearTimeout(t)
  }, [over, rest])

  if (!rest) return null
  const progress = Math.min(1, Math.max(0, 1 - remaining / rest.duration))

  return (
    <div className={'rest-bar' + (over ? ' over' : '')} role="timer" aria-live="polite">
      <span className="rest-fill" style={{ transform: `scaleX(${progress})` }} />
      <div className="rest-content">
        <div className="rest-read">
          <span className="eyebrow">{over ? 'Rest over' : 'Rest'}</span>
          <span className="rest-time">{over ? 'Go' : fmtClock(remaining)}</span>
        </div>
        {!over && (
          <button type="button" className="btn small ghost" onClick={() => addRest(30)}>
            +30s
          </button>
        )}
        <button type="button" className="btn small" onClick={stopRest}>
          {over ? 'OK' : 'Skip'}
        </button>
      </div>
    </div>
  )
}
