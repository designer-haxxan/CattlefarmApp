// Weight recording for individual animals.
import * as UI from '../core/ui.js';
import { esc, fmtDate, fmtNum, today, uuid, nowISO, num, clean, debounce } from '../core/utils.js';
import * as idb from '../db/idb.js';
import * as Catalog from '../services/catalog.js';
import { t } from '../i18n.js';
import { dateFilter, bindDateFilter, rangeFor, pager } from '../core/views.js';

const $ = window.jQuery;

async function addWeightModal(prefillAnimalId = null) {
  const animals = Catalog.searchAnimals('', { status: 'active' });
  const animalOpts = `<option value="">— select —</option>` +
    animals.map((a) => `<option value="${esc(a.id)}" ${a.id === prefillAnimalId ? 'selected' : ''}>${esc(a.tagNo)}${a.name ? ' — ' + esc(a.name) : ''}</option>`).join('');

  return UI.formModal({
    title: t('addWeight'),
    body: `<div class="row g-2">
      <div class="col-12"><label class="form-label">${t('animal')} *</label>
        <select name="animalId" class="form-select" required>${animalOpts}</select></div>
      <div class="col-6"><label class="form-label">${t('date')} *</label>
        <input type="date" name="date" class="form-control" value="${today()}" max="${today()}" required></div>
      <div class="col-6"><label class="form-label">${t('weight')} *</label>
        <input type="number" name="weight" class="form-control" min="0.1" step="0.1" required placeholder="kg"></div>
      <div class="col-12"><label class="form-label">${t('notes')}</label>
        <input name="notes" class="form-control" maxlength="200"></div>
    </div>`,
    submitLabel: t('save'),
    submitClass: 'btn-success',
    onSubmit: async (v) => {
      if (!v.animalId) throw new Error('Select an animal.');
      const weight = num(v.weight);
      if (weight <= 0) throw new Error('Enter a valid weight.');
      const now = nowISO();
      const date = v.date || today();
      const key = v.animalId + '|' + date;
      const rec = {
        id: uuid(), animalId: v.animalId, date, weight,
        notes: clean(v.notes, 200), animalDate: key,
        createdAt: now, updatedAt: now,
      };
      await idb.write(['weightRecords'], async (tx) => tx.add('weightRecords', rec));
      document.dispatchEvent(new CustomEvent('data:changed'));
      return true;
    },
  });
}

export default {
  async render(el, { params }) {
    const $el = $(el);
    const prefillAnimal = params[0] ? decodeURIComponent(params[0]) : null;
    const [from, to] = rangeFor('month');

    $el.html(UI.pageHeader(t('weights'),
      `<button class="btn btn-success btn-sm btn-add"><i class="bi bi-plus-lg"></i> ${t('addWeight')}</button>`) +
      dateFilter(from, to) +
      `<input type="search" class="form-control mb-2 q" placeholder="${t('search')}…">
       <div class="small text-body-secondary mb-2 summary"></div>
       <div class="list-card weight-list"></div>`);

    const draw = async (f = from, t2 = to) => {
      const q = $el.find('.q').val() || '';
      let all = await idb.read(['weightRecords'], (tx) =>
        tx.getAllByIndex('weightRecords', 'date', IDBKeyRange.bound(f, t2 + '￿')));
      if (q) {
        const ql = q.toLowerCase();
        all = all.filter((r) => {
          const a = Catalog.animal(r.animalId);
          return a && (a.tagNo.toLowerCase().includes(ql) || (a.name || '').toLowerCase().includes(ql));
        });
      }
      all.sort((a, b) => b.date.localeCompare(a.date));
      $el.find('.summary').text(`${all.length} records`);
      pager($el.find('.weight-list'), all, (r) => {
        const a = Catalog.animal(r.animalId);
        return `<div class="list-row">
          <div class="main">
            <div class="title">${a ? esc(a.tagNo) + (a.name ? ' — ' + esc(a.name) : '') : '?'}</div>
            <div class="sub">${fmtDate(r.date)}${r.notes ? ' · ' + esc(r.notes) : ''}</div>
          </div>
          <div class="end fw-semibold">${fmtNum(r.weight)} kg</div>
        </div>`;
      }, 60, UI.emptyState(t('noRecords'), 'graph-up',
        `<button class="btn btn-success btn-sm mt-3 btn-add">${t('addWeight')}</button>`));
    };

    bindDateFilter($el, draw);
    $el.on('input', '.q', debounce(draw, 150));
    await draw();
    $el.on('click', '.btn-add', async () => { await addWeightModal(prefillAnimal); await draw(); });

    if (prefillAnimal && params[0]) {
      await addWeightModal(prefillAnimal);
    }
  },
};
