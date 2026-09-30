// Farm settings: profile, currency, language, theme, number prefixes, data integrity.
import * as UI from '../core/ui.js';
import { esc, clean, num } from '../core/utils.js';
import { getSettings, saveSettings, DEFAULT_SETTINGS } from '../core/settings.js';
import { t, lang, setLang } from '../i18n.js';
import * as Posting from '../services/posting.js';

const $ = window.jQuery;

function settingRow(label, content) {
  return `<div class="settings-row"><div class="settings-label">${esc(label)}</div><div class="settings-value">${content}</div></div>`;
}
function settingSection(title, rows) {
  return `<div class="card mb-3"><div class="card-header small fw-semibold">${esc(title)}</div><div class="card-body p-0">${rows}</div></div>`;
}

function buildForm(s) {
  const themeOpts = ['auto', 'light', 'dark'].map((v) =>
    `<option value="${v}" ${s.theme === v ? 'selected' : ''}>${esc(t(v === 'auto' ? 'followDevice' : v))}</option>`).join('');
  const curLang = lang();

  return `
  <form id="settings-form" novalidate>
    ${settingSection(t('farmProfile'), `
      ${settingRow(t('farmName'), `<input name="businessName" class="form-control form-control-sm" value="${esc(s.business.name)}" maxlength="80">`)}
      ${settingRow(t('farmAddress'), `<input name="businessAddress" class="form-control form-control-sm" value="${esc(s.business.address)}" maxlength="120">`)}
      ${settingRow(t('phone'), `<input name="businessPhone" class="form-control form-control-sm" value="${esc(s.business.phone)}" maxlength="20">`)}
    `)}
    ${settingSection(t('language') + ' & ' + t('theme'), `
      ${settingRow(t('language'), `
        <div class="btn-group btn-group-sm">
          <button type="button" class="btn btn-${curLang === 'en' ? 'success' : 'outline-secondary'} lang-btn" data-lang="en">English</button>
          <button type="button" class="btn btn-${curLang === 'ur' ? 'success' : 'outline-secondary'} lang-btn" data-lang="ur">اردو</button>
        </div>
      `)}
      ${settingRow(t('theme'), `<select name="theme" class="form-select form-select-sm" style="max-width:150px">${themeOpts}</select>`)}
      ${settingRow(t('currency'), `<input name="currency" class="form-control form-control-sm" value="${esc(s.currency)}" maxlength="5" style="max-width:80px">`)}
    `)}
    ${settingSection(t('numberPrefixes'), `
      ${settingRow(t('milkSale'), `<input name="pfx_milkSale" class="form-control form-control-sm" value="${esc(s.prefixes.milkSale)}" maxlength="8" style="max-width:100px">`)}
      ${settingRow(t('animalTxns'), `<input name="pfx_animalTxn" class="form-control form-control-sm" value="${esc(s.prefixes.animalTxn)}" maxlength="8" style="max-width:100px">`)}
      ${settingRow(t('expenses'), `<input name="pfx_expense" class="form-control form-control-sm" value="${esc(s.prefixes.expense)}" maxlength="8" style="max-width:100px">`)}
      ${settingRow(t('receipt'), `<input name="pfx_receipt" class="form-control form-control-sm" value="${esc(s.prefixes.receipt)}" maxlength="8" style="max-width:100px">`)}
      ${settingRow(t('payment'), `<input name="pfx_payment" class="form-control form-control-sm" value="${esc(s.prefixes.payment)}" maxlength="8" style="max-width:100px">`)}
    `)}
    <div class="d-flex gap-2 mb-3">
      <button type="submit" class="btn btn-success btn-sm">${t('save')}</button>
    </div>
  </form>
  ${settingSection(t('appData'), `
    ${settingRow(t('checkIntegrity'), `<button type="button" class="btn btn-outline-secondary btn-sm btn-integrity">${t('check')}</button> <span class="integrity-result small ms-2"></span>`)}
  `)}`;
}

export default {
  async render(el) {
    const $el = $(el);
    $el.html(UI.pageHeader(t('settings')));

    const draw = () => {
      const s = getSettings();
      $el.append(buildForm(s));
    };
    draw();

    $el.on('click', '.lang-btn', function () {
      const newLang = $(this).data('lang');
      setLang(newLang);
      location.reload();
    });

    $el.on('submit', '#settings-form', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      const s = getSettings();
      saveSettings({
        ...s,
        business: {
          name: clean(fd.businessName, 80) || 'My Cattle Farm',
          address: clean(fd.businessAddress, 120),
          phone: clean(fd.businessPhone, 20),
          footer: s.business.footer || '',
        },
        currency: clean(fd.currency, 5) || 'Rs',
        theme: fd.theme || 'auto',
        prefixes: {
          milkSale: clean(fd.pfx_milkSale, 8) || 'MS',
          animalTxn: clean(fd.pfx_animalTxn, 8) || 'AT',
          expense: clean(fd.pfx_expense, 8) || 'EXP',
          receipt: clean(fd.pfx_receipt, 8) || 'RCV',
          payment: clean(fd.pfx_payment, 8) || 'PAY',
          transfer: s.prefixes.transfer || 'TRF',
        },
      });
      UI.toast('Settings saved');
    });

    $el.on('click', '.btn-integrity', async function () {
      $(this).prop('disabled', true).text('Checking…');
      $el.find('.integrity-result').text('');
      try {
        const result = await Posting.integrityCheck();
        if (!result.issues.length) {
          $el.find('.integrity-result').html(`<span class="text-success">✓ All ${result.checked.entries} entries balanced</span>`);
        } else {
          $el.find('.integrity-result').html(`<span class="text-danger">${result.issues.length} error(s): ${esc(result.issues[0])}</span>`);
        }
      } catch (err) {
        $el.find('.integrity-result').text(err.message || String(err));
      } finally { $(this).prop('disabled', false).text('Check'); }
    });
  },
};
