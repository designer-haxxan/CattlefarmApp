import { CONFIG } from '../config.js';

export const DB_NAME = `${CONFIG.APP_ID}_db`;
export const LEGACY_DB_NAME = 'cattlefarm_db';
export const DB_VERSION = 2;

// Stores included in backups (all business data).
export const DATA_STORES = [
  'breeds', 'animals', 'milkRecords', 'healthEvents', 'breedingRecords', 'weightRecords',
  'animalTxns', 'milkSales', 'farmExpenses',
  'buyers', 'sellers', 'accounts', 'vouchers', 'entries', 'auditLog', 'meta',
];

const STORES = {
  meta: { keyPath: 'key', indexes: {} },
  breeds: { indexes: { nameLc: 'nameLc', species: 'species' } },
  animals: {
    indexes: {
      tagNo: ['tagNo', true], nameLc: 'nameLc', status: 'status',
      gender: 'gender', species: 'species', motherId: 'motherId',
    },
  },
  milkRecords: {
    indexes: {
      animalId: 'animalId', date: 'date',
      animalDate: 'animalDate',
      dateOnly: 'date',
    },
  },
  healthEvents: {
    indexes: {
      animalId: 'animalId', date: 'date', type: 'type', nextDue: 'nextDue',
    },
  },
  breedingRecords: {
    indexes: {
      animalId: 'animalId', date: 'date',
      pregnancyStatus: 'pregnancyStatus', expectedCalving: 'expectedCalving',
    },
  },
  weightRecords: {
    indexes: {
      animalId: 'animalId', date: 'date',
      animalDate: 'animalDate',
    },
  },
  // Animal buy/sell transactions
  animalTxns: {
    indexes: {
      number: ['number', true], date: 'date',
      animalId: 'animalId', type: 'type', partyId: 'partyId',
    },
  },
  // Milk sold to buyers
  milkSales: {
    indexes: { number: ['number', true], date: 'date', buyerId: 'buyerId' },
  },
  // Farm operating expenses
  farmExpenses: {
    indexes: { number: ['number', true], date: 'date', category: 'category' },
  },
  // Milk buyers / animal buyers
  buyers: { indexes: { nameLc: 'nameLc', phone: 'phone' } },
  // Feed / animal sellers
  sellers: { indexes: { nameLc: 'nameLc', phone: 'phone' } },
  // Chart of accounts (cash, bank, income, expense)
  accounts: { indexes: { type: 'type' } },
  // Cash book entries (receipt / payment / transfer)
  vouchers: { indexes: { number: ['number', true], date: 'date', type: 'type' } },
  // Double-entry ledger rows (source of truth for all balances)
  entries: {
    indexes: {
      accountId: 'accountId', txnId: 'txnId', date: 'date',
      acctDate: [['accountId', 'date'], false],
    },
  },
  auditLog: { indexes: { at: 'at' } },
};

export const SYSTEM_ACCOUNTS = [
  { id: 'cash',         name: 'Cash in Hand',            type: 'cash'    },
  { id: 'bank',         name: 'Bank Account',             type: 'bank'    },
  { id: 'milk_income',  name: 'Milk Sales Revenue',       type: 'income'  },
  { id: 'animal_income',name: 'Animal Sales Revenue',     type: 'income'  },
  { id: 'livestock',    name: 'Livestock / Animals',      type: 'asset'   },
  { id: 'feed_expense', name: 'Feed & Fodder',            type: 'expense' },
  { id: 'vet_expense',  name: 'Vet & Medicine',           type: 'expense' },
  { id: 'labor_expense',name: 'Labor & Wages',            type: 'expense' },
  { id: 'other_expense',name: 'Other Farm Expenses',      type: 'expense' },
  { id: 'equity',       name: 'Opening Balance Equity',   type: 'equity'  },
];

// Default Pakistani cattle breeds
export const DEFAULT_BREEDS = [
  { id: 'sahiwal',    name: 'Sahiwal',          species: 'cattle'  },
  { id: 'nili_ravi',  name: 'Nili-Ravi',         species: 'buffalo' },
  { id: 'cholistani', name: 'Cholistani',         species: 'cattle'  },
  { id: 'frisian',    name: 'Holstein Frisian',   species: 'cattle'  },
  { id: 'jersey',     name: 'Jersey',             species: 'cattle'  },
  { id: 'tharparkar', name: 'Tharparkar',         species: 'cattle'  },
  { id: 'bhagnari',   name: 'Bhagnari',           species: 'cattle'  },
  { id: 'kankrej',    name: 'Kankrej',            species: 'cattle'  },
  { id: 'murrah',     name: 'Murrah',             species: 'buffalo' },
  { id: 'surti',      name: 'Surti',              species: 'buffalo' },
  { id: 'crossbred',  name: 'Crossbred',          species: 'cattle'  },
  { id: 'local',      name: 'Local / Desi',       species: 'cattle'  },
];

export function upgrade(db, oldVersion, t) {
  if (oldVersion < 2 && oldVersion >= 1) {
    // Fix animalDate: was compound ['animalId','date'], must be simple string field index
    const mr = t.objectStore('milkRecords');
    mr.deleteIndex('animalDate');
    mr.createIndex('animalDate', 'animalDate', { unique: false });
    const wr = t.objectStore('weightRecords');
    wr.deleteIndex('animalDate');
    wr.createIndex('animalDate', 'animalDate', { unique: false });
  }
  if (oldVersion < 1) {
    for (const [name, def] of Object.entries(STORES)) {
      const os = db.createObjectStore(name, { keyPath: def.keyPath || 'id' });
      for (const [idx, spec] of Object.entries(def.indexes || {})) {
        const [keyPath, unique] = Array.isArray(spec) ? spec : [spec, false];
        os.createIndex(idx, keyPath, { unique: !!unique });
      }
    }
    const now = new Date().toISOString();
    const acc = t.objectStore('accounts');
    for (const a of SYSTEM_ACCOUNTS) acc.put({ ...a, system: true, active: 1, createdAt: now, updatedAt: now });
    const br = t.objectStore('breeds');
    for (const b of DEFAULT_BREEDS) br.put({ ...b, nameLc: b.name.toLowerCase(), createdAt: now, updatedAt: now });
    t.objectStore('meta').put({ key: 'schemaVersion', value: 1 });
    t.objectStore('meta').put({ key: 'createdAt', value: now });
  }
}
