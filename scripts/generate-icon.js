'use strict';

/*
 * Generates the app icons (assets/icon.png 512x512 and assets/tray.png 32x32)
 * with no dependencies: pixels are rasterized here and encoded as PNG with zlib.
 * Run: npm run icon
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/** Signed distance to a rounded rectangle centred at (cx, cy). */
function roundRectSdf(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - hw + r;
  const qy = Math.abs(y - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Shape in unit space [0,1]; returns [r,g,b,a] for a sample point. */
function sample(u, v, simple) {
  const bg = roundRectSdf(u, v, 0.5, 0.5, 0.46, 0.46, simple ? 0.2 : 0.22);
  if (bg > 0) return [0, 0, 0, 0];
  // Diagonal green gradient.
  const t = (u + v) / 2;
  let col = [30 + (18 - 30) * t, 215 + (150 - 215) * t, 96 + (70 - 96) * t];
  // Five equalizer bars.
  const heights = [0.3, 0.52, 0.7, 0.46, 0.26];
  const barW = 0.085;
  const gap = 0.045;
  const total = heights.length * barW + (heights.length - 1) * gap;
  const start = 0.5 - total / 2;
  for (let i = 0; i < heights.length; i++) {
    const cx = start + i * (barW + gap) + barW / 2;
    const d = roundRectSdf(u, v, cx, 0.5, barW / 2, heights[i] / 2, barW / 2);
    if (d <= 0) col = [255, 255, 255];
  }
  return [col[0], col[1], col[2], 255];
}

function render(size, simple) {
  const ss = 4;
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const [cr, cg, cb, ca] = sample((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size, simple);
          r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
        }
      }
      const i = (y * size + x) * 4;
      out[i + 3] = Math.round(a / (ss * ss));
      if (a > 0) {
        out[i] = Math.round(r / a);
        out[i + 1] = Math.round(g / a);
        out[i + 2] = Math.round(b / a);
      }
    }
  }
  return out;
}

const assets = path.join(__dirname, '..', 'assets');
fs.mkdirSync(assets, { recursive: true });
for (const [name, size, simple] of [['icon.png', 512, false], ['tray.png', 32, true]]) {
  fs.writeFileSync(path.join(assets, name), encodePng(size, render(size, simple)));
  console.log(`wrote assets/${name} (${size}x${size})`);
}
