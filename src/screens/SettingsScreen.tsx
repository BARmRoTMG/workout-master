import { useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, saveSettings, type Settings } from '../db'
import { useExerciseMap, useSettings } from '../hooks'
import { convertUnits, exportBackup, exportCsv, importBackup } from '../lib/backup'
import { fmtClock } from '../lib/format'
import { MUSCLE_LABEL, MUSCLES } from '../lib/muscles'

export function SettingsScreen() {
  const settings = useSettings()
  const exMap = useExerciseMap()
  const [message, setMessage] = useState<string | null>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)

  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted)
  }, [])

  const set = (patch: Partial<Settings>) => void saveSettings(patch)

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="display">Settings</h1>
      </header>

      <section className="card">
        <h2 className="h2">Your plan</h2>
        <p className="muted small">
          Muscles to hit in each full-body workout, one exercise each. Glutes get worked by leg press and Romanian
          deadlifts already.
        </p>
        <div className="chips">
          {MUSCLES.map((m) => {
            const on = settings.planMuscles.includes(m)
            return (
              <button
                type="button"
                key={m}
                className={'chip' + (on ? ' on' : '')}
                aria-pressed={on}
                onClick={() =>
                  set({
                    planMuscles: on
                      ? settings.planMuscles.filter((x) => x !== m)
                      : MUSCLES.filter((x) => x === m || settings.planMuscles.includes(x)),
                  })
                }
              >
                {MUSCLE_LABEL[m]}
              </button>
            )
          })}
        </div>
        <Stepper
          label="Sets per exercise"
          value={settings.setsPerExercise}
          min={1}
          max={6}
          onChange={(v) => set({ setsPerExercise: v })}
        />
        <Stepper
          label="Weekly set goal per muscle"
          value={settings.weeklySetTarget}
          min={4}
          max={20}
          onChange={(v) => set({ weeklySetTarget: v })}
        />
      </section>

      <section className="card">
        <h2 className="h2">Rest timer</h2>
        <Stepper
          label="Compound lifts"
          value={settings.restCompound}
          min={30}
          max={300}
          step={15}
          format={fmtClock}
          onChange={(v) => set({ restCompound: v })}
        />
        <Stepper
          label="Isolation"
          value={settings.restIsolation}
          min={30}
          max={300}
          step={15}
          format={fmtClock}
          onChange={(v) => set({ restIsolation: v })}
        />
      </section>

      <section className="card">
        <h2 className="h2">Units</h2>
        <div className="seg">
          {(['kg', 'lb'] as const).map((u) => (
            <button
              type="button"
              key={u}
              className={settings.unit === u ? 'on' : ''}
              onClick={() => convertUnits(settings.unit, u)}
            >
              {u}
            </button>
          ))}
        </div>
        <p className="muted small">Switching converts everything you've logged.</p>
        <Stepper
          label={`Barbell weight (${settings.unit})`}
          value={settings.barWeight}
          min={5}
          max={45}
          step={settings.unit === 'kg' ? 2.5 : 5}
          onChange={(v) => set({ barWeight: v })}
        />
      </section>

      <section className="card">
        <h2 className="h2">Your data</h2>
        <p className="muted small">
          Everything is stored only on this phone. Export a backup now and then, since clearing browser data or losing
          the phone erases it.
          {persisted === false && ' Your browser may clear it if storage runs low.'}
        </p>
        <div className="stack">
          <button type="button" className="btn ghost" onClick={() => exportBackup()}>
            Export backup (.json)
          </button>
          <label className="btn ghost file-btn">
            Restore from backup
            <input
              type="file"
              accept="application/json,.json"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                try {
                  const n = await importBackup(file)
                  setMessage(`Restored ${n} workouts.`)
                } catch (err) {
                  setMessage(err instanceof Error ? err.message : 'Could not read that file.')
                }
              }}
            />
          </label>
          <button type="button" className="btn ghost" onClick={() => exportCsv(exMap)}>
            Export sets as spreadsheet (.csv)
          </button>
          {persisted === false && (
            <button
              type="button"
              className="btn ghost"
              onClick={async () => setPersisted((await navigator.storage?.persist?.()) ?? false)}
            >
              Ask browser to keep data permanently
            </button>
          )}
        </div>
        {message && <p className="advice neutral">{message}</p>}
      </section>

      <section className="card">
        <h2 className="h2">Install on your phone</h2>
        <p className="muted small">
          <b>iPhone (Safari):</b> Share → Add to Home Screen. <b>Android (Chrome):</b> menu ⋮ → Install app. It then opens
          full screen and works offline at the gym.
        </p>
      </section>

      <button type="button" className="link-btn muted" onClick={() =>
          saveSettings({ ...DEFAULT_SETTINGS, unit: settings.unit, barWeight: settings.unit === 'lb' ? 45 : 20 })
        }>
        Reset settings to defaults
      </button>
    </div>
  )
}

function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  format = String,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  format?: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <div className="stepper">
      <span>{label}</span>
      <div className="row">
        <button type="button" aria-label={`Less ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>
          −
        </button>
        <b>{format(value)}</b>
        <button type="button" aria-label={`More ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>
          +
        </button>
      </div>
    </div>
  )
}
