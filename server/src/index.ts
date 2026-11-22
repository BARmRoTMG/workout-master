import { DurableObject } from 'cloudflare:workers'
import { sendPush, type Subscription, type Vapid } from './webpush'

/**
 * Push server for Workout Master. The app can't run while the phone is locked,
 * so it hands its upcoming alerts (rest over, interval phases, daily
 * reminders) to this Worker, which sends each one as a Web Push at its time.
 *
 * One Durable Object per device holds that device's push subscription and
 * pending alerts, and wakes itself with an alarm when the next one is due.
 */

export interface Env {
  BOX: DurableObjectNamespace<PushBox>
  VAPID_PUBLIC_KEY: string
  VAPID_PRIVATE_KEY: string
  VAPID_SUBJECT: string
  /** Comma-separated origins allowed to call the API. */
  ALLOWED_ORIGINS: string
}

export interface Alert {
  /** Which feature owns it: setting a group's alerts replaces only that group. */
  group: string
  at: number
  title: string
  body: string
  /** Opened when the notification is tapped. */
  url: string
  /** Notifications with the same tag replace each other on the phone. */
  tag: string
  /** Seconds after `at` that it is still worth delivering. */
  ttl: number
  /** Milliseconds between repeats; repeating alerts are rescheduled after sending. */
  repeat?: number
}

const MAX_ALERTS = 80
const MAX_AHEAD = 8 * 86_400_000

const vapid = (env: Env): Vapid => ({
  publicKey: env.VAPID_PUBLIC_KEY,
  privateKey: env.VAPID_PRIVATE_KEY,
  subject: env.VAPID_SUBJECT,
})

const str = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : null)

function cleanAlert(group: string, raw: unknown, now: number): Alert | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const at = Number(r.at)
  const title = str(r.title, 120)
  const body = str(r.body, 240) ?? ''
  const url = str(r.url, 500)
  const tag = str(r.tag, 32) ?? group
  if (!Number.isFinite(at) || at > now + MAX_AHEAD || !title || !url || !/^https?:\/\//.test(url)) return null
  const ttl = Math.min(86_400, Math.max(10, Number(r.ttl) || 60))
  const repeat = Number(r.repeat)
  return {
    group,
    at,
    title,
    body,
    url,
    tag,
    ttl,
    ...(Number.isFinite(repeat) && repeat >= 3_600_000 ? { repeat } : {}),
  }
}

/** Browsers' push services. Anything else is refused, so the Worker can't be pointed at arbitrary hosts. */
const PUSH_HOSTS = [
  /(^|\.)push\.apple\.com$/,
  /^fcm\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /\.notify\.windows\.com$/,
]

function cleanSubscription(raw: unknown): Subscription | null {
  const r = raw as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null
  const endpoint = str(r?.endpoint, 1000)
  const p256dh = str(r?.keys?.p256dh, 200)
  const auth = str(r?.keys?.auth, 100)
  if (!endpoint || !p256dh || !auth) return null
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || !PUSH_HOSTS.some((h) => h.test(url.hostname))) return null
  return { endpoint, keys: { p256dh, auth } }
}

/**
 * Declarative Web Push (iOS 18.4+ shows it without running any app code);
 * older Safari and other browsers hand the same JSON to the app's service worker.
 */
function payload(a: Pick<Alert, 'title' | 'body' | 'url' | 'tag'>) {
  return JSON.stringify({
    web_push: 8030,
    notification: { title: a.title, body: a.body, navigate: a.url, tag: a.tag, silent: false },
  })
}

export class PushBox extends DurableObject<Env> {
  async subscribe(sub: Subscription) {
    await this.ctx.storage.put('sub', sub)
  }

  async unsubscribe() {
    await this.ctx.storage.deleteAlarm()
    await this.ctx.storage.deleteAll()
  }

  async setAlerts(group: string, raw: unknown[]) {
    const now = Date.now()
    const incoming = raw.map((r) => cleanAlert(group, r, now)).filter((a): a is Alert => a !== null)
    const others = ((await this.ctx.storage.get<Alert[]>('alerts')) ?? []).filter((a) => a.group !== group)
    await this.save([...others, ...incoming].slice(0, MAX_ALERTS))
    return incoming.length
  }

  /** Sends a notification right away. Returns the push service's status code. */
  async test(url: string) {
    const sub = await this.ctx.storage.get<Subscription>('sub')
    if (!sub) return 0
    const res = await sendPush(
      sub,
      payload({ title: 'Notifications are on', body: "You'll get rest alerts and reminders here.", url, tag: 'test' }),
      vapid(this.env),
      { ttl: 300, urgency: 'high' },
    )
    if (res.status === 404 || res.status === 410) await this.unsubscribe()
    return res.status
  }

  async alarm() {
    const now = Date.now()
    const alerts = (await this.ctx.storage.get<Alert[]>('alerts')) ?? []
    const sub = await this.ctx.storage.get<Subscription>('sub')
    const due = alerts.filter((a) => a.at <= now + 500)
    const later = alerts.filter((a) => a.at > now + 500)

    // If several of the same kind came due together (say the alarm ran late), only the newest matters.
    const latest = new Map<string, Alert>()
    for (const a of due) {
      const key = `${a.group}/${a.tag}`
      const seen = latest.get(key)
      if (!seen || seen.at < a.at) latest.set(key, a)
    }

    let gone = false
    if (sub) {
      for (const a of latest.values()) {
        if (now - a.at > a.ttl * 1000) continue
        try {
          const res = await sendPush(sub, payload(a), vapid(this.env), {
            ttl: a.ttl,
            urgency: 'high',
            topic: a.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || undefined,
          })
          if (res.status === 404 || res.status === 410) gone = true
          else if (!res.ok) console.log('push failed', res.status, await res.text())
        } catch (err) {
          console.log('push error', String(err))
        }
      }
    }
    if (gone) {
      await this.unsubscribe()
      return
    }

    for (const a of due) {
      if (!a.repeat) continue
      let at = a.at + a.repeat
      while (at <= now) at += a.repeat
      later.push({ ...a, at })
    }
    await this.save(later)
  }

  private async save(alerts: Alert[]) {
    await this.ctx.storage.put('alerts', alerts)
    if (alerts.length) await this.ctx.storage.setAlarm(Math.min(...alerts.map((a) => a.at)))
    else await this.ctx.storage.deleteAlarm()
  }
}

// ---------------------------------------------------------------------------
// HTTP API. Bodies are JSON sent as text/plain, so browsers skip the CORS
// preflight and navigator.sendBeacon can deliver them while the app hides.

const DEVICE = /^[0-9a-f-]{36}$/

export default {
  async fetch(req, env): Promise<Response> {
    const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
    const origin = req.headers.get('Origin')
    const cors: Record<string, string> = {
      'Access-Control-Allow-Origin': origin && allowed.includes(origin) ? origin : allowed[0],
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      Vary: 'Origin',
    }
    const reply = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (origin && !allowed.includes(origin)) return reply({ error: 'origin' }, 403)

    const path = new URL(req.url).pathname
    if (req.method === 'GET' && path === '/key') return reply({ key: env.VAPID_PUBLIC_KEY })
    if (req.method !== 'POST') return reply({ error: 'not found' }, 404)

    const text = await req.text()
    if (text.length > 64_000) return reply({ error: 'too big' }, 413)
    let body: Record<string, unknown>
    try {
      body = JSON.parse(text)
    } catch {
      return reply({ error: 'bad json' }, 400)
    }
    const id = typeof body.id === 'string' && DEVICE.test(body.id) ? body.id : null
    if (!id) return reply({ error: 'bad id' }, 400)
    const box = env.BOX.get(env.BOX.idFromName(id))

    switch (path) {
      case '/subscribe': {
        const sub = cleanSubscription(body.subscription)
        if (!sub) return reply({ error: 'bad subscription' }, 400)
        await box.subscribe(sub)
        return reply({ ok: true })
      }
      case '/alerts': {
        const group = str(body.group, 16)
        if (!group || !Array.isArray(body.alerts)) return reply({ error: 'bad alerts' }, 400)
        return reply({ ok: true, count: await box.setAlerts(group, body.alerts) })
      }
      case '/test': {
        const url = str(body.url, 500)
        if (!url || !/^https?:\/\//.test(url)) return reply({ error: 'bad url' }, 400)
        const status = await box.test(url)
        return reply({ ok: status >= 200 && status < 300, status })
      }
      case '/unsubscribe':
        await box.unsubscribe()
        return reply({ ok: true })
      default:
        return reply({ error: 'not found' }, 404)
    }
  },
} satisfies ExportedHandler<Env>
