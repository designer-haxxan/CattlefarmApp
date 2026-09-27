// Dashboard: today's figures computed from transaction records, quick actions, alerts.
import * as idb from '../db/idb.js';
import * as UI from '../core/ui.js';
import { esc, fmtNum, fmtQty, fmtTime, today, round2 } from '../core/utils.js';
import { money } from '../core/views.js';
import { pref } from '../core/settings.js';
import * as Auth from '../services/auth.js';
import * as Catalog from '../services/catalog.js';
import * as Posting from '../services/posting.js';
import * as Backup from '../services/backup.js';

const $ = window.jQuery;

export async function todayFigures(date = today()) {
  const r = IDBKeyRange.only(date);
  const [sales, purchases, sret, pret, vouchers, entries, accounts] = await idb.read(['sales', 'purchases', 'saleReturns', 'purchaseReturns', 'vouchers', 'entries', 'accounts'], (t) => Promise.all([
    t.getAllByIndex('sales', 'date', r), t.getAllByIndex('purchases', 'date', r), t.getAllByIndex('saleReturns', 'date', r),
    t.getAllByIndex('purchaseReturns', 'date', r), t.getAllByIndex('vouchers', 'date', r), t.getAllByIndex('entries', 'date', r), t.getAll('accounts'),
  ]));
  const live = (x) => x.filter((d) => d.status !== 'void');
  const cashIds = new Set(accounts.filter((a) => ['cash', 'bank'].includes(a.type)).map((a) => a.id));
  const cashEntries = entries.filter((e) => cashIds.has(e.accountId) && e.refType !== 'opening' && e.refType !== 'transfer');
  const s = live(sales); const p = live(purchases);
  return {
    sales: round2(s.reduce((a, d) => a + d.total, 0)), salesCount: s.length,
    purchases: round2(p.reduce((a, d) => a + d.total, 0)), purchasesCount: p.length,
    saleReturns: round2(live(sret).reduce((a, d) => a + d.total, 0)),
    purchaseReturns: round2(live(pret).reduce((a, d) => a + d.total, 0)),
    cashIn: round2(cashEntries.reduce((a, e) => a + e.debit, 0)),
    cashOut: round2(cashEntries.reduce((a, e) => a + e.credit, 0)),
    txCount: s.length + p.length + live(sret).length + live(pret).length + live(vouchers).length,
    recent: s.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6),
  };
}

export default {
  async render(el) {
    this.destroy();
    const $el = $(el);
    const u = Auth.user();
    const [f, bal] = await Promise.all([todayFigures(), Posting.allBalances()]);
    let rec = 0; let pay = 0;
    for (const [id, b] of bal) { if (id.startsWith('C:') && b.balance > 0) rec += b.balance; if (id.startsWith('S:') && b.balance < 0) pay -= b.balance; }
    const prods = Catalog.allProducts().filter((p) => p.active && p.trackStock !== false);
    const stockValue = prods.reduce((s, p) => s + Math.max(0, p.stock) * (p.purchasePrice || 0), 0);
    const low = prods.filter((p) => p.stock <= (p.minStock || 0)).sort((a, b) => a.stock - b.stock);
    const lastBackup = pref.get('lastBackupAt');
    const backupDays = lastBackup ? Math.floor((Date.now() - new Date(lastBackup)) / 86400000) : null;
    const stat = (label, value, icon, color, href = null) => `<div class="col-6 col-md-4 col-xl-3"><${href ? `a href="${href}"` : 'div'} class="card stat-card h-100 text-decoration-none"><div class="card-body py-2 px-3">
      <div class="d-flex justify-content-between"><div class="stat-label">${label}</div><i class="bi bi-${icon} text-${color}"></i></div><div class="stat-value money">${value}</div></div></${href ? 'a' : 'div'}></div>`;
    const qa = (href, icon, label, perm) => (!perm || Auth.can(perm)) ? `<div class="col-4 col-md-2"><a class="quick-action" href="${href}"><i class="bi bi-${icon}"></i>${label}</a></div>` : '';
    $el.html(`
      <div class="d-flex justify-content-between align-items-end mb-3"><div><div class="text-body-secondary small">${new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div><h1 class="h5 mb-0">Hello, ${esc(u.name.split(' ')[0])}</h1></div></div>
      ${!navigator.onLine ? '<div class="alert alert-secondary py-2 small"><i class="bi bi-wifi-off me-1"></i>You are offline. Everything you do is saved on this device.</div>' : ''}
      <div class="legacy-hint"></div>
      ${Auth.can('backup.export') && (backupDays === null || backupDays >= 7) ? `<div class="alert alert-warning py-2 small d-flex align-items-center gap-2"><i class="bi bi-exclamation-triangle"></i><div class="flex-grow-1">${backupDays === null ? 'No backup has been made on this device yet.' : `Last backup was ${backupDays} days ago.`} Your data only lives on this device.</div><a class="btn btn-sm btn-warning" href="#/backup">Back up</a></div>` : ''}
      <div class="row g-2 mb-3">
        ${qa('#/pos', 'cart-plus', 'New sale', 'sale.create')}${qa('#/purchase/new', 'bag-plus', 'Purchase', 'purchase.manage')}
        ${qa('#/vouchers', 'cash-coin', 'Cash book', 'voucher.create')}${qa('#/customers', 'people', 'Customers')}
        ${qa('#/products', 'box-seam', 'Products')}${qa('#/reports', 'bar-chart-line', 'Reports', 'reports.view')}
      </div>
      <h2 class="h6 text-body-secondary">Today</h2>
      <div class="row g-2 mb-3">
        ${stat('Sales', money(f.sales), 'receipt', 'primary', '#/sales')}
        ${Auth.can('purchase.manage') ? stat('Purchases', money(f.purchases), 'bag', 'secondary', '#/purchases') : ''}
        ${stat('Cash received', money(f.cashIn), 'arrow-down-circle', 'success', Auth.can('voucher.create') ? '#/vouchers' : null)}
        ${stat('Cash paid', money(f.cashOut), 'arrow-up-circle', 'danger', Auth.can('voucher.create') ? '#/vouchers' : null)}
        ${stat('Transactions', f.txCount, 'activity', 'info')}
        ${f.saleReturns ? stat('Sale returns', money(f.saleReturns), 'arrow-return-left', 'warning', '#/returns') : ''}
      </div>
      <h2 class="h6 text-body-secondary">Overall</h2>
      <div class="row g-2 mb-3">
        ${stat('Receivables', money(rec), 'person-down', 'warning', Auth.can('reports.view') ? '#/reports/receivables' : '#/customers')}
        ${Auth.can('purchase.manage') ? stat('Payables', money(pay), 'truck', 'danger', Auth.can('reports.view') ? '#/reports/payables' : null) : ''}
        ${stat('Stock value', money(stockValue), 'boxes', 'primary', '#/stock')}
        ${stat('Low stock items', low.length, 'exclamation-triangle', low.length ? 'danger' : 'success', '#/stock')}
      </div>
      <div class="row g-3">
        <div class="col-md-6"><h2 class="h6 text-body-secondary">Recent sales</h2><div class="list-card">${f.recent.map((s) => `<a class="list-row" href="#/sales/${encodeURIComponent(s.id)}"><div class="main"><div class="title">${esc(s.number)}</div><div class="sub">${esc(s.customerName)} · ${fmtTime(s.createdAt)}</div></div><div class="end fw-semibold money">${fmtNum(s.total)}</div></a>`).join('') || UI.emptyState('No sales yet today', 'receipt')}</div></div>
        <div class="col-md-6"><h2 class="h6 text-body-secondary">Low stock</h2><div class="list-card">${low.slice(0, 6).map((p) => `<a class="list-row" href="#/stock/${encodeURIComponent(p.id)}"><div class="main"><div class="title">${esc(p.name)}</div><div class="sub">Min ${fmtQty(p.minStock || 0)}</div></div><div class="end"><span class="badge ${p.stock <= 0 ? 'text-bg-danger' : 'text-bg-warning'}">${fmtQty(p.stock)} ${esc(p.unit)}</span></div></a>`).join('') || UI.emptyState('All stock levels are fine', 'check-circle')}</div></div>
      </div>`);
    if (Auth.can('backup.restore') && pref.get('legacyHandled') !== true) {
      Backup.legacyDataExists().then((yes) => yes && $el.find('.legacy-hint').html('<div class="alert alert-info py-2 small d-flex align-items-center gap-2"><i class="bi bi-database"></i><div class="flex-grow-1">Data from an older version was found on this device.</div><a class="btn btn-sm btn-info" href="#/backup">Review</a></div>'));
    }
    const refresh = () => { if (location.hash === '' || location.hash.startsWith('#/dashboard')) this.render(el); };
    this._h = refresh;
    document.addEventListener('data:changed', refresh);
  },
  destroy() { if (this._h) document.removeEventListener('data:changed', this._h); this._h = null; },
};
