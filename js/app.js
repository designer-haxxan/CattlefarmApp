// Application bootstrap: service worker, database, authentication gate, routing, language.
import { CONFIG } from './config.js';
import { t, applyLang, lang } from './i18n.js';
import { applyTheme, getSettings } from './core/settings.js';
import * as UI from './core/ui.js';
import { esc } from './core/utils.js';
import { openDB } from './db/idb.js';
import * as Auth from './services/auth.js';
import * as Catalog from './services/catalog.js';

const $ = window.jQuery;

// Route: [loader, titleKey, icon, navSection]
const ROUTES = {
  dashboard:  [() => import('./modules/dashboard.js'),   'dashboard',  'house',           'secMain'],
  animals:    [() => import('./modules/animals.js'),     'animals',    'collection',      'secHerd'],
  milk:       [() => import('./modules/milk.js'),        'milk',       'droplet-half',    'secHerd'],
  health:     [() => import('./modules/health.js'),      'health',     'heart-pulse',     'secHerd'],
  breeding:   [() => import('./modules/breeding.js'),    'breeding',   'arrow-repeat',    'secHerd'],
  weights:    [() => import('./modules/weights.js'),     'weights',    'graph-up',        'secHerd'],
  milkSales:  [() => import('./modules/milk-sales.js'),  'milkSales',  'bag-check',       'secFinance'],
  animalTxns: [() => import('./modules/animal-txns.js'), 'animalTxns', 'arrow-left-right','secFinance'],
  expenses:   [() => import('./modules/expenses.js'),    'expenses',   'receipt-cutoff',  'secFinance'],
  buyers:     [() => import('./modules/parties.js'),     'buyers',     'people',          'secFinance'],
  sellers:    [() => import('./modules/parties.js'),     'sellers',    'truck',           'secFinance'],
  accounts:   [() => import('./modules/accounts.js'),    'accounts',   'bank',            'secFinance'],
  vouchers:   [() => import('./modules/vouchers.js'),    'vouchers',   'cash-coin',       'secFinance'],
  reports:    [() => import('./modules/reports.js'),     'reports',    'bar-chart-line',  'secFinance'],
  backup:     [() => import('./modules/backup.js'),      'backup',     'cloud-arrow-down','secAdmin'],
  settings:   [() => import('./modules/settings.js'),   'settings',   'gear',            'secAdmin'],
};

let currentModule = null;
let routeToken = 0;
let deferredInstall = null;

function showView(name) {
  $('#splash').addClass('d-none');
  $('#view-login').toggleClass('d-none', name !== 'login');
  $('#view-app').toggleClass('d-none', name !== 'app');
}

function fatal(msg) {
  $('#splash-error').text(msg);
  $('#splash .spinner-border').addClass('d-none');
}

// ---------- Service worker ----------
function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('service-worker.js').then((reg) => {
    const check = () => {
      if (!navigator.onLine) return;
      reg.update().catch(() => {});
      (reg.active || navigator.serviceWorker.controller)?.postMessage({ type: 'ENSURE_CACHE' });
    };
    check();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    setInterval(check, 60 * 60 * 1000);
  }).catch((e) => console.warn('SW registration failed:', e));
  let controlled = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (controlled && !reloading) { reloading = true; location.reload(); }
    controlled = true;
  });
}

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; $('#install-btn').removeClass('d-none'); });
window.addEventListener('appinstalled', () => { deferredInstall = null; $('#install-btn').addClass('d-none'); UI.toast(t('appName') + ' installed'); });
export async function promptInstall() {
  if (!deferredInstall) return false;
  deferredInstall.prompt(); await deferredInstall.userChoice;
  deferredInstall = null; $('#install-btn').addClass('d-none');
  return true;
}
export const canInstall = () => !!deferredInstall;

// ---------- Connection badge ----------
function renderConn(status) {
  const [icon, label] = status === 'online' ? ['wifi', 'Online'] : ['wifi-off', 'Offline'];
  $('#conn-badge').attr('class', `badge rounded-pill conn-${status}`).html(`<i class="bi bi-${icon}"></i> <span>${label}</span>`);
  $('#login-conn').html(navigator.onLine
    ? '<i class="bi bi-wifi text-success"></i> Online'
    : '<i class="bi bi-wifi-off text-danger"></i> Offline — connect to sign in');
}
window.addEventListener('online', () => renderConn('online'));
window.addEventListener('offline', () => renderConn('offline'));

// ---------- Menu ----------
function buildMenu() {
  let html = ''; let section = '';
  for (const [name, [, titleKey, icon, sec]] of Object.entries(ROUTES)) {
    if (!sec) continue;
    if (sec !== section) { section = sec; html += `<div class="nav-section">${esc(t(sec))}</div>`; }
    html += `<a class="nav-link" href="#/${name}" data-route="${name}"><i class="bi bi-${icon}"></i>${esc(t(titleKey))}</a>`;
  }
  $('.nav-menu').html(html);
  const u = Auth.user();
  $('#user-name').text(u.username);
  $('#user-role').text(t('myAccount'));
  const s = getSettings();
  $('#brand-name').text(s.business.name || t('appName'));
}

// ---------- Routing ----------
async function route() {
  if (!Auth.user()) return;
  if (checkExpiry()) return;
  const token = ++routeToken;
  const parts = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('/').map(decodeURIComponent);
  const name = ROUTES[parts[0]] ? parts[0] : 'dashboard';
  const [loader, titleKey] = ROUTES[name];
  try { currentModule?.destroy?.(); } catch { /* ignore */ }
  currentModule = null;
  bootstrap.Offcanvas.getInstance('#menu-offcanvas')?.hide();
  $('.nav-menu .nav-link, #bottom-nav a').removeClass('active');
  $(`.nav-menu [data-route="${name}"], #bottom-nav [data-route="${name}"]`).addClass('active');
  $('#topbar-title').text(t(titleKey));
  const $c = $('#content').off();
  $c.html(UI.spinner());
  try {
    const mod = (await loader()).default;
    if (token !== routeToken) return;
    currentModule = mod;
    window.scrollTo(0, 0);
    await mod.render($c[0], { route: name, params: parts.slice(1), setTitle: (tt) => $('#topbar-title').text(tt) });
  } catch (e) {
    console.error(e);
    if (token === routeToken) $c.html(UI.errorState(e));
  }
}

// ---------- Auth gate ----------
async function startApp() {
  await Catalog.load();
  buildMenu();
  showView('app');
  renderConn(navigator.onLine ? 'online' : 'offline');
  clearInterval(expiryTimer);
  expiryTimer = setInterval(checkExpiry, 60000);
  if (navigator.storage?.persist) navigator.storage.persisted().then((p) => { if (!p) navigator.storage.persist().catch(() => {}); });
  route();
}

async function doLogout(forced = false, reason = '') {
  if (!forced && !await UI.confirmDialog(t('logOutConfirm'), { okLabel: t('logOut'), okClass: 'btn-danger' })) return;
  clearInterval(expiryTimer);
  try { currentModule?.destroy?.(); } catch { /* ignore */ }
  currentModule = null;
  Auth.logout();
  $('#content').empty();
  showLogin(reason);
}

let expiryTimer = null;
function checkExpiry() {
  if (!Auth.sessionExpired()) return false;
  UI.toast(t('sessionExpired'), 'warning', 6000);
  doLogout(true, t('sessionExpired'));
  return true;
}

function showLogin(reason = '') {
  showView('login');
  renderConn(navigator.onLine ? 'online' : 'offline');
  $('#login-username-label').text(t('username'));
  $('#login-password-label').text(t('password'));
  $('#login-btn').text(t('signIn'));
  $('#login-internet-note').text(t('internetRequired'));
  const notices = reason ? [esc(reason)] : [];
  $('#login-notice').toggleClass('d-none', !notices.length).html(notices.join('<br>'));
  setTimeout(() => $('#login-username').trigger('focus'), 50);
}

$('#login-form').on('submit', async (e) => {
  e.preventDefault();
  const $btn = $('#login-btn').prop('disabled', true).html(`<span class="spinner-border spinner-border-sm me-2"></span>${t('signingIn')}`);
  $('#login-error').addClass('d-none');
  try {
    await Auth.login($('#login-username').val(), $('#login-password').val());
    $('#login-password').val('');
    await startApp();
  } catch (err) {
    $('#login-error').text(err.message || String(err)).removeClass('d-none');
  } finally { $btn.prop('disabled', false).text(t('signIn')); }
});

$('#toggle-pw').on('click', () => {
  const $i = $('#login-password'); const show = $i.attr('type') === 'password';
  $i.attr('type', show ? 'text' : 'password');
  $('#toggle-pw i').attr('class', show ? 'bi bi-eye-slash' : 'bi bi-eye');
});
$('#logout-btn').on('click', () => doLogout(false));
$('#install-btn').on('click', promptInstall);

// Language toggle button in topbar
$('#lang-toggle').on('click', () => {
  const { setLang, lang: getLang } = window._i18n;
  const newLang = getLang() === 'en' ? 'ur' : 'en';
  setLang(newLang);
  location.reload();
});

window.addEventListener('hashchange', route);
document.addEventListener('settings:changed', () => {
  applyTheme();
  if (Auth.user()) {
    $('#brand-name').text(getSettings().business.name || t('appName'));
    buildMenu();
  }
});

// ---------- Boot ----------
(async function boot() {
  applyLang();
  applyTheme();
  registerSW();
  // Expose i18n for lang toggle (cross-module use)
  const i18n = await import('./i18n.js');
  window._i18n = i18n;
  // Update login page text
  $('#login-title').text(t('appName'));
  $('#lang-toggle').text(lang() === 'en' ? 'اردو' : 'English');
  if (!window.jQuery || !window.bootstrap) return fatal('Required libraries failed to load. Connect to the internet once so the app can be cached.');
  try { await openDB(); } catch (err) { return fatal('Could not open local database: ' + (err.message || err)); }
  const { user, reason } = Auth.restoreSession();
  if (user) {
    try { await startApp(); } catch (err) { console.error(err); fatal(err.message || String(err)); }
  } else showLogin(reason);
})();
