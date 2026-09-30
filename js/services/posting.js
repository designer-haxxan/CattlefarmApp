// Farm posting engine: double-entry accounting for milk sales, animal transactions,
// expenses, cash book, and party management. All operations are atomic IndexedDB transactions.
import * as idb from '../db/idb.js';
import { uuid, round2, num, nowISO, today, AppError, clean, lc } from '../core/utils.js';
import { getSettings } from '../core/settings.js';
import * as Catalog from './catalog.js';

const EPS = 0.005;

export const ACCOUNT_TYPES = {
  cash: 'Cash', bank: 'Bank / Wallet', income: 'Income',
  expense: 'Expense', asset: 'Other Asset', liability: 'Liability', equity: 'Equity',
};
const DEBIT_NORMAL = new Set(['cash', 'bank', 'asset', 'expense', 'buyer']);
export const isDebitNormal = (type) => DEBIT_NORMAL.has(type);

// B: prefix for buyer (receivable), S: for seller (payable)
export const partyAccount = (kind, id) => (kind === 'buyers' ? 'B:' : 'S:') + id;
export function parseAccount(accId) {
  if (accId?.startsWith('B:')) return { kind: 'buyers', id: accId.slice(2), type: 'buyer' };
  if (accId?.startsWith('S:')) return { kind: 'sellers', id: accId.slice(2), type: 'seller' };
  return { kind: 'accounts', id: accId };
}

// ---------- helpers ----------
async function nextNumber(t, kind) {
  const s = getSettings();
  const prefix = (s.prefixes[kind] || kind.toUpperCase()).slice(0, 12);
  const key = 'seq:' + kind;
  const rec = (await t.get('meta', key)) || { key, value: 0 };
  let n = rec.value; let number;
  const storeMap = { milkSale: 'milkSales', animalTxn: 'animalTxns', expense: 'farmExpenses', receipt: 'vouchers', payment: 'vouchers', transfer: 'vouchers' };
  const store = storeMap[kind];
  do { n++; number = `${prefix}-${String(n).padStart(6, '0')}`; }
  while (store && await t.getByIndex(store, 'number', number));
  await t.put('meta', { key, value: n });
  return number;
}

function mkEntries(doc, refType, lines) {
  const at = nowISO();
  const out = lines.filter((l) => round2(l[1]) !== 0 || round2(l[2]) !== 0).map(([accountId, dr, cr, memo]) => {
    if (dr < 0 || cr < 0) throw new AppError('Internal: negative ledger amount');
    return { id: uuid(), txnId: doc.id, refType, refNo: doc.number, date: doc.date, accountId, debit: round2(dr), credit: round2(cr), memo: memo || '', createdAt: at };
  });
  const d = round2(out.reduce((s, e) => s + e.debit, 0));
  const c = round2(out.reduce((s, e) => s + e.credit, 0));
  if (Math.abs(d - c) > 0.009) throw new AppError(`Unbalanced entries (Dr ${d} / Cr ${c})`);
  return out;
}

async function addEntries(t, doc, refType, lines) {
  for (const e of mkEntries(doc, refType, lines)) await t.add('entries', e);
}

async function paymentAccount(t, id) {
  const acc = await t.get('accounts', id || 'cash');
  if (!acc || !['cash', 'bank'].includes(acc.type) || !acc.active) throw new AppError('Select a valid cash/bank account.');
  return acc;
}

async function accountInfo(t, accId) {
  const pa = parseAccount(accId);
  const rec = await t.get(pa.kind, pa.id);
  if (!rec) return null;
  return { id: accId, name: rec.name, type: pa.type || rec.type, active: rec.active };
}

async function audit(t, action, details = {}) {
  await t.add('auditLog', { id: uuid(), at: nowISO(), action, details });
}

function setOpening(t, txnId, accountId, debitAmount, date, label) {
  // remove old opening entry for this account first
  // (we'll handle this inline in saveParty and saveAccount)
  const amt = round2(debitAmount);
  if (!amt) return Promise.resolve();
  const doc = { id: txnId, number: 'OPENING', date: date || today() };
  return addEntries(t, doc, 'opening', amt > 0
    ? [[accountId, amt, 0, label], ['equity', 0, amt, label]]
    : [[accountId, 0, -amt, label], ['equity', -amt, 0, label]]);
}

// ---------- BALANCES & LEDGERS ----------
export async function allBalances() {
  const map = new Map();
  await idb.each('entries', null, null, (e) => {
    const b = map.get(e.accountId) || { debit: 0, credit: 0 };
    b.debit += e.debit; b.credit += e.credit; map.set(e.accountId, b);
  });
  for (const b of map.values()) {
    b.debit = round2(b.debit); b.credit = round2(b.credit);
    b.balance = round2(b.debit - b.credit);
  }
  return map;
}

export async function accountBalance(accountId, uptoDate = '9999-12-31') {
  const rows = await idb.getAllByIndex('entries', 'acctDate', IDBKeyRange.bound([accountId, ''], [accountId, uptoDate]));
  return round2(rows.reduce((s, e) => s + e.debit - e.credit, 0));
}

export async function ledger(accountId, from, to) {
  const [before, rows] = await idb.read(['entries'], (t) => Promise.all([
    t.getAllByIndex('entries', 'acctDate', IDBKeyRange.bound([accountId, ''], [accountId, from], false, true)),
    t.getAllByIndex('entries', 'acctDate', IDBKeyRange.bound([accountId, from], [accountId, to])),
  ]));
  const opening = round2(before.reduce((s, e) => s + e.debit - e.credit, 0));
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  let run = opening;
  for (const r of rows) { run = round2(run + r.debit - r.credit); r.running = run; }
  return { opening, rows, closing: run, debit: round2(rows.reduce((s, r) => s + r.debit, 0)), credit: round2(rows.reduce((s, r) => s + r.credit, 0)) };
}

// ---------- MILK SALES ----------
export async function saveMilkSale(input) {
  const id = input.id || uuid();
  const qty = round2(num(input.quantity));
  const rate = round2(num(input.rate));
  if (!(qty > 0)) throw new AppError('Quantity must be greater than zero.');
  if (rate < 0) throw new AppError('Rate cannot be negative.');
  const total = round2(qty * rate);
  const buyerId = input.buyerId || null;
  const paid = round2(num(input.paid));
  if (paid < 0 || paid > total + EPS) throw new AppError('Paid amount cannot exceed the total.');
  if (!buyerId && paid < total - EPS) throw new AppError('Select a buyer for credit milk sales.');

  return idb.write(['milkSales', 'entries', 'meta', 'buyers', 'accounts', 'auditLog'], async (t) => {
    const existing = await t.get('milkSales', id);
    if (existing) return existing; // duplicate guard
    const acc = await paymentAccount(t, input.paymentAccountId);
    const number = await nextNumber(t, 'milkSale');
    let buyerName = 'Cash Sale';
    if (buyerId) {
      const b = await t.get('buyers', buyerId);
      if (!b) throw new AppError('Buyer not found.');
      buyerName = b.name;
    }
    const now = nowISO();
    const doc = {
      id, number, date: input.date || today(), createdAt: now, updatedAt: now,
      buyerId, buyerName, quantity: qty, rate, total, paid,
      balance: round2(total - paid), paymentAccountId: acc.id, paymentAccountName: acc.name,
      note: clean(input.note, 500), status: 'completed',
    };
    await t.add('milkSales', doc);
    const B = buyerId && partyAccount('buyers', buyerId);
    await addEntries(t, doc, 'milkSale', buyerId ? [
      [B, total, 0, 'Milk sale'],
      ['milk_income', 0, total, 'Milk sale'],
      [acc.id, paid, 0, 'Payment received'],
      [B, 0, paid, 'Payment received'],
    ] : [
      [acc.id, total, 0, 'Cash milk sale'],
      ['milk_income', 0, total, 'Cash milk sale'],
    ]);
    await audit(t, 'milk_sale', { number, total });
    return doc;
  });
}

export async function voidMilkSale(id) {
  return idb.write(['milkSales', 'entries', 'auditLog'], async (t) => {
    const d = await t.get('milkSales', id);
    if (!d) throw new AppError('Record not found.');
    if (d.status === 'void') throw new AppError('Already voided.');
    await t.deleteByIndex('entries', 'txnId', id);
    Object.assign(d, { status: 'void', voidedAt: nowISO(), updatedAt: nowISO() });
    await t.put('milkSales', d);
    await audit(t, 'void_milk_sale', { number: d.number });
    return d;
  });
}

// ---------- ANIMAL TRANSACTIONS (BUY / SELL) ----------
export async function saveAnimalTxn(input) {
  const id = input.id || uuid();
  const type = input.type; // 'buy' | 'sell'
  if (!['buy', 'sell'].includes(type)) throw new AppError('Invalid transaction type.');
  const amount = round2(num(input.amount));
  if (!(amount > 0)) throw new AppError('Amount must be greater than zero.');
  const paid = round2(num(input.paid));
  if (paid < 0 || paid > amount + EPS) throw new AppError('Paid amount cannot exceed the total.');
  const partyId = input.partyId || null;
  const partyKind = type === 'buy' ? 'sellers' : 'buyers';
  if (!partyId && paid < amount - EPS) throw new AppError(`Select a ${type === 'buy' ? 'seller' : 'buyer'} for credit transactions.`);

  const doc = await idb.write(['animalTxns', 'entries', 'meta', 'buyers', 'sellers', 'animals', 'accounts', 'auditLog'], async (t) => {
    const existing = await t.get('animalTxns', id);
    if (existing) return existing;
    const acc = await paymentAccount(t, input.paymentAccountId);
    const number = await nextNumber(t, 'animalTxn');
    let partyName = type === 'buy' ? 'Cash Purchase' : 'Cash Sale';
    if (partyId) {
      const p = await t.get(partyKind, partyId);
      if (!p) throw new AppError('Party not found.');
      partyName = p.name;
    }
    const animal = input.animalId ? await t.get('animals', input.animalId) : null;
    const now = nowISO();
    const d = {
      id, number, type, date: input.date || today(), createdAt: now, updatedAt: now,
      animalId: input.animalId || null, animalTag: animal?.tagNo || input.animalTag || '',
      animalName: animal?.name || input.animalName || '', animalDesc: input.animalDesc || '',
      partyId, partyKind, partyName, amount, paid, balance: round2(amount - paid),
      paymentAccountId: acc.id, paymentAccountName: acc.name,
      note: clean(input.note, 500), status: 'completed',
    };
    await t.add('animalTxns', d);

    // Update animal status if selling
    if (type === 'sell' && input.animalId) {
      const a = await t.get('animals', input.animalId);
      if (a) { a.status = 'sold'; a.soldDate = d.date; a.soldPrice = amount; a.updatedAt = now; await t.put('animals', a); }
    }

    const PA = partyId && partyAccount(partyKind, partyId);
    if (type === 'buy') {
      await addEntries(t, d, 'animalBuy', partyId ? [
        ['livestock', amount, 0, 'Animal purchase'],
        [PA, 0, amount, 'Animal purchase'],
        [PA, paid, 0, 'Payment made'],
        [acc.id, 0, paid, 'Payment made'],
      ] : [
        ['livestock', amount, 0, 'Cash animal purchase'],
        [acc.id, 0, amount, 'Cash animal purchase'],
      ]);
    } else {
      await addEntries(t, d, 'animalSell', partyId ? [
        [PA, amount, 0, 'Animal sale'],
        ['animal_income', 0, amount, 'Animal sale'],
        [acc.id, paid, 0, 'Payment received'],
        [PA, 0, paid, 'Payment received'],
      ] : [
        [acc.id, amount, 0, 'Cash animal sale'],
        ['animal_income', 0, amount, 'Cash animal sale'],
      ]);
    }
    await audit(t, type === 'buy' ? 'animal_purchase' : 'animal_sale', { number, amount });
    return d;
  });
  if (input.animalId) await Catalog.refreshAnimal(input.animalId);
  document.dispatchEvent(new CustomEvent('data:changed'));
  return doc;
}

export async function voidAnimalTxn(id) {
  const doc = await idb.write(['animalTxns', 'entries', 'animals', 'auditLog'], async (t) => {
    const d = await t.get('animalTxns', id);
    if (!d) throw new AppError('Not found.');
    if (d.status === 'void') throw new AppError('Already voided.');
    await t.deleteByIndex('entries', 'txnId', id);
    // Revert sold status
    if (d.type === 'sell' && d.animalId) {
      const a = await t.get('animals', d.animalId);
      if (a && a.status === 'sold') { a.status = 'active'; a.soldDate = null; a.soldPrice = null; a.updatedAt = nowISO(); await t.put('animals', a); }
    }
    Object.assign(d, { status: 'void', voidedAt: nowISO(), updatedAt: nowISO() });
    await t.put('animalTxns', d);
    await audit(t, 'void_animal_txn', { number: d.number });
    return d;
  });
  if (doc.animalId) await Catalog.refreshAnimal(doc.animalId);
  document.dispatchEvent(new CustomEvent('data:changed'));
  return doc;
}

// ---------- FARM EXPENSES ----------
const EXP_ACCOUNTS = { feed: 'feed_expense', vet: 'vet_expense', labor: 'labor_expense', other: 'other_expense' };

export async function saveFarmExpense(input) {
  const id = input.id || uuid();
  const amount = round2(num(input.amount));
  if (!(amount > 0)) throw new AppError('Amount must be greater than zero.');
  const expAccId = EXP_ACCOUNTS[input.category] || 'other_expense';
  const sellerId = input.sellerId || null;

  return idb.write(['farmExpenses', 'entries', 'meta', 'sellers', 'accounts', 'auditLog'], async (t) => {
    const existing = await t.get('farmExpenses', id);
    if (existing) return existing;
    const acc = await paymentAccount(t, input.paymentAccountId);
    const number = await nextNumber(t, 'expense');
    let sellerName = '';
    if (sellerId) {
      const s = await t.get('sellers', sellerId);
      if (!s) throw new AppError('Seller not found.');
      sellerName = s.name;
    }
    const now = nowISO();
    const d = {
      id, number, date: input.date || today(), createdAt: now, updatedAt: now,
      category: input.category || 'other', description: clean(input.description, 200),
      amount, sellerId, sellerName, paymentAccountId: acc.id, paymentAccountName: acc.name,
      note: clean(input.note, 500), status: 'completed',
    };
    await t.add('farmExpenses', d);
    const S = sellerId && partyAccount('sellers', sellerId);
    await addEntries(t, d, 'expense', sellerId ? [
      [expAccId, amount, 0, d.description || 'Farm expense'],
      [S, 0, amount, d.description || 'Farm expense'],
    ] : [
      [expAccId, amount, 0, d.description || 'Farm expense'],
      [acc.id, 0, amount, d.description || 'Farm expense'],
    ]);
    await audit(t, 'farm_expense', { number, amount, category: d.category });
    return d;
  });
}

export async function voidFarmExpense(id) {
  return idb.write(['farmExpenses', 'entries', 'auditLog'], async (t) => {
    const d = await t.get('farmExpenses', id);
    if (!d) throw new AppError('Not found.');
    if (d.status === 'void') throw new AppError('Already voided.');
    await t.deleteByIndex('entries', 'txnId', id);
    Object.assign(d, { status: 'void', voidedAt: nowISO(), updatedAt: nowISO() });
    await t.put('farmExpenses', d);
    await audit(t, 'void_expense', { number: d.number });
    return d;
  });
}

// ---------- VOUCHERS (receipts, payments, transfers) ----------
export async function saveVoucher(input) {
  const type = input.type;
  if (!['receipt', 'payment', 'transfer'].includes(type)) throw new AppError('Invalid voucher type.');
  const amount = round2(num(input.amount));
  if (!(amount > 0)) throw new AppError('Amount must be greater than zero.');
  if (!input.counterAccountId) throw new AppError('Select who/what this is for.');
  if (input.counterAccountId === input.accountId) throw new AppError('The two accounts must be different.');

  return idb.write(['vouchers', 'entries', 'meta', 'accounts', 'buyers', 'sellers', 'auditLog'], async (t) => {
    const existing = await t.get('vouchers', input.id);
    if (existing) return existing;
    const acc = await paymentAccount(t, input.accountId);
    const counter = await accountInfo(t, input.counterAccountId);
    if (!counter || !counter.active) throw new AppError('The selected account/party does not exist or is inactive.');
    if (type === 'transfer' && !['cash', 'bank'].includes(counter.type)) throw new AppError('Transfers must be between cash/bank accounts.');
    const number = await nextNumber(t, type);
    const d = {
      id: input.id, number, type, date: input.date || today(), createdAt: nowISO(), amount,
      accountId: acc.id, accountName: acc.name, counterAccountId: counter.id, counterName: counter.name, counterType: counter.type,
      method: clean(input.method, 40), note: clean(input.note, 500), status: 'completed',
    };
    await t.add('vouchers', d);
    const memo = d.note || { receipt: 'Received', payment: 'Paid', transfer: 'Transfer' }[type];
    await addEntries(t, d, type, type === 'receipt'
      ? [[acc.id, amount, 0, memo], [counter.id, 0, amount, memo]]
      : type === 'payment' ? [[counter.id, amount, 0, memo], [acc.id, 0, amount, memo]]
        : [[counter.id, amount, 0, memo], [acc.id, 0, amount, memo]]);
    const pa = parseAccount(counter.id);
    if (pa.kind !== 'accounts') await Catalog.refreshParty(pa.kind, pa.id);
    await audit(t, 'voucher_' + type, { number, amount });
    return d;
  });
}

export async function voidVoucher(id) {
  return idb.write(['vouchers', 'entries', 'auditLog'], async (t) => {
    const d = await t.get('vouchers', id);
    if (!d) throw new AppError('Not found.');
    if (d.status === 'void') throw new AppError('Already voided.');
    await t.deleteByIndex('entries', 'txnId', id);
    Object.assign(d, { status: 'void', voidedAt: nowISO(), updatedAt: nowISO() });
    await t.put('vouchers', d);
    await audit(t, 'void_voucher', { number: d.number });
    return d;
  });
}

// ---------- PARTIES (buyers / sellers) ----------
export async function saveParty(kind, data) {
  const name = clean(data.name, 120);
  if (!name) throw new AppError('Name is required.');
  const opening = round2(num(data.openingBalance));
  const id = data.id || uuid();
  const now = nowISO();
  const rec = await idb.write([kind, 'entries', 'auditLog'], async (t) => {
    const old = data.id ? await t.get(kind, id) : null;
    const r = {
      ...(old || { createdAt: now }), id, name, nameLc: lc(name),
      phone: clean(data.phone, 40), address: clean(data.address, 300),
      note: clean(data.note, 500), openingBalance: opening,
      openingDate: data.openingDate || old?.openingDate || today(),
      active: data.active === false ? 0 : 1, updatedAt: now,
    };
    await t.put(kind, r);
    const acc = partyAccount(kind, id);
    await t.deleteByIndex('entries', 'txnId', 'open:' + acc);
    // buyers are debit-normal (receivable), sellers are credit-normal (payable)
    await setOpening(t, 'open:' + acc, acc, kind === 'buyers' ? opening : -opening, r.openingDate, 'Opening balance');
    await audit(t, (old ? 'update_' : 'create_') + kind.slice(0, -1), { name });
    return r;
  });
  await Catalog.refreshParty(kind, id);
  document.dispatchEvent(new CustomEvent('data:changed'));
  return rec;
}

export async function deleteParty(kind, id) {
  const acc = partyAccount(kind, id);
  const res = await idb.write([kind, 'entries', 'milkSales', 'animalTxns', 'auditLog'], async (t) => {
    const p = await t.get(kind, id);
    if (!p) throw new AppError('Not found.');
    const used = (await t.getAllByIndex('entries', 'accountId', acc)).some((e) => e.refType !== 'opening');
    if (used) {
      p.active = 0; p.updatedAt = nowISO(); await t.put(kind, p);
      await audit(t, 'deactivate_' + kind.slice(0, -1), { name: p.name });
      return 'deactivated';
    }
    await t.deleteByIndex('entries', 'txnId', 'open:' + acc);
    await t.delete(kind, id);
    await audit(t, 'delete_' + kind.slice(0, -1), { name: p.name });
    return 'deleted';
  });
  await Catalog.refreshParty(kind, id);
  document.dispatchEvent(new CustomEvent('data:changed'));
  return res;
}

// ---------- ACCOUNTS ----------
export async function saveAccount(data) {
  const id = data.id || uuid();
  const now = nowISO();
  const rec = await idb.write(['accounts', 'entries', 'auditLog'], async (t) => {
    const old = data.id ? await t.get('accounts', id) : null;
    const type = old?.system ? old.type : data.type;
    if (!ACCOUNT_TYPES[type]) throw new AppError('Select an account type.');
    const name = old?.system ? old.name : clean(data.name, 80);
    if (!name) throw new AppError('Account name is required.');
    const opening = round2(num(data.openingBalance));
    const r = {
      ...(old || { createdAt: now, system: false }), id, name, type,
      note: clean(data.note, 300), openingBalance: opening,
      openingDate: data.openingDate || old?.openingDate || today(),
      active: old?.system ? 1 : (data.active === false ? 0 : 1), updatedAt: now,
    };
    await t.put('accounts', r);
    if (!['income', 'expense'].includes(type) && id !== 'equity') {
      await t.deleteByIndex('entries', 'txnId', 'open:' + id);
      await setOpening(t, 'open:' + id, id, isDebitNormal(type) ? opening : -opening, r.openingDate, 'Opening balance');
    }
    await audit(t, old ? 'update_account' : 'create_account', { name });
    return r;
  });
  document.dispatchEvent(new CustomEvent('data:changed'));
  return rec;
}

export async function deleteAccount(id) {
  return idb.write(['accounts', 'entries', 'auditLog'], async (t) => {
    const a = await t.get('accounts', id);
    if (!a) throw new AppError('Account not found.');
    if (a.system) throw new AppError('System accounts cannot be deleted.');
    const used = (await t.getAllByIndex('entries', 'accountId', id)).some((e) => e.refType !== 'opening');
    if (used) {
      a.active = 0; a.updatedAt = nowISO(); await t.put('accounts', a);
      await audit(t, 'deactivate_account', { name: a.name }); return 'deactivated';
    }
    await t.deleteByIndex('entries', 'txnId', 'open:' + id);
    await t.delete('accounts', id);
    await audit(t, 'delete_account', { name: a.name });
    return 'deleted';
  });
}

// ---------- INTEGRITY ----------
export async function integrityCheck() {
  const issues = [];
  const entries = await idb.getAll('entries');
  const byTxn = {};
  for (const e of entries) {
    const b = byTxn[e.txnId] || (byTxn[e.txnId] = { d: 0, c: 0, ref: e.refNo });
    b.d += e.debit; b.c += e.credit;
  }
  for (const [txn, b] of Object.entries(byTxn)) {
    if (Math.abs(b.d - b.c) > 0.009) issues.push(`Unbalanced: ${b.ref || txn} Dr ${round2(b.d)} Cr ${round2(b.c)}`);
  }
  return { issues, checked: { entries: entries.length } };
}
