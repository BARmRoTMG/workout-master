import { useEffect, useState } from 'react'
import { useBodyweights, useExerciseMap, useNow, useProtein, useSettings, useSteps, useWaists, useWorkouts } from '../hooks'
import {
  appUrl,
  disableNotifications,
  enableNotifications,
  notifyStatus,
  REMINDER_DEFAULTS,
  refreshSubscription,
  sendTestNotification,
  setAlerts,
  setNotifyPrefs,
  useNotifyPrefs,
  type NotifyPrefs,
} from '../lib/push'
import { dailyAlerts } from '../lib/reminders'
import { Icon, Switch } from './ui'

/** Settings card: turn notifications on, pick which ones and when. */
export function NotificationsCard() {
  const prefs = useNotifyPrefs()
  const [, refresh] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok?: boolean } | null>(null)
  const status = notifyStatus(prefs)

  const run = async (fn: () => Promise<string | null>, success?: string) => {
    setBusy(true)
    setMessage(null)
    const err = await fn()
    setBusy(false)
    refresh((n) => n + 1)
    if (err) setMessage({ text: err })
    else if (success) setMessage({ text: success, ok: true })
  }

  let body
  switch (status) {
    case 'unconfigured':
      body = <p className="muted small">Notifications aren't set up in this version of the app.</p>
      break
    case 'install':
      body = (
        <p className="muted small">
          iPhone only sends notifications to apps on the Home Screen. In Safari tap <b>Share</b>, then{' '}
          <b>Add to Home Screen</b>, and open the app from there.
        </p>
      )
      break
    case 'unsupported':
      body = <p className="muted small">This browser can't show notifications from web apps.</p>
      break
    case 'blocked':
      body = (
        <p className="muted small">
          Notifications are blocked for this app. Turn them on in iPhone <b>Settings</b> → <b>Notifications</b> →{' '}
          <b>Workout</b>, then come back here.
        </p>
      )
      break
    case 'off':
      body = (
        <>
          <p className="muted small">
            Rest-over alerts on your lock screen, so you can leave the app between sets, plus nudges to weigh in, train, log steps
            and hit your protein.
          </p>
          <button type="button" className="btn primary wide" disabled={busy} onClick={() => run(enableNotifications)}>
            <Icon name="bell" size={18} /> Turn on notifications
          </button>
        </>
      )
      break
    case 'on':
      body = (
        <>
          <Switch
            label="Rest and interval timers"
            sub="When a timer ends and the app isn't on screen"
            checked={prefs.timers}
            onChange={(timers) => setNotifyPrefs({ timers })}
          />
          <Reminder prefs={prefs} which="weigh" label="Weigh-in" sub="Skipped once you've weighed in" />
          <Reminder prefs={prefs} which="train" label="Workout day" sub="Only on days your muscles are ready" />
          <Reminder prefs={prefs} which="steps" label="Steps" sub="Skipped once today's steps are in" />
          <Reminder prefs={prefs} which="protein" label="Protein" sub="Only if you're short of your target" />
          <Reminder prefs={prefs} which="checkin" label="Weekly check-in" sub="Sundays" />
          <div className="row between">
            <button
              type="button"
              className="text-link"
              disabled={busy}
              onClick={() => run(sendTestNotification, 'Sent. It should arrive in a few seconds.')}
            >
              Send a test
            </button>
            <button type="button" className="text-link muted" disabled={busy} onClick={() => run(async () => (await disableNotifications(), null))}>
              Turn off
            </button>
          </div>
        </>
      )
  }

  return (
    <section className="card notify">
      <h2 className="h2">Notifications</h2>
      {body}
      {message && <p className={'advice ' + (message.ok ? 'good' : 'warn')}>{message.text}</p>}
    </section>
  )
}

type ReminderKey = keyof typeof REMINDER_DEFAULTS

function Reminder({ prefs, which, label, sub }: { prefs: NotifyPrefs; which: ReminderKey; label: string; sub: string }) {
  const time = prefs[which]
  return (
    <Switch label={label} sub={sub} checked={time !== null} onChange={(on) => setNotifyPrefs({ [which]: on ? REMINDER_DEFAULTS[which] : null })}>
      {time !== null && (
        <input
          type="time"
          className="time-input"
          aria-label={`${label} time`}
          value={time}
          onChange={(e) => e.target.value && setNotifyPrefs({ [which]: e.target.value })}
        />
      )}
    </Switch>
  )
}

/** Keeps the server's daily reminders in step with what you've logged. Renders nothing. */
export function ReminderSync() {
  const prefs = useNotifyPrefs()
  const workouts = useWorkouts()
  const bodyweights = useBodyweights()
  const steps = useSteps()
  const protein = useProtein()
  const waists = useWaists()
  const settings = useSettings()
  const exMap = useExerciseMap()
  const now = useNow(60_000)
  const on = notifyStatus(prefs) === 'on'

  useEffect(() => {
    if (on) void refreshSubscription()
  }, [on])

  useEffect(() => {
    if (!on || !workouts || !bodyweights || !steps || !protein || !waists) return
    setAlerts('daily', dailyAlerts({ prefs, now, workouts, exMap, settings, bodyweights, steps, protein, waists, url: appUrl }))
  }, [on, prefs, now, workouts, exMap, settings, bodyweights, steps, protein, waists])

  return null
}
