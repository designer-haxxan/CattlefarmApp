// Chart of accounts: system accounts + user-defined cash/bank/asset/liability accounts.
import * as UI from '../core/ui.js';
import { esc, num, clean, lc } from '../core/utils.js';
import * as idb from '../db/idb.js';
import * as Posting from '../services/posting.js';
import { t } from '../i18n.js';
import { balText, pager, money } from '../core/views.js';

const $ = window.jQuery;

const TYPE_ORDER = ['cash', 'bank', 'asset', 'income', 'expense', 'liability', 'equity'];

async function editAccountModal(acct = null) {
  return UI.formModal({
    title: acct ? 'Edit Account' : 'Add Account',
    body: `<div class="row g-2">
      <div class="col-12"><label class="form-label">Account Name *</label>
        <input name="name" class="form-control" required maxlength="80" value="${esc(acct?.name)}"></div>
      <div class="col-6"><label class="form-label">Type</label>
        <select name="type" class="form-select" ${acct?.system ? 'disabled' : ''}>
          ${Object.entries(Posting.ACCOUNT_TYPES).map(([k, l]) =>
            `<option value="${k}" ${k === (acct?.type || 'cash') ? 'selected' : ''}>${esc(l)}</option>`).join('')}
        </select></div>
      <div class="col-6"><label class="form-label">Opening Balance</label>
        <input type="number" name="opening" class="form-control" step="0.01" value="${acct?.opening || 0}"></div>
      <div class="col-12"><div class="form-check">
        <input class="form-check-input" type="checkbox" name="active" id="acc-active" ${acct?.active !== false ? 'checked' : ''}>
        <label class="form-check-label" for="acc-active">Active</label>
      </div></div>
    </div>`,
    submitLabel: t('save'),
    submitClass: 'btn-success',
    onSubmit: async (v) => {
      const name = clean(v.name, 80);
      if (!name) throw new Error('Name is required.');
      const a = await Posting.saveAccount({
        ...(acct || {}), name, type: acct?.system ? acct.type : v.type,
        openingBalance: num(v.opening), active: !!v.active,
      });
      document.dispatchEvent(new CustomEvent('data:changed'));
      return a;
    },
  });
}

export default {
  async render(el) {
    const $el = $(el);
    $el.html(UI.pageHeader(t('accounts'),
      `<button class="btn btn-success btn-sm btn-add"><i class="bi bi-plus-lg"></i> Add Account</button>`) +
      `<div class="list-card acc-list"></div>`);

    const draw = async () => {
      const all = await idb.getAll('accounts');
      const balMap = await Posting.allBalances();
      all.sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.name.localeCompare(b.name));
      let lastType = '';
      const rows = all.map((a) => {
        let header = '';
        if (a.type !== lastType) { lastType = a.type; header = `<div class="list-section-header">${esc(Posting.ACCOUNT_TYPES[a.type] || a.type)}</div>`; }
        const balance = balMap.get(a.id)?.balance || 0;
        const dn = Posting.isDebitNormal(a.type);
        return header + `<div class="list-row ${a.active ? '' : 'text-body-secondary'}">
          <div class="main">
            <div class="title">${esc(a.name)}</div>
            <div class="sub">${esc(Posting.ACCOUNT_TYPES[a.type] || a.type)}${!a.active ? ' · Inactive' : ''}</div>
          </div>
          <div class="end fw-semibold">${balText(balance, dn)}</div>
          ${!a.system ? `<button class="btn btn-link btn-sm btn-edit-acc p-0 ms-2" data-id="${esc(a.id)}" title="Edit"><i class="bi bi-pencil"></i></button>` : ''}
        </div>`;
      });
      $el.find('.acc-list').html(rows.join('') || UI.emptyState('No accounts'));
    };

    await draw();
    $el.on('click', '.btn-add', async () => { await editAccountModal(); await draw(); });
    $el.on('click', '.btn-edit-acc', async function () {
      const all = await idb.getAll('accounts');
      const a = all.find((x) => x.id === $(this).data('id'));
      if (a) { await editAccountModal(a); await draw(); }
    });
  },
};
