import * as UI from '../core/ui.js';
import { esc, fmtNum, fmtDate, today, monthStart } from '../core/utils.js';
import * as idb from '../db/idb.js';
import * as Posting from '../services/posting.js';
import * as Catalog from '../services/catalog.js';
import { t } from '../i18n.js';
import { getSettings } from '../core/settings.js';

const $ = window.jQuery;
const cur = () => getSettings().currency;
const money = (n) => `${esc(cur())} ${fmtNum(n)}`;

async function loadStats() {
  const animals = Catalog.allAnimals();
  const active = animals.filter((a) => a.status === 'active');
  const females = active.filter((a) => a.gender === 'female');
  const males = active.filter((a) => a.gender === 'male');
  const calves = active.filter((a) => a.species === 'calf');

  // Today's milk
  const todayDate = today();
  const milkToday = await idb.read(['milkRecords'], (tx) =>
    tx.getAllByIndex('milkRecords', 'date', todayDate));
  const todayLiters = milkToday.reduce((s, r) => s + (r.total || 0), 0);

  // Balances
  const bal = await Posting.allBalances();
  let buyerBal = 0; let sellerBal = 0;
  for (const [id, b] of bal) {
    if (id.startsWith('B:')) buyerBal += b.balance;
    else if (id.startsWith('S:')) sellerBal -= b.balance;
  }

  // Upcoming calving (next 30 days)
  const soon = await idb.read(['breedingRecords'], (tx) =>
    tx.getAllByIndex('breedingRecords', 'pregnancyStatus', 'pregnant'));
  const futureDate = new Date(); futureDate.setDate(futureDate.getDate() + 30);
  const futureDateStr = futureDate.toISOString().slice(0, 10);
  const dueSoon = soon.filter((r) => r.expectedCalving && r.expectedCalving <= futureDateStr).length;

  // Upcoming vaccinations (next 14 days)
  const allHealth = await idb.getAll('healthEvents');
  const futureVax = new Date(); futureVax.setDate(futureVax.getDate() + 14);
  const futureVaxStr = futureVax.toISOString().slice(0, 10);
  const dueVax = allHealth.filter((h) => h.nextDue && h.nextDue >= todayDate && h.nextDue <= futureVaxStr).length;

  return { total: animals.length, active: active.length, females: females.length, males: males.length, calves: calves.length, todayLiters, buyerBal, sellerBal, dueSoon, dueVax };
}

export default {
  async render(el) {
    const $el = $(el);
    $el.html(UI.pageHeader(t('dashboard')) + `
      <div class="stat-grid" id="dash-stats">${UI.spinner('')}</div>
      <div class="row g-3">
        <div class="col-lg-6">
          <h2 class="h6 mb-2">${t('quickActions')}</h2>
          <div class="row g-2 mb-3">
            <div class="col-6"><a href="#/milk" class="quick-action text-decoration-none"><i class="bi bi-droplet-half-fill text-primary"></i><span>${t('recordMilk')}</span></a></div>
            <div class="col-6"><a href="#/animals" class="quick-action text-decoration-none"><i class="bi bi-plus-circle text-success"></i><span>${t('addAnimal')}</span></a></div>
            <div class="col-6"><a href="#/health" class="quick-action text-decoration-none"><i class="bi bi-heart-pulse text-danger"></i><span>${t('addHealthEvent')}</span></a></div>
            <div class="col-6"><a href="#/milkSales" class="quick-action text-decoration-none"><i class="bi bi-bag-check text-warning"></i><span>${t('milkSale')}</span></a></div>
          </div>
          <div id="dash-alerts"></div>
        </div>
        <div class="col-lg-6">
          <h2 class="h6 mb-2">${t('recentActivity')}</h2>
          <div class="list-card" id="dash-recent">${UI.spinner()}</div>
        </div>
      </div>`);

    try {
      const stats = await loadStats();
      $('#dash-stats').html(`
        <div class="stat-tile"><div class="st-icon">🐄</div><div class="st-val">${stats.active}</div><div class="st-lbl">${t('activeCows')}</div></div>
        <div class="stat-tile"><div class="st-icon">🐃</div><div class="st-val">${stats.males}</div><div class="st-lbl">${t('totalBulls')}</div></div>
        <div class="stat-tile"><div class="st-icon">🥛</div><div class="st-val">${fmtNum(stats.todayLiters)} L</div><div class="st-lbl">${t('todayMilk')}</div></div>
        <div class="stat-tile"><div class="st-icon">💰</div><div class="st-val text-success">${money(stats.buyerBal)}</div><div class="st-lbl">${t('buyerBalance')}</div></div>`);

      // Alerts
      let alerts = '';
      if (stats.dueSoon > 0) alerts += `<div class="alert alert-warning py-2 small mb-2"><i class="bi bi-exclamation-triangle me-2"></i>${stats.dueSoon} animal(s) due for calving in the next 30 days. <a href="#/breeding">View</a></div>`;
      if (stats.dueVax > 0) alerts += `<div class="alert alert-info py-2 small mb-2"><i class="bi bi-heart-pulse me-2"></i>${stats.dueVax} vaccination(s) due in the next 14 days. <a href="#/health">View</a></div>`;
      if (stats.buyerBal > 0) alerts += `<div class="alert alert-success py-2 small mb-2"><i class="bi bi-cash-coin me-2"></i>Buyers owe you ${money(stats.buyerBal)}. <a href="#/buyers">View ledgers</a></div>`;
      $('#dash-alerts').html(alerts || `<div class="text-body-secondary small">No alerts.</div>`);
    } catch (e) {
      $('#dash-stats').html(UI.errorState(e));
    }

    // Recent milk sales
    try {
      const recent = (await idb.getAll('milkSales')).filter((d) => d.status !== 'void').slice(-8).reverse();
      if (!recent.length) {
        $('#dash-recent').html(UI.emptyState('No transactions yet', 'receipt'));
      } else {
        $('#dash-recent').html(recent.map((d) => `<a class="list-row" href="#/milkSales/${encodeURIComponent(d.id)}">
          <div class="thumb"><i class="bi bi-droplet-half"></i></div>
          <div class="main"><div class="title">${esc(d.buyerName)}</div><div class="sub">${fmtDate(d.date)} · ${fmtNum(d.quantity)} L</div></div>
          <div class="end fw-semibold money">${money(d.total)}</div></a>`).join(''));
      }
    } catch (e) {
      $('#dash-recent').html(UI.errorState(e));
    }
  },
};
