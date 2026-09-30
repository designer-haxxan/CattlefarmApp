// Backup and restore: full JSON export/import of all farm data.
import * as UI from '../core/ui.js';
import { esc, today, downloadFile } from '../core/utils.js';
import * as idb from '../db/idb.js';
import { t } from '../i18n.js';
import { CONFIG } from '../config.js';
import { getSettings } from '../core/settings.js';

const $ = window.jQuery;

const DATA_STORES = [
  'animals', 'breeds', 'milkRecords', 'healthEvents', 'breedingRecords',
  'weightRecords', 'animalTxns', 'milkSales', 'farmExpenses',
  'buyers', 'sellers', 'accounts', 'vouchers', 'entries', 'auditLog', 'meta',
];

async function createBackup() {
  const data = {};
  for (const store of DATA_STORES) {
    data[store] = await idb.getAll(store);
  }
  const s = getSettings();
  const payload = {
    app: CONFIG.APP_ID, version: CONFIG.BACKUP_VERSION,
    farm: s.business.name, createdAt: new Date().toISOString(), data,
  };
  const json = JSON.stringify(payload, null, 2);
  const farmSlug = (s.business.name || 'CattleFarm').replace(/\s+/g, '_');
  downloadFile(`${farmSlug}_backup_${today()}.json`, json, 'application/json');
  // Save last backup time
  await idb.write(['meta'], (tx) => tx.put('meta', { key: 'lastBackup', value: new Date().toISOString() }));
  UI.toast('Backup downloaded');
}

async function restoreBackup(file) {
  const text = await file.text();
  let payload;
  try { payload = JSON.parse(text); } catch { throw new Error('Invalid backup file (not valid JSON).'); }
  if (payload.app !== CONFIG.APP_ID) throw new Error(`This backup is for "${payload.app}", not "${CONFIG.APP_ID}". Wrong app.`);

  if (!await UI.confirmDialog(
    `${t('backupWarning')}\n\nBackup: ${payload.farm || '?'} (${payload.createdAt?.slice(0, 10) || '?'})`,
    { okLabel: t('restore'), okClass: 'btn-danger' }
  )) return false;

  // Restore each store in its own transaction to avoid IDB auto-commit
  for (const store of DATA_STORES) {
    const rows = payload.data?.[store] || [];
    await idb.write([store], async (tx) => {
      await tx.clear(store);
      for (const row of rows) await tx.add(store, row);
    });
  }
  return true;
}

export default {
  async render(el) {
    const $el = $(el);
    $el.html(UI.pageHeader(t('backup')));

    const lastBackupRec = await idb.get('meta', 'lastBackup');
    const lastBackup = lastBackupRec?.value ? new Date(lastBackupRec.value).toLocaleString() : 'Never';

    $el.append(`
      <div class="card mb-3"><div class="card-body">
        <h5 class="card-title">${t('createBackup')}</h5>
        <p class="card-text small text-body-secondary">Downloads a JSON backup of all your farm data: animals, milk, health, breeding, transactions, and accounts.</p>
        <p class="small text-body-secondary mb-2 last-backup-time">${t('lastBackup')}: ${esc(lastBackup)}</p>
        <button class="btn btn-success btn-backup"><i class="bi bi-cloud-arrow-down me-1"></i>${t('createBackup')}</button>
      </div></div>

      <div class="card"><div class="card-body">
        <h5 class="card-title">${t('restoreBackup')}</h5>
        <p class="card-text small text-body-secondary">${t('backupWarning')}</p>
        <div class="mb-2">
          <input type="file" id="restore-file" class="form-control" accept=".json">
        </div>
        <button class="btn btn-outline-danger btn-restore" disabled><i class="bi bi-cloud-arrow-up me-1"></i>${t('restore')}</button>
      </div></div>`);

    $el.on('click', '.btn-backup', async () => {
      await UI.withLoading(createBackup, 'Creating backup…');
      $el.find('.last-backup-time').text(`${t('lastBackup')}: ${new Date().toLocaleString()}`);
    });

    $el.on('change', '#restore-file', function () {
      $el.find('.btn-restore').prop('disabled', !this.files?.length);
    });

    $el.on('click', '.btn-restore', async function () {
      const file = $el.find('#restore-file')[0]?.files?.[0];
      if (!file) return;
      $(this).prop('disabled', true);
      try {
        const ok = await restoreBackup(file);
        if (ok) {
          UI.toast('Restore successful — reloading…', 'success', 2500);
          setTimeout(() => location.reload(), 2500);
        }
      } catch (err) {
        UI.toast(err.message || String(err), 'danger', 6000);
      } finally { $(this).prop('disabled', false); }
    });
  },
};
