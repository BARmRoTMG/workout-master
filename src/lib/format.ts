/** 22.5 → "22.5", 20 → "20", 1.25 → "1.25". */
export function fmtW(n: number | null | undefined) {
  if (n === null || n === undefined) return ''
  return String(Number(n.toFixed(2)))
}

/** 95 → "1:35". */
export function fmtClock(totalSecs: number) {
  const s = Math.max(0, Math.round(totalSecs))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

export function fmtDuration(ms: number) {
  const mins = Math.round(ms / 60_000)
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, '0')} min`
}

export function fmtDay(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

export function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/** Local calendar date as YYYY-MM-DD. */
export function dateKey(d: Date = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Value for <input type="datetime-local">. */
export function toLocalInput(ts: number) {
  const d = new Date(ts)
  return `${dateKey(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function relativeDay(ts: number, now = Date.now()) {
  const days = Math.round((startOfDay(now) - startOfDay(ts)) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return fmtDay(ts)
}

function startOfDay(ts: number) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function pad2(n: number) {
  return String(n).padStart(2, '0')
}
