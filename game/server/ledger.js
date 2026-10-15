// Ledger: the ONLY place that changes coin balances or item locations.
// Every operation list is validated completely first, then applied atomically (single-threaded host).
import { DEFS } from '../shared/content.js';

export const ACCT = { HOUSE: 'house', JACKPOT: 'jackpot', VOID: 'void', MINT: 'mint' };
const NEG_OK = new Set([ACCT.MINT, ACCT.HOUSE, ACCT.VOID]);   // mint creates money; house and void are unbounded accounts

export function newAccounts() { return { house: 0, jackpot: 0, void: 0, mint: 0 }; }
export const pAcct = (pid) => 'p:' + pid;
export const escrowAcct = (table, seat) => `escrow:${table}:${seat}`;

export function getBal(state, a) {
  if (a.startsWith('p:')) { const p = state.players[a.slice(2)]; return p ? p.coins : 0; }
  if (a.startsWith('escrow:')) return state.escrow[a] ?? 0;
  return state.accts[a] ?? 0;
}
function setBal(state, a, v) {
  if (a.startsWith('p:')) { state.players[a.slice(2)].coins = v; state.dirty.players = true; }
  else if (a.startsWith('escrow:')) { if (v === 0) delete state.escrow[a]; else state.escrow[a] = v; state.dirty.meta = true; }
  else { state.accts[a] = v; state.dirty.meta = true; }
}
const itemsIn = (state, loc) => { let s = state.idx.get(loc); if (!s) { s = new Set(); state.idx.set(loc, s); } return s; };
export function indexItems(state) {
  state.idx = new Map();
  for (const it of Object.values(state.items)) itemsIn(state, it.loc).add(it.id);
}
export const itemsAt = (state, loc) => [...(state.idx.get(loc) || [])].map(id => state.items[id]);

// ops: {k:'xfer', from, to, n} | {k:'mint', d, loc, o, id?} | {k:'move', id, from, to} | {k:'destroy', id, from}
export function tx(state, ops, meta = {}) {
  if (meta.cmdKey) {
    const seen = state.seen.get(meta.cmdKey);
    if (seen) return { ok: true, dup: true, ...seen };
  }
  // ---- validate (dry run) ----
  const delta = {}; const locs = {}; const destroyed = new Set();
  for (const op of ops) {
    if (op.k === 'xfer') {
      if (!Number.isInteger(op.n) || op.n < 0) return { ok: false, err: 'bad_amount' };
      for (const a of [op.from, op.to]) if (a.startsWith('p:') && !state.players[a.slice(2)]) return { ok: false, err: 'no_account' };
      delta[op.from] = (delta[op.from] || 0) - op.n; delta[op.to] = (delta[op.to] || 0) + op.n;
    } else if (op.k === 'move' || op.k === 'destroy') {
      const it = state.items[op.id]; if (!it || destroyed.has(op.id)) return { ok: false, err: 'no_item' };
      const cur = locs[op.id] ?? it.loc;
      if (cur !== op.from) return { ok: false, err: 'item_moved' };        // compare-and-swap on the location
      if (op.k === 'move') locs[op.id] = op.to; else destroyed.add(op.id);
    } else if (op.k === 'mint') {
      if (!DEFS[op.d]) return { ok: false, err: 'bad_def' };
    } else return { ok: false, err: 'bad_op' };
  }
  for (const [a, d] of Object.entries(delta)) {
    if (d < 0 && !NEG_OK.has(a) && getBal(state, a) + d < 0) return { ok: false, err: 'insufficient_funds' };
  }
  // ---- apply ----
  const minted = [];
  for (const op of ops) {
    if (op.k === 'xfer') { /* applied through delta below */ }
    else if (op.k === 'move') { const it = state.items[op.id]; itemsIn(state, it.loc).delete(it.id); it.loc = op.to; itemsIn(state, op.to).add(it.id); state.dirty.items = true; }
    else if (op.k === 'destroy') { const it = state.items[op.id]; itemsIn(state, it.loc).delete(it.id); delete state.items[op.id]; state.counters.destroyed[it.d] = (state.counters.destroyed[it.d] || 0) + 1; state.dirty.items = true; }
    else if (op.k === 'mint') {
      const id = state.meta.nextId++; const it = { id, d: op.d, o: op.o, loc: op.loc };
      if (DEFS[op.d].rarity === 'collectible') it.ser = (state.counters.minted[op.d] || 0) + 1;
      state.items[id] = it; itemsIn(state, op.loc).add(id); minted.push(id);
      state.counters.minted[op.d] = (state.counters.minted[op.d] || 0) + 1; state.dirty.items = true; state.dirty.meta = true;
    }
  }
  for (const [a, d] of Object.entries(delta)) setBal(state, a, getBal(state, a) + d);
  const res = { ok: true, minted };
  const entry = { tx: state.meta.nextTx++, t: Date.now(), p: meta.pid || null, why: meta.reason || '', ops: ops.map(o => o.k === 'xfer' ? `${o.from}>${o.to}:${o.n}` : o.k === 'mint' ? `mint:${o.d}>${o.loc}` : `${o.k}:${o.id}`) };
  state.journalQueue.push(entry);
  if (meta.cmdKey) { state.seen.set(meta.cmdKey, { minted }); if (state.seen.size > 5000) state.seen.delete(state.seen.keys().next().value); }
  return res;
}

// ---- convenience wrappers ----
export const credit = (state, pid, n, reason) => tx(state, [{ k: 'xfer', from: ACCT.MINT, to: pAcct(pid), n }], { pid, reason });
export const debitToVoid = (state, pid, n, reason, cmdKey) => tx(state, [{ k: 'xfer', from: pAcct(pid), to: ACCT.VOID, n }], { pid, reason, cmdKey });

export function audit(state) {
  const errors = [];
  let sum = 0;
  for (const p of Object.values(state.players)) { if (p.coins < 0) errors.push(`negative wallet ${p.id}`); sum += p.coins; }
  for (const [k, v] of Object.entries(state.accts)) sum += v;
  for (const v of Object.values(state.escrow || {})) sum += v;
  if (sum !== 0) errors.push(`coin conservation broken: sum=${sum}`);
  const counts = {};
  for (const it of Object.values(state.items)) {
    counts[it.d] = (counts[it.d] || 0) + 1;
    if (!state.idx.get(it.loc)?.has(it.id)) errors.push(`index mismatch item ${it.id}`);
    if (it.loc.startsWith('placed:')) { const pr = state.props[it.loc.slice(7)]; if (!pr || !pr.objects[it.id]) errors.push(`placed item ${it.id} missing in property`); }
  }
  for (const d of new Set([...Object.keys(state.counters.minted), ...Object.keys(counts)])) {
    const exp = (state.counters.minted[d] || 0) - (state.counters.destroyed[d] || 0);
    if (exp !== (counts[d] || 0)) errors.push(`item conservation ${d}: expected ${exp} got ${counts[d] || 0}`);
  }
  for (const pr of Object.values(state.props)) for (const oid of Object.keys(pr.objects)) { const it = state.items[oid]; if (!it || it.loc !== 'placed:' + pr.id) errors.push(`property ${pr.id} object ${oid} bad location`); }
  return { ok: errors.length === 0, errors };
}
