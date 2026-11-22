import { useState } from 'react'
import { ConfirmButton, Icon, Ring, Stepper } from '../components/ui'
import { useNow, useWakeLock } from '../hooks'
import { fmtClock } from '../lib/format'
import {
  isRunning,
  lastConfig,
  pauseIntervals,
  phases,
  position,
  PRESETS,
  resumeIntervals,
  saveConfig,
  startIntervals,
  stopIntervals,
  totalSeconds,
  useIntervalRun,
  type IntervalConfig,
  type IntervalRun,
} from '../lib/intervals'

const secs = (v: number) => (v < 60 ? `${v}s` : fmtClock(v))

export function TimerScreen() {
  const run = useIntervalRun()
  return run ? <Running run={run} /> : <Setup />
}

function Setup() {
  const [config, setConfig] = useState<IntervalConfig>(lastConfig)
  const change = (patch: Partial<IntervalConfig>) => {
    const next = { ...config, ...patch }
    setConfig(next)
    saveConfig(next)
  }
  const total = totalSeconds(config)
  const same = (c: IntervalConfig) => c.work === config.work && c.rest === config.rest && c.rounds === config.rounds

  return (
    <div className="page timer-page">
      <header className="page-head">
        <span className="eyebrow">Intervals</span>
        <h1 className="display">Timer</h1>
      </header>

      <div className="presets" role="group" aria-label="Presets">
        {PRESETS.map((p) => (
          <button
            type="button"
            key={p.name}
            className={'preset' + (same(p.config) ? ' on' : '')}
            aria-pressed={same(p.config)}
            onClick={() => change(p.config)}
          >
            <b>{p.name}</b>
            <small>
              {p.config.work}/{p.config.rest} × {p.config.rounds}
            </small>
          </button>
        ))}
      </div>

      <section className="card iv-setup">
        <Stepper label={<Phase kind="work">Work</Phase>} value={config.work} min={5} max={600} step={5} format={secs} onChange={(work) => change({ work })} />
        <Stepper label={<Phase kind="rest">Rest</Phase>} value={config.rest} min={0} max={300} step={5} format={(v) => (v ? secs(v) : 'none')} onChange={(rest) => change({ rest })} />
        <Stepper label="Rounds" value={config.rounds} min={1} max={30} onChange={(rounds) => change({ rounds })} />
      </section>

      <Timeline config={config} done={0} />
      <p className="muted small center">
        {fmtClock(total)} in all, after a 5-second countdown. It beeps 3-2-1 before each change.
      </p>

      <div className="dock">
        <button type="button" className="go-btn" onClick={() => startIntervals(config)}>
          <Icon name="play" size={24} /> Start · {fmtClock(total)}
        </button>
      </div>
    </div>
  )
}

function Phase({ kind, children }: { kind: 'work' | 'rest'; children: string }) {
  return <span className={'iv-key ' + kind}>{children}</span>
}

const LABEL = { prep: 'Get ready', work: 'Work', rest: 'Rest' } as const

function Running({ run }: { run: IntervalRun }) {
  const now = useNow(200)
  const paused = run.pausedAt !== null
  const pos = position(run, now)
  const { rounds } = run.config
  useWakeLock(isRunning(run, now))

  if (!pos.phase) {
    return (
      <div className="page timer-page">
        <header className="page-head">
          <div className="row between">
            <span className="eyebrow">Intervals</span>
            <button type="button" className="btn small ghost" onClick={stopIntervals}>
              Close
            </button>
          </div>
          <h1 className="display">Timer</h1>
        </header>
        <section className="iv-face done">
          <span className="big-check">
            <Icon name="check" size={44} />
          </span>
          <h2 className="focus-name">Done</h2>
          <p className="muted">
            {rounds} round{rounds === 1 ? '' : 's'} · {fmtClock(totalSeconds(run.config))}
          </p>
        </section>
        <div className="dock">
          <button type="button" className="go-btn" onClick={() => startIntervals(run.config)}>
            Again
          </button>
        </div>
      </div>
    )
  }

  const { phase } = pos
  const progress = 1 - pos.left / phase.len
  const all = phases(run.config)
  const workDone = all.filter((p, i) => p.kind !== 'prep' && i < pos.index).length
  const next = all[pos.index + 1]
  const left = Math.ceil(pos.left - 0.05)

  return (
    <div className="page timer-page">
      <header className="page-head">
        <div className="row between">
          <span className="eyebrow">
            {fmtClock(pos.totalLeft)} left
          </span>
          <ConfirmButton className="btn small ghost" confirm="Tap to end" onConfirm={stopIntervals}>
            End
          </ConfirmButton>
        </div>
        <h1 className="display">Timer</h1>
      </header>

      <section className={`iv-face ${phase.kind}${paused ? ' paused' : ''}`} aria-live="polite">
        <Ring value={progress} size={264} stroke={14}>
          <span className="iv-phase">{LABEL[phase.kind]}</span>
          <span className="iv-time">{left >= 60 ? fmtClock(left) : left}</span>
          <span className="iv-round">
            {phase.kind === 'prep' ? `${rounds} round${rounds === 1 ? '' : 's'}` : `Round ${phase.round} of ${rounds}`}
          </span>
        </Ring>
      </section>

      <Timeline config={run.config} done={workDone} current={phase.kind === 'prep' ? undefined : progress} />
      {next && <p className="muted small center iv-next">Next: {next.kind === 'work' ? `work ${secs(next.len)}` : `rest ${secs(next.len)}`}{next.kind === 'work' ? ` · round ${next.round} of ${rounds}` : ''}</p>}
      {!next && <p className="muted small center iv-next">Last one</p>}

      <div className="dock">
        {paused ? (
          <button type="button" className="go-btn" onClick={resumeIntervals}>
            <Icon name="play" size={24} /> Resume
          </button>
        ) : (
          <button type="button" className="go-btn quiet" onClick={pauseIntervals}>
            <Icon name="pause" size={24} /> Pause
          </button>
        )}
      </div>
    </div>
  )
}

/** Every work and rest phase as a strip, widths to scale; finished ones filled. */
function Timeline({ config, done, current }: { config: IntervalConfig; done: number; current?: number }) {
  const list = phases(config).filter((p) => p.kind !== 'prep')
  return (
    <div className="iv-line" aria-hidden="true">
      {list.map((p, i) => (
        <span key={i} className={p.kind} style={{ flexGrow: p.len }}>
          <i style={{ transform: `scaleX(${i < done ? 1 : i === done && current !== undefined ? current : 0})` }} />
        </span>
      ))}
    </div>
  )
}
