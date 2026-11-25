import { useSyncExternalStore } from 'react'
import { isIOS } from './steps'

/**
 * Notifications. iPhone only shows a web app's notifications when a server
 * pushes them, and the app stops running once the phone locks, so the app
 * hands its upcoming alerts to the push server (server/) and that sends each
 * one at its time.
 *
 * Alerts come in groups: "rest", "iv" (interval timer) and "daily"
 * (reminders). Sending a group replaces everything the server holds for it.
 */

const env = import.meta.env
/** Where the push server lives (server/, deployed to Cloudflare). Override with VITE_PUSH_URL for local testing. */
export const PUSH_URL: string = env.VITE_PUSH_URL ?? 'https://workout-push.barmrotmg.workers.dev'
/** The server's VAPID public key (base64url); must match server/wrangler.jsonc. */
const PUSH_KEY: string = env.VITE_PUSH_KEY ?? 'BMF6aTpiyIbpv1lgvDnLOCo1LX3qW1-7lkczWJgT85kkxXny0Lmxq9SlysJJwgtodEFvLjCHaTR4t-NsZTDqE_c'

// ---------------------------------------------------------------------------
// Preferences: per device, since each phone has its own subscription.

export interface NotifyPrefs {
  /** This device's id on the push server; null while notifications are off. */
  id: string | null
  /** Rest-over and interval alerts when the app isn't on screen. */
  timers: boolean
  /** Reminder times as "HH:MM", or null when that reminder is off. */
  weigh: string | null
  train: string | null
  steps: string | null
  /** Evening nudge when protein is short of the target. */
  protein: string | null
  /** Sundays. */
  checkin: string | null
}

export const REMINDER_DEFAULTS = { weigh: '08:00', train: '17:00', steps: '21:00', protein: '19:00', checkin: '10:00' } as const

const PREFS_KEY = 'notify'
const DEFAULT_PREFS: NotifyPrefs = { id: null, timers: true, ...REMINDER_DEFAULTS }

let prefs: NotifyPrefs = readPrefs()
const listeners = new Set<() => void>()

function readPrefs(): NotifyPrefs {
  try {
    return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<NotifyPrefs>) }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function getNotifyPrefs() {
  return prefs
}

export function setNotifyPrefs(patch: Partial<NotifyPrefs>) {
  prefs = { ...prefs, ...patch }
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Storage unavailable: preferences last for this session.
  }
  listeners.forEach((l) => l())
  syncTimers()
}

export function useNotifyPrefs() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => prefs,
  )
}

// ---------------------------------------------------------------------------
// Status, turning on and off

export type NotifyStatus = 'unconfigured' | 'install' | 'unsupported' | 'blocked' | 'off' | 'on'

const standalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export function notifyStatus(p: NotifyPrefs = prefs): NotifyStatus {
  if (!PUSH_URL || !PUSH_KEY) return 'unconfigured'
  if (!supported()) return isIOS() && !standalone() ? 'install' : 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  return p.id && Notification.permission === 'granted' ? 'on' : 'off'
}

function keyBytes(b64: string) {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

function sameKey(sub: PushSubscription) {
  const k = sub.options?.applicationServerKey
  if (!k) return true
  const a = new Uint8Array(k)
  const b = keyBytes(PUSH_KEY)
  return a.length === b.length && a.every((x, i) => x === b[i])
}

async function registration() {
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) throw new Error('The app is still installing. Try again in a moment.')
  return reg
}

async function subscribe(reg: ServiceWorkerRegistration) {
  let sub = await reg.pushManager.getSubscription()
  if (sub && !sameKey(sub)) {
    await sub.unsubscribe()
    sub = null
  }
  return sub ?? reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUSH_KEY) })
}

/** Call straight from a tap (iPhone only asks for permission then). Returns an error message, or null. */
export async function enableNotifications(): Promise<string | null> {
  try {
    const reg = registration()
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      listeners.forEach((l) => l())
      return permission === 'denied' ? null : 'Notifications were not allowed.'
    }
    const sub = await subscribe(await reg)
    const id = prefs.id ?? crypto.randomUUID()
    if (!(await post('/subscribe', { id, subscription: sub.toJSON() }))) {
      return "Couldn't reach the notification server. Check your connection and try again."
    }
    sent.clear()
    setNotifyPrefs({ id })
    return null
  } catch (err) {
    return err instanceof Error ? err.message : 'Something went wrong turning notifications on.'
  }
}

export async function disableNotifications() {
  const id = prefs.id
  sent.clear()
  setNotifyPrefs({ id: null })
  if (id) await post('/unsubscribe', { id })
  try {
    await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription().then((s) => s?.unsubscribe())
  } catch {
    // Nothing to unsubscribe.
  }
}

export async function sendTestNotification(): Promise<string | null> {
  if (!prefs.id) return 'Notifications are off.'
  try {
    const res = await fetch(PUSH_URL + '/test', { method: 'POST', body: JSON.stringify({ id: prefs.id, url: appUrl('') }) })
    const data = (await res.json()) as { ok?: boolean; status?: number }
    if (data.ok) return null
    if (data.status === 0) {
      setNotifyPrefs({ id: null })
      return 'This phone is no longer registered. Turn notifications on again.'
    }
    return `The notification service refused it (${data.status}).`
  } catch {
    return "Couldn't reach the notification server."
  }
}

/**
 * On launch: make sure the server has this phone's current subscription
 * (they can change or expire) and gets a fresh copy of every alert.
 */
export async function refreshSubscription() {
  if (notifyStatus() !== 'on') return
  try {
    const sub = await subscribe(await registration())
    await post('/subscribe', { id: prefs.id, subscription: sub.toJSON() })
  } catch {
    // Try again next launch.
  }
}

// ---------------------------------------------------------------------------
// Sending alerts

export interface AlertIn {
  at: number
  title: string
  body: string
  tag: string
  url: string
  ttl: number
  repeat?: number
}

/** A link into this app, e.g. appUrl('timer'). */
export function appUrl(path: string) {
  return location.origin + location.pathname + '#/' + path
}

/** Last list sent per group, so unchanged lists aren't sent again. */
const sent = new Map<string, string>()

function post(path: string, body: unknown, beacon = false): Promise<boolean> {
  const data = JSON.stringify(body)
  // text/plain keeps it a "simple" request: no CORS preflight, and sendBeacon can carry it.
  if (beacon && navigator.sendBeacon?.(PUSH_URL + path, new Blob([data], { type: 'text/plain' }))) {
    return Promise.resolve(true)
  }
  return fetch(PUSH_URL + path, { method: 'POST', body: data, keepalive: true })
    .then((r) => r.ok)
    .catch(() => false)
}

export function setAlerts(group: string, alerts: AlertIn[], beacon = false) {
  if (!prefs.id || !PUSH_URL) return
  const json = JSON.stringify(alerts)
  if (sent.get(group) === json) return
  sent.set(group, json)
  const id = prefs.id
  // Gym signal is patchy: retry a failed send a couple of times, unless a newer list replaced it.
  const attempt = (tries: number) =>
    void post('/alerts', { id, group, alerts }, beacon && tries === 0).then((ok) => {
      if (ok || sent.get(group) !== json) return
      if (tries < 2) setTimeout(() => sent.get(group) === json && attempt(tries + 1), 1500)
      else sent.delete(group)
    })
  attempt(0)
}

// ---------------------------------------------------------------------------
// Timer alerts (rest, intervals)
//
// While the app is on screen it beeps by itself, so an alert is taken back
// from the server shortly before it's due. If the app goes to the background
// (the phone locks, you open another app) everything still to come is handed
// over again, and the server sends it.

export type TimedAlert = Omit<AlertIn, 'ttl' | 'repeat'>

/** How long before an alert the app takes it back from the server, if it's on screen (allows for slow signal). */
const LEAD = 5000
const providers = new Map<string, () => TimedAlert[]>()
let checkTimer: ReturnType<typeof setTimeout> | undefined

export function registerTimerAlerts(group: string, provider: () => TimedAlert[]) {
  providers.set(group, provider)
}

export function syncTimers() {
  if (typeof document === 'undefined') return
  clearTimeout(checkTimer)
  const hidden = document.visibilityState === 'hidden'
  const now = Date.now()
  let next = Infinity
  for (const [group, provider] of providers) {
    const all = prefs.id && prefs.timers ? provider().filter((a) => a.at > now) : []
    for (const a of all) if (a.at - LEAD > now) next = Math.min(next, a.at - LEAD)
    const armed = all.filter((a) => hidden || a.at - now > LEAD).slice(0, 60)
    setAlerts(group, armed.map((a) => ({ ...a, ttl: 30 })), hidden)
  }
  if (next < Infinity) checkTimer = setTimeout(syncTimers, next - now + 50)
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', syncTimers)
  // Once every timer module has registered.
  setTimeout(syncTimers, 0)
}
