// Minimal promise-based IndexedDB layer with atomic multi-store transactions.
import { upgrade, DB_NAME, DB_VERSION } from './schema.js';

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB is not supported in this browser.'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => upgrade(req.result, e.oldVersion, req.transaction);
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbPromise = null; location.reload(); };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error?.name === 'VersionError'
        ? new Error(`The local database "${DB_NAME}" was created by a newer version of this app. Update the app (reload while online).`)
        : req.error);
    };
    req.onblocked = () => reject(new Error('Database upgrade blocked. Close other tabs of this app and reload.'));
  });
  return dbPromise;
}

const promisify = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

// Wraps an IDBTransaction. Only await these request promises inside tx() callbacks,
// otherwise the browser auto-commits the transaction.
function wrap(t) {
  const s = (name) => t.objectStore(name);
  return {
    raw: t,
    get: (store, key) => promisify(s(store).get(key)),
    getAll: (store, query, count) => promisify(s(store).getAll(query, count)),
    getByIndex: (store, index, key) => promisify(s(store).index(index).get(key)),
    getAllByIndex: (store, index, query, count) => promisify(s(store).index(index).getAll(query, count)),
    countByIndex: (store, index, query) => promisify(s(store).index(index).count(query)),
    put: (store, val) => promisify(s(store).put(val)),
    add: (store, val) => promisify(s(store).add(val)),
    delete: (store, key) => promisify(s(store).delete(key)),
    clear: (store) => promisify(s(store).clear()),
    async deleteByIndex(store, index, key) {
      const keys = await promisify(s(store).index(index).getAllKeys(key));
      for (const k of keys) await promisify(s(store).delete(k));
      return keys.length;
    },
  };
}

export async function tx(stores, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    let t;
    try { t = db.transaction(stores, mode); } catch (e) { return reject(e); }
    let result; let fnError = null;
    t.oncomplete = () => resolve(result);
    t.onabort = () => reject(fnError || t.error || new Error('Transaction aborted'));
    Promise.resolve()
      .then(() => fn(wrap(t)))
      .then((r) => { result = r; }, (err) => { fnError = err; try { t.abort(); } catch { /* already finished */ } });
  });
}

export const read = (stores, fn) => tx(stores, 'readonly', fn);
export const write = (stores, fn) => tx(stores, 'readwrite', fn);

export const get = (store, key) => read([store], (t) => t.get(store, key));
export const getAll = (store, query, count) => read([store], (t) => t.getAll(store, query, count));
export const getAllByIndex = (store, index, query, count) => read([store], (t) => t.getAllByIndex(store, index, query, count));
export const count = (store) => openDB().then((db) => promisify(db.transaction(store).objectStore(store).count()));

// Iterate a whole index range without materialising unneeded values.
export async function each(store, index, range, cb) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const os = db.transaction(store).objectStore(store);
    const req = (index ? os.index(index) : os).openCursor(range);
    req.onsuccess = () => { const c = req.result; if (!c) return resolve(); cb(c.value); c.continue(); };
    req.onerror = () => reject(req.error);
  });
}
