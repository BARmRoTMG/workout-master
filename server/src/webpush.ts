/**
 * Web Push sending with nothing but WebCrypto, so it runs on Cloudflare
 * Workers (and in Node for tests):
 *
 * - payload encryption: RFC 8291 (aes128gcm content coding, RFC 8188)
 * - sender identification: VAPID, RFC 8292
 */

export interface Subscription {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface Vapid {
  /** Uncompressed P-256 public key, base64url (65 bytes). */
  publicKey: string
  /** The private scalar d, base64url (32 bytes). */
  privateKey: string
  /** mailto: or https: contact for the push service. */
  subject: string
}

type Bytes = Uint8Array

const enc = new TextEncoder()

export function b64u(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function unb64u(s: string): Bytes {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, ''))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

/** A P-256 private key from its scalar and public point (WebCrypto can't import a bare scalar). */
export function importPrivate(d: string, publicKey: Uint8Array, alg: 'ECDH' | 'ECDSA') {
  if (publicKey.length !== 65 || publicKey[0] !== 4) throw new Error('Public key must be an uncompressed P-256 point')
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    d,
    x: b64u(publicKey.slice(1, 33)),
    y: b64u(publicKey.slice(33, 65)),
    ext: true,
  }
  return crypto.subtle.importKey('jwk', jwk, { name: alg, namedCurve: 'P-256' }, false, alg === 'ECDH' ? ['deriveBits'] : ['sign'])
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, length: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8))
}

export interface EncryptOptions {
  /** Fixed values for tests; random in normal use. */
  salt?: Bytes
  sender?: { privateKey: CryptoKey; publicKey: Bytes }
}

/** Encrypts a push payload for one subscription (single aes128gcm record). */
export async function encrypt(plaintext: Bytes, uaPublic: Bytes, authSecret: Bytes, opts: EncryptOptions = {}): Promise<Bytes> {
  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16))
  let sender = opts.sender
  if (!sender) {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
    sender = { privateKey: pair.privateKey, publicKey: new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey) as ArrayBuffer) }
  }

  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  // A variable, not a literal: some type packages spell the 'public' member differently.
  const ecdhAlg = { name: 'ECDH', public: uaKey }
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits(ecdhAlg, sender.privateKey, 256))

  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, sender.publicKey)
  const ikm = await hkdf(authSecret, ecdh, keyInfo, 32)
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)

  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  // 0x02 marks the last (and only) record; no padding.
  const record = concat(plaintext, new Uint8Array([2]))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, record))

  const header = new Uint8Array(16 + 4 + 1)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, 4096)
  header[20] = sender.publicKey.length
  return concat(header, sender.publicKey, ciphertext)
}

/** The VAPID Authorization header for a push service, valid for 12 hours. */
export async function vapidAuth(endpoint: string, vapid: Vapid, now = Date.now()): Promise<string> {
  const header = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64u(
    enc.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(now / 1000) + 12 * 3600,
        sub: vapid.subject,
      }),
    ),
  )
  const unsigned = `${header}.${claims}`
  const key = await importPrivate(vapid.privateKey, unb64u(vapid.publicKey), 'ECDSA')
  // WebCrypto's ECDSA signature is already the raw r||s form JWS wants.
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned)))
  return `vapid t=${unsigned}.${b64u(sig)}, k=${vapid.publicKey}`
}

export interface SendOptions {
  /** Seconds the push service may hold the message while the phone is offline. */
  ttl: number
  urgency?: 'very-low' | 'low' | 'normal' | 'high'
  /** Replaces an undelivered message with the same topic (≤ 32 base64url characters). */
  topic?: string
}

export async function sendPush(sub: Subscription, payload: string, vapid: Vapid, opts: SendOptions): Promise<Response> {
  const body = await encrypt(enc.encode(payload), unb64u(sub.keys.p256dh), unb64u(sub.keys.auth))
  const headers: Record<string, string> = {
    Authorization: await vapidAuth(sub.endpoint, vapid),
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    TTL: String(Math.max(0, Math.round(opts.ttl))),
    Urgency: opts.urgency ?? 'normal',
  }
  if (opts.topic) headers.Topic = opts.topic
  return fetch(sub.endpoint, { method: 'POST', headers, body })
}
