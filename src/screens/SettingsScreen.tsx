import { useState } from 'react'
import { ShortcutSetup } from '../components/Daily'
import { NotificationsCard } from '../components/Notifications'
import { Icon, Stepper } from '../components/ui'
import { saveSettings, type Settings } from '../db'
import { go, useSettings } from '../hooks'
import { convertUnits, exportBackup, importBackup } from '../lib/backup'
import { MUSCLE_LABEL, MUSCLES } from '../lib/muscles'

export function SettingsScreen() {
  const settings = useSettings()
  const [message, setMessage] = useState<string | null>(null)
  const set = (patch: Partial<Settings>) => void saveSettings(patch)

  return (
    <div className="page">
      <header className="page-head">
        <button type="button" className="icon-btn" onClick={() => go('progress')} aria-label="Back">
          <Icon name="back" />
        </button>
        <h1 className="display">Settings</h1>
      </header>

      <section className="card">
        <h2 className="h2">Your plan</h2>
        <p className="muted small">The muscles each full-body workout hits, one exercise each.</p>
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
        <Stepper label="Sets per exercise" value={settings.setsPerExercise} min={1} max={6} onChange={(v) => set({ setsPerExercise: v })} />
        <Stepper
          label="Daily steps goal"
          value={settings.stepGoal}
          min={3000}
          max={20000}
          step={1000}
          format={(v) => `${v / 1000}k`}
          onChange={(v) => set({ stepGoal: v })}
        />
        <div className="stepper">
          <span>Units</span>
          <div className="seg">
            {(['kg', 'lb'] as const).map((u) => (
              <button type="button" key={u} className={settings.unit === u ? 'on' : ''} onClick={() => convertUnits(settings.unit, u)}>
                {u}
              </button>
            ))}
          </div>
        </div>
      </section>

      <NotificationsCard />

      <section className="card">
        <h2 className="h2">Steps from Apple Health</h2>
        <p className="muted small">
          Apple doesn't let web apps read Health directly, so a small Shortcut copies today's steps and you paste them by
          tapping the steps tile.
        </p>
        <ShortcutSetup />
      </section>

      <section className="card">
        <h2 className="h2">Backup</h2>
        <p className="muted small">
          Everything lives only on this phone. Save a backup to Files now and then in case the phone is lost or reset.
        </p>
        <div className="row gap">
          <button type="button" className="btn ghost grow" onClick={() => exportBackup()}>
            Save backup
          </button>
          <label className="btn ghost grow file-btn">
            Restore
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
        </div>
        {message && <p className="advice neutral">{message}</p>}
      </section>
    </div>
  )
}
