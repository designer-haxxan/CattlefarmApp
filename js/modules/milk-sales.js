// Milk sales: sell milk to buyers, update buyer ledger balance.
import * as UI from '../core/ui.js';
import { esc, fmtDate, fmtNum, today, num, clean, debounce } from '../core/utils.js';
import * as idb from '../db/idb.js';
import * as Catalog from '../services/catalog.js';
import * as Posting from '../services/posting.js';
import { t } from '../i18n.js';
import { dateFilter, bindDateFilter, rangeFor, pager, money } from '../core/views.js';

const $ = window.jQuery;

async function pickBuyer() {
  const result = await UI.pick({
    title: t('buyer'),
    placeholder: t('search') + '…',
    addNew: {
      label: t('addBuyer') || 'Add Buyer',
      create: async () => {
        let party = null;
        await UI.formModal({
          title: t('addBuyer') || 'Add Buyer',
          body: `<div class="mb-3"><label class="form-label">${t('name')} *</label>
            <input name="name" class="form-control" required maxlength="80" autofocus></div>
            <div class="mb-3"><label class="form-label">${t('phone')}</label>
            <input name="phone" class="form-control" maxlength="20"></div>`,
          submitLabel: t('save'),
          submitClass: 'btn-success',
          onSubmit: async (v) => {
            if (!v.name?.trim()) throw new Error('Enter buyer name.');
            party = await Posting.saveParty('buyers', { name: v.name.trim(), phone: v.phone || '' });
            await Catalog.refreshParty('buyers', party.id);
            return true;
          },
        });
        return party ? { id: party.id, title: party.name } : null;
      },
    },
    search: (q) => {
      const results = Catalog.searchParties('buyers', q, 30);
      return results.map((p) => ({ id: p.id, title: p.name, subtitle: p.phone || '' }));
    },
  });
  return result;
}

async function getAccounts() {
  const all = await idb.getAll('accounts');
  return all.filter((a) => ['cash', 'bank'].includes(a.type) && a.active);
}

async function newSaleModal() {
  const accounts = await getAccounts();
  const accOpts = accounts.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');

  return UI.formModal({
    title: t('milkSale'),
    size: 'lg',
    body: `<div class="row g-2">
      <div class="col-12">
        <label class="form-label">${t('buyer')} *</label>
        <div class="d-flex gap-2">
          <input name="buyerName" class="form-control flex-grow-1 buyer-name" readonly placeholder="${t('search')}…" required>
          <input type="hidden" name="buyerId">
          <button type="button" class="btn btn-outline-secondary pick-buyer">${t('select') || 'Select'}</button>
        </div>
      </div>
      <div class="col-6"><label class="form-label">${t('date')} *</label>
        <input type="date" name="date" class="form-control" value="${today()}" max="${today()}" required></div>
      <div class="col-3"><label class="form-label">${t('quantity')} *</label>
        <input type="number" name="quantity" class="form-control" min="0.1" step="0.1" placeholder="L" required></div>
      <div class="col-3"><label class="form-label">${t('rate')} *</label>
        <input type="number" name="rate" class="form-control" min="0" step="0.5" placeholder="Rs/L" required></div>
      <div class="col-12"><label class="form-label">${t('totalAmount')}</label>
        <input name="total" class="form-control bg-body-secondary total-field" readonly placeholder="0.00"></div>
      <div class="col-12">
        <div class="form-check form-switch my-1">
          <input class="form-check-input" type="checkbox" role="switch" name="isPaid" id="isPaid" checked>
          <label class="form-check-label" for="isPaid">${t('paid')} (cash received now)</label>
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
      const recalc = () => {
        const q = num($m.find('[name=quantity]').val());
        const r = num($m.find('[name=rate]').val());
        $m.find('.total-field').val((q * r).toFixed(2));
      };
      $m.on('input', '[name=quantity],[name=rate]', debounce(recalc, 80));
      $m.on('change', '[name=isPaid]', () => {
        $m.find('.paid-acc').toggleClass('d-none', !$m.find('[name=isPaid]').prop('checked'));
      });
      $m.on('click', '.pick-buyer', async () => {
        const b = await pickBuyer();
        if (b) {
          $m.find('.buyer-name').val(b.title);
          $m.find('[name=buyerId]').val(b.id);
        }
      });
    },
    onSubmit: async (v) => {
      if (!v.buyerId) throw new Error('Select a buyer.');
      const qty = num(v.quantity);
      const rate = num(v.rate);
      if (qty <= 0 || rate < 0) throw new Error('Enter valid quantity and rate.');
      const total = qty * rate;
      const buyer = Catalog.party('buyers', v.buyerId);
      const isPaid = !!v.isPaid;
      await Posting.saveMilkSale({
        date: v.date || today(), buyerId: v.buyerId, buyerName: buyer?.name || v.buyerName,
        quantity: qty, rate, total,
        paid: isPaid ? total : 0,
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

    $el.html(UI.pageHeader(t('milkSales'),
      `<button class="btn btn-success btn-sm btn-add"><i class="bi bi-plus-lg"></i> ${t('milkSale')}</button>`) +
      dateFilter(from, to) +
      `<div class="small text-body-secondary mb-2 summary"></div>
       <div class="list-card sale-list"></div>`);

    const draw = async (f = from, t2 = to) => {
      const all = (await idb.read(['milkSales'], (tx) =>
        tx.getAllByIndex('milkSales', 'date', IDBKeyRange.bound(f, t2 + '￿'))))
        .filter((d) => d.status !== 'void')
        .sort((a, b) => b.date.localeCompare(a.date));
      const totalQty = all.reduce((s, d) => s + (d.quantity || 0), 0);
      const totalAmt = all.reduce((s, d) => s + (d.total || 0), 0);
      $el.find('.summary').text(`${all.length} sales · ${fmtNum(totalQty)} L · ${money(totalAmt)}`);
      pager($el.find('.sale-list'), all, (d) => `<div class="list-row">
        <div class="main">
          <div class="title">${esc(d.buyerName)}</div>
          <div class="sub">${fmtDate(d.date)} · ${fmtNum(d.quantity)} L @ ${money(d.rate)}/L</div>
          ${d.balance > 0 ? `<div class="sub text-warning small">Credit</div>` : ''}
        </div>
        <div class="end fw-semibold">${money(d.total)}</div>
      </div>`, 60, UI.emptyState(t('noRecords'), 'bag-check',
        `<button class="btn btn-success btn-sm mt-3 btn-add">${t('milkSale')}</button>`));
    };

    bindDateFilter($el, draw);
    await draw();
    $el.on('click', '.btn-add', async () => { await newSaleModal(); await draw(); });
  },
};
