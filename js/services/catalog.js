// In-memory cache: animals, breeds, buyers, sellers for instant search.
import * as idb from '../db/idb.js';
import { lc } from '../core/utils.js';

const animals = new Map();
const breeds = new Map();
const buyers = new Map();
const sellers = new Map();

function indexAnimal(a) {
  a._s = lc([a.tagNo, a.name, a.breed, a.species].filter(Boolean).join(' '));
  animals.set(a.id, a);
}

export async function load() {
  const [as, bs, buys, sels] = await idb.read(
    ['animals', 'breeds', 'buyers', 'sellers'],
    (t) => Promise.all([t.getAll('animals'), t.getAll('breeds'), t.getAll('buyers'), t.getAll('sellers')]),
  );
  animals.clear(); breeds.clear(); buyers.clear(); sellers.clear();
  bs.forEach((b) => breeds.set(b.id, b));
  as.forEach(indexAnimal);
  buys.forEach((b) => buyers.set(b.id, b));
  sels.forEach((s) => sellers.set(s.id, s));
}

export async function refreshAnimal(id) {
  const a = await idb.get('animals', id);
  if (a) indexAnimal(a); else animals.delete(id);
}
export async function refreshBreeds() {
  const bs = await idb.getAll('breeds');
  breeds.clear(); bs.forEach((b) => breeds.set(b.id, b));
  animals.forEach(indexAnimal);
}
export async function refreshParty(kind, id) {
  const map = kind === 'buyers' ? buyers : sellers;
  const p = await idb.get(kind, id);
  if (p) map.set(id, p); else map.delete(id);
}

export const animal = (id) => animals.get(id);
export const allAnimals = () => [...animals.values()];
export const breed = (id) => breeds.get(id);
export const allBreeds = () => [...breeds.values()].sort((a, b) => a.name.localeCompare(b.name));
export const party = (kind, id) => (kind === 'buyers' ? buyers : sellers).get(id);
export const allParties = (kind) => [...(kind === 'buyers' ? buyers : sellers).values()];

export function searchAnimals(q, { status = null, gender = null, species = null } = {}) {
  const terms = lc(q).split(/\s+/).filter(Boolean);
  return allAnimals().filter((a) => {
    if (status && a.status !== status) return false;
    if (gender && a.gender !== gender) return false;
    if (species && a.species !== species) return false;
    return !terms.length || terms.every((t) => a._s.includes(t));
  }).sort((a, b) => (a.tagNo || '').localeCompare(b.tagNo || '') || (a.name || '').localeCompare(b.name || ''));
}

export function searchParties(kind, q, limit = 50) {
  const terms = lc(q).split(/\s+/).filter(Boolean);
  return allParties(kind)
    .filter((p) => p.active && terms.every((term) => lc(`${p.name} ${p.phone || ''}`).includes(term)))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, limit);
}
