import { useMemo, useRef, useState } from 'react'

export interface Pt {
  x: number
  y: number
}

/**
 * Small time-series chart: one emphasised line, optional faint dots behind it
 * (e.g. raw weigh-ins under a 7-day average), recessive grid, endpoint label,
 * and a touch/hover crosshair with a tooltip.
 */
export function LineChart({
  line,
  dots,
  height = 180,
  formatY,
  formatX,
  label,
  tooltip,
}: {
  line: Pt[]
  dots?: Pt[]
  height?: number
  formatY: (v: number) => string
  formatX: (v: number) => string
  label: string
  /** Tooltip text for the line point at index i. */
  tooltip: (i: number) => string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const W = 340
  const H = height
  const pad = { l: 36, r: 14, t: 14, b: 22 }

  const scale = useMemo(() => {
    const all = [...line, ...(dots ?? [])]
    const xs = all.map((p) => p.x)
    const ys = all.map((p) => p.y)
    let x0 = Math.min(...xs)
    let x1 = Math.max(...xs)
    if (x0 === x1) {
      x0 -= 86_400_000
      x1 += 86_400_000
    }
    let y0 = Math.min(...ys)
    let y1 = Math.max(...ys)
    const span = Math.max(y1 - y0, Math.abs(y1) * 0.04, 1)
    y0 -= span * 0.15
    y1 += span * 0.15
    const step = niceStep((y1 - y0) / 3)
    const ticks: number[] = []
    for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) ticks.push(Number(v.toFixed(6)))
    return {
      x: (v: number) => pad.l + ((v - x0) / (x1 - x0)) * (W - pad.l - pad.r),
      y: (v: number) => pad.t + (1 - (v - y0) / (y1 - y0)) * (H - pad.t - pad.b),
      ticks,
      x0,
      x1,
    }
  }, [line, dots, H, pad.l, pad.r, pad.t, pad.b])

  if (!line.length) return null

  const path = line.map((p, i) => `${i ? 'L' : 'M'}${scale.x(p.x).toFixed(1)},${scale.y(p.y).toFixed(1)}`).join('')
  const end = line[line.length - 1]
  const h = hover !== null ? line[hover] : null

  const onMove = (clientX: number) => {
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    const vx = ((clientX - box.left) / box.width) * W
    let best = 0
    for (let i = 1; i < line.length; i++) {
      if (Math.abs(scale.x(line[i].x) - vx) < Math.abs(scale.x(line[best].x) - vx)) best = i
    }
    setHover(best)
  }

  return (
    <div
      className="chart"
      ref={ref}
      onPointerMove={(e) => onMove(e.clientX)}
      onPointerDown={(e) => onMove(e.clientX)}
      onPointerLeave={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {scale.ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={pad.l} x2={W - pad.r} y1={scale.y(t)} y2={scale.y(t)} />
            <text className="axis" x={pad.l - 6} y={scale.y(t)} dy="0.32em" textAnchor="end">
              {formatY(t)}
            </text>
          </g>
        ))}
        <text className="axis" x={pad.l} y={H - 6}>
          {formatX(scale.x0)}
        </text>
        <text className="axis" x={W - pad.r} y={H - 6} textAnchor="end">
          {formatX(scale.x1)}
        </text>
        {dots?.map((p, i) => (
          <circle key={i} className="dot-faint" cx={scale.x(p.x)} cy={scale.y(p.y)} r={3.5} />
        ))}
        <path className="series" d={path} />
        {line.length < 30 &&
          line.map((p, i) => <circle key={i} className="marker" cx={scale.x(p.x)} cy={scale.y(p.y)} r={4} />)}
        <circle className="marker end" cx={scale.x(end.x)} cy={scale.y(end.y)} r={5} />
        {h && (
          <g>
            <line className="crosshair" x1={scale.x(h.x)} x2={scale.x(h.x)} y1={pad.t} y2={H - pad.b} />
            <circle className="marker hover" cx={scale.x(h.x)} cy={scale.y(h.y)} r={6} />
          </g>
        )}
      </svg>
      {hover === null && (
        <span
          className="end-label"
          style={{ right: `${((W - scale.x(end.x)) / W) * 100}%`, top: `${(scale.y(end.y) / H) * 100}%` }}
        >
          {formatY(end.y)}
        </span>
      )}
      {h && (
        <div
          className="tip"
          style={{
            left: `${Math.min(78, Math.max(22, (scale.x(h.x) / W) * 100))}%`,
          }}
        >
          {tooltip(hover!)}
        </div>
      )}
    </div>
  )
}

function niceStep(raw: number) {
  const mag = 10 ** Math.floor(Math.log10(raw))
  const n = raw / mag
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag
}
