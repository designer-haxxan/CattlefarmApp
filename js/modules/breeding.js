// Breeding & pregnancy records: heat, insemination, pregnancy checks, calving.
import * as UI from '../core/ui.js';
import { esc, fmtDate, fmtNum, today, uuid, nowISO, num, clean } from '../core/utils.js';
import * as idb from '../db/idb.js';
import * as Catalog from '../services/catalog.js';
import { t } from '../i18n.js';
import { CONFIG } from '../config.js';
import { dateFilter, bindDateFilter, rangeFor, pager } from '../core/views.js';

const $ = window.jQuery;

const TYPES = ['heat', 'insemination', 'pregnancy_check', 'calving', 'abortion', 'dry'];
const PREGNANCY_STATUSES = ['open', 'pregnant', 'calved', 'aborted'];

function daysFromNow(dateStr) {
  if (!dateStr) return null;
  const diff = (new Date(dateStr).getTime() - Date.now()) / 86400000;
  return Math.round(diff);
}
function progressBar(pct) {
  const w = Math.min(100, Math.max(0, pct));
  const cls = w > 85 ? 'bg-danger' : w > 60 ? 'bg-warning' : 'bg-success';
  return `<div class="progress pregnancy-bar mt-1" style="height:6px"><div class="progress-bar ${cls}" style="width:${w}%"></div></div>`;
}

function calcExpectedCalving(inseminationDate, species) {
  const days = (species === 'buffalo' || species === 'murrah') ? CONFIG.GESTATION.buffalo : CONFIG.GESTATION.cattle;
  const d = new Date(inseminationDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function addBreedingModal(prefillAnimalId = null) {
  const females = Catalog.searchAnimals('', { status: 'active', gender: 'female' });
  const animalOpts = `<option value="">— select —</option>` +
    females.map((a) => `<option value="${esc(a.id)}" ${a.id === prefillAnimalId ? 'selected' : ''}>${esc(a.tagNo)}${a.name ? ' — ' + esc(a.name) : ''}</option>`).join('');

  return UI.formModal({
    title: t('addBreedingRecord'),
    size: 'lg',
    body: `<div class="row g-2">
      <div class="col-6"><label class="form-label">${t('animal')} *</label>
        <select name="animalId" class="form-select" required>${animalOpts}</select></div>
      <div class="col-6"><label class="form-label">${t('date')} *</label>
        <input type="date" name="date" class="form-control" value="${today()}" max="${today()}" required></div>
      <div class="col-12"><label class="form-label">${t('type')}</label>
        <select name="type" class="form-select breed-type">
          ${TYPES.map((tp) => `<option value="${tp}">${esc(t(tp === 'pregnancy_check' ? 'pregnancyCheck' : tp === 'dry' ? 'dryOff' : tp))}</option>`).join('')}
        </select></div>
      <div class="insemination-fields"><div class="col-12 col-md-6"><label class="form-label">${t('bullDesc')}</label><input name="bullDesc" class="form-control" maxlength="100"></div></div>
      <div class="pregnancy-check-fields d-none"><label class="form-label">${t('pregnancyStatus')}</label>
        <select name="pregnancyStatus" class="form-select">
          ${PREGNANCY_STATUSES.map((ps) => `<option value="${ps}">${esc(t(ps))}</option>`).join('')}
        </select></div>
      <div class="calving-fields d-none row g-2">
        <div class="col-6"><label class="form-label">${t('calfGender')}</label>
          <select name="calfGender" class="form-select"><option value="">—</option><option value="female">${t('female')}</option><option value="male">${t('male')}</option></select></div>
        <div class="col-6"><label class="form-label">Add calf to herd?</label>
          <select name="addCalf" class="form-select"><option value="">No</option><option value="yes">Yes — add new animal</option></select></div>
      </div>
      <div class="col-12"><label class="form-label">${t('notes')}</label><textarea name="notes" class="form-control" rows="2"></textarea></div>
    </div>`,
    submitLabel: t('save'),
    submitClass: 'btn-success',
    onShown: ($m) => {
      const toggleFields = () => {
        const tp = $m.find('.breed-type').val();
        $m.find('.insemination-fields').toggleClass('d-none', tp !== 'insemination' && tp !== 'heat');
        $m.find('.pregnancy-check-fields').toggleClass('d-none', tp !== 'pregnancy_check');
        $m.find('.calving-fields').toggleClass('d-none', tp !== 'calving');
      };
      $m.on('change', '.breed-type', toggleFields);
      toggleFields();
    },
    onSubmit: async (v) => {
      if (!v.animalId) throw new Error('Select an animal.');
      const animal = Catalog.animal(v.animalId);
      const now = nowISO();
      const rec = {
        id: uuid(), animalId: v.animalId, date: v.date || today(),
        type: v.type, bullDesc: clean(v.bullDesc, 100), notes: clean(v.notes, 500),
        pregnancyStatus: v.type === 'pregnancy_check' ? v.pregnancyStatus : '',
        expectedCalving: v.type === 'insemination' ? calcExpectedCalving(v.date, animal?.species) : '',
        calfGender: v.calfGender || '',
        createdAt: now, updatedAt: now,
      };
      await idb.write(['breedingRecords'], async (tx) => {
        await tx.add('breedingRecords', rec);
      });

      // If calving and user wants to add calf to herd
      if (v.type === 'calving' && v.addCalf === 'yes') {
        await import('./animals.js'); // trigger lazy load so catalog is available
      }

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

    // Two tabs: records + pregnant animals
    $el.html(UI.pageHeader(t('breeding'),
      `<button class="btn btn-success btn-sm btn-add"><i class="bi bi-plus-lg"></i> ${t('addBreedingRecord')}</button>`) +
      `<ul class="nav nav-tabs mb-3">
        <li class="nav-item"><button class="nav-link active" data-view="records">${t('breedingRecord')}</button></li>
        <li class="nav-item"><button class="nav-link" data-view="pregnant">${t('pregnantAnimals')}</button></li>
      </ul>
      <div id="breed-content"></div>`);

    const showView = async (view) => {
      $el.find('[data-view]').removeClass('active');
      $el.find(`[data-view="${view}"]`).addClass('active');
      const $c = $el.find('#breed-content');

      if (view === 'records') {
        $c.html(dateFilter(from, to) + `<div class="small text-body-secondary mb-2 summary"></div><div class="list-card breed-list"></div>`);
        const draw = async (f = from, t2 = to) => {
          const all = (await idb.read(['breedingRecords'], (tx) =>
            tx.getAllByIndex('breedingRecords', 'date', IDBKeyRange.bound(f, t2 + '￿'))))
            .sort((a, b) => b.date.localeCompare(a.date));
          $c.find('.summary').text(`${all.length} records`);
          pager($c.find('.breed-list'), all, (r) => {
            const a = Catalog.animal(r.animalId);
            return `<div class="list-row">
              <div class="main">
                <div class="title">${esc(t(r.type === 'pregnancy_check' ? 'pregnancyCheck' : r.type === 'dry' ? 'dryOff' : r.type))}</div>
                <div class="sub">${fmtDate(r.date)}${a ? ` · ${esc(a.tagNo)}` : ''}${r.bullDesc ? ` · ${esc(r.bullDesc)}` : ''}</div>
                ${r.expectedCalving ? `<div class="sub text-warning"><i class="bi bi-calendar me-1"></i>${t('expectedCalving')}: ${fmtDate(r.expectedCalving)}</div>` : ''}
              </div>
              <div class="end">${r.pregnancyStatus ? `<span class="badge bg-success">${esc(t(r.pregnancyStatus))}</span>` : ''}</div>
            </div>`;
          }, 60, UI.emptyState(t('noRecords'), 'arrow-repeat'));
        };
        bindDateFilter($c, draw);
        await draw();
      } else {
        // Pregnant animals view
        const pregRecs = await idb.getAllByIndex('breedingRecords', 'pregnancyStatus', 'pregnant');
        // Also include those with expectedCalving set (from insemination) and no subsequent pregnancy_check
        const insemRecs = (await idb.getAll('breedingRecords'))
          .filter((r) => r.type === 'insemination' && r.expectedCalving);
        // Deduplicate by animal - take most recent per animal
        const animalMap = {};
        [...insemRecs, ...pregRecs].forEach((r) => {
          if (!animalMap[r.animalId] || r.date > animalMap[r.animalId].date) animalMap[r.animalId] = r;
        });
        const list = Object.values(animalMap).sort((a, b) => (a.expectedCalving || '').localeCompare(b.expectedCalving || ''));

        $c.html(list.length ? list.map((r) => {
          const a = Catalog.animal(r.animalId);
          const daysLeft = daysFromNow(r.expectedCalving);
          const gestDays = a?.species === 'buffalo' ? CONFIG.GESTATION.buffalo : CONFIG.GESTATION.cattle;
          const pct = r.expectedCalving ? Math.round(100 - (daysLeft / gestDays * 100)) : 0;
          return `<div class="card mb-2"><div class="card-body py-2">
            <div class="d-flex justify-content-between align-items-start">
              <div><a href="#/animals/${encodeURIComponent(r.animalId)}" class="fw-semibold text-decoration-none">${a ? esc(a.tagNo) : '?'}${a?.name ? ' — ' + esc(a.name) : ''}</a>
                <div class="small text-body-secondary">${t('expectedCalving')}: ${r.expectedCalving ? fmtDate(r.expectedCalving) : '—'}</div>
              </div>
              <div class="text-end small">${daysLeft !== null ? (daysLeft <= 0 ? '<span class="badge bg-danger">Overdue</span>' : `<span class="fw-semibold">${daysLeft}d left</span>`) : ''}</div>
            </div>
            ${r.expectedCalving ? progressBar(pct) : ''}
          </div></div>`;
        }).join('') : UI.emptyState(t('pregnantAnimals'), 'arrow-repeat'));
      }
    };

    $el.on('click', '[data-view]', (e) => showView($(e.currentTarget).data('view')));
    $el.on('click', '.btn-add', async () => { await addBreedingModal(); await showView('records'); });
    await showView('records');

    if (prefillAnimal) {
      await addBreedingModal(prefillAnimal);
    }
  },
};
