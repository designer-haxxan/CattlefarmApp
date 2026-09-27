// Camera barcode scanning: native BarcodeDetector when available, html5-qrcode (lazy-loaded) otherwise.
// Hardware (keyboard-wedge) scanners are handled by attachWedge().
import { CDN } from '../config.js';
import { loadScript, esc } from '../core/utils.js';
import * as UI from '../core/ui.js';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'codabar', 'itf', 'qr_code', 'data_matrix'];

const errName = (e) => e?.name || (String(e).match(/(NotAllowedError|SecurityError|NotFoundError|OverconstrainedError|NotReadableError|AbortError)/) || [])[1] || '';

function cameraError(e) {
  // html5-qrcode reports errors as plain strings, native APIs as DOMExceptions.
  const n = errName(e);
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'No camera was found on this device.';
  if (n === 'NotReadableError' || n === 'AbortError') return 'The camera is being used by another app. Close it and try again.';
  return e?.message || String(e);
}
const isDenied = (e) => ['NotAllowedError', 'SecurityError'].includes(errName(e));

// Closing the scanner while the camera is still starting makes the video's pending play() reject with
// AbortError (inside html5-qrcode too). That is expected, so don't report it as an unhandled error.
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason?.name === 'AbortError' && /play\(\)/.test(e.reason?.message || '')) e.preventDefault();
});

// 'granted' | 'denied' | 'prompt' | 'unknown' (the Permissions API is not available everywhere, e.g. Firefox).
export async function cameraPermission() {
  try { return (await navigator.permissions.query({ name: 'camera' })).state; } catch { return 'unknown'; }
}

// Step-by-step help to re-enable a blocked camera, for the platform the app is running on.
export function cameraHelpHTML() {
  const ua = navigator.userAgent;
  const android = /Android/i.test(ua);
  const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installed = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const site = esc(location.host);
  let steps;
  if (android && installed) {
    steps = `<li>Long-press the <b>SaleAPP</b> icon on your home screen → tap <b>App info</b> (ⓘ).</li>
      <li>Open <b>Permissions</b> → <b>Camera</b> → choose <b>Allow only while using the app</b>.</li>
      <li>If Camera is not listed there: open <b>Chrome</b> → ⋮ → <b>Settings</b> → <b>Site settings</b> → <b>Camera</b> → <b>${site}</b> → <b>Allow</b>.</li>`;
  } else if (android) {
    steps = `<li>Tap the <b>ⓘ / lock icon</b> left of the address bar.</li>
      <li>Tap <b>Permissions</b> (or <b>Site settings</b>) → <b>Camera</b> → <b>Allow</b>.</li>
      <li>Or: Chrome ⋮ → <b>Settings</b> → <b>Site settings</b> → <b>Camera</b> → <b>${site}</b> → <b>Allow</b>.</li>`;
  } else if (ios) {
    steps = `<li>Open the iPhone <b>Settings</b> app → <b>Safari</b> → <b>Camera</b> → choose <b>Ask</b> or <b>Allow</b>.</li>
      <li>In Safari you can also tap <b>aA</b> in the address bar → <b>Website Settings</b> → <b>Camera</b> → <b>Allow</b>.</li>
      <li>Close the app completely and open it again.</li>`;
  } else {
    steps = `<li>Click the <b>camera / lock icon</b> in the browser's address bar.</li>
      <li>Set <b>Camera</b> to <b>Allow</b> for ${site}, then reload the page.</li>`;
  }
  const chromeTip = android ? '<li>Still blocked? Let Chrome use the camera: phone <b>Settings</b> → <b>Apps</b> → <b>Chrome</b> → <b>Permissions</b> → <b>Camera</b> → <b>Allow</b>.</li>' : '';
  return `<div class="alert alert-warning small mb-2"><div class="fw-semibold mb-1"><i class="bi bi-camera-video-off me-1"></i>Camera access is blocked</div>
    <ol class="mb-1 ps-3">${steps}${chromeTip}</ol>
    <div>Then tap <b>Try again</b>. You can always type the barcode below or use a USB/Bluetooth barcode scanner.</div></div>`;
}

/**
 * Opens the scanner dialog.
 * single mode: resolves with the scanned code (or null).
 * continuous mode: calls onCode(code) for each scan and resolves null when closed.
 */
export function scan({ continuous = false, onCode = null, title = 'Scan barcode' } = {}) {
  return new Promise((resolve) => {
    let result = null; let stopFn = null; let last = { code: '', t: 0 }; let count = 0; let closed = false; let starting = false;
    const m = UI.modal({
      title, size: 'md',
      body: `<div class="scanner-status small text-body-secondary mb-2"></div>
        <div class="scanner-perm mb-2"></div>
        <div class="scanner-box mb-2 d-none"><video playsinline muted></video><div class="scan-line"></div></div>
        <div id="html5qr-region" class="mb-2"></div>
        <div class="scanner-last small mb-2"></div>
        <form class="input-group scanner-manual"><input class="form-control" inputmode="numeric" placeholder="Or type barcode" autocomplete="off"><button class="btn btn-primary">Add</button></form>`,
    });
    const $s = m.$el.find('.scanner-status');
    const $perm = m.$el.find('.scanner-perm');
    const handle = (code) => {
      code = String(code || '').trim();
      if (!code || closed) return;
      const now = Date.now();
      if (code === last.code && now - last.t < 1500) return;
      last = { code, t: now };
      UI.beep();
      if (continuous) {
        count++;
        m.$el.find('.scanner-last').html(`<i class="bi bi-check-circle text-success me-1"></i>${esc(code)} <span class="text-body-secondary">(${count} scanned)</span>`);
        onCode?.(code);
      } else { result = code; m.close(); }
    };
    m.$el.find('.scanner-manual').on('submit', (e) => { e.preventDefault(); const $i = $(e.target).find('input'); handle($i.val()); last = { code: '', t: 0 }; $i.val(''); });
    m.closed.then(async () => { closed = true; try { await stopFn?.(); } catch { /* ignore */ } resolve(result); });

    const showDenied = () => {
      $s.text('');
      $perm.html(cameraHelpHTML() + '<button type="button" class="btn btn-primary w-100 btn-cam-retry"><i class="bi bi-arrow-clockwise me-1"></i>Try again</button>');
    };
    // Runs from the user's tap on "Allow camera" / "Try again" (or directly when already granted),
    // so the browser shows its permission prompt instead of silently blocking the request.
    const start = async () => {
      if (starting || closed) return;
      starting = true;
      $perm.empty();
      $s.removeClass('text-danger').addClass('text-body-secondary').text('Starting camera…');
      try {
        if (!window.isSecureContext) throw new Error('Camera access requires HTTPS (or localhost).');
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser does not support camera access.');
        let native = false;
        if ('BarcodeDetector' in window) {
          try { native = (await window.BarcodeDetector.getSupportedFormats()).length > 0; } catch { native = false; }
        }
        if (native) stopFn = await startNative(m.$el, handle, () => closed);
        else stopFn = await startFallback(handle);
        if (closed) { await stopFn?.(); return; }
        $s.text(continuous ? 'Point the camera at barcodes. Items are added automatically.' : 'Point the camera at a barcode.');
      } catch (e) {
        if (closed) return; // dialog closed while the camera was starting
        if (isDenied(e)) showDenied();
        else $s.removeClass('text-body-secondary').addClass('text-danger').text(cameraError(e));
        m.$el.find('.scanner-manual input').trigger('focus');
      } finally { starting = false; }
    };
    m.$el.on('click', '.btn-cam-allow, .btn-cam-retry', start);

    cameraPermission().then((state) => {
      if (closed) return;
      if (state === 'granted') start();
      else if (state === 'denied') showDenied();
      else {
        $perm.html(`<div class="text-center py-3"><i class="bi bi-camera display-6 text-primary d-block mb-2"></i>
          <div class="mb-3 small">The camera is only used to read barcodes. Tap below, then choose <b>Allow</b> when your phone asks.</div>
          <button type="button" class="btn btn-primary btn-lg w-100 btn-cam-allow"><i class="bi bi-camera me-1"></i>Allow camera</button></div>`);
      }
    });
  });
}

async function startNative($el, handle, isClosed) {
  const supported = await window.BarcodeDetector.getSupportedFormats();
  const detector = new window.BarcodeDetector({ formats: FORMATS.filter((f) => supported.includes(f)) });
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  if (isClosed()) { stream.getTracks().forEach((t) => t.stop()); return null; }
  const video = $el.find('video')[0];
  $el.find('.scanner-box').removeClass('d-none');
  video.srcObject = stream;
  await video.play();
  let running = true;
  const loop = async () => {
    if (!running) return;
    try {
      if (video.readyState >= 2) {
        const codes = await detector.detect(video);
        if (codes.length) handle(codes[0].rawValue);
      }
    } catch { /* frame not ready */ }
    if (running) setTimeout(loop, 120);
  };
  loop();
  return async () => { running = false; stream.getTracks().forEach((t) => t.stop()); };
}

async function startFallback(handle) {
  await loadScript(CDN.html5qrcode);
  const H = window.Html5Qrcode;
  const F = window.Html5QrcodeSupportedFormats;
  const formats = F ? [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.CODE_93, F.CODABAR, F.ITF, F.QR_CODE] : undefined;
  const scanner = new H('html5qr-region', { formatsToSupport: formats, verbose: false, experimentalFeatures: { useBarCodeDetectorIfSupported: true } });
  await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: (w, h) => ({ width: Math.floor(w * 0.85), height: Math.floor(Math.min(h, w) * 0.5) }) }, (text) => handle(text), () => {});
  return async () => { try { await scanner.stop(); scanner.clear(); } catch { /* ignore */ } };
}

/**
 * Detects keyboard-wedge (hardware/Bluetooth HID) scanners: rapid keystrokes ending with Enter,
 * typed while no input field has focus. Returns a detach function.
 */
export function attachWedge(onCode) {
  let buf = ''; let lastT = 0;
  const onKey = (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag) || e.target.isContentEditable) return;
    if (document.querySelector('.modal.show')) return;
    const now = Date.now();
    if (now - lastT > 60) buf = '';
    lastT = now;
    if (e.key === 'Enter') { if (buf.length >= 3) { e.preventDefault(); onCode(buf); } buf = ''; return; }
    if (e.key.length === 1) buf += e.key;
  };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}
