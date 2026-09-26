// Renders text that thermal printers cannot print natively (Urdu/Arabic etc.) into 1-bit raster images
// using the Jameel Noori Nastaleeq font, for ESC/POS "GS v 0" printing. Latin text keeps the printer font.
export const URDU_FONT = '"Jameel Noori Nastaleeq"';
// Latin letters/digits fall through to a monospace font sized like the printer's own 12x24-dot font.
const FALLBACK = '"Courier New", "Noto Nastaliq Urdu", "Noto Naskh Arabic", monospace';
const LATIN = '"Courier New", monospace';
const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
export const isRTL = (s) => RTL.test(String(s ?? ''));

// Load the font before drawing on canvas (canvas does not wait for web fonts).
export async function ensureFont() {
  if (!document.fonts?.load) return false;
  try { await document.fonts.load(`32px ${URDU_FONT}`, 'اردو'); } catch { /* use fallback fonts */ }
  return document.fonts.check(`32px ${URDU_FONT}`, 'اردو');
}

const fontFor = (px, bold) => `${bold ? 'bold ' : ''}${px}px ${URDU_FONT}, ${FALLBACK}`;
// Parts without RTL text are drawn like printer text so mixed lines ("Customer: محمد علی") look consistent.
const partFont = (text, px, bold, double) => (isRTL(text) ? fontFor(px, bold) : `${bold ? 'bold ' : ''}${double ? 40 : 20}px ${LATIN}`);

function measure(ctx, text, px, bold, double) {
  ctx.font = partFont(text, px, bold, double);
  ctx.direction = isRTL(text) ? 'rtl' : 'ltr';
  return ctx.measureText(text).width;
}

function wrapWords(ctx, text, maxW, px, bold, double) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = []; let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && measure(ctx, next, px, bold, double) > maxW) { lines.push(cur); cur = w; } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

// Draws one text row (1..n parts) and returns the rows of pixels that actually contain ink.
function drawRow(width, px, bold, double, parts) {
  const h = Math.ceil(px * 3);
  const baseline = Math.round(px * 1.9); // Nastaleeq has tall ascenders and deep descenders
  const c = document.createElement('canvas');
  c.width = width; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, h);
  ctx.fillStyle = '#000'; ctx.textBaseline = 'alphabetic';
  for (const p of parts) {
    if (!p.text) continue;
    ctx.font = partFont(p.text, px, bold, double);
    ctx.direction = isRTL(p.text) ? 'rtl' : 'ltr';
    ctx.textAlign = p.align === 'center' ? 'center' : p.align === 'right' ? 'right' : 'left';
    const x = p.align === 'center' ? width / 2 : p.align === 'right' ? width - 1 : 0;
    ctx.fillText(p.text, x, baseline, width);
  }
  const img = ctx.getImageData(0, 0, width, h).data;
  const ink = (x, y) => { const i = (y * width + x) * 4; return img[i] * 0.299 + img[i + 1] * 0.587 + img[i + 2] * 0.114 < 150; };
  let top = h; let bottom = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < width; x++) if (ink(x, y)) { if (y < top) top = y; bottom = y; break; }
  if (bottom < 0) return { rows: [], ink };
  const rows = [];
  for (let y = Math.max(0, top - 2); y <= Math.min(h - 1, bottom + 2); y++) rows.push(y);
  return { rows, ink };
}

/**
 * Render lines to one monochrome bitmap.
 * specs: [{ parts: [{ text, align }] }] or [{ wrap: text, align }]
 * returns { widthBytes, height, data } for ESC/POS GS v 0 (1 = black, MSB first).
 */
export function render(width, specs, { double = false, bold = false } = {}) {
  const px = double ? 48 : 34; // Nastaleeq needs a larger size than Latin to stay legible at 203 dpi
  const probe = document.createElement('canvas').getContext('2d');
  const rows = [];
  for (const spec of specs) {
    if (spec.wrap !== undefined) {
      const align = spec.align === 'left' && isRTL(spec.wrap) ? 'right' : spec.align || 'left';
      for (const line of wrapWords(probe, spec.wrap, width - 4, px, bold, double)) rows.push([{ text: line, align }]);
    } else {
      const parts = spec.parts.filter((p) => p.text);
      const total = parts.reduce((s, p) => s + measure(probe, p.text, px, bold, double), 0) + 16;
      if (parts.length > 1 && total > width) parts.forEach((p) => rows.push([p])); // too wide: one part per row
      else rows.push(parts);
    }
  }
  const widthBytes = Math.ceil(width / 8);
  const bands = rows.map((parts) => drawRow(width, px, bold, double, parts));
  const height = bands.reduce((s, b) => s + b.rows.length, 0);
  const data = new Uint8Array(widthBytes * height);
  let out = 0;
  for (const b of bands) {
    for (const y of b.rows) {
      for (let x = 0; x < width; x++) if (b.ink(x, y)) data[out * widthBytes + (x >> 3)] |= 0x80 >> (x & 7);
      out++;
    }
  }
  return { widthBytes, height, data };
}
