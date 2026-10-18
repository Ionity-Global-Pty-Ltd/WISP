'use strict';
/*
 * WISP - tray icon painter.
 * Draws the tray glyph in the *current* aura colour (a glowing ring with a
 * bright wisp on it) straight into RGBA pixels and wraps it in a tiny PNG,
 * so the tray always shows the colour you picked - no image files needed.
 */
const zlib = require('zlib');
const { nativeImage } = require('electron');

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
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
  ]);
}

const hex2rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function hsl(hue, s = 0.9, l = 0.58) {
  const a = s * Math.min(l, 1 - l);
  const f = n => { const k = (n + hue / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * @param {number} size  pixel size
 * @param {object} o     { color:'#RRGGBB', special:'gradient'|'spectrum'|undefined, enabled:boolean }
 */
function paint(size, o) {
  const px = Buffer.alloc(size * size * 4);
  const c = size / 2, R = size * 0.34, ring = Math.max(1.2, size * 0.085);
  const base = hex2rgb(o.color || '#3366FF');
  const purple = hex2rgb('#5746E3'), cyan = hex2rgb('#00D2FF');
  const on = o.enabled !== false;
  const wa = -Math.PI / 4; // wisp angle (top-right)
  const wx = c + Math.cos(wa) * R, wy = c + Math.sin(wa) * R;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c;
      const d = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      let col = base;
      if (o.special === 'spectrum') col = hsl(((ang + Math.PI) / (2 * Math.PI)) * 360);
      else if (o.special === 'gradient') col = mix(purple, cyan, (Math.sin(ang - Math.PI / 4) + 1) / 2);
      if (!on) { const g = (col[0] + col[1] + col[2]) / 3; col = [g * 0.7, g * 0.7, g * 0.7]; }

      const e = Math.abs(d - R);
      let a = 0;
      a = Math.max(a, Math.min(1, Math.max(0, ring / 2 + 0.6 - e)));            // crisp ring
      a = Math.max(a, 0.55 * Math.exp(-((e / (ring * 1.9)) ** 2)));              // halo
      let white = 0;
      const dw = Math.hypot(x + 0.5 - wx, y + 0.5 - wy);
      if (on) {
        const core = Math.max(0, Math.min(1, size * 0.13 - dw + 0.6));
        white = core;
        a = Math.max(a, core, 0.9 * Math.exp(-((dw / (size * 0.16)) ** 2)));
      }
      const i = (y * size + x) * 4;
      const fc = mix(col, [255, 255, 255], white * 0.85);
      px[i] = fc[0]; px[i + 1] = fc[1]; px[i + 2] = fc[2];
      px[i + 3] = Math.round(Math.min(1, a) * 255);
    }
  }
  return encodePNG(size, size, px);
}

function trayImage(o) {
  const base = process.platform === 'darwin' ? 18 : (process.platform === 'win32' ? 16 : 24);
  const img = nativeImage.createEmpty();
  for (const sf of [1, 1.5, 2, 3]) {
    const s = Math.round(base * sf);
    img.addRepresentation({ scaleFactor: sf, width: s, height: s, buffer: paint(s, o) });
  }
  return img;
}

module.exports = { trayImage, paint, encodePNG };
