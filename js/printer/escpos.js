// Minimal ESC/POS command encoder for 58mm (32 columns / 384 dots) and 80mm (48 columns / 576 dots) printers.
// Plain Latin text uses the printer's built-in font. Text the printer cannot encode (Urdu, Arabic, …) is drawn
// by an optional rasteriser (see raster.js) and sent as a bitmap, so it prints correctly instead of "????".
const ESC = 0x1b; const GS = 0x1d;

const stripAccents = (s) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '');
export const asciiSafe = (s) => stripAccents(s).replace(/[^\x20-\x7e\n]/g, '?');
export const isPlain = (s) => /^[\x20-\x7e\n]*$/.test(stripAccents(s));

export class EscPos {
  constructor(width = 58, raster = null) {
    this.cols = Number(width) === 80 ? 48 : 32;
    this.dots = this.cols * 12; // font A is 12 dots wide
    this.raster = raster;
    this.state = { align: 'left', bold: false, double: false };
    this.buf = [];
    this.raw(ESC, 0x40); // initialize
  }
  raw(...bytes) { this.buf.push(...bytes); return this; }
  text(s) { for (const ch of asciiSafe(s)) this.buf.push(ch.charCodeAt(0)); return this; }
  align(a) { this.state.align = a; return this.raw(ESC, 0x61, { left: 0, center: 1, right: 2 }[a] ?? 0); }
  bold(on) { this.state.bold = !!on; return this.raw(ESC, 0x45, on ? 1 : 0); }
  size(double) { this.state.double = !!double; return this.raw(GS, 0x21, double ? 0x11 : 0x00); }

  // GS v 0: print a 1-bit raster image (full printer width, so alignment is baked into the bitmap).
  image({ widthBytes, height, data }) {
    if (!height) return this;
    this.raw(ESC, 0x61, 0, GS, 0x76, 0x30, 0, widthBytes & 0xff, widthBytes >> 8, height & 0xff, height >> 8);
    for (let i = 0; i < data.length; i++) this.buf.push(data[i]);
    return this.raw(ESC, 0x61, { left: 0, center: 1, right: 2 }[this.state.align] ?? 0);
  }
  rasterize(specs) { return this.image(this.raster.render(this.dots, specs, this.state)); }

  line(s = '') {
    if (isPlain(s) || !this.raster) return this.text(s).raw(0x0a);
    return this.rasterize([{ parts: [{ text: String(s), align: this.state.align }] }]);
  }
  hr(ch = '-') { return this.line(ch.repeat(this.cols)); }
  lr(left, right, width = this.cols) {
    if (this.raster && !(isPlain(left) && isPlain(right))) {
      return this.rasterize([{ parts: [{ text: String(left), align: 'left' }, { text: String(right), align: 'right' }] }]);
    }
    left = asciiSafe(left); right = asciiSafe(right);
    const space = width - left.length - right.length;
    if (space >= 1) return this.line(left + ' '.repeat(space) + right);
    return this.line(left).line(' '.repeat(Math.max(0, width - right.length)) + right);
  }
  wrap(s, width = this.cols) {
    if (this.raster && !isPlain(s)) return this.rasterize([{ wrap: String(s), align: this.state.align }]);
    const words = asciiSafe(s).split(/\s+/); let cur = '';
    for (const w of words) {
      if ((cur + ' ' + w).trim().length > width) { if (cur) this.line(cur); cur = w.length > width ? w.slice(0, width) : w; }
      else cur = (cur + ' ' + w).trim();
    }
    if (cur) this.line(cur);
    return this;
  }
  feed(n = 3) { return this.raw(ESC, 0x64, n); }
  cut() { return this.raw(GS, 0x56, 0x42, 0x00); }
  bytes() { return new Uint8Array(this.buf); }
}
