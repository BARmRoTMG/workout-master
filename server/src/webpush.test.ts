import { describe, expect, it } from 'vitest'
import { b64u, encrypt, importPrivate, unb64u, vapidAuth } from './webpush'

// RFC 8291 section 5 and appendix A.
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  body:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml' +
    'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT' +
    'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
}

describe('web push encryption', () => {
  it('matches the RFC 8291 worked example byte for byte', async () => {
    const asPublic = unb64u(RFC.asPublic)
    const body = await encrypt(new TextEncoder().encode(RFC.plaintext), unb64u(RFC.uaPublic), unb64u(RFC.auth), {
      salt: unb64u(RFC.salt),
      sender: { privateKey: await importPrivate(RFC.asPrivate, asPublic, 'ECDH'), publicKey: asPublic },
    })
    expect(b64u(body)).toBe(RFC.body)
  })

  it('uses a fresh salt and key each time', async () => {
    const msg = new TextEncoder().encode('hi')
    const a = await encrypt(msg, unb64u(RFC.uaPublic), unb64u(RFC.auth))
    const b = await encrypt(msg, unb64u(RFC.uaPublic), unb64u(RFC.auth))
    expect(b64u(a)).not.toBe(b64u(b))
    // salt 16 + record size 4 + key length 1 + key 65 + (2 bytes + delimiter + 16 tag)
    expect(a.length).toBe(86 + 2 + 1 + 16)
  })
})

describe('VAPID', () => {
  it('signs a JWT the public key verifies, scoped to the push service origin', async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
    const publicKey = b64u(new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer))
    const now = Date.UTC(2026, 10, 22, 12)
    const header = await vapidAuth('https://web.push.apple.com/abc/def', { publicKey, privateKey: jwk.d!, subject: 'https://example.test/' }, now)

    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header)!
    expect(m).not.toBeNull()
    expect(m[4]).toBe(publicKey)
    const claims = JSON.parse(new TextDecoder().decode(unb64u(m[2])))
    expect(claims).toEqual({ aud: 'https://web.push.apple.com', exp: now / 1000 + 12 * 3600, sub: 'https://example.test/' })
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pair.publicKey,
      unb64u(m[3]),
      new TextEncoder().encode(`${m[1]}.${m[2]}`),
    )
    expect(ok).toBe(true)
  })
})
