'use strict';
// -------------------------------------------------------------------------
// Icon generator for Pomo Electron.
//
//   node build/gen-icon.js
//
// Draws a themed tomato and writes build/icon.ico (multi-size: 16..256) and
// build/icon.png (256). Pure Node -- no image libraries. The drawing is
// vector-based (distances + gradients), so it stays crisp at every size.
//
// Want a different look? Tweak the color constants and geometry in draw().
// -------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = __dirname; // the build/ folder

// ---- color helpers ----
function mix(c1, c2, t) {
  t = Math.max(0, Math.min(1, t));
  return [
    c1[0] + (c2[0] - c1[0]) * t,
    c1[1] + (c2[1] - c1[1]) * t,
    c1[2] + (c2[2] - c1[2]) * t,
  ];
}
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// ---- distance helpers ----
function len(x, y) { return Math.hypot(x, y); }
function sdRoundBox(px, py, hw, hh, r) {
  const qx = Math.abs(px) - hw + r;
  const qy = Math.abs(py) - hh + r;
  const outside = len(Math.max(qx, 0), Math.max(qy, 0));
  return Math.min(Math.max(qx, qy), 0) + outside - r;
}

// Render an RGBA Uint8Array for the given square size.
function draw(size) {
  const out = new Uint8Array(size * size * 4); // transparent

  const cx = size / 2;
  const cy = size / 2;

  const R = size * 0.30;          // tomato body radius
  const bcx = cx;
  const bcy = cy + size * 0.055;  // body sits slightly low, room for leaves
  const stemBase = { x: cx, y: bcy - R * 0.82 };

  const bgTop = [0x2f, 0x2f, 0x37];
  const bgBot = [0x18, 0x18, 0x1d];
  const bodyIn = [0xff, 0x82, 0x63];
  const bodyOut = [0xe1, 0x39, 0x28];
  const leafIn = [0x6f, 0xdb, 0x9a];
  const leafOut = [0x2f, 0x9e, 0x63];

  const upOffsets = [0, 40, -40, 78, -78]; // leaf directions (deg from up)
  const leaves = upOffsets.map((deg) => {
    const ang = (-90 + deg) * Math.PI / 180;
    return { ca: Math.cos(ang), sa: Math.sin(ang) };
  });
  const leafLen = R * 0.62;
  const leafWid = R * 0.20;

  function composite(idx, r, g, b, a) {
    if (a <= 0) return;
    const dA = out[idx + 3] / 255;
    const oA = a + dA * (1 - a);
    if (oA <= 0) return;
    out[idx] = ((r * a + out[idx] * dA * (1 - a)) / oA) | 0;
    out[idx + 1] = ((g * a + out[idx + 1] * dA * (1 - a)) / oA) | 0;
    out[idx + 2] = ((b * a + out[idx + 2] * dA * (1 - a)) / oA) | 0;
    out[idx + 3] = (oA * 255) | 0;
  }

  const aa = 1.0;
  const cov = (d) => clamp01(0.5 - d / aa);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const idx = (y * size + x) * 4;

      // Background rounded square (vertical gradient).
      const dBg = sdRoundBox(px - cx, py - cy, size / 2 - size * 0.045,
        size / 2 - size * 0.045, size * 0.22);
      const aBg = cov(dBg);
      if (aBg > 0) {
        const c = mix(bgTop, bgBot, y / size);
        composite(idx, c[0], c[1], c[2], aBg);
      }

      // Soft drop shadow.
      const dShadow = len(px - bcx, py - (bcy + R * 0.32)) - R * 0.92;
      const aShadow = clamp01(0.5 - dShadow / (size * 0.06)) * 0.35;
      if (aShadow > 0) composite(idx, 0, 0, 0, aShadow);

      // Leaf crown.
      let leafCov = 0;
      let leafT = 0;
      for (const lf of leaves) {
        const rx = px - stemBase.x;
        const ry = py - stemBase.y;
        const u = rx * lf.ca + ry * lf.sa;
        const v = -rx * lf.sa + ry * lf.ca;
        const cu = u - leafLen * 0.55;
        const taper = 1 - clamp01(u / (leafLen * 1.15)) * 0.85;
        const w = Math.max(0.001, leafWid * taper);
        const d = len(cu / (leafLen * 0.6), v / w) - 1;
        const dpx = d * Math.min(leafLen * 0.6, w);
        const c = cov(dpx);
        if (c > leafCov) { leafCov = c; leafT = clamp01(u / leafLen); }
      }
      if (leafCov > 0) {
        const c = mix(leafIn, leafOut, leafT);
        composite(idx, c[0], c[1], c[2], leafCov);
      }

      // Tomato body (radial gradient + bottom shading).
      const dBody = len(px - bcx, py - bcy) - R;
      const aBody = cov(dBody);
      if (aBody > 0) {
        const rr = len(px - bcx, py - bcy) / R;
        let c = mix(bodyIn, bodyOut, Math.pow(rr, 0.9));
        const vshade = clamp01((py - bcy) / R) * 0.18;
        c = mix(c, [0x9e, 0x22, 0x1a], vshade);
        composite(idx, c[0], c[1], c[2], aBody);
      }

      // Specular highlight.
      const hx = bcx - R * 0.35;
      const hy = bcy - R * 0.38;
      const dHi = len((px - hx) / (R * 0.34), (py - hy) / (R * 0.24)) - 1;
      const aHi = clamp01(0.5 - dHi / 1.2) * 0.55;
      if (aHi > 0 && dBody < 0) composite(idx, 255, 255, 255, aHi);
    }
  }
  return out;
}

// ---- PNG encoder ----
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const l = Buffer.alloc(4);
  l.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([l, t, data, crc]);
}
function encodePNG(rgba, size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---- ICO assembler (PNG-encoded entries) ----
function buildICO(sizes) {
  const images = sizes.map((s) => encodePNG(draw(s), s));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);          // type = icon
  header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + dir.length;
  sizes.forEach((s, i) => {
    const o = i * 16;
    dir[o] = s >= 256 ? 0 : s;
    dir[o + 1] = s >= 256 ? 0 : s;
    dir.writeUInt16LE(1, o + 4);       // planes
    dir.writeUInt16LE(32, o + 6);      // bpp
    dir.writeUInt32LE(images[i].length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += images[i].length;
  });
  return Buffer.concat([header, dir, ...images]);
}

fs.writeFileSync(path.join(OUT_DIR, 'icon.ico'), buildICO([16, 24, 32, 48, 64, 128, 256]));
fs.writeFileSync(path.join(OUT_DIR, 'icon.png'), encodePNG(draw(256), 256));
console.log('Wrote build/icon.ico and build/icon.png');
