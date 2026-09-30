// Farm reports: milk, herd, breeding, P&L, balance sheet, receivables/payables.
import * as UI from '../core/ui.js';
import { esc, fmtDate, fmtNum, today, monthStart, toCSV, downloadFile } from '../core/utils.js';
import * as idb from '../db/idb.js';
import * as Catalog from '../services/catalog.js';
import * as Posting from '../services/posting.js';
import { t } from '../i18n.js';
import { dateFilter, bindDateFilter, rangeFor, balText, money } from '../core/views.js';
import { getSettings } from '../core/settings.js';

const $ = window.jQuery;

const REPORT_TYPES = [
  { key: 'milk', icon: 'droplet-half', label: () => t('milkReport') },
  { key: 'herd', icon: 'collection', label: () => t('herdReport') },
  { key: 'breeding', icon: 'arrow-repeat', label: () => t('breedingReport') },
  { key: 'pl', icon: 'currency-rupee', label: () => t('profitLoss') },
  { key: 'bs', icon: 'bank', label: () => t('balanceSheet') },
  { key: 'receivables', icon: 'people', label: () => t('receivables') },
  { key: 'payables', icon: 'truck', label: () => t('payables') },
];

// ---- Milk report ----
async function milkReport(f, t2) {
  const records = await idb.read(['milkRecords'], (tx) =>
    tx.getAllByIndex('milkRecords', 'dateOnly', IDBKeyRange.bound(f, t2)));
  // Group by date
  const byDate = {};
  for (const r of records) {
    byDate[r.dateOnly] = byDate[r.dateOnly] || { date: r.dateOnly, total: 0, count: 0, morning: 0, evening: 0 };
    byDate[r.dateOnly].total += r.total || 0;
    byDate[r.dateOnly].morning += r.morning || 0;
    byDate[r.dateOnly].evening += r.evening || 0;
    byDate[r.dateOnly].count++;
  }
  const days = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  const totalLiters = days.reduce((s, d) => s + d.total, 0);
  const avgPerDay = days.length ? (totalLiters / days.length).toFixed(2) : 0;

  return `<div class="row g-2 mb-3">
    <div class="col-4"><div class="card text-center p-2"><div class="fw-bold fs-5">${fmtNum(totalLiters)} L</div><div class="small">Total</div></div></div>
    <div class="col-4"><div class="card text-center p-2"><div class="fw-bold fs-5">${days.length}</div><div class="small">Days</div></div></div>
    <div class="col-4"><div class="card text-center p-2"><div class="fw-bold fs-5">${avgPerDay} L</div><div class="small">Avg/Day</div></div></div>
  </div>
  <div class="table-responsive"><table class="table table-sm table-report">
    <thead><tr><th>Date</th><th class="num">Morning L</th><th class="num">Evening L</th><th class="num">Total L</th></tr></thead>
    <tbody>${days.map((d) => `<tr><td>${fmtDate(d.date)}</td><td class="num">${fmtNum(d.morning)}</td><td class="num">${fmtNum(d.evening)}</td><td class="num fw-semibold">${fmtNum(d.total)}</td></tr>`).join('') || '<tr><td colspan="4" class="text-center text-body-secondary py-3">No data</td></tr>'}</tbody>
    <tfoot><tr class="fw-semibold"><td>Total</td><td class="num">${fmtNum(days.reduce((s, d) => s + d.morning, 0))}</td><td class="num">${fmtNum(days.reduce((s, d) => s + d.evening, 0))}</td><td class="num">${fmtNum(totalLiters)}</td></tr></tfoot>
  </table></div>`;
}

// ---- Herd report ----
async function herdReport() {
  const animals = Catalog.allAnimals();
  const byStatus = {};
  const bySpecies = {};
  for (const a of animals) {
    byStatus[a.status] = (byStatus[a.status] || 0) + 1;
    bySpecies[a.species] = (bySpecies[a.species] || 0) + 1;
  }
  const active = animals.filter((a) => a.status === 'active');
  const females = active.filter((a) => a.gender === 'female').length;
  const males = active.filter((a) => a.gender === 'male').length;
  return `<div class="row g-2 mb-3">
    <div class="col-3"><div class="card text-center p-2"><div class="fw-bold fs-5">${animals.length}</div><div class="small">Total</div></div></div>
    <div class="col-3"><div class="card text-center p-2"><div class="fw-bold fs-5">${active.length}</div><div class="small">Active</div></div></div>
    <div class="col-3"><div class="card text-center p-2"><div class="fw-bold fs-5">${females}</div><div class="small">Females</div></div></div>
    <div class="col-3"><div class="card text-center p-2"><div class="fw-bold fs-5">${males}</div><div class="small">Males</div></div></div>
  </div>
  <div class="row g-3">
    <div class="col-6">
      <h6>By Status</h6>
      <table class="table table-sm"><tbody>${Object.entries(byStatus).map(([k, v]) => `<tr><td>${esc(t(k))}</td><td class="num fw-semibold">${v}</td></tr>`).join('')}</tbody></table>
    </div>
    <div class="col-6">
      <h6>By Species</h6>
      <table class="table table-sm"><tbody>${Object.entries(bySpecies).map(([k, v]) => `<tr><td>${esc(t(k))}</td><td class="num fw-semibold">${v}</td></tr>`).join('')}</tbody></table>
    </div>
  </div>`;
}

// ---- Breeding report ----
async function breedingReport(f, t2) {
  const all = (await idb.read(['breedingRecords'], (tx) =>
    tx.getAllByIndex('breedingRecords', 'date', IDBKeyRange.bound(f, t2 + '￿'))))
    .sort((a, b) => b.date.localeCompare(a.date));
  const pregnant = all.filter((r) => r.pregnancyStatus === 'pregnant').length;
  const calvings = all.filter((r) => r.type === 'calving').length;
  return `<div class="row g-2 mb-3">
    <div class="col-4"><div class="card text-center p-2"><div class="fw-bold fs-5">${all.length}</div><div class="small">Total Records</div></div></div>
    <div class="col-4"><div class="card text-center p-2"><div class="fw-bold fs-5">${pregnant}</div><div class="small">Pregnant</div></div></div>
    <div class="col-4"><div class="card text-center p-2"><div class="fw-bold fs-5">${calvings}</div><div class="small">Calvings</div></div></div>
  </div>
  <div class="table-responsive"><table class="table table-sm table-report">
    <thead><tr><th>Date</th><th>Animal</th><th>Event</th><th>Status</th></tr></thead>
    <tbody>${all.map((r) => { const a = Catalog.animal(r.animalId); return `<tr><td>${fmtDate(r.date)}</td><td>${a ? esc(a.tagNo) : '?'}</td><td>${esc(t(r.type === 'pregnancy_check' ? 'pregnancyCheck' : r.type))}</td><td>${r.pregnancyStatus ? esc(t(r.pregnancyStatus)) : '—'}</td></tr>`; }).join('') || '<tr><td colspan="4" class="text-center text-body-secondary py-3">No data</td></tr>'}</tbody>
  </table></div>`;
}

// ---- P&L ----
async function plReport(f, t2) {
  const milkSales = (await idb.read(['milkSales'], (tx) =>
    tx.getAllByIndex('milkSales', 'date', IDBKeyRange.bound(f, t2 + '￿')))).filter((d) => d.status !== 'void');
  const animalSales = (await idb.read(['animalTxns'], (tx) =>
    tx.getAllByIndex('animalTxns', 'date', IDBKeyRange.bound(f, t2 + '￿')))).filter((d) => d.status !== 'void' && d.type === 'sell');
  const expenses = (await idb.read(['farmExpenses'], (tx) =>
    tx.getAllByIndex('farmExpenses', 'date', IDBKeyRange.bound(f, t2 + '￿')))).filter((d) => d.status !== 'void');

  const milkIncome = milkSales.reduce((s, d) => s + d.total, 0);
  const animalIncome = animalSales.reduce((s, d) => s + d.amount, 0);
  const totalIncome = milkIncome + animalIncome;

  const byCategory = {};
  for (const e of expenses) byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const netProfit = totalIncome - totalExpenses;
  const s = getSettings();

  return `<div class="row g-2 mb-3">
    <div class="col-4"><div class="card text-center p-2"><div class="fw-bold fs-5 text-success">${s.currency} ${fmtNum(totalIncome)}</div><div class="small">Income</div></div></div>
    <div class="col-4"><div class="card text-center p-2"><div class="fw-bold fs-5 text-danger">${s.currency} ${fmtNum(totalExpenses)}</div><div class="small">Expenses</div></div></div>
    <div class="col-4"><div class="card text-center p-2"><div class="fw-bold fs-5 ${netProfit >= 0 ? 'text-success' : 'text-danger'}">${s.currency} ${fmtNum(Math.abs(netProfit))}</div><div class="small">${netProfit >= 0 ? 'Net Profit' : 'Net Loss'}</div></div></div>
  </div>
  <div class="row g-3">
    <div class="col-6">
      <h6>Income</h6>
      <table class="table table-sm"><tbody>
        <tr><td>Milk Sales</td><td class="num">${s.currency} ${fmtNum(milkIncome)}</td></tr>
        <tr><td>Animal Sales</td><td class="num">${s.currency} ${fmtNum(animalIncome)}</td></tr>
        <tr class="fw-semibold"><td>Total</td><td class="num">${s.currency} ${fmtNum(totalIncome)}</td></tr>
      </tbody></table>
    </div>
    <div class="col-6">
      <h6>Expenses</h6>
      <table class="table table-sm"><tbody>
        ${Object.entries(byCategory).map(([k, v]) => `<tr><td>${esc(t(k) || k)}</td><td class="num">${s.currency} ${fmtNum(v)}</td></tr>`).join('')}
        <tr class="fw-semibold"><td>Total</td><td class="num">${s.currency} ${fmtNum(totalExpenses)}</td></tr>
      </tbody></table>
    </div>
  </div>`;
}

// ---- Receivables / Payables ----
async function partyReport(kind) {
  const parties = Catalog.allParties(kind);
  const isReceivable = kind === 'buyers';
  const dn = isReceivable;
  const rows = await Promise.all(parties.map(async (p) => {
    const bal = await Posting.accountBalance(Posting.partyAccount(kind, p.id));
    return { ...p, balance: bal };
  }));
  const activeRows = rows.filter((r) => Math.abs(r.balance) > 0.005);
  const total = activeRows.reduce((s, r) => s + (dn ? Math.max(0, r.balance) : Math.max(0, -r.balance)), 0);
  return `<div class="mb-2 fw-semibold">Total ${isReceivable ? 'Receivable' : 'Payable'}: ${money(total)}</div>
  <div class="table-responsive"><table class="table table-sm table-report">
    <thead><tr><th>Name</th><th>Phone</th><th class="num">Balance</th></tr></thead>
    <tbody>${activeRows.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.phone || '')}</td><td class="num fw-semibold">${balText(r.balance, dn)}</td></tr>`).join('') || '<tr><td colspan="3" class="text-center text-body-secondary py-3">No balances</td></tr>'}</tbody>
  </table></div>`;
}

export default {
  async render(el) {
    const $el = $(el);
    const [from, to] = rangeFor('month');
    let activeReport = 'milk';

    const navTabs = REPORT_TYPES.map((r) =>
      `<button class="btn btn-sm btn-outline-secondary rpt-tab" data-rpt="${r.key}"><i class="bi bi-${r.icon} me-1"></i>${r.label()}</button>`
    ).join('');

    $el.html(UI.pageHeader(t('reports')) +
      `<div class="d-flex gap-2 flex-wrap mb-3">${navTabs}</div>
       <div class="report-date-filter"></div>
       <div id="rpt-content">${UI.spinner()}</div>`);

    let curFrom = from, curTo = to;

    const showReport = async (rpt, f = curFrom, t2 = curTo) => {
      curFrom = f; curTo = t2; activeReport = rpt;
      $el.find('.rpt-tab').removeClass('btn-success').addClass('btn-outline-secondary');
      $el.find(`[data-rpt="${rpt}"]`).addClass('btn-success').removeClass('btn-outline-secondary');
      const $df = $el.find('.report-date-filter');
      const needsDate = ['milk', 'pl', 'breeding'].includes(rpt);
      $df.html(needsDate ? dateFilter(f, t2) : '');
      if (needsDate) bindDateFilter($df, (nf, nt) => showReport(rpt, nf, nt));
      const $c = $el.find('#rpt-content').html(UI.spinner());
      try {
        let html = '';
        if (rpt === 'milk') html = await milkReport(f, t2);
        else if (rpt === 'herd') html = await herdReport();
        else if (rpt === 'breeding') html = await breedingReport(f, t2);
        else if (rpt === 'pl') html = await plReport(f, t2);
        else if (rpt === 'bs') html = '<div class="alert alert-info">Balance sheet coming soon.</div>';
        else if (rpt === 'receivables') html = await partyReport('buyers');
        else if (rpt === 'payables') html = await partyReport('sellers');
        $c.html(html);
      } catch (e) { $c.html(UI.errorState(e)); }
    };

    $el.on('click', '.rpt-tab', (e) => showReport($(e.currentTarget).data('rpt'), curFrom, curTo));
    await showReport('milk');
  },
};
