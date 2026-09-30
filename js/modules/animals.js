// Animal herd management: list, add/edit, detail with tabs.
import * as UI from '../core/ui.js';
import { esc, fmtDate, fmtNum, today, uuid, nowISO, clean, lc, num, debounce } from '../core/utils.js';
import * as idb from '../db/idb.js';
import * as Catalog from '../services/catalog.js';
import { t } from '../i18n.js';
import { getSettings } from '../core/settings.js';
import { pager } from '../core/views.js';

const $ = window.jQuery;
const SPECIES = ['cattle', 'buffalo', 'goat', 'sheep', 'other'];

function compressImage(file, maxSide = 600, quality = 0.75) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}
const GENDERS = ['female', 'male'];
const STATUSES = ['active', 'sold', 'dead', 'culled'];

function statusBadge(s) {
  const cls = { active: 'badge-active', sold: 'badge-sold', dead: 'badge-dead', culled: 'badge-culled' };
  return `<span class="badge ${cls[s] || 'bg-secondary'}">${esc(t(s))}</span>`;
}
function genderBadge(g) {
  return `<span class="badge ${g === 'female' ? 'badge-female' : 'badge-male'}">${esc(t(g))}</span>`;
}
function ageStr(dob) {
  if (!dob) return '—';
  const ms = Date.now() - new Date(dob).getTime();
  const days = Math.floor(ms / 86400000);
  if (days < 30) return days + ' days';
  const months = Math.floor(days / 30.44);
  if (months < 24) return months + ' months';
  return (months / 12).toFixed(1) + ' years';
}

// Animal form (add / edit)
async function editAnimal(animal = null) {
  const a = animal || {};
  const breeds = Catalog.allBreeds();
  const allActive = Catalog.searchAnimals('', { status: 'active' });
  const mothers = allActive.filter((x) => x.gender === 'female' && x.id !== a.id);

  const breedOpts = `<option value="">— select —</option>` +
    breeds.map((b) => `<option value="${esc(b.id)}" ${b.id === a.breed ? 'selected' : ''}>${esc(b.name)}</option>`).join('');
  const motherOpts = `<option value="">— none —</option>` +
    mothers.map((m) => `<option value="${esc(m.id)}" ${m.id === a.motherId ? 'selected' : ''}>${esc(m.tagNo)} ${esc(m.name || '')}</option>`).join('');

  return UI.formModal({
    title: animal ? t('editAnimal') : t('addAnimal'),
    size: 'lg',
    body: `<div class="row g-2">
      <div class="col-12">
        <div class="d-flex align-items-center gap-3 mb-1">
          <div class="animal-photo-preview thumb" style="width:72px;height:72px;border-radius:10px;overflow:hidden;flex-shrink:0">
            ${a.photo ? `<img src="${esc(a.photo)}" style="width:100%;height:100%;object-fit:cover">` : `<i class="bi bi-camera fs-4"></i>`}
          </div>
          <div class="flex-grow-1">
            <label class="form-label mb-1">${t('photo')}</label>
            <input type="file" name="photoFile" class="form-control form-control-sm photo-input" accept="image/*">
            <div class="form-text">${t('photoHint')}</div>
          </div>
        </div>
      </div>
      <div class="col-6"><label class="form-label">${t('tagNo')} *</label><input name="tagNo" class="form-control" required maxlength="30" value="${esc(a.tagNo)}"></div>
      <div class="col-6"><label class="form-label">${t('name')}</label><input name="name" class="form-control" maxlength="60" value="${esc(a.name)}"></div>
      <div class="col-6"><label class="form-label">${t('species')}</label><select name="species" class="form-select">
        ${SPECIES.map((s) => `<option value="${s}" ${s === (a.species || 'cattle') ? 'selected' : ''}>${esc(t(s))}</option>`).join('')}
      </select></div>
      <div class="col-6"><label class="form-label">${t('breed')}</label><select name="breed" class="form-select">${breedOpts}</select></div>
      <div class="col-6"><label class="form-label">${t('gender')}</label><select name="gender" class="form-select">
        ${GENDERS.map((g) => `<option value="${g}" ${g === (a.gender || 'female') ? 'selected' : ''}>${esc(t(g))}</option>`).join('')}
      </select></div>
      <div class="col-6"><label class="form-label">${t('dob')}</label><input type="date" name="dob" class="form-control" value="${esc(a.dob)}" max="${today()}"></div>
      <div class="col-6"><label class="form-label">${t('color')}</label><input name="color" class="form-control" maxlength="60" value="${esc(a.color)}"></div>
      <div class="col-6"><label class="form-label">${t('mother')}</label><select name="motherId" class="form-select">${motherOpts}</select></div>
      <div class="col-12"><label class="form-label">${t('father')}</label><input name="fatherDesc" class="form-control" placeholder="Name / AI semen" maxlength="80" value="${esc(a.fatherDesc)}"></div>
      <div class="col-6"><label class="form-label">${t('purchaseDate')}</label><input type="date" name="purchaseDate" class="form-control" value="${esc(a.purchaseDate)}"></div>
      <div class="col-6"><label class="form-label">${t('purchasePrice')}</label><input name="purchasePrice" class="form-control" inputmode="decimal" value="${a.purchasePrice || ''}"></div>
      ${animal ? `<div class="col-6"><label class="form-label">${t('status')}</label><select name="status" class="form-select">
        ${STATUSES.map((s) => `<option value="${s}" ${s === a.status ? 'selected' : ''}>${esc(t(s))}</option>`).join('')}
      </select></div>` : ''}
      <div class="col-12"><label class="form-label">${t('notes')}</label><textarea name="notes" class="form-control" rows="2">${esc(a.notes)}</textarea></div>
    </div>`,
    onShown: ($m) => {
      $m.on('change', '.photo-input', function () {
        const file = this.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
          const preview = $m.find('.animal-photo-preview');
          preview.html(`<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover">`);
        };
        reader.readAsDataURL(file);
      });
    },
    onSubmit: async (v) => {
      const tagNo = clean(v.tagNo, 30);
      if (!tagNo) throw new Error('Tag number is required.');
      // Check for duplicate tag
      const existing = (await idb.getAllByIndex('animals', 'tagNo', tagNo)).filter((x) => x.id !== (a.id || ''));
      if (existing.length) throw new Error(`Tag number "${tagNo}" already exists.`);
      // Compress photo if a new file was selected
      let photo = a.photo || null;
      if (v.photoFile instanceof File && v.photoFile.size > 0) {
        photo = await compressImage(v.photoFile);
      }
      const id = a.id || uuid();
      const now = nowISO();
      const rec = {
        ...(a || {}), id, tagNo, name: clean(v.name, 60),
        species: v.species, breed: v.breed || '', gender: v.gender,
        dob: v.dob || '', color: clean(v.color, 60), motherId: v.motherId || '',
        fatherDesc: clean(v.fatherDesc, 80),
        purchaseDate: v.purchaseDate || '', purchasePrice: num(v.purchasePrice) || 0,
        status: v.status || 'active', notes: clean(v.notes, 500),
        photo,
        nameLc: lc(v.name || tagNo), createdAt: a.createdAt || now, updatedAt: now,
      };
      await idb.write(['animals'], (t2) => t2.put('animals', rec));
      await Catalog.refreshAnimal(id);
      document.dispatchEvent(new CustomEvent('data:changed'));
      return rec;
    },
  });
}

// ---- List view ----
async function renderList(el) {
  const $el = $(el);
  $el.html(UI.pageHeader(t('animals'), `<button class="btn btn-success btn-sm btn-add"><i class="bi bi-plus-lg"></i> ${t('add')}</button>`) + `
    <div class="filters">
      <input type="search" class="form-control flex-grow-2 q" placeholder="${t('search')}…">
      <select class="form-select f-species"><option value="">All Species</option>${SPECIES.map((s) => `<option value="${s}">${esc(t(s))}</option>`).join('')}</select>
      <select class="form-select f-gender"><option value="">All Genders</option>${GENDERS.map((g) => `<option value="${g}">${esc(t(g))}</option>`).join('')}</select>
      <select class="form-select f-status"><option value="active">${t('active')}</option><option value="">All</option>${STATUSES.map((s) => `<option value="${s}">${esc(t(s))}</option>`).join('')}</select>
    </div>
    <div class="small text-body-secondary mb-2 summary"></div>
    <div class="list-card animal-list"></div>`);

  const draw = async () => {
    const q = $el.find('.q').val();
    const sp = $el.find('.f-species').val();
    const ge = $el.find('.f-gender').val();
    const st = $el.find('.f-status').val();
    const list = Catalog.searchAnimals(q, { status: st || null, gender: ge || null, species: sp || null });
    $el.find('.summary').text(`${list.length} animals`);
    pager($el.find('.animal-list'), list, (a) => {
      const breedName = Catalog.breed(a.breed)?.name || a.breed || '';
      const thumbContent = a.photo
        ? `<img src="${esc(a.photo)}" style="width:100%;height:100%;object-fit:cover;border-radius:8px">`
        : `<i class="bi bi-${a.species === 'buffalo' ? 'bug' : 'heart-pulse'} ${a.gender === 'female' ? 'text-pink' : ''}"></i>`;
      return `<a class="list-row" href="#/animals/${encodeURIComponent(a.id)}">
        <div class="thumb">${thumbContent}</div>
        <div class="main">
          <div class="title">${esc(a.tagNo)}${a.name ? ` — ${esc(a.name)}` : ''}</div>
          <div class="sub">${esc(t(a.species))} · ${esc(breedName)} · ${esc(t(a.gender))} · ${esc(ageStr(a.dob))}</div>
        </div>
        <div class="end">${statusBadge(a.status)}</div></a>`;
    }, 60, UI.emptyState(t('noRecords'), 'collection', `<button class="btn btn-success btn-sm mt-3 btn-add">${t('addAnimal')}</button>`));
  };
  await draw();
  $el.on('input', '.q', debounce(draw, 150));
  $el.on('change', '.f-species, .f-gender, .f-status', draw);
  $el.on('click', '.btn-add', async () => {
    const a = await editAnimal();
    if (a) location.hash = `#/animals/${a.id}`;
  });
  document.addEventListener('data:changed', draw);
  return () => document.removeEventListener('data:changed', draw);
}

// ---- Detail view ----
async function renderDetail(el, id) {
  const $el = $(el).off();
  let a = Catalog.animal(id);
  if (!a) { $el.html(UI.emptyState('Animal not found', 'question-circle')); return; }

  const breedName = Catalog.breed(a.breed)?.name || a.breed || '—';
  const motherName = a.motherId ? (Catalog.animal(a.motherId)?.tagNo || '?') : '—';

  $el.html(`
    ${UI.pageHeader(`${esc(a.tagNo)}${a.name ? ' — ' + esc(a.name) : ''}`,
      `<button class="btn btn-light btn-sm btn-edit" title="${t('edit')}"><i class="bi bi-pencil"></i></button>
       <button class="btn btn-outline-danger btn-sm btn-del" title="${t('delete')}"><i class="bi bi-trash"></i></button>`,
      '#/animals')}
    <div class="card mb-3"><div class="card-body">
      ${a.photo ? `<div class="text-center mb-3"><img src="${esc(a.photo)}" alt="${esc(a.name || a.tagNo)}" style="max-height:220px;max-width:100%;border-radius:12px;object-fit:cover"></div>` : ''}
      <div class="row g-2 small">
        <div class="col-6 col-md-3"><div class="text-body-secondary">${t('species')}</div><div class="fw-semibold">${esc(t(a.species))}</div></div>
        <div class="col-6 col-md-3"><div class="text-body-secondary">${t('breed')}</div><div class="fw-semibold">${esc(breedName)}</div></div>
        <div class="col-6 col-md-3"><div class="text-body-secondary">${t('gender')}</div><div>${genderBadge(a.gender)}</div></div>
        <div class="col-6 col-md-3"><div class="text-body-secondary">${t('status')}</div><div>${statusBadge(a.status)}</div></div>
        <div class="col-6 col-md-3"><div class="text-body-secondary">${t('dob')}</div><div class="fw-semibold">${a.dob ? fmtDate(a.dob) : '—'} (${ageStr(a.dob)})</div></div>
        <div class="col-6 col-md-3"><div class="text-body-secondary">${t('color')}</div><div class="fw-semibold">${esc(a.color || '—')}</div></div>
        <div class="col-6 col-md-3"><div class="text-body-secondary">${t('mother')}</div><div class="fw-semibold">${a.motherId ? `<a href="#/animals/${encodeURIComponent(a.motherId)}">${esc(motherName)}</a>` : '—'}</div></div>
        <div class="col-6 col-md-3"><div class="text-body-secondary">${t('father')}</div><div class="fw-semibold">${esc(a.fatherDesc || '—')}</div></div>
        ${a.purchaseDate ? `<div class="col-6 col-md-3"><div class="text-body-secondary">${t('purchaseDate')}</div><div class="fw-semibold">${fmtDate(a.purchaseDate)}</div></div>` : ''}
        ${a.purchasePrice ? `<div class="col-6 col-md-3"><div class="text-body-secondary">${t('purchasePrice')}</div><div class="fw-semibold">${fmtNum(a.purchasePrice)}</div></div>` : ''}
        ${a.notes ? `<div class="col-12"><div class="text-body-secondary">${t('notes')}</div><div>${esc(a.notes)}</div></div>` : ''}
      </div>
    </div></div>

    <ul class="nav nav-tabs detail-tabs mb-3" id="animal-tabs">
      <li class="nav-item"><button class="nav-link active" data-tab="milk">${t('milk')}</button></li>
      ${a.gender === 'female' ? `<li class="nav-item"><button class="nav-link" data-tab="breeding">${t('breeding')}</button></li>` : ''}
      <li class="nav-item"><button class="nav-link" data-tab="health">${t('health')}</button></li>
      <li class="nav-item"><button class="nav-link" data-tab="weights">${t('weights')}</button></li>
    </ul>
    <div id="tab-content"></div>`);

  const showTab = async (tab) => {
    $el.find('.nav-link').removeClass('active');
    $el.find(`[data-tab="${tab}"]`).addClass('active');
    const $c = $el.find('#tab-content').html(UI.spinner());
    try {
      if (tab === 'milk') await renderMilkTab($c, id);
      else if (tab === 'breeding') await renderBreedingTab($c, id, a.species);
      else if (tab === 'health') await renderHealthTab($c, id);
      else if (tab === 'weights') await renderWeightsTab($c, id);
    } catch (e) { $c.html(UI.errorState(e)); }
  };

  $el.on('click', '[data-tab]', (e) => showTab($(e.currentTarget).data('tab')));
  $el.on('click', '.btn-edit', async () => {
    const updated = await editAnimal(Catalog.animal(id));
    if (updated) { a = updated; await renderDetail(el, id); }
  });
  $el.on('click', '.btn-del', async () => {
    if (!await UI.confirmDialog(`Delete animal ${a.tagNo}? All records (milk, health, breeding) will also be deleted.`, { okLabel: 'Delete', okClass: 'btn-danger' })) return;
    await idb.write(['animals', 'milkRecords', 'healthEvents', 'breedingRecords', 'weightRecords'], async (tx) => {
      await tx.delete('animals', id);
      await tx.deleteByIndex('milkRecords', 'animalId', id);
      await tx.deleteByIndex('healthEvents', 'animalId', id);
      await tx.deleteByIndex('breedingRecords', 'animalId', id);
      await tx.deleteByIndex('weightRecords', 'animalId', id);
    });
    await Catalog.refreshAnimal(id);
    UI.toast('Animal deleted');
    location.hash = '#/animals';
  });

  await showTab('milk');
}

async function renderMilkTab($c, animalId) {
  const records = (await idb.getAllByIndex('milkRecords', 'animalId', animalId))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 30);
  const total = records.reduce((s, r) => s + (r.total || 0), 0);
  const avg = records.length ? (total / records.length).toFixed(1) : 0;
  $c.html(`
    <div class="d-flex gap-2 mb-2">
      <div class="flex-grow-1 small text-body-secondary">${records.length} records · Avg ${avg} L/day</div>
      <a href="#/milk" class="btn btn-success btn-sm">${t('addMilkRecord')}</a>
    </div>
    ${records.length ? `<div class="list-card">${records.map((r) => `<div class="list-row">
      <div class="main"><div class="title">${fmtDate(r.date)}</div><div class="sub">Morning: ${fmtNum(r.morning || 0)} L · Evening: ${fmtNum(r.evening || 0)} L</div></div>
      <div class="end fw-semibold">${fmtNum(r.total || 0)} L</div></div>`).join('')}</div>`
      : UI.emptyState('No milk records yet', 'droplet')}`);
}

async function renderBreedingTab($c, animalId, species) {
  const records = (await idb.getAllByIndex('breedingRecords', 'animalId', animalId))
    .sort((a, b) => b.date.localeCompare(a.date));
  const TYPE_ICON = { heat: 'fire', insemination: 'gender-ambiguous', pregnancy_check: 'search', calving: 'star', abortion: 'x-circle', dry: 'moon' };
  const TYPE_COLOR = { heat: 'text-danger', insemination: 'text-primary', pregnancy_check: 'text-success', calving: 'text-warning', abortion: 'text-secondary', dry: 'text-body-secondary' };
  $c.html(`
    <div class="d-flex gap-2 mb-2">
      <div class="flex-grow-1"></div>
      <a href="#/breeding?animal=${encodeURIComponent(animalId)}" class="btn btn-success btn-sm">${t('addBreedingRecord')}</a>
    </div>
    ${records.length ? `<ul class="timeline">${records.map((r) => `<li class="timeline-item">
      <div class="timeline-dot bg-body border"><i class="bi bi-${TYPE_ICON[r.type] || 'circle'} ${TYPE_COLOR[r.type] || ''}"></i></div>
      <div class="timeline-body">
        <div class="tl-title">${esc(t(r.type === 'pregnancy_check' ? 'pregnancyCheck' : r.type === 'dry' ? 'dryOff' : r.type))}</div>
        <div class="tl-meta">${fmtDate(r.date)}${r.bullDesc ? ` · ${esc(r.bullDesc)}` : ''}${r.pregnancyStatus ? ` · ${esc(t(r.pregnancyStatus))}` : ''}</div>
        ${r.expectedCalving ? `<div class="tl-meta"><i class="bi bi-calendar me-1"></i>${t('expectedCalving')}: ${fmtDate(r.expectedCalving)}</div>` : ''}
        ${r.notes ? `<div class="small mt-1">${esc(r.notes)}</div>` : ''}
      </div></li>`).join('')}</ul>`
      : UI.emptyState('No breeding records', 'arrow-repeat')}`);
}

async function renderHealthTab($c, animalId) {
  const records = (await idb.getAllByIndex('healthEvents', 'animalId', animalId))
    .sort((a, b) => b.date.localeCompare(a.date));
  const TYPE_ICON = { vaccination: 'shield-check', treatment: 'capsule', checkup: 'stethoscope', deworming: 'bug', vitamin: 'droplet', other: 'bandaid' };
  $c.html(`
    <div class="d-flex gap-2 mb-2">
      <div class="flex-grow-1"></div>
      <a href="#/health?animal=${encodeURIComponent(animalId)}" class="btn btn-success btn-sm">${t('addHealthEvent')}</a>
    </div>
    ${records.length ? `<ul class="timeline">${records.map((r) => `<li class="timeline-item">
      <div class="timeline-dot bg-body border"><i class="bi bi-${TYPE_ICON[r.type] || 'heart-pulse'} evt-${r.type}"></i></div>
      <div class="timeline-body">
        <div class="tl-title">${esc(r.title || t(r.type))}</div>
        <div class="tl-meta">${fmtDate(r.date)}${r.medicine ? ` · ${esc(r.medicine)}` : ''}${r.vetName ? ` · Dr. ${esc(r.vetName)}` : ''}</div>
        ${r.nextDue ? `<div class="tl-meta text-warning"><i class="bi bi-calendar-event me-1"></i>Next due: ${fmtDate(r.nextDue)}</div>` : ''}
        ${r.cost ? `<div class="tl-meta">Cost: ${fmtNum(r.cost)}</div>` : ''}
      </div></li>`).join('')}</ul>`
      : UI.emptyState('No health records', 'heart-pulse')}`);
}

async function renderWeightsTab($c, animalId) {
  const records = (await idb.getAllByIndex('weightRecords', 'animalId', animalId))
    .sort((a, b) => b.date.localeCompare(a.date));
  const latest = records[0];
  const prev = records[1];
  const change = latest && prev ? (latest.weight - prev.weight).toFixed(1) : null;
  $c.html(`
    <div class="d-flex gap-2 mb-2">
      ${latest ? `<div class="flex-grow-1 small fw-semibold">${t('latestWeight')}: ${fmtNum(latest.weight)} kg${change !== null ? ` (${change > 0 ? '+' : ''}${change} kg)` : ''}</div>` : '<div class="flex-grow-1"></div>'}
      <a href="#/weights?animal=${encodeURIComponent(animalId)}" class="btn btn-success btn-sm">${t('addWeight')}</a>
    </div>
    ${records.length ? `<div class="list-card">${records.map((r) => `<div class="list-row">
      <div class="main"><div class="title">${fmtDate(r.date)}</div>${r.notes ? `<div class="sub">${esc(r.notes)}</div>` : ''}</div>
      <div class="end fw-semibold">${fmtNum(r.weight)} kg</div></div>`).join('')}</div>`
      : UI.emptyState('No weight records', 'graph-up')}`);
}

export default {
  async render(el, { params }) {
    if (params[0]) await renderDetail(el, params[0]);
    else return renderList(el);
  },
};
