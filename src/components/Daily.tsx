import { useEffect, useState } from 'react'
import { db, type Settings } from '../db'
import { useBodyweights, useNow, useSteps } from '../hooks'
import { trendLine, weeklyRate } from '../lib/engine'
import { dateKey, fmtTime, fmtW } from '../lib/format'
import { isIOS, pasteStepsFromClipboard, saveSteps, SHORTCUT_NAME, SHORTCUT_URL } from '../lib/steps'
import { Icon, NumInput, Ring, Sheet } from './ui'

/**
 * When the user last jumped to the Shortcut, so the tile can invite a paste on
 * return. Kept in localStorage because iOS may reload the app meanwhile.
 */
const LAUNCH_KEY = 'health-launched-at'
const readLaunch = () => {
  try {
    return Number(localStorage.getItem(LAUNCH_KEY)) || 0
  } catch {
    return 0
  }
}
const writeLaunch = (t: number) => {
  try {
    if (t) localStorage.setItem(LAUNCH_KEY, String(t))
    else localStorage.removeItem(LAUNCH_KEY)
  } catch {
    // Storage unavailable: the tile just won't show the paste hint.
  }
}

// ---------------------------------------------------------------------------
// Steps

export function StepsTile({ settings }: { settings: Settings }) {
  const steps = useSteps()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [, rerender] = useState(0)
  const now = useNow(30_000)
  const today = dateKey(new Date(now))
  const entry = steps?.find((s) => s.date === today)
  const usesHealth = steps?.some((s) => s.source === 'health') ?? false
  const justLaunched = now - readLaunch() < 10 * 60_000

  // Coming back from the Shortcuts app: refresh the label.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && rerender((n) => n + 1)
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(null), 4000)
    return () => clearTimeout(t)
  }, [note])

  const tap = async () => {
    // On iPhone (where the Shortcut lives) a tap tries the clipboard first, so the
    // very first sync works too. Elsewhere only once Health steps have been used.
    if (isIOS() || usesHealth || justLaunched) {
      const got = await pasteStepsFromClipboard()
      if (got) {
        writeLaunch(0)
        const t = got.find((r) => r.date === today) ?? got[got.length - 1]
        setNote(`${t.steps.toLocaleString()} from Health`)
        return
      }
    }
    setOpen(true)
  }

  const goal = settings.stepGoal
  const value = entry?.steps ?? 0
  let sub: string
  if (note) sub = note
  else if (justLaunched) sub = 'Tap to paste from Health'
  else if (entry) sub = `${entry.source === 'health' ? 'Health' : 'Typed'} ${fmtTime(entry.at)}`
  else sub = usesHealth ? 'Tap to sync' : 'Tap to add'

  return (
    <>
      <button type="button" className={'tile steps-tile' + (justLaunched ? ' invite' : '')} onClick={tap}>
        <Ring value={value / goal} size={50} stroke={5}>
          <Icon name="steps" size={20} />
        </Ring>
        <span className="tile-body">
          <span className="eyebrow">Steps</span>
          <b className="tile-num">{entry ? value.toLocaleString() : '—'}</b>
          <small className={note ? 'ok' : ''}>{sub}</small>
        </span>
      </button>
      {open && <StepsSheet current={entry?.steps ?? null} goal={goal} onClose={() => setOpen(false)} />}
    </>
  )
}

function StepsSheet({ current, goal, onClose }: { current: number | null; goal: number; onClose: () => void }) {
  const [value, setValue] = useState<number | null>(current)
  const ios = isIOS()
  const save = async () => {
    if (!value) return
    await saveSteps([{ date: dateKey(), steps: Math.round(value) }], 'manual')
    onClose()
  }
  return (
    <Sheet title="Steps today" onClose={onClose} fit>
      {ios && (
        <>
          <a
            className="btn health wide"
            href={SHORTCUT_URL}
            onClick={() => {
              writeLaunch(Date.now())
              setTimeout(onClose, 300)
            }}
          >
            <Icon name="heart" size={18} /> Get from Apple Health
          </a>
          <p className="muted small">
            Runs your “{SHORTCUT_NAME}” Shortcut, which copies today's steps. Come back, tap the steps tile, then tap
            Paste. First time? Set it up below.
          </p>
        </>
      )}
      <div className="entry-row">
        <NumInput label="Steps today" value={value} onChange={setValue} placeholder={`goal ${goal.toLocaleString()}`} className="big-num" />
        <button type="button" className="btn primary" disabled={!value} onClick={save}>
          Save
        </button>
      </div>
      <ShortcutSetup collapsed />
    </Sheet>
  )
}

/** One-time instructions for the iPhone Shortcut that copies today's steps. */
export function ShortcutSetup({ collapsed }: { collapsed?: boolean }) {
  const body = (
    <ol className="howto">
      <li>
        Open the <b>Shortcuts</b> app, tap <b>+</b>, and name the shortcut <b>{SHORTCUT_NAME}</b> (exactly).
      </li>
      <li>
        Add <b>Find Health Samples</b>. Set <i>Type</i> is <b>Steps</b>, add the filter <i>Start Date</i> is <b>Today</b>,
        and set <i>Group By</i> to <b>Day</b>. Grouping stops iPhone and Watch steps being counted twice.
      </li>
      <li>
        Add <b>Calculate Statistics</b> and pick <b>Sum</b>.
      </li>
      <li>
        Add <b>Copy to Clipboard</b>.
      </li>
      <li>Run it once and allow access to Health. Check the number matches the Health app.</li>
    </ol>
  )
  if (!collapsed) return body
  return (
    <details className="setup">
      <summary>Set up the Health Shortcut (once, about a minute)</summary>
      {body}
      <p className="muted small">
        Tip: add the Shortcut to your Home Screen or a widget. Run it in the evening, open this app, tap the steps tile
        and tap Paste. You can also just type the number from the Health app.
      </p>
    </details>
  )
}

// ---------------------------------------------------------------------------
// Body weight

export function WeightTile({ settings }: { settings: Settings }) {
  const entries = useBodyweights()
  const [open, setOpen] = useState(false)
  if (!entries) return <div className="tile" />
  const today = dateKey()
  const todays = entries.find((e) => e.date === today)
  const trend = trendLine(entries)
  const avg = trend[trend.length - 1]?.avg
  const rate = weeklyRate(entries)
  const unit = settings.unit

  let sub: string
  if (!todays) sub = 'Tap to weigh in'
  else if (rate !== null) sub = `${rate > 0 ? '+' : ''}${fmtW(Number(rate.toFixed(2)))} ${unit}/week`
  else sub = avg !== undefined && entries.length > 1 ? `7-day avg ${avg.toFixed(1)}` : 'Saved for today'

  return (
    <>
      <button type="button" className={'tile weight-tile' + (todays ? ' done' : '')} onClick={() => setOpen(true)}>
        <span className="tile-icon">
          <Icon name={todays ? 'check' : 'scale'} size={22} />
        </span>
        <span className="tile-body">
          <span className="eyebrow">Weight</span>
          <b className="tile-num">
            {todays ? fmtW(todays.weight) : entries.length ? fmtW(entries[entries.length - 1].weight) : '—'}
            <small> {unit}</small>
          </b>
          <small className={rate !== null && rate < 0 && todays ? 'ok' : ''}>{sub}</small>
        </span>
      </button>
      {open && <WeightSheet unit={unit} current={todays?.weight ?? null} onClose={() => setOpen(false)} />}
    </>
  )
}

function WeightSheet({ unit, current, onClose }: { unit: string; current: number | null; onClose: () => void }) {
  const [value, setValue] = useState<number | null>(current)
  const save = async () => {
    if (!value) return
    const date = dateKey()
    const prior = await db.bodyweights.where('date').equals(date).first()
    if (prior?.id) await db.bodyweights.update(prior.id, { weight: value })
    else await db.bodyweights.add({ date, weight: value })
    onClose()
  }
  return (
    <Sheet title="Weigh in" onClose={onClose} fit>
      <p className="muted small">Same time each morning, after the bathroom. The 7-day average is what counts, not one day.</p>
      <div className="entry-row">
        <NumInput decimal autoFocus label={`Body weight (${unit})`} value={value} onChange={setValue} placeholder={unit} className="big-num" />
        <button type="button" className="btn primary" disabled={!value} onClick={save}>
          Save
        </button>
      </div>
    </Sheet>
  )
}
