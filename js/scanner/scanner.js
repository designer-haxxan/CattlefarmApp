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

// ---------- Why the camera is unavailable, and how to fix it ----------
// Chrome only lists a site under Site settings → Camera AFTER the site has asked once, so an empty list is normal.
// Causes: 'inapp' (WhatsApp/Facebook/Instagram built-in browser), 'system' (Android does not let the BROWSER use
// the camera, or the quick-settings "Camera access" switch is off), 'site' (camera blocked for this site / Chrome's
// global Camera switch off), 'dismissed' (prompt closed; Chrome pauses it after repeated dismissals).
const UA = () => navigator.userAgent;
export const inAppBrowser = () => /FBAN|FBAV|FB_IAB|Instagram|Line\/|; wv\)/i.test(UA());

export async function diagnoseCameraError(e) {
  if (inAppBrowser()) return 'inapp';
  if (/system/i.test(String(e?.message || e))) return 'system'; // Chrome: "Permission denied by system"
  return (await cameraPermission()) === 'denied' ? 'site' : 'dismissed';
}

export function cameraHelpHTML(reason = 'site') {
  const ua = UA();
  const android = /Android/i.test(ua);
  const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const samsung = /SamsungBrowser/i.test(ua);
  const browser = samsung ? 'Samsung Internet' : 'Chrome';
  const installed = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const site = esc(location.host);
  const noReset = `<li class="text-danger-emphasis">Do <b>not</b> use <b>Clear &amp; reset</b> / <b>Delete data</b> for this site — that erases all POS data on the phone.</li>`;
  const siteSteps = samsung
    ? `<li>Open <b>Samsung Internet</b> → ☰ → <b>Settings</b> → <b>Sites and downloads</b> → <b>Site permissions</b> → <b>Camera</b>.</li>
       <li>Find <b>${site}</b> and turn it <b>on</b> (Allow).</li>`
    : `<li>Open the <b>Chrome</b> browser (not this app) → ⋮ → <b>Settings</b> → <b>Site settings</b> → <b>Camera</b>.</li>
       <li>Make sure the <b>Camera</b> switch at the top is <b>ON</b>.</li>
       <li>If <b>${site}</b> is under <b>Blocked</b>, tap it → <b>Allow</b>. If it is not listed, that is fine — come back and tap Try again.</li>`;
  const systemSteps = `<li>Swipe down from the top of the screen and make sure the <b>Camera access</b> tile is <b>ON</b> (Android 12 and newer).</li>
       <li>Phone <b>Settings</b> → <b>Apps</b> → <b>${browser}</b> → <b>Permissions</b> → <b>Camera</b> → <b>Allow only while using the app</b>.</li>`;
  let title; let steps; let extra = '';
  if (reason === 'inapp') {
    title = 'This page is open inside another app';
    steps = `<li>WhatsApp, Facebook and Instagram open links in their own mini browser, which usually cannot use the camera.</li>
      <li>Tap <b>Open in Chrome</b> below (or the ⋮ menu → <b>Open in browser</b>), then log in and install the app from Chrome.</li>`;
    if (android) extra = `<a class="btn btn-success w-100 mb-2" href="intent://${esc(location.host + location.pathname + location.search + location.hash)}#Intent;scheme=https;package=com.android.chrome;end"><i class="bi bi-browser-chrome me-1"></i>Open in Chrome</a>`;
  } else if (!android && !ios) {
    title = 'Camera access is blocked';
    steps = `<li>Click the <b>camera / lock icon</b> in the browser's address bar.</li><li>Set <b>Camera</b> to <b>Allow</b> for ${site}, then reload the page.</li>`;
  } else if (ios) {
    title = 'Camera access is blocked';
    steps = `<li>Open the iPhone <b>Settings</b> app → <b>Safari</b> → <b>Camera</b> → choose <b>Ask</b> or <b>Allow</b>.</li>
      <li>In Safari you can also tap <b>aA</b> in the address bar → <b>Website Settings</b> → <b>Camera</b> → <b>Allow</b>.</li>
      <li>Close the app completely and open it again.</li>`;
  } else if (reason === 'system') {
    title = `Your phone does not let ${browser} use the camera`;
    steps = systemSteps;
  } else if (reason === 'dismissed') {
    title = 'The camera request was closed';
    steps = `<li>Tap <b>Try again</b> and choose <b>Allow</b> when the phone asks.</li>
      <li>No question appears? ${browser} pauses requests after they are closed a few times. Then:</li>${siteSteps}
      <li>Still nothing? Check the phone itself:</li>${systemSteps}`;
  } else {
    title = 'Camera access is blocked for this app';
    steps = `${siteSteps}${installed ? '<li>Note: <b>App info → Permissions</b> of the installed app can show <i>No permissions</i> — that is normal; the camera setting is in the browser\'s Site settings above.</li>' : `<li>Or tap the <b>lock / ⓘ icon</b> left of the address bar → <b>Permissions</b> → <b>Camera</b> → <b>Allow</b>.</li>`}
      <li>Still blocked? Check the phone itself:</li>${systemSteps}`;
  }
  return `<div class="alert alert-warning small mb-2"><div class="fw-semibold mb-1"><i class="bi bi-camera-video-off me-1"></i>${title}</div>
    <ol class="mb-1 ps-3">${steps}${android && reason !== 'inapp' ? noReset : ''}</ol>
    <div>Then tap <b>Try again</b>. You can always type the barcode below or use a USB/Bluetooth barcode scanner.</div></div>${extra}`;
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

    const showDenied = (reason) => {
      $s.text('');
      $perm.html(cameraHelpHTML(reason) + '<button type="button" class="btn btn-primary w-100 btn-cam-retry"><i class="bi bi-arrow-clockwise me-1"></i>Try again</button>');
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
        if (isDenied(e)) showDenied(await diagnoseCameraError(e));
        else if (errName(e) === 'NotReadableError' && /Android/i.test(UA())) showDenied('system'); // camera busy or privacy switch off
        else $s.removeClass('text-body-secondary').addClass('text-danger').text(cameraError(e));
        m.$el.find('.scanner-manual input').trigger('focus');
      } finally { starting = false; }
    };
    m.$el.on('click', '.btn-cam-allow, .btn-cam-retry', start);

    cameraPermission().then((state) => {
      if (closed) return;
      if (inAppBrowser()) showDenied('inapp');
      else if (state === 'granted') start();
      else if (state === 'denied') showDenied('site');
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
