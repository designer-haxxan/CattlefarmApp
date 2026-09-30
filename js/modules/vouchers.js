// Cash book: receipts, payments, and transfers between accounts.
import * as UI from '../core/ui.js';
import { esc, fmtDate, fmtNum, today, num, clean, uuid } from '../core/utils.js';
import * as idb from '../db/idb.js';
import * as Catalog from '../services/catalog.js';
import * as Posting from '../services/posting.js';
import { t } from '../i18n.js';
import { dateFilter, bindDateFilter, rangeFor, pager, money, ledgerTable, balText } from '../core/views.js';

const $ = window.jQuery;

async function getAccounts() {
  return (await idb.getAll('accounts')).filter((a) => ['cash', 'bank'].includes(a.type) && a.active);
}

async function newVoucherModal(defaultType = 'receipt') {
  const accounts = await getAccounts();
  const accOpts = accounts.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');

  return UI.formModal({
    title: t(defaultType === 'receipt' ? 'receive' : defaultType === 'payment' ? 'pay' : 'transfer'),
    size: 'lg',
    body: `<div class="row g-2">
      <div class="col-6"><label class="form-label">${t('type')}</label>
        <select name="type" class="form-select vtype">
          <option value="receipt" ${defaultType === 'receipt' ? 'selected' : ''}>${t('receive')}</option>
          <option value="payment" ${defaultType === 'payment' ? 'selected' : ''}>${t('pay')}</option>
          <option value="transfer" ${defaultType === 'transfer' ? 'selected' : ''}>${t('transfer')}</option>
        </select></div>
      <div class="col-6"><label class="form-label">${t('date')} *</label>
        <input type="date" name="date" class="form-control" value="${today()}" max="${today()}" required></div>
      <!-- Receipt/Payment: party -->
      <div class="party-row col-12">
        <label class="form-label party-type-lbl">From / Party</label>
        <div class="d-flex gap-2">
          <input name="partyName" class="form-control party-name" readonly placeholder="${t('search')}…">
          <input type="hidden" name="partyId">
          <input type="hidden" name="partyKind">
          <button type="button" class="btn btn-outline-secondary pick-vparty">Select</button>
        </div>
      </div>
      <!-- Account -->
      <div class="col-6 acc-row"><label class="form-label">Account</label>
        <select name="accountId" class="form-select">${accOpts}</select></div>
      <!-- Transfer: to account -->
      <div class="col-6 to-acc-row d-none"><label class="form-label">To Account</label>
        <select name="toAccountId" class="form-select">${accOpts}</select></div>
      <div class="col-6"><label class="form-label">${t('amount')} *</label>
        <input type="number" name="amount" class="form-control" min="0.01" step="0.01" required></div>
      <div class="col-12"><label class="form-label">Memo</label>
        <input name="memo" class="form-control" maxlength="200"></div>
    </div>`,
    submitLabel: t('save'),
    submitClass: 'btn-success',
    onShown: ($m) => {
      const toggleType = () => {
        const tp = $m.find('.vtype').val();
        $m.find('.party-row').toggleClass('d-none', tp === 'transfer');
        $m.find('.to-acc-row').toggleClass('d-none', tp !== 'transfer');
        $m.find('.party-type-lbl').text(tp === 'receipt' ? 'Received from' : 'Paid to');
      };
      $m.on('change', '.vtype', toggleType);
      toggleType();
      $m.on('click', '.pick-vparty', async () => {
        const tp = $m.find('.vtype').val();
        // For receipt: from buyer; for payment: to seller or buyer
        const result = await UI.pick({
          title: 'Select Party', placeholder: t('search') + '…',
          search: (q) => [
            ...Catalog.searchParties('buyers', q, 15).map((p) => ({ id: p.id, title: p.name, subtitle: 'Buyer', value: { id: p.id, name: p.name, kind: 'buyers' } })),
            ...Catalog.searchParties('sellers', q, 15).map((p) => ({ id: p.id, title: p.name, subtitle: 'Seller', value: { id: p.id, name: p.name, kind: 'sellers' } })),
          ],
        });
        if (result) {
          const info = result.value || result;
          $m.find('.party-name').val(info.title || info.name);
          $m.find('[name=partyId]').val(info.id);
          $m.find('[name=partyKind]').val(info.kind || (info.subtitle === 'Buyer' ? 'buyers' : 'sellers'));
        }
      });
    },
    onSubmit: async (v) => {
      const amount = num(v.amount);
      if (amount <= 0) throw new Error('Enter a valid amount.');
      // Build counterAccountId: party ledger account or the "to" cash/bank account
      let counterAccountId;
      if (v.type === 'transfer') {
        counterAccountId = v.toAccountId;
        if (!counterAccountId) throw new Error('Select the "To" account for transfer.');
      } else {
        if (!v.partyId) throw new Error('Select a party.');
        counterAccountId = Posting.partyAccount(v.partyKind || 'buyers', v.partyId);
      }
      await Posting.saveVoucher({
        id: uuid(), type: v.type, date: v.date || today(),
        accountId: v.accountId || 'cash',
        counterAccountId, amount, note: clean(v.memo, 200),
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

    $el.html(UI.pageHeader(t('vouchers'),
      `<div class="btn-group btn-group-sm">
        <button class="btn btn-success btn-vcr" data-type="receipt">${t('receive')}</button>
        <button class="btn btn-outline-danger btn-vcr" data-type="payment">${t('pay')}</button>
        <button class="btn btn-outline-secondary btn-vcr" data-type="transfer">${t('transfer')}</button>
      </div>`) +
      dateFilter(from, to) +
      `<div class="small text-body-secondary mb-2 summary"></div>
       <div class="list-card vcr-list"></div>`);

    const draw = async (f = from, t2 = to) => {
      const all = (await idb.read(['vouchers'], (tx) =>
        tx.getAllByIndex('vouchers', 'date', IDBKeyRange.bound(f, t2 + '￿'))))
        .filter((d) => d.status !== 'void')
        .sort((a, b) => b.date.localeCompare(a.date));
      $el.find('.summary').text(`${all.length} vouchers`);
      pager($el.find('.vcr-list'), all, (v) => {
        const icon = v.type === 'receipt' ? 'arrow-down-circle text-success' : v.type === 'payment' ? 'arrow-up-circle text-danger' : 'arrow-left-right text-secondary';
        return `<div class="list-row">
          <div class="thumb"><i class="bi bi-${icon}"></i></div>
          <div class="main">
            <div class="title">${esc(v.type.charAt(0).toUpperCase() + v.type.slice(1))}${v.partyName ? ` · ${esc(v.partyName)}` : ''}</div>
            <div class="sub">${fmtDate(v.date)}${v.memo ? ` · ${esc(v.memo)}` : ''}</div>
          </div>
          <div class="end fw-semibold">${money(v.amount)}</div>
        </div>`;
      }, 60, UI.emptyState(t('noRecords'), 'cash-coin'));
    };

    bindDateFilter($el, draw);
    await draw();
    $el.on('click', '.btn-vcr', async function () { await newVoucherModal($(this).data('type')); await draw(); });
  },
};
