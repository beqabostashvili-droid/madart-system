// Generates build/icon.png (the source electron-builder turns into the Windows
// .ico). Hand-rolled so the repo needs no image toolchain: a rounded brand-
// coloured tile with the MADART "M". Run: node build/make-icon.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SIZE = 512;
const SS = 3; // supersampling factor per axis
const BRAND = [0xff, 0xbb, 0x00];
const INK = [0x1f, 0x1a, 0x0b];

const inRoundedRect = (x, y, w, h, r) => {
  const cx = Math.min(Math.max(x, r), w - r);
  const cy = Math.min(Math.max(y, r), h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r || (x >= r && x <= w - r) || (y >= r && y <= h - r);
};

// "M" outline, clockwise from the bottom-left foot.
function mPolygon() {
  const x0 = SIZE * 0.24;
  const x1 = SIZE * 0.76;
  const y0 = SIZE * 0.29;
  const y1 = SIZE * 0.71;
  const w = (x1 - x0) * 0.2; // stroke width
  const cx = (x0 + x1) / 2;
  const h = y1 - y0;
  return [
    [x0, y1],
    [x0, y0],
    [x0 + w, y0],
    [cx, y0 + h * 0.5],
    [x1 - w, y0],
    [x1, y0],
    [x1, y1],
    [x1 - w, y1],
    [x1 - w, y0 + h * 0.36],
    [cx, y0 + h * 0.86],
    [x0 + w, y0 + h * 0.36],
    [x0 + w, y1],
  ];
}

const inPolygon = (px, py, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

const poly = mPolygon();
const radius = SIZE * 0.22;
const pixels = Buffer.alloc(SIZE * SIZE * 4);

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let bg = 0;
    let fg = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const px = x + (sx + 0.5) / SS;
        const py = y + (sy + 0.5) / SS;
        if (!inRoundedRect(px, py, SIZE, SIZE, radius)) continue;
        bg++;
        if (inPolygon(px, py, poly)) fg++;
      }
    }
    const total = SS * SS;
    const alpha = Math.round((bg / total) * 255);
    // blend the ink over the brand tile by its own coverage
    const k = bg === 0 ? 0 : fg / bg;
    const o = (y * SIZE + x) * 4;
    for (let c = 0; c < 3; c++) pixels[o + c] = Math.round(BRAND[c] * (1 - k) + INK[c] * k);
    pixels[o + 3] = alpha;
  }
}

// ── minimal PNG encoder ───────────────────────────────────────────────────
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0; // filter: none
  pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'icon.png');
writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes, ${SIZE}x${SIZE})`);
