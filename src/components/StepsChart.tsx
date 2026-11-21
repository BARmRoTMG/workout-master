import { useState } from 'react'

export interface StepBar {
  date: string
  steps: number | null
}

/**
 * Daily steps as thin bars against a dashed goal line. One series, so no
 * legend; tap or hover a bar to read its value (the latest day is shown by default).
 */
export function StepsChart({ days, goal }: { days: StepBar[]; goal: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 340
  const H = 150
  const pad = { l: 2, r: 34, t: 26, b: 20 }
  const max = Math.max(goal * 1.2, ...days.map((d) => d.steps ?? 0))
  const slot = (W - pad.l - pad.r) / days.length
  const bw = Math.min(16, slot * 0.62)
  const base = H - pad.b
  const y = (v: number) => pad.t + (base - pad.t) * (1 - v / max)
  const goalY = y(goal)
  const lastWithData = days.map((d) => d.steps !== null).lastIndexOf(true)
  const shown = hover ?? (lastWithData >= 0 ? lastWithData : null)
  const label = (date: string) => new Date(date + 'T12:00:00')

  const bar = (x: number, top: number) => {
    const h = base - top
    const r = Math.min(4, bw / 2, h)
    return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + bw - r}Q${x + bw},${top} ${x + bw},${top + r}V${base}Z`
  }

  return (
    <div className="chart steps-chart" onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Daily steps, last ${days.length} days, goal ${goal}`}>
        <line className="grid" x1={pad.l} x2={W - pad.r + 4} y1={base} y2={base} />
        <line className="goal-line" x1={pad.l} x2={W - pad.r + 4} y1={goalY} y2={goalY} />
        {days.map((d, i) => {
          const x = pad.l + slot * i + (slot - bw) / 2
          const dt = label(d.date)
          return (
            <g key={d.date} onPointerEnter={() => setHover(i)} onClick={() => setHover(i)}>
              <rect x={pad.l + slot * i} y={0} width={slot} height={H} fill="transparent" />
              {d.steps ? (
                <path className={'bar' + (d.steps >= goal ? ' met' : '') + (i === shown ? ' on' : '')} d={bar(x, y(d.steps))} />
              ) : (
                <circle className="bar-empty" cx={x + bw / 2} cy={base - 3} r={1.5} />
              )}
              {(days.length <= 14 || dt.getDay() === 1) && (
                <text className={'axis' + (i === shown ? ' on' : '')} x={x + bw / 2} y={H - 5} textAnchor="middle">
                  {dt.toLocaleDateString(undefined, { weekday: 'narrow' })}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <span className="goal-label" style={{ top: `${(goalY / H) * 100}%` }}>
        goal {goal >= 1000 ? `${Math.round(goal / 100) / 10}k` : goal}
      </span>
      {shown !== null && (
        <span
          className="tip"
          style={{
            left: `${Math.min(80, Math.max(20, ((pad.l + slot * (shown + 0.5)) / W) * 100))}%`,
            top: 0,
            transform: 'translate(-50%, 0)',
          }}
        >
          {label(days[shown].date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} ·{' '}
          {days[shown].steps === null ? 'no data' : `${days[shown].steps!.toLocaleString()}${days[shown].steps! >= goal ? ' ✓' : ''}`}
        </span>
      )}
    </div>
  )
}
