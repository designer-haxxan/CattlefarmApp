// Health events: vaccinations, treatments, checkups, deworming, vitamins.
import * as UI from '../core/ui.js';
import { esc, fmtDate, fmtNum, today, uuid, nowISO, num, clean, lc } from '../core/utils.js';
import * as idb from '../db/idb.js';
import * as Catalog from '../services/catalog.js';
import { t } from '../i18n.js';
import { dateFilter, bindDateFilter, rangeFor, pager } from '../core/views.js';

const $ = window.jQuery;

const TYPES = ['vaccination', 'treatment', 'checkup', 'deworming', 'vitamin', 'otherEvent'];
const TYPE_ICON = { vaccination: 'shield-check', treatment: 'capsule', checkup: 'stethoscope', deworming: 'bug', vitamin: 'droplet', otherEvent: 'bandaid' };
const TYPE_CLASS = { vaccination: 'evt-vaccination', treatment: 'evt-treatment', checkup: 'evt-checkup', deworming: 'evt-deworming', vitamin: 'evt-vitamin', otherEvent: 'evt-other' };

const COMMON_VACCINES = ['FMD', 'HS (Haemorrhagic Septicaemia)', 'BQ (Black Quarter)', 'Anthrax', 'Brucellosis', 'LSD', 'PPR', 'Rabies'];

async function addEventModal(prefillAnimalId = null) {
  const animals = Catalog.searchAnimals('', { status: 'active' });
  const animalOpts = `<option value="">— All active (herd-wide) —</option>` +
    animals.map((a) => `<option value="${esc(a.id)}" ${a.id === prefillAnimalId ? 'selected' : ''}>${esc(a.tagNo)}${a.name ? ' — ' + esc(a.name) : ''}</option>`).join('');
  const vaccineList = COMMON_VACCINES.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('');

  return UI.formModal({
    title: t('addHealthEvent'),
    size: 'lg',
    body: `<div class="row g-2">
      <div class="col-6"><label class="form-label">${t('date')} *</label><input type="date" name="date" class="form-control" value="${today()}" max="${today()}" required></div>
      <div class="col-6"><label class="form-label">${t('animal')}</label><select name="animalId" class="form-select">${animalOpts}</select></div>
      <div class="col-6"><label class="form-label">${t('type')}</label><select name="type" class="form-select">
        ${TYPES.map((tp) => `<option value="${tp}">${esc(t(tp))}</option>`).join('')}
      </select></div>
      <div class="col-6"><label class="form-label">${t('title')}</label>
        <input name="title" class="form-control" list="vaccine-list" maxlength="80">
        <datalist id="vaccine-list">${vaccineList}</datalist>
      </div>
      <div class="col-6"><label class="form-label">${t('medicine')}</label><input name="medicine" class="form-control" maxlength="100"></div>
      <div class="col-6"><label class="form-label">${t('dose')}</label><input name="dose" class="form-control" maxlength="60"></div>
      <div class="col-6"><label class="form-label">${t('vetName')}</label><input name="vetName" class="form-control" maxlength="80"></div>
      <div class="col-6"><label class="form-label">${t('nextDue')}</label><input type="date" name="nextDue" class="form-control"></div>
      <div class="col-6"><label class="form-label">${t('cost')}</label><input name="cost" class="form-control" inputmode="decimal"></div>
      <div class="col-12"><label class="form-label">${t('notes')}</label><textarea name="notes" class="form-control" rows="2"></textarea></div>
    </div>`,
    submitLabel: t('save'),
    submitClass: 'btn-success',
    onSubmit: async (v) => {
      const date = v.date || today();
      const now = nowISO();
      const base = {
        type: v.type, title: clean(v.title, 80), medicine: clean(v.medicine, 100),
        dose: clean(v.dose, 60), vetName: clean(v.vetName, 80),
        nextDue: v.nextDue || '', cost: num(v.cost) || 0,
        notes: clean(v.notes, 500), date, createdAt: now, updatedAt: now,
      };
      const targetAnimals = v.animalId ? [{ id: v.animalId }] : animals;
      await idb.write(['healthEvents'], async (tx) => {
        for (const a of targetAnimals) {
          await tx.add('healthEvents', { id: uuid(), ...base, animalId: a.id });
        }
      });
      document.dispatchEvent(new CustomEvent('data:changed'));
      return true;
    },
  });
}

export default {
  async render(el, { params }) {
    const $el = $(el);
    const prefillAnimal = params[0] ? decodeURIComponent(params[0].replace(/^\?animal=/, '')) : null;
    const [from, to] = rangeFor('month');

    $el.html(UI.pageHeader(t('health'),
      `<button class="btn btn-success btn-sm btn-add"><i class="bi bi-plus-lg"></i> ${t('addHealthEvent')}</button>`) +
      dateFilter(from, to, `<select name="ftype" class="form-select form-select-sm" style="max-width:140px">
        <option value="">All types</option>
        ${TYPES.map((tp) => `<option value="${tp}">${esc(t(tp))}</option>`).join('')}
      </select>`) +
      `<div class="small text-body-secondary mb-2 summary"></div>
       <div class="list-card health-list"></div>`);

    const draw = async (f = from, t2 = to, extra = {}) => {
      let all = await idb.read(['healthEvents'], (tx) =>
        tx.getAllByIndex('healthEvents', 'date', IDBKeyRange.bound(f, t2 + '￿')));
      if (extra.ftype) all = all.filter((r) => r.type === extra.ftype);
      all.sort((a, b) => b.date.localeCompare(a.date));
      $el.find('.summary').text(`${all.length} events`);
      pager($el.find('.health-list'), all, (r) => {
        const a = Catalog.animal(r.animalId);
        return `<div class="list-row">
          <div class="thumb"><i class="bi bi-${TYPE_ICON[r.type] || 'heart-pulse'} ${TYPE_CLASS[r.type] || ''}"></i></div>
          <div class="main">
            <div class="title">${esc(r.title || t(r.type))}</div>
            <div class="sub">${fmtDate(r.date)}${a ? ` · ${esc(a.tagNo)}` : ''}${r.medicine ? ` · ${esc(r.medicine)}` : ''}</div>
            ${r.nextDue ? `<div class="sub text-warning"><i class="bi bi-calendar-event me-1"></i>Next due: ${fmtDate(r.nextDue)}</div>` : ''}
          </div>
          <div class="end">${r.cost ? `<span class="small">${fmtNum(r.cost)}</span>` : ''}</div>
        </div>`;
      }, 60, UI.emptyState(t('noRecords'), 'heart-pulse',
        `<button class="btn btn-success btn-sm mt-3 btn-add">${t('addHealthEvent')}</button>`));
    };

    bindDateFilter($el, (f, t2, fd) => draw(f, t2, fd));
    await draw();

    if (prefillAnimal) {
      await addEventModal(prefillAnimal);
      await draw();
    }

    $el.on('click', '.btn-add', async () => {
      await addEventModal();
      await draw();
    });
  },
};
