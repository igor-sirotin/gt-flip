#!/usr/bin/env node
/**
 * Generates icon16.png, icon48.png, and icon128.png for the GT Flip extension.
 * Run once before loading the extension:
 *   node icons/create-icons.js
 *
 * No external dependencies — uses only Node.js built-ins (zlib, fs, path).
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

// ── Minimal PNG encoder ──────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf  = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32BE(data.length);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf   = Buffer.allocUnsafe(4);
  crcBuf.writeUInt32BE(crc32(crcInput));
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/**
 * @param {number}   size   – icon dimension (square)
 * @param {Function} drawFn – (x, y, size) => [r, g, b]
 * @returns {Buffer} PNG file bytes
 */
function makePNG(size, drawFn) {
  // Build raw (unfiltered) scanlines: each row starts with a filter byte of 0.
  const raw = [];
  for (let y = 0; y < size; y++) {
    raw.push(0); // filter: None
    for (let x = 0; x < size; x++) {
      const [r, g, b] = drawFn(x, y, size);
      raw.push(r, g, b);
    }
  }

  const compressed = zlib.deflateSync(Buffer.from(raw), { level: 9 });

  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(size, 0); // width
  ihdr.writeUInt32BE(size, 4); // height
  ihdr.writeUInt8(8, 8);       // bit depth
  ihdr.writeUInt8(2, 9);       // color type: RGB
  ihdr.writeUInt8(0, 10);      // compression method
  ihdr.writeUInt8(0, 11);      // filter method
  ihdr.writeUInt8(0, 12);      // interlace method

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG magic bytes
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Icon design ──────────────────────────────────────────────────────────────
// Two horizontal swap arrows (→ on top, ← on bottom) in white on Google blue.

const BLUE  = [66, 133, 244];
const WHITE = [255, 255, 255];

function iconPixel(x, y, size) {
  const pad    = Math.round(size * 0.12);           // side padding
  const thick  = Math.max(1, Math.round(size * 0.1)); // stroke thickness (px)
  const head   = Math.round(size * 0.22);           // arrowhead length (px)

  const y1 = Math.round(size * 0.35); // top arrow centre
  const y2 = Math.round(size * 0.65); // bottom arrow centre

  // ── Top arrow →  (shaft + right arrowhead) ──────────────────────────────
  // Shaft
  if (Math.abs(y - y1) <= thick && x >= pad && x <= size - pad - head) return WHITE;
  // Arrowhead (right side)
  {
    const dx = (size - pad) - x; // distance from right tip
    if (dx >= 0 && dx <= head && Math.abs(y - y1) <= dx * 0.75) return WHITE;
  }

  // ── Bottom arrow ←  (shaft + left arrowhead) ────────────────────────────
  // Shaft
  if (Math.abs(y - y2) <= thick && x >= pad + head && x <= size - pad) return WHITE;
  // Arrowhead (left side)
  {
    const dx = x - pad; // distance from left tip
    if (dx >= 0 && dx <= head && Math.abs(y - y2) <= dx * 0.75) return WHITE;
  }

  return BLUE;
}

// ── Write files ───────────────────────────────────────────────────────────────
const outDir = __dirname;

for (const size of [16, 48, 128]) {
  const png  = makePNG(size, iconPixel);
  const file = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(file, png);
  console.log(`✓  ${file}  (${size}×${size}, ${png.length} bytes)`);
}

console.log('\nDone — reload the extension in chrome://extensions to pick up the new icons.');
