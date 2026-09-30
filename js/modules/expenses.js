// Farm expense recording: feed, vet, labor, other.
import * as UI from '../core/ui.js';
import { esc, fmtDate, fmtNum, today, num, clean } from '../core/utils.js';
import * as idb from '../db/idb.js';
import * as Catalog from '../services/catalog.js';
import * as Posting from '../services/posting.js';
import { t } from '../i18n.js';
import { dateFilter, bindDateFilter, rangeFor, pager, money } from '../core/views.js';

const $ = window.jQuery;

const CATEGORIES = ['feed', 'vet', 'labor', 'other'];
const CAT_LABELS = {
  feed: () => t('feedExpense'), vet: () => t('vetExpense'),
  labor: () => t('laborExpense'), other: () => t('otherExpense'),
};

async function getAccounts() {
  return (await idb.getAll('accounts')).filter((a) => ['cash', 'bank'].includes(a.type) && a.active);
}

async function newExpenseModal() {
  const accounts = await getAccounts();
  const accOpts = accounts.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');

  return UI.formModal({
    title: t('addExpense'),
    body: `<div class="row g-2">
      <div class="col-6"><label class="form-label">${t('date')} *</label>
        <input type="date" name="date" class="form-control" value="${today()}" max="${today()}" required></div>
      <div class="col-6"><label class="form-label">Category</label>
        <select name="category" class="form-select">
          ${CATEGORIES.map((c) => `<option value="${c}">${esc(CAT_LABELS[c]())}</option>`).join('')}
        </select></div>
      <div class="col-12"><label class="form-label">${t('description')}</label>
        <input name="description" class="form-control" maxlength="200" required></div>
      <div class="col-6"><label class="form-label">${t('amount')} *</label>
        <input type="number" name="amount" class="form-control" min="0.01" step="0.01" required></div>
      <div class="col-12">
        <div class="form-check form-switch my-1">
          <input class="form-check-input" type="checkbox" role="switch" name="isPaid" id="expIsPaid" checked>
          <label class="form-check-label" for="expIsPaid">${t('paid')} (cash now)</label>
        </div>
      </div>
      <div class="paid-acc col-12"><label class="form-label">${t('paymentAccount')}</label>
        <select name="accountId" class="form-select">${accOpts}</select></div>
      <div class="credit-acc col-12 d-none">
        <label class="form-label">${t('seller')} (credit from)</label>
        <div class="d-flex gap-2">
          <input name="partyName" class="form-control party-name" readonly placeholder="${t('search')}…">
          <input type="hidden" name="partyId">
          <button type="button" class="btn btn-outline-secondary pick-seller">Select</button>
        </div>
      </div>
      <div class="col-12"><label class="form-label">${t('notes')}</label>
        <textarea name="notes" class="form-control" rows="1"></textarea></div>
    </div>`,
    submitLabel: t('save'),
    submitClass: 'btn-success',
    onShown: ($m) => {
      $m.on('change', '[name=isPaid]', () => {
        const paid = $m.find('[name=isPaid]').prop('checked');
        $m.find('.paid-acc').toggleClass('d-none', !paid);
        $m.find('.credit-acc').toggleClass('d-none', paid);
      });
      $m.on('click', '.pick-seller', async () => {
        const result = await UI.pick({
          title: t('seller'), placeholder: t('search') + '…',
          search: (q) => Catalog.searchParties('sellers', q, 30).map((p) => ({ id: p.id, title: p.name })),
        });
        if (result) {
          $m.find('.party-name').val(result.title);
          $m.find('[name=partyId]').val(result.id);
        }
      });
    },
    onSubmit: async (v) => {
      const amount = num(v.amount);
      if (amount <= 0) throw new Error('Enter a valid amount.');
      const desc = clean(v.description, 200);
      if (!desc) throw new Error('Enter a description.');
      const party = v.partyId ? Catalog.party('sellers', v.partyId) : null;
      const isPaid = !!v.isPaid;
      await Posting.saveFarmExpense({
        date: v.date || today(), category: v.category || 'other',
        description: desc, amount,
        paymentAccountId: isPaid ? (v.accountId || 'cash') : null,
        sellerId: isPaid ? null : (v.partyId || null),
        note: clean(v.notes, 300),
      });
      document.dispatchEvent(new CustomEvent('data:changed'));
      return true;
    },
  });
}

export default {
  async render(el) {
    const $el = $(el);
    const [from, to] = rangeFor('month');

    $el.html(UI.pageHeader(t('expenses'),
      `<button class="btn btn-success btn-sm btn-add"><i class="bi bi-plus-lg"></i> ${t('addExpense')}</button>`) +
      dateFilter(from, to,
        `<select name="fcat" class="form-select form-select-sm" style="max-width:160px">
          <option value="">All</option>
          ${CATEGORIES.map((c) => `<option value="${c}">${esc(CAT_LABELS[c]())}</option>`).join('')}
        </select>`) +
      `<div class="small text-body-secondary mb-2 summary"></div>
       <div class="list-card exp-list"></div>`);

    const draw = async (f = from, t2 = to, extra = {}) => {
      let all = (await idb.read(['farmExpenses'], (tx) =>
        tx.getAllByIndex('farmExpenses', 'date', IDBKeyRange.bound(f, t2 + '￿'))))
        .filter((d) => d.status !== 'void');
      if (extra.fcat) all = all.filter((d) => d.category === extra.fcat);
      all.sort((a, b) => b.date.localeCompare(a.date));
      const total = all.reduce((s, d) => s + (d.amount || 0), 0);
      $el.find('.summary').text(`${all.length} expenses · ${money(total)}`);
      pager($el.find('.exp-list'), all, (d) => `<div class="list-row">
        <div class="main">
          <div class="title">${esc(d.description)}</div>
          <div class="sub">${fmtDate(d.date)} · ${esc(CAT_LABELS[d.category]?.() || d.category)}</div>
          ${d.partyName ? `<div class="sub">${esc(d.partyName)}</div>` : ''}
        </div>
        <div class="end fw-semibold">${money(d.amount)}</div>
      </div>`, 60, UI.emptyState(t('noRecords'), 'receipt-cutoff',
        `<button class="btn btn-success btn-sm mt-3 btn-add">${t('addExpense')}</button>`));
    };

    bindDateFilter($el, (f, t2, fd) => draw(f, t2, fd));
    await draw();
    $el.on('click', '.btn-add', async () => { await newExpenseModal(); await draw(); });
  },
};
