// Animal buy/sell transactions: post to livestock account and party ledger.
import * as UI from '../core/ui.js';
import { esc, fmtDate, fmtNum, today, num, clean } from '../core/utils.js';
import * as idb from '../db/idb.js';
import * as Catalog from '../services/catalog.js';
import * as Posting from '../services/posting.js';
import { t } from '../i18n.js';
import { dateFilter, bindDateFilter, rangeFor, pager, money } from '../core/views.js';

const $ = window.jQuery;

async function getAccounts() {
  return (await idb.getAll('accounts')).filter((a) => ['cash', 'bank'].includes(a.type) && a.active);
}

async function newTxnModal() {
  const accounts = await getAccounts();
  const accOpts = accounts.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');
  const animals = Catalog.allAnimals();
  const activeAnimals = animals.filter((a) => a.status === 'active');

  return UI.formModal({
    title: t('animalTxns'),
    size: 'lg',
    body: `<div class="row g-2">
      <div class="col-6">
        <label class="form-label">${t('type')} *</label>
        <select name="txnType" class="form-select txn-type">
          <option value="buy">${t('animalPurchase')}</option>
          <option value="sell">${t('animalSale')}</option>
        </select>
      </div>
      <div class="col-6"><label class="form-label">${t('date')} *</label>
        <input type="date" name="date" class="form-control" value="${today()}" max="${today()}" required></div>

      <!-- Buy: new animal fields -->
      <div class="buy-fields col-12">
        <label class="form-label">${t('tagNo')} (new animal)</label>
        <input name="tagNo" class="form-control" placeholder="Tag number of purchased animal">
      </div>

      <!-- Sell: pick existing animal -->
      <div class="sell-fields d-none col-12">
        <label class="form-label">${t('animal')}</label>
        <select name="animalId" class="form-select">
          <option value="">— select —</option>
          ${activeAnimals.map((a) => `<option value="${esc(a.id)}">${esc(a.tagNo)}${a.name ? ' — ' + esc(a.name) : ''}</option>`).join('')}
        </select>
      </div>

      <div class="col-12">
        <label class="form-label party-label">${t('seller')}</label>
        <div class="d-flex gap-2">
          <input name="partyName" class="form-control flex-grow-1 party-name" readonly placeholder="${t('search')}…">
          <input type="hidden" name="partyId">
          <button type="button" class="btn btn-outline-secondary pick-party">Select</button>
        </div>
      </div>
      <div class="col-6"><label class="form-label">${t('amount')} *</label>
        <input type="number" name="amount" class="form-control" min="0" step="100" required></div>
      <div class="col-12">
        <div class="form-check form-switch my-1">
          <input class="form-check-input" type="checkbox" role="switch" name="isPaid" id="atIsPaid" checked>
          <label class="form-check-label" for="atIsPaid">${t('paid')} (cash now)</label>
        </div>
      </div>
      <div class="paid-acc col-12"><label class="form-label">${t('paymentAccount')}</label>
        <select name="accountId" class="form-select">${accOpts}</select></div>
      <div class="col-12"><label class="form-label">${t('notes')}</label>
        <textarea name="notes" class="form-control" rows="1"></textarea></div>
    </div>`,
    submitLabel: t('save'),
    submitClass: 'btn-success',
    onShown: ($m) => {
      const toggleType = () => {
        const isBuy = $m.find('.txn-type').val() === 'buy';
        $m.find('.buy-fields').toggleClass('d-none', !isBuy);
        $m.find('.sell-fields').toggleClass('d-none', isBuy);
        $m.find('.party-label').text(t(isBuy ? 'seller' : 'buyer'));
      };
      $m.on('change', '.txn-type', toggleType);
      toggleType();
      $m.on('change', '[name=isPaid]', () => {
        $m.find('.paid-acc').toggleClass('d-none', !$m.find('[name=isPaid]').prop('checked'));
      });
      $m.on('click', '.pick-party', async () => {
        const kind = $m.find('.txn-type').val() === 'buy' ? 'sellers' : 'buyers';
        const result = await UI.pick({
          title: t(kind === 'sellers' ? 'seller' : 'buyer'),
          placeholder: t('search') + '…',
          search: (q) => Catalog.searchParties(kind, q, 30).map((p) => ({ id: p.id, title: p.name })),
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
      const isBuy = v.txnType === 'buy';
      const partyKind = isBuy ? 'sellers' : 'buyers';
      const party = v.partyId ? Catalog.party(partyKind, v.partyId) : null;
      const isPaid = !!v.isPaid;
      await Posting.saveAnimalTxn({
        type: v.txnType, date: v.date || today(),
        animalId: isBuy ? null : (v.animalId || null),
        animalTag: isBuy ? clean(v.tagNo, 30) : null,
        partyId: v.partyId || '',
        partyName: party?.name || v.partyName || '',
        amount, paid: isPaid ? amount : 0,
        paymentAccountId: v.accountId || 'cash',
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

    $el.html(UI.pageHeader(t('animalTxns'),
      `<button class="btn btn-success btn-sm btn-add"><i class="bi bi-plus-lg"></i> Add</button>`) +
      dateFilter(from, to) +
      `<div class="small text-body-secondary mb-2 summary"></div>
       <div class="list-card txn-list"></div>`);

    const draw = async (f = from, t2 = to) => {
      const all = (await idb.read(['animalTxns'], (tx) =>
        tx.getAllByIndex('animalTxns', 'date', IDBKeyRange.bound(f, t2 + '￿'))))
        .filter((d) => d.status !== 'void')
        .sort((a, b) => b.date.localeCompare(a.date));
      $el.find('.summary').text(`${all.length} transactions`);
      pager($el.find('.txn-list'), all, (d) => `<div class="list-row">
        <div class="thumb"><i class="bi bi-${d.type === 'buy' ? 'box-arrow-in-down' : 'box-arrow-up'} ${d.type === 'buy' ? 'text-success' : 'text-danger'}"></i></div>
        <div class="main">
          <div class="title">${esc(t(d.type === 'buy' ? 'animalPurchase' : 'animalSale'))}${d.tagNo ? ` · ${esc(d.tagNo)}` : ''}</div>
          <div class="sub">${fmtDate(d.date)}${d.partyName ? ` · ${esc(d.partyName)}` : ''}</div>
        </div>
        <div class="end fw-semibold">${money(d.amount)}</div>
      </div>`, 60, UI.emptyState(t('noRecords'), 'arrow-left-right',
        `<button class="btn btn-success btn-sm mt-3 btn-add">Add</button>`));
    };

    bindDateFilter($el, draw);
    await draw();
    $el.on('click', '.btn-add', async () => { await newTxnModal(); await draw(); });
  },
};
