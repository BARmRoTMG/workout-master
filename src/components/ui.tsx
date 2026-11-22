import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Unit } from '../db'
import { platesPerSide } from '../lib/engine'
import { fmtW } from '../lib/format'
import { MUSCLE_LABEL, type Muscle } from '../lib/muscles'

// ---------------------------------------------------------------------------
// Icons (24px, stroke)

const PATHS = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  plus: 'M12 5v14M5 12h14',
  back: 'M15 5l-7 7 7 7',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  swap: 'M7 7h11l-3-3M17 17H6l3 3',
  trash: 'M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12',
  x: 'M6 6l12 12M18 6L6 18',
  today: 'M4 9h16M8 3v4M16 3v4M5 5h14v15H5z',
  history: 'M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4M12 8v4l3 2',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2 .2-1.3-1.3.2-2-3-1-1 2h-1.8l-1-2-3 1 .2 2L7 7.2 5 7l-1 3 2 1v1.9l-2 1 1 3 2-.2 1.3 1.3-.2 2 3 1 1-2h1.8l1 2 3-1-.2-2 1.3-1.3 2 .2 1-3-2-1z',
  sort: 'M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3',
  arrowUp: 'M12 19V5M6 11l6-6 6 6',
  arrowDown: 'M12 5v14M6 13l6 6 6-6',
  equal: 'M6 9h12M6 15h12',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  heart: 'M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z',
  steps: 'M8.5 3.5c1.6 0 2.4 1.9 2.4 4.1s-.9 3.9-2.4 3.9-2.4-1.7-2.4-3.9.8-4.1 2.4-4.1zM6.4 14.2h4.2l-.3 2.6a1.8 1.8 0 0 1-3.6 0zM15.5 7.5c1.6 0 2.4 1.9 2.4 4.1s-.9 3.9-2.4 3.9-2.4-1.7-2.4-3.9.8-4.1 2.4-4.1zM13.4 18.2h4.2l-.3 1.6a1.8 1.8 0 0 1-3.6 0z',
  scale: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM8 10.5a5 5 0 0 1 8 0M12 10.5l1.6-2.2',
  play: 'M8 5.5v13l10.5-6.5z',
  pause: 'M8 5v14M16 5v14',
  timer: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.5 2M10 2.5h4M18.5 6.5l1.5-1.5',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Two-tap confirm, so nothing destructive happens on a stray tap and no browser dialog is needed

export function ConfirmButton({
  children,
  confirm,
  onConfirm,
  className = 'btn ghost danger',
}: {
  children: ReactNode
  confirm: ReactNode
  onConfirm: () => void
  className?: string
}) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button
      type="button"
      className={className + (armed ? ' armed' : '')}
      onClick={() => (armed ? onConfirm() : setArmed(true))}
    >
      {armed ? confirm : children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Bottom sheet

export function Sheet({
  title,
  onClose,
  children,
  fit,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  /** Size to the content instead of the tall list height. */
  fit?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.classList.add('locked')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('locked')
    }
  }, [onClose])
  // Portalled to <body> so an animated ancestor can't trap the fixed overlay.
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className={'sheet' + (fit ? ' fit' : '')} role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

// ---------------------------------------------------------------------------
// Numeric input that keeps a text draft so "22." can be typed

export function NumInput({
  value,
  onChange,
  placeholder,
  decimal,
  label,
  className,
  autoFocus,
}: {
  value: number | null
  onChange: (v: number | null) => void
  placeholder?: string
  decimal?: boolean
  label: string
  className?: string
  autoFocus?: boolean
}) {
  const [draft, setDraft] = useState(fmtW(value))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setDraft(fmtW(value))
  }, [value])
  return (
    <input
      className={'num ' + (className ?? '')}
      inputMode={decimal ? 'decimal' : 'numeric'}
      aria-label={label}
      placeholder={placeholder}
      autoFocus={autoFocus}
      enterKeyHint="done"
      value={draft}
      onFocus={(e) => {
        focused.current = true
        e.target.select()
      }}
      onBlur={() => {
        focused.current = false
        setDraft(fmtW(value))
      }}
      onChange={(e) => {
        const text = e.target.value.replace(',', '.')
        if (!/^\d*\.?\d*$/.test(text)) return
        setDraft(text)
        const n = parseFloat(text)
        onChange(Number.isFinite(n) ? (decimal ? n : Math.round(n)) : null)
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// Bits

export function MuscleTag({ muscle, secondary }: { muscle: Muscle; secondary?: boolean }) {
  return <span className={`tag m-${muscle}` + (secondary ? ' secondary' : '')}>{MUSCLE_LABEL[muscle]}</span>
}

const PLATE_CLASS: Record<string, string> = {
  'kg-25': 'p-red',
  'kg-20': 'p-blue',
  'kg-15': 'p-yellow',
  'kg-10': 'p-green',
  'kg-5': 'p-white',
  'kg-2.5': 'p-red',
  'kg-1.25': 'p-silver',
  'lb-45': 'p-blue',
  'lb-35': 'p-yellow',
  'lb-25': 'p-green',
  'lb-10': 'p-white',
  'lb-5': 'p-red',
  'lb-2.5': 'p-silver',
}

/** One side of a loaded barbell, drawn with competition plate colours. */
export function PlateStack({ weight, bar, unit }: { weight: number; bar: number; unit: Unit }) {
  const plates = platesPerSide(weight, bar, unit)
  if (!plates) return null
  const heaviest = unit === 'kg' ? 25 : 45
  return (
    <div className="plates" aria-label={`Per side: ${plates.map(fmtW).join(', ') || 'empty bar'}`}>
      <span className="plates-label">Per side</span>
      <div className="plates-bar">
        <span className="sleeve" />
        {plates.map((p, i) => (
          <span
            key={i}
            className={'plate ' + PLATE_CLASS[`${unit}-${p}`]}
            style={{ height: `${Math.max(34, Math.round((Math.sqrt(p) / Math.sqrt(heaviest)) * 100))}%` }}
            title={`${fmtW(p)} ${unit}`}
          >
            <i>{fmtW(p)}</i>
          </span>
        ))}
        <span className="collar" />
      </div>
      {!plates.length && <span className="plates-label">Empty bar</span>}
    </div>
  )
}

export function Meter({ value, max, marker, tone }: { value: number; max: number; marker?: number; tone?: string }) {
  return (
    <div className={'meter ' + (tone ?? '')}>
      <span style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
      {marker !== undefined && <i style={{ left: `${(marker / max) * 100}%` }} />}
    </div>
  )
}

/** Progress ring, e.g. steps toward the daily goal. */
export function Ring({ value, size = 64, stroke = 7, children }: { value: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value))
  return (
    <div className={'ring' + (v >= 1 ? ' met' : '')} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle
          className="ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {children && <div className="ring-in">{children}</div>}
    </div>
  )
}

/** A labelled number with − and + buttons. */
export function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  format = String,
  onChange,
}: {
  label: ReactNode
  value: number
  min: number
  max: number
  step?: number
  format?: (v: number) => string
  onChange: (v: number) => void
}) {
  const name = typeof label === 'string' ? label : 'value'
  return (
    <div className="stepper">
      <span>{label}</span>
      <div className="row">
        <button type="button" aria-label={`Less: ${name}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>
          −
        </button>
        <b>{format(value)}</b>
        <button type="button" aria-label={`More: ${name}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>
          +
        </button>
      </div>
    </div>
  )
}

/** An on/off switch with a label, and room for an extra control (e.g. a time) beside it. */
export function Switch({
  label,
  sub,
  checked,
  onChange,
  children,
}: {
  label: string
  sub?: string
  checked: boolean
  onChange: (on: boolean) => void
  children?: ReactNode
}) {
  return (
    <div className="switch-row">
      <span className="switch-text">
        {label}
        {sub && <small>{sub}</small>}
      </span>
      {children}
      <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />
    </div>
  )
}
