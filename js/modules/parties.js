// Buyer and seller ledger management. Route: #/buyers and #/sellers.
import * as UI from '../core/ui.js';
import { esc, fmtDate, fmtNum, today, num, clean, lc, debounce } from '../core/utils.js';
import * as idb from '../db/idb.js';
import * as Catalog from '../services/catalog.js';
import * as Posting from '../services/posting.js';
import { t } from '../i18n.js';
import { ledgerTable, balText, dateFilter, bindDateFilter, rangeFor, pager, money } from '../core/views.js';

const $ = window.jQuery;

// kind: 'buyers' | 'sellers'
function isDebitNormal(kind) { return kind === 'buyers'; }

async function editPartyModal(kind, party = null) {
  return UI.formModal({
    title: party ? `Edit ${t(kind === 'buyers' ? 'buyer' : 'seller')}` : `Add ${t(kind === 'buyers' ? 'buyer' : 'seller')}`,
    body: `<div class="row g-2">
      <div class="col-12"><label class="form-label">${t('name')} *</label>
        <input name="name" class="form-control" required maxlength="100" value="${esc(party?.name)}"></div>
      <div class="col-6"><label class="form-label">${t('phone')}</label>
        <input name="phone" class="form-control" maxlength="20" value="${esc(party?.phone)}"></div>
      <div class="col-6"><label class="form-label">Opening Balance</label>
        <input type="number" name="opening" class="form-control" value="${party?.opening || 0}"></div>
      <div class="col-12"><label class="form-label">${t('notes')}</label>
        <input name="notes" class="form-control" maxlength="200" value="${esc(party?.notes)}"></div>
    </div>`,
    submitLabel: t('save'),
    submitClass: 'btn-success',
    onSubmit: async (v) => {
      const name = clean(v.name, 100);
      if (!name) throw new Error('Name is required.');
      const p = await Posting.saveParty(kind, {
        ...(party || {}), name, phone: clean(v.phone, 20),
        openingBalance: num(v.opening), note: clean(v.notes, 200),
      });
      await Catalog.refreshParty(kind, p.id);
      document.dispatchEvent(new CustomEvent('data:changed'));
      return p;
    },
  });
}

async function renderDetail($el, kind, id) {
  const party = Catalog.party(kind, id);
  if (!party) { $el.html(UI.emptyState('Not found', 'question-circle')); return; }
  const [from, to] = rangeFor('month');
  const dn = isDebitNormal(kind);

  $el.html(UI.pageHeader(esc(party.name),
    `<button class="btn btn-light btn-sm btn-edit"><i class="bi bi-pencil"></i></button>
     <button class="btn btn-outline-danger btn-sm btn-del"><i class="bi bi-trash"></i></button>`,
    `#/${kind}`) +
    `<div class="card mb-3"><div class="card-body">
      ${party.phone ? `<div class="small"><i class="bi bi-telephone me-1"></i>${esc(party.phone)}</div>` : ''}
      <div id="party-bal" class="mt-1">${UI.spinner('')}</div>
    </div></div>` +
    dateFilter(from, to) +
    `<div id="party-ledger">${UI.spinner()}</div>`);

  const drawLedger = async (f = from, t2 = to) => {
    const led = await Posting.ledger(Posting.partyAccount(kind, id), f, t2);
    const bal = await Posting.accountBalance(Posting.partyAccount(kind, id));
    $el.find('#party-bal').html(`<span class="fw-semibold">${t('balance')}: ${balText(bal, dn)}</span>`);
    $el.find('#party-ledger').html(ledgerTable(led, { debitNormal: dn }));
  };

  bindDateFilter($el, drawLedger);
  await drawLedger();

  $el.on('click', '.btn-edit', async () => {
    await editPartyModal(kind, Catalog.party(kind, id));
    await renderDetail($el, kind, id);
  });
  $el.on('click', '.btn-del', async () => {
    if (!await UI.confirmDialog(`Delete ${party.name}? This also deletes all their transactions.`, { okClass: 'btn-danger', okLabel: 'Delete' })) return;
    await Posting.deleteParty(kind, id);
    await Catalog.refreshParty(kind, id);
    UI.toast('Deleted');
    location.hash = `#/${kind}`;
  });
}

async function renderList($el, kind) {
  const labelKey = kind === 'buyers' ? 'buyer' : 'seller';
  $el.html(UI.pageHeader(t(kind),
    `<button class="btn btn-success btn-sm btn-add"><i class="bi bi-plus-lg"></i> Add ${t(labelKey)}</button>`) +
    `<input type="search" class="form-control mb-2 q" placeholder="${t('search')}…">
     <div class="list-card party-list"></div>`);

  const balances = new Map();
  const draw = async () => {
    const q = $el.find('.q').val() || '';
    const parties = Catalog.searchParties(kind, q, 200);
    // Load balances lazily
    for (const p of parties) {
      if (!balances.has(p.id)) {
        const bal = await Posting.accountBalance(Posting.partyAccount(kind, p.id));
        balances.set(p.id, bal);
      }
    }
    pager($el.find('.party-list'), parties, (p) => {
      const bal = balances.get(p.id) || 0;
      const dn = isDebitNormal(kind);
      const balTxt = balText(bal, dn);
      return `<a class="list-row" href="#/${kind}/${encodeURIComponent(p.id)}">
        <div class="main">
          <div class="title">${esc(p.name)}</div>
          ${p.phone ? `<div class="sub">${esc(p.phone)}</div>` : ''}
        </div>
        <div class="end fw-semibold">${balTxt}</div>
      </a>`;
    }, 60, UI.emptyState(t('noRecords'), 'people',
      `<button class="btn btn-success btn-sm mt-3 btn-add">Add ${t(labelKey)}</button>`));
  };
  await draw();
  $el.on('input', '.q', debounce(draw, 150));
  $el.on('click', '.btn-add', async () => {
    const p = await editPartyModal(kind);
    if (p) location.hash = `#/${kind}/${p.id}`;
  });
}

export default {
  async render(el, { route, params }) {
    const $el = $(el);
    const kind = route; // 'buyers' or 'sellers'
    if (params[0]) await renderDetail($el, kind, params[0]);
    else await renderList($el, kind);
  },
};
