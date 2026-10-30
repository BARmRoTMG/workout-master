// Draws the app icon (a loaded barbell end-on: yellow, blue and red plates on a dark tile)
// into PNGs without any image dependencies. Run: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const BG = [14, 14, 13]
const PLATES = [
  // [half-height as a fraction of the icon, width fraction, colour]
  [0.34, 0.07, [42, 99, 212]],
  [0.3, 0.06, [242, 194, 25]],
  [0.24, 0.05, [216, 50, 42]],
]
const BAR = [167, 171, 177]

function draw(size, padding) {
  const px = new Uint8Array(size * size * 4)
  const set = (x, y, [r, g, b]) => {
    const i = (y * size + x) * 4
    px[i] = r
    px[i + 1] = g
    px[i + 2] = b
    px[i + 3] = 255
  }
  const rect = (x0, y0, x1, y1, c) => {
    for (let y = Math.max(0, Math.round(y0)); y < Math.min(size, Math.round(y1)); y++)
      for (let x = Math.max(0, Math.round(x0)); x < Math.min(size, Math.round(x1)); x++) set(x, y, c)
  }
  rect(0, 0, size, size, BG)

  const s = size * (1 - 2 * padding)
  const o = size * padding
  const cy = size / 2
  // Bar through the middle
  rect(o + s * 0.04, cy - s * 0.035, o + s * 0.96, cy + s * 0.035, BAR)
  // Plates, mirrored on both sides, heaviest innermost
  let xL = o + s * 0.33
  let xR = o + s * 0.67
  for (const [h, w, c] of PLATES) {
    rect(xL - s * w, cy - s * h, xL, cy + s * h, c)
    rect(xR, cy - s * h, xR + s * w, cy + s * h, c)
    xL -= s * w + s * 0.012
    xR += s * w + s * 0.012
  }
  // Collars
  rect(xL - s * 0.03, cy - s * 0.07, xL, cy + s * 0.07, BAR)
  rect(xR, cy - s * 0.07, xR + s * 0.03, cy + s * 0.07, BAR)
  return px
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(size, px) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    Buffer.from(px.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const [name, size, padding] of [
  ['icon-192.png', 192, 0.08],
  ['icon-512.png', 512, 0.08],
  ['icon-maskable-512.png', 512, 0.2],
  ['apple-touch-icon.png', 180, 0.1],
]) {
  writeFileSync(new URL(`../public/${name}`, import.meta.url), png(size, draw(size, padding)))
  console.log('wrote', name)
}
