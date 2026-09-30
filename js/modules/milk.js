// Milk production recording: per-animal morning/evening sessions.
import * as UI from '../core/ui.js';
import { esc, fmtDate, fmtNum, today, uuid, nowISO, num, debounce } from '../core/utils.js';
import * as idb from '../db/idb.js';
import * as Catalog from '../services/catalog.js';
import { t } from '../i18n.js';
import { dateFilter, bindDateFilter, rangeFor, pager } from '../core/views.js';

const $ = window.jQuery;

// Quick-entry form: record milk for all active dairy animals in one table
async function recordMilkModal(date = today()) {
  const animals = Catalog.searchAnimals('', { status: 'active', gender: 'female' });
  if (!animals.length) {
    UI.toast('No active female animals to record milk for.', 'warning');
    return null;
  }
  // Load existing records for this date
  const existing = {};
  const recs = await idb.getAllByIndex('milkRecords', 'dateOnly', date);
  for (const r of recs) existing[r.animalId] = r;

  const rows = animals.map((a) => {
    const r = existing[a.id] || {};
    return `<tr data-id="${esc(a.id)}">
      <td class="small">${esc(a.tagNo)}${a.name ? ' ' + esc(a.name) : ''}</td>
      <td><input type="number" class="form-control form-control-sm morning" min="0" step="0.1" value="${r.morning || ''}"></td>
      <td><input type="number" class="form-control form-control-sm evening" min="0" step="0.1" value="${r.evening || ''}"></td>
      <td class="row-total small fw-semibold">${r.total ? fmtNum(r.total) : '—'}</td>
    </tr>`;
  }).join('');

  return UI.formModal({
    title: t('addMilkRecord'),
    size: 'lg',
    body: `<div class="mb-3"><label class="form-label">${t('date')}</label>
      <input type="date" name="date" class="form-control" value="${esc(date)}" max="${today()}"></div>
      <div class="table-responsive"><table class="table table-sm mb-0">
        <thead><tr><th>${t('animal')}</th><th>${t('morning')}</th><th>${t('evening')}</th><th>Total L</th></tr></thead>
        <tbody id="milk-entry-rows">${rows}</tbody>
        <tfoot><tr><td colspan="3" class="text-end small fw-semibold">Grand total:</td><td class="fw-semibold grand-total">—</td></tr></tfoot>
      </table></div>`,
    submitLabel: t('save'),
    submitClass: 'btn-success',
    onShown: ($m) => {
      const recalc = () => {
        let grand = 0;
        $m.find('#milk-entry-rows tr').each(function () {
          const m = num($(this).find('.morning').val());
          const ev = num($(this).find('.evening').val());
          const total = m + ev;
          $(this).find('.row-total').text(total > 0 ? fmtNum(total) : '—');
          grand += total;
        });
        $m.find('.grand-total').text(fmtNum(grand));
      };
      $m.on('input', 'input[type=number]', debounce(recalc, 80));
      recalc();
    },
    onSubmit: async (v) => {
      const d = v.date || today();
      const now = nowISO();
      await idb.write(['milkRecords'], async (tx) => {
        for (const a of animals) {
          const $row = $(`[data-id="${a.id}"]`);
          const morning = num($row.find('.morning').val());
          const evening = num($row.find('.evening').val());
          const total = morning + evening;
          // look up from existing in tx
          const key = a.id + '|' + d;
          const existing_rec = await tx.getByIndex('milkRecords', 'animalDate', key);
          if (total > 0 || existing_rec) {
            const rec = {
              id: existing_rec?.id || uuid(),
              animalId: a.id, date: d,
              morning, evening, total,
              notes: '', dateOnly: d, animalDate: key,
              createdAt: existing_rec?.createdAt || now, updatedAt: now,
            };
            await tx.put('milkRecords', rec);
          }
        }
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
    $el.html(UI.pageHeader(t('milk'),
      `<button class="btn btn-success btn-sm btn-add"><i class="bi bi-plus-lg"></i> ${t('addMilkRecord')}</button>`) +
      dateFilter(from, to) +
      `<div class="small text-body-secondary mb-2 summary"></div>
       <div class="list-card milk-list"></div>`);

    const draw = async (f = from, t2 = to) => {
      const all = await idb.read(['milkRecords'], (tx) =>
        tx.getAllByIndex('milkRecords', 'date', IDBKeyRange.bound(f, t2)));
      // Group by date
      const byDate = {};
      for (const r of all) {
        byDate[r.dateOnly] = byDate[r.dateOnly] || { date: r.dateOnly, total: 0, count: 0 };
        byDate[r.dateOnly].total += r.total || 0;
        byDate[r.dateOnly].count++;
      }
      const days = Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date));
      const grandTotal = days.reduce((s, d) => s + d.total, 0);
      $el.find('.summary').text(`${days.length} days · ${fmtNum(grandTotal)} L total`);
      pager($el.find('.milk-list'), days, (d) => `<a class="list-row" href="#/milk/${encodeURIComponent(d.date)}">
        <div class="main"><div class="title">${fmtDate(d.date)}</div><div class="sub">${d.count} animals recorded</div></div>
        <div class="end fw-semibold">${fmtNum(d.total)} L</div></a>`, 60,
        UI.emptyState(t('noRecords'), 'droplet',
          `<button class="btn btn-success btn-sm mt-3 btn-add">${t('addMilkRecord')}</button>`));
    };

    bindDateFilter($el, draw);
    await draw();
    $el.on('click', '.btn-add', async () => {
      await recordMilkModal();
      await draw();
    });
  },
};
