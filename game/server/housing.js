// Housing: the authoritative rules for properties, building, furniture, permissions and collaboration.
import { DEFS, PROPERTIES, ROLE_CAPS, WALL_COST, DOOR_COST, WINDOW_COST, UPGRADES, ACCESS_MODES, ROLES, FLOOR_COLORS, WALL_COLORS } from '../shared/content.js';
import { tx, pAcct, ACCT, itemsAt } from './ledger.js';

export const LEASE_MS = 8000;
const TYPE_COST = { 1: WALL_COST, 2: DOOR_COST, 3: WINDOW_COST };
const key = (x, y) => x + ',' + y;

export function newProperty(def) {
  const p = { id: def.id, def: def.id, owner: null, name: def.name, w: def.w, h: def.h, walls: {}, floors: {}, objects: {}, rev: 1, roles: {}, access: 'open', ban: [], rules: '', capacity: 12, extraCap: 0, spent: 0, paid: 0, upkeep: { played: 0, arrears: 0, dusty: false }, purchasedAt: 0, likes: {}, visitors: {}, audit: [], wallColor: 0, doorBells: {}, tier: def.tier };
  resetLayout(p); return p;
}
export function resetLayout(p) {
  p.walls = {}; p.floors = {}; p.objects = {};
  const doorX = entryX(p);
  for (let x = 0; x < p.w; x++) { p.walls[key(x, 0)] = 1; p.walls[key(x, p.h - 1)] = 1; }
  for (let y = 0; y < p.h; y++) { p.walls[key(0, y)] = 1; p.walls[key(p.w - 1, y)] = 1; }
  p.walls[key(doorX, p.h - 1)] = 2;
  for (const x of [2, p.w - 3]) if (x > 0 && x < p.w - 1) p.walls[key(x, 0)] = 3;
  p.rev++;
}
export const entryX = (p) => Math.floor(p.w / 2);
export const spawnOf = (p) => ({ x: entryX(p) + 0.5, y: p.h - 1.5 });
export const doorOf = (p) => ({ x: entryX(p), y: p.h - 1 });

export function objSize(def, rot) { return (rot & 1) ? { w: def.h, h: def.w } : { w: def.w, h: def.h }; }
export function objTiles(def, x, y, rot) { const { w, h } = objSize(def, rot); const t = []; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) t.push([x + i, y + j]); return t; }

export function cap(p) { return (PROPERTIES[p.def]?.cap || 150) + p.extraCap; }
export function objectCount(p) { return Object.keys(p.objects).length; }
export function roleOf(state, p, pid) {
  if (p.owner === pid) return 'owner';
  if (p.roles[pid]) return p.roles[pid];
  if (p.owner && state.players[p.owner]?.friends?.includes(pid)) return 'friend';
  return 'visitor';
}
export function can(state, p, pid, c) { const r = roleOf(state, p, pid); const caps = ROLE_CAPS[r]; return caps.includes('*') || caps.includes(c); }

export function solidAt(state, p, tx_, ty_) {   // for movement validation inside a home
  const w = p.walls[key(tx_, ty_)]; if (w === 1 || w === 3) return true;
  if (tx_ < 0 || ty_ < 0 || tx_ >= p.w || ty_ >= p.h) return true;
  for (const [id, o] of Object.entries(p.objects)) {
    const d = DEFS[state.items[id]?.d]; if (!d || d.layer !== 'floor') continue;
    if (d.interact === 'sit' || d.interact === 'lie') { /* still solid; players sit via interaction */ }
    for (const [x, y] of objTiles(d, o.x, o.y, o.rot)) if (x === tx_ && y === ty_) return true;
  }
  return false;
}

export function validatePlacement(state, p, def, x, y, rot, ignoreId = null) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || !(rot === 0 || rot === 1 || rot === 2 || rot === 3)) return 'bad_args';
  const tiles = objTiles(def, x, y, rot);
  for (const [tx_, ty_] of tiles) if (tx_ < 0 || ty_ < 0 || tx_ >= p.w || ty_ >= p.h) return 'out_of_bounds';
  if (def.layer === 'wall') {
    if (def.h !== 1) return 'bad_def';
    for (const [tx_, ty_] of objTiles(def, x, y, 0)) if (p.walls[key(tx_, ty_)] !== 1) return 'needs_wall';
  } else {
    for (const [tx_, ty_] of tiles) { const w = p.walls[key(tx_, ty_)]; if (w) return 'blocked_by_wall'; }
    const door = doorOf(p);
    if (def.layer === 'floor') for (const [tx_, ty_] of tiles) if (Math.abs(tx_ - door.x) <= 0 && ty_ >= p.h - 2) return 'blocks_entrance';
  }
  for (const [id, o] of Object.entries(p.objects)) {
    if (String(id) === String(ignoreId)) continue;
    const od = DEFS[state.items[id].d]; if (od.layer !== def.layer) continue;       // different layers may overlap (rugs under furniture, wall art on walls)
    const rot2 = def.layer === 'wall' ? 0 : o.rot; const mine = def.layer === 'wall' ? objTiles(def, x, y, 0) : tiles;
    const theirs = objTiles(od, o.x, o.y, od.layer === 'wall' ? 0 : rot2);
    for (const [a, b] of mine) for (const [c, d] of theirs) if (a === c && b === d) return 'overlap';
  }
  return null;
}

const audit = (p, pid, op, detail) => { p.audit.push({ t: Date.now(), pid, op, detail }); if (p.audit.length > 200) p.audit.shift(); };
const bump = (state, p) => { p.rev++; state.dirty.props = true; };
const err = (e, extra = {}) => ({ err: e, ...extra });

export class Housing {
  constructor(state, hooks = {}) { this.state = state; this.hooks = hooks; }
  prop(id) { return this.state.props[id]; }

  // ---------- ownership ----------
  priceFor(pid, def) { const pl = this.state.players[pid]; if (def.tier === 'Studio' && !pl.stats.freeStudioUsed) return 0; return def.price; }
  buy(pid, propId) {
    const st = this.state, pl = st.players[pid], p = st.props[propId], def = PROPERTIES[propId];
    if (!p || !def) return err('no_property'); if (p.owner) return err('already_owned');
    if (pl.props.length >= 5) return err('property_limit');
    if (def.minLevel && pl.level < def.minLevel) return err('level_required', { level: def.minLevel });
    const price = this.priceFor(pid, def);
    const r = tx(st, price ? [{ k: 'xfer', from: pAcct(pid), to: ACCT.VOID, n: price }] : [], { pid, reason: 'property:' + propId });
    if (!r.ok) return err(r.err);
    if (price === 0 && def.tier === 'Studio') pl.stats.freeStudioUsed = true;
    p.owner = pid; p.purchasedAt = Date.now(); p.paid = price; p.spent = 0; p.upkeep = { played: 0, arrears: 0, dusty: false }; p.roles = {}; p.access = 'open'; p.ban = []; p.likes = {}; p.visitors = {};
    pl.props.push(propId); st.dirty.props = st.dirty.players = true; audit(p, pid, 'buy', { price }); this.hooks.event?.(pid, 'propBuy', 1);
    return { ok: true, price };
  }
  sell(pid, propId) {
    const st = this.state, p = st.props[propId]; if (!p || p.owner !== pid) return err('not_owner');
    const refund = Math.floor(p.paid * 0.7 + p.spent * 0.5);
    // return every item to its contributor first (containers' contents too)
    const ops = [];
    for (const itemId of Object.keys(p.objects)) {
      const it = st.items[itemId];
      for (const inner of itemsAt(st, 'store:' + itemId)) ops.push({ k: 'move', id: inner.id, from: 'store:' + itemId, to: 'inv:' + inner.o });
      ops.push({ k: 'move', id: it.id, from: it.loc, to: 'inv:' + it.o });
    }
    if (refund) ops.push({ k: 'xfer', from: ACCT.VOID, to: pAcct(pid), n: refund });
    const r = tx(st, ops, { pid, reason: 'sell:' + propId }); if (!r.ok) return err(r.err);
    const def = PROPERTIES[propId]; const fresh = newProperty(def); st.props[propId] = fresh;
    const pl = st.players[pid]; pl.props = pl.props.filter(x => x !== propId); st.dirty.props = st.dirty.players = true;
    return { ok: true, refund };
  }
  transfer(pid, propId, toPid) {
    const st = this.state, p = st.props[propId]; if (!p || p.owner !== pid) return err('not_owner'); const to = st.players[toPid]; if (!to || toPid === pid) return err('bad_target'); if (to.props.length >= 5) return err('property_limit');
    const fee = Math.floor((p.paid || 0) * 0.02); const r = tx(st, fee ? [{ k: 'xfer', from: pAcct(pid), to: ACCT.VOID, n: fee }] : [], { pid, reason: 'transfer' }); if (!r.ok) return err(r.err);
    p.owner = toPid; p.roles = {}; st.players[pid].props = st.players[pid].props.filter(x => x !== propId); to.props.push(propId); st.dirty.props = st.dirty.players = true; audit(p, pid, 'transfer', { to: toPid }); return { ok: true };
  }
  upgrade(pid, propId, kind) {
    const st = this.state, p = st.props[propId]; if (!p) return err('no_property'); if (!can(st, p, pid, 'upgrade')) return err('no_permission');
    const u = UPGRADES[kind]; if (!u) return err('bad_upgrade'); const tierIdx = ['Studio', 'Cottage', 'Family House', 'Villa', 'Mansion'].indexOf(p.tier);
    if (kind === 'expand' && p.w >= 34) return err('max_size');
    const price = u.price(tierIdx); const r = tx(st, [{ k: 'xfer', from: pAcct(pid), to: ACCT.VOID, n: price }], { pid, reason: 'upgrade:' + kind }); if (!r.ok) return err(r.err);
    p.spent += price;
    if (kind === 'cap100') p.extraCap += 100;
    else {                      // expand: +2 tiles wide, right wall moves out
      const oldW = p.w; p.w += 2;
      for (let y = 1; y < p.h - 1; y++) delete p.walls[key(oldW - 1, y)];
      for (let x = oldW - 1; x < p.w; x++) { p.walls[key(x, 0)] = 1; p.walls[key(x, p.h - 1)] = 1; }
      for (let y = 0; y < p.h; y++) p.walls[key(p.w - 1, y)] = 1;
      // keep the entrance door where it was
      p.walls[key(Math.floor(oldW / 2), p.h - 1)] = 2;
    }
    bump(this.state, p); audit(p, pid, 'upgrade', { kind, price }); return { ok: true, price };
  }

  // ---------- access control ----------
  canEnter(pid, propId) {
    const st = this.state, p = st.props[propId]; if (!p) return err('no_property');
    if (!p.owner) return { ok: true, vacant: true };
    if (p.owner === pid) return { ok: true };
    if (p.ban.includes(pid)) return err('banned');
    if (p.upkeep.dusty) return err('dusty');
    const r = roleOf(st, p, pid); const caps = ROLE_CAPS[r];
    const inv = p.invites?.[pid]; const invited = inv && inv > Date.now();
    if (!invited) {
      if (p.access === 'locked' && !caps.includes('enterLocked') && !caps.includes('*')) return err('locked');
      if (p.access === 'invite' && !caps.includes('enterLocked')) return err('invite_only', { canRing: true });
      if (p.access === 'friends' && !caps.includes('enterLocked')) return err('friends_only', { canRing: true });
    }
    const inside = this.hooks.occupants?.(propId) ?? 0; if (inside >= p.capacity && !(caps.includes('*'))) return err('full');
    return { ok: true };
  }
  invite(pid, propId, toPid) { const p = this.prop(propId); if (!p || !can(this.state, p, pid, 'invite')) return err('no_permission'); p.invites = p.invites || {}; p.invites[toPid] = Date.now() + 3600e3; return { ok: true }; }
  setAccess(pid, propId, mode) { const p = this.prop(propId); if (!p || p.owner !== pid) return err('not_owner'); if (!ACCESS_MODES.includes(mode)) return err('bad_mode'); p.access = mode; bump(this.state, p); return { ok: true }; }
  setRole(pid, propId, targetPid, role) {
    const st = this.state, p = this.prop(propId); if (!p || !can(st, p, pid, 'roles')) return err('no_permission');
    if (targetPid === p.owner) return err('bad_target'); if (!st.players[targetPid]) return err('no_player');
    if (role && !ROLES.includes(role)) return err('bad_role'); if (role === 'coowner' && p.owner !== pid) return err('owner_only');
    if (p.roles[targetPid] === 'coowner' && p.owner !== pid) return err('owner_only');
    if (!role || role === 'visitor') delete p.roles[targetPid]; else p.roles[targetPid] = role;
    audit(p, pid, 'role', { target: targetPid, role }); bump(st, p); this.hooks.rolesChanged?.(propId, targetPid); return { ok: true };
  }
  ban(pid, propId, target) { const p = this.prop(propId); if (!p || !can(this.state, p, pid, 'kick')) return err('no_permission'); if (target === p.owner) return err('bad_target'); if (!p.ban.includes(target)) p.ban.push(target); delete p.roles[target]; bump(this.state, p); return { ok: true }; }
  unban(pid, propId, target) { const p = this.prop(propId); if (!p || !can(this.state, p, pid, 'kick')) return err('no_permission'); p.ban = p.ban.filter(x => x !== target); bump(this.state, p); return { ok: true }; }
  setRules(pid, propId, rules, name) { const p = this.prop(propId); if (!p || p.owner !== pid) return err('not_owner'); if (typeof rules === 'string') p.rules = rules.slice(0, 200); if (typeof name === 'string' && name.trim()) p.name = name.trim().slice(0, 28); bump(this.state, p); return { ok: true }; }

  // ---------- leases (collaborative editing) ----------
  leaseHolder(p, itemId) { const l = p.leases?.[itemId]; if (!l) return null; if (l.until < Date.now()) { delete p.leases[itemId]; return null; } return l.pid; }
  lease(pid, propId, ids) {
    const p = this.prop(propId); if (!p) return err('no_property'); p.leases = p.leases || {};
    for (const id of ids) { if (!p.objects[id]) return err('not_found'); const h = this.leaseHolder(p, id); if (h && h !== pid) return err('locked', { by: h, id }); }
    for (const id of ids) p.leases[id] = { pid, until: Date.now() + LEASE_MS };
    return { ok: true };
  }
  release(pid, propId, ids) { const p = this.prop(propId); if (!p?.leases) return { ok: true }; for (const id of ids) if (p.leases[id]?.pid === pid) delete p.leases[id]; return { ok: true }; }
  releaseAll(pid) { for (const p of Object.values(this.state.props)) if (p.leases) for (const [id, l] of Object.entries(p.leases)) if (l.pid === pid) delete p.leases[id]; }

  // ---------- furniture ----------
  _checkEditor(pid, propId, c) { const p = this.prop(propId); if (!p) return [err('no_property')]; if (!p.owner) return [err('unowned')]; if (!can(this.state, p, pid, c)) return [err('no_permission')]; return [null, p]; }
  place(pid, propId, itemId, x, y, rot = 0, cmdKey) {
    const st = this.state; const [e, p] = this._checkEditor(pid, propId, 'place'); if (e) return e;
    const it = st.items[itemId]; if (!it || it.loc !== 'inv:' + pid) return err('not_in_inventory');
    const def = DEFS[it.d]; if (def.type !== 'furniture') return err('not_placeable');
    if (objectCount(p) >= cap(p)) return err('object_cap', { cap: cap(p) });
    const bad = validatePlacement(st, p, def, x, y, rot); if (bad) return err(bad);
    const r = tx(st, [{ k: 'move', id: it.id, from: 'inv:' + pid, to: 'placed:' + propId }], { pid, reason: 'place', cmdKey }); if (!r.ok) return err(r.err);
    p.objects[it.id] = { x, y, rot, state: 0, by: pid, rev: 1 }; bump(st, p); audit(p, pid, 'place', { d: it.d, x, y });
    this.hooks.event?.(pid, 'place', 1); this.hooks.placedDef?.(pid, it.d);
    return { ok: true, obj: { id: it.id, d: it.d, ...p.objects[it.id], o: it.o } };
  }
  move(pid, propId, itemId, x, y, rot, baseRev) {
    const st = this.state; const p = this.prop(propId); if (!p) return err('no_property'); const o = p.objects[itemId]; if (!o) return err('not_found');
    const it = st.items[itemId]; const own = o.by === pid || it.o === pid;
    if (!(can(st, p, pid, own ? 'moveOwn' : 'moveOthers') || can(st, p, pid, 'moveOthers'))) return err('no_permission');
    const h = this.leaseHolder(p, itemId); if (h && h !== pid) return err('locked', { by: h });
    if (baseRev != null && baseRev !== o.rev) return err('stale', { rev: o.rev, obj: { id: itemId, ...o } });
    const def = DEFS[it.d]; const bad = validatePlacement(st, p, def, x, y, rot, itemId); if (bad) return err(bad);
    Object.assign(o, { x, y, rot }); o.rev++; bump(st, p); audit(p, pid, 'move', { d: it.d, x, y }); return { ok: true, obj: { id: itemId, ...o } };
  }
  moveGroup(pid, propId, moves) {                 // atomic: all valid or nothing
    const st = this.state; const p = this.prop(propId); if (!p) return err('no_property'); if (!Array.isArray(moves) || !moves.length || moves.length > 200) return err('bad_args');
    for (const m of moves) { const o = p.objects[m.id]; if (!o) return err('not_found'); const it = st.items[m.id]; const own = o.by === pid || it.o === pid; if (!can(st, p, pid, own ? 'moveOwn' : 'moveOthers') && !can(st, p, pid, 'moveOthers')) return err('no_permission'); const h = this.leaseHolder(p, m.id); if (h && h !== pid) return err('locked', { by: h }); }
    // validate against the layout with all moved objects removed, adding them one by one
    const backup = {}; for (const m of moves) backup[m.id] = { ...p.objects[m.id] };
    for (const m of moves) delete p.objects[m.id];
    const placed = [];
    let bad = null;
    for (const m of moves) { const def = DEFS[st.items[m.id].d]; bad = validatePlacement(st, p, def, m.x, m.y, m.rot ?? backup[m.id].rot); if (bad) break; p.objects[m.id] = { ...backup[m.id], x: m.x, y: m.y, rot: m.rot ?? backup[m.id].rot, rev: backup[m.id].rev + 1 }; placed.push(m.id); }
    if (bad) { for (const id of placed) delete p.objects[id]; for (const m of moves) p.objects[m.id] = backup[m.id]; return err(bad); }
    bump(st, p); audit(p, pid, 'moveGroup', { n: moves.length }); return { ok: true, objs: moves.map(m => ({ id: m.id, ...p.objects[m.id] })) };
  }
  remove(pid, propId, itemId) {
    const st = this.state; const p = this.prop(propId); if (!p) return err('no_property'); const o = p.objects[itemId]; if (!o) return err('not_found');
    const it = st.items[itemId]; const own = o.by === pid || it.o === pid;
    if (!(own ? can(st, p, pid, 'moveOwn') : can(st, p, pid, 'removeOthers'))) return err('no_permission');
    const h = this.leaseHolder(p, itemId); if (h && h !== pid) return err('locked', { by: h });
    if (itemsAt(st, 'store:' + itemId).length) return err('container_not_empty');
    const r = tx(st, [{ k: 'move', id: itemId, from: it.loc, to: 'inv:' + it.o }], { pid, reason: 'pickup' }); if (!r.ok) return err(r.err);
    delete p.objects[itemId]; if (p.leases) delete p.leases[itemId]; bump(st, p); audit(p, pid, 'remove', { d: it.d }); this.hooks.seatsFreed?.(propId, itemId);
    return { ok: true, returnedTo: it.o };
  }
  toggle(pid, propId, itemId) {
    const st = this.state; const p = this.prop(propId); if (!p?.objects[itemId]) return err('not_found'); if (!can(st, p, pid, 'use')) return err('no_permission');
    const def = DEFS[st.items[itemId].d]; if (def.interact !== 'toggle' && def.interact !== 'music') return err('not_toggle');
    const o = p.objects[itemId]; o.state = o.state ? 0 : 1; o.rev++; bump(st, p); return { ok: true, obj: { id: itemId, ...o } };
  }
  storeIn(pid, propId, containerId, itemId) {
    const st = this.state; const p = this.prop(propId); if (!p?.objects[containerId]) return err('not_found'); if (!can(st, p, pid, 'storage')) return err('no_permission');
    const cdef = DEFS[st.items[containerId].d]; if (cdef.interact !== 'storage') return err('not_container');
    if (itemsAt(st, 'store:' + containerId).length >= cdef.cap) return err('container_full');
    const it = st.items[itemId]; if (!it || it.loc !== 'inv:' + pid) return err('not_in_inventory'); if (itemId === containerId) return err('bad_args');
    const r = tx(st, [{ k: 'move', id: itemId, from: 'inv:' + pid, to: 'store:' + containerId }], { pid, reason: 'store' }); return r.ok ? { ok: true } : err(r.err);
  }
  storeOut(pid, propId, containerId, itemId) {
    const st = this.state; const p = this.prop(propId); if (!p?.objects[containerId]) return err('not_found'); if (!can(st, p, pid, 'storage')) return err('no_permission');
    const it = st.items[itemId]; if (!it || it.loc !== 'store:' + containerId) return err('not_found');
    if (it.o !== pid && p.owner !== pid) return err('not_yours');
    const r = tx(st, [{ k: 'move', id: itemId, from: it.loc, to: 'inv:' + it.o }], { pid, reason: 'store-out' }); return r.ok ? { ok: true } : err(r.err);
  }
  contents(containerId) { return itemsAt(this.state, 'store:' + containerId).map(i => ({ id: i.id, d: i.d, o: i.o })); }

  // ---------- building ----------
  setWall(pid, propId, x, y, type) {
    const st = this.state; const [e, p] = this._checkEditor(pid, propId, 'walls'); if (e) return e;
    if (![0, 1, 2, 3].includes(type) || !Number.isInteger(x) || !Number.isInteger(y)) return err('bad_args');
    if (x < 0 || y < 0 || x >= p.w || y >= p.h) return err('out_of_bounds');
    const border = x === 0 || y === 0 || x === p.w - 1 || y === p.h - 1; const door = doorOf(p);
    if (x === door.x && y === door.y) return err('entrance');
    if (border && ![1, 3].includes(type)) return err('border'); if (border && p.walls[key(x, y)] === undefined) return err('border');
    if (type === 2 && !border && !this._doorAllowed(p, x, y)) { /* doors may sit in any interior wall run */ }
    // nothing may be standing on the tile
    for (const [id, o] of Object.entries(p.objects)) { const d = DEFS[st.items[id].d]; if (d.layer === 'rug') continue; for (const [a, b] of objTiles(d, o.x, o.y, d.layer === 'wall' ? 0 : o.rot)) if (a === x && b === y) { if (d.layer === 'wall' && type === 1) continue; return err('tile_occupied'); } }
    const cur = p.walls[key(x, y)] || 0; if (cur === type) return { ok: true, nochange: true };
    const refund = TYPE_COST[cur] || 0, cost = TYPE_COST[type] || 0; const ops = [];
    if (cost > refund) ops.push({ k: 'xfer', from: pAcct(pid), to: ACCT.VOID, n: cost - refund }); else if (refund > cost) ops.push({ k: 'xfer', from: ACCT.VOID, to: pAcct(pid), n: refund - cost });
    // removing a wall that holds wall-art would orphan it
    if (cur === 1 && type !== 1) for (const [id, o] of Object.entries(p.objects)) { const d = DEFS[st.items[id].d]; if (d.layer === 'wall') for (const [a, b] of objTiles(d, o.x, o.y, 0)) if (a === x && b === y) return err('wall_has_item'); }
    if (ops.length) { const r = tx(st, ops, { pid, reason: 'wall' }); if (!r.ok) return err(r.err); }
    if (type === 0) delete p.walls[key(x, y)]; else p.walls[key(x, y)] = type;
    bump(st, p); this.hooks.event?.(pid, 'wall', type ? 1 : 0); return { ok: true, x, y, type };
  }
  _doorAllowed() { return true; }
  setFloors(pid, propId, tiles, color) {
    const st = this.state; const [e, p] = this._checkEditor(pid, propId, 'floors'); if (e) return e;
    if (!Array.isArray(tiles) || tiles.length > 600) return err('bad_args'); if (color !== null && !(Number.isInteger(color) && color >= 0 && color < FLOOR_COLORS.length)) return err('bad_color');
    for (const [x, y] of tiles) { if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= p.w || y >= p.h) return err('out_of_bounds'); if (color === null) delete p.floors[key(x, y)]; else p.floors[key(x, y)] = color; }
    bump(st, p); return { ok: true };
  }
  setWallColor(pid, propId, color) { const st = this.state; const [e, p] = this._checkEditor(pid, propId, 'floors'); if (e) return e; if (!(Number.isInteger(color) && color >= 0 && color < WALL_COLORS.length)) return err('bad_color'); p.wallColor = color; bump(st, p); return { ok: true }; }

  // ---------- blueprints ----------
  blueprintSave(pid, propId, name, rect) {
    const st = this.state; const p = this.prop(propId); if (!p) return err('no_property'); if (!can(st, p, pid, 'blueprint')) return err('no_permission');
    const pl = st.players[pid]; if (pl.blueprints.length >= 10) return err('blueprint_limit');
    const { x0, y0, x1, y1 } = rect; const items = [], walls = [], floors = [];
    for (const [id, o] of Object.entries(p.objects)) if (o.x >= x0 && o.y >= y0 && o.x <= x1 && o.y <= y1) items.push({ d: st.items[id].d, x: o.x - x0, y: o.y - y0, rot: o.rot });
    for (const [k, t] of Object.entries(p.walls)) { const [x, y] = k.split(',').map(Number); if (x > 0 && y > 0 && x < p.w - 1 && y < p.h - 1 && x >= x0 && y >= y0 && x <= x1 && y <= y1) walls.push({ x: x - x0, y: y - y0, t }); }
    for (const [k, c] of Object.entries(p.floors)) { const [x, y] = k.split(',').map(Number); if (x >= x0 && y >= y0 && x <= x1 && y <= y1) floors.push({ x: x - x0, y: y - y0, c }); }
    const bp = { id: 'bp' + Date.now().toString(36), name: String(name || 'Blueprint').slice(0, 24), w: x1 - x0 + 1, h: y1 - y0 + 1, items, walls, floors };
    pl.blueprints.push(bp); st.dirty.players = true; return { ok: true, bp };
  }
  blueprintBom(pid, bp) {
    const st = this.state; const need = {}; for (const i of bp.items) need[i.d] = (need[i.d] || 0) + 1;
    const have = {}; for (const it of itemsAt(st, 'inv:' + pid)) have[it.d] = (have[it.d] || 0) + 1;
    return Object.entries(need).map(([d, n]) => ({ d, need: n, have: have[d] || 0, missing: Math.max(0, n - (have[d] || 0)), price: DEFS[d]?.price || 0 }));
  }
  blueprintApply(pid, propId, bpId, ox, oy, skipInvalid = false) {
    const st = this.state; const [e, p] = this._checkEditor(pid, propId, 'blueprint'); if (e) return e; const pl = st.players[pid];
    const bp = pl.blueprints.find(b => b.id === bpId); if (!bp) return err('no_blueprint');
    // snapshot for atomic rollback
    const snap = JSON.stringify({ walls: p.walls, floors: p.floors }); const itemSnap = []; const placedIds = [];
    const fail = (code, extra) => { const s = JSON.parse(snap); p.walls = s.walls; p.floors = s.floors; for (const id of placedIds.reverse()) { tx(st, [{ k: 'move', id, from: 'placed:' + propId, to: 'inv:' + pid }], { pid, reason: 'bp-rollback' }); delete p.objects[id]; } return err(code, extra); };
    const skipped = [];
    for (const w of bp.walls) { const r = this.setWall(pid, propId, w.x + ox, w.y + oy, w.t); if (r.err && !skipInvalid) return fail(r.err, { at: [w.x + ox, w.y + oy] }); if (r.err) skipped.push(r.err); }
    for (const f of bp.floors) { const x = f.x + ox, y = f.y + oy; if (x >= 0 && y >= 0 && x < p.w && y < p.h) p.floors[key(x, y)] = f.c; }
    const mine = itemsAt(st, 'inv:' + pid); const used = new Set();
    for (const i of bp.items) {
      const it = mine.find(m => m.d === i.d && !used.has(m.id)); if (!it) { if (skipInvalid) { skipped.push('missing:' + i.d); continue; } return fail('missing_items', { d: i.d }); }
      const r = this.place(pid, propId, it.id, i.x + ox, i.y + oy, i.rot); if (r.err) { if (skipInvalid) { skipped.push(r.err); continue; } return fail(r.err, { d: i.d }); }
      used.add(it.id); placedIds.push(it.id);
    }
    bump(st, p); audit(p, pid, 'blueprint', { bp: bp.name, skipped: skipped.length }); return { ok: true, skipped: skipped.length, placed: placedIds.length };
  }

  // ---------- social/prestige ----------
  like(pid, propId) { const p = this.prop(propId); if (!p?.owner || p.owner === pid) return err('cannot'); const day = Math.floor(Date.now() / 86400e3); if (p.likes[pid] === day) return err('already_liked'); p.likes[pid] = day; bump(this.state, p); return { ok: true, likes: Object.keys(p.likes).length }; }
  style(p) {
    const defs = new Set(Object.keys(p.objects).map(id => this.state.items[id].d)); const n = Object.keys(p.objects).length;
    const score = defs.size * 4 + n * 0.5 + Object.keys(p.floors).length * 0.1 + Object.keys(p.likes || {}).length * 5;
    const stars = score >= 400 ? 5 : score >= 220 ? 4 : score >= 110 ? 3 : score >= 45 ? 2 : score >= 10 ? 1 : 0; return { score: Math.round(score), stars, variety: defs.size };
  }
  tickUpkeep(pid, seconds) {   // called with the owner's online seconds
    const st = this.state; const pl = st.players[pid];
    for (const id of pl.props) {
      const p = st.props[id]; const def = PROPERTIES[id]; p.upkeep.played += seconds;
      const period = st.meta.settings.upkeepSec;
      while (p.upkeep.played >= period) {
        p.upkeep.played -= period;
        const r = tx(st, [{ k: 'xfer', from: pAcct(pid), to: ACCT.VOID, n: def.upkeep }], { pid, reason: 'upkeep:' + id });
        if (!r.ok) { p.upkeep.arrears = Math.min(4, p.upkeep.arrears + 1); if (p.upkeep.arrears >= 4) p.upkeep.dusty = true; this.hooks.notify?.(pid, `Upkeep for ${p.name} is overdue (${p.upkeep.arrears}/4). Pay at the Town Hall.`); }
        else this.hooks.notify?.(pid, `Paid ${def.upkeep} Coins upkeep for ${p.name}.`);
      }
      st.dirty.props = true;
    }
  }
  payArrears(pid, propId) {
    const st = this.state; const p = st.props[propId]; if (!p || p.owner !== pid) return err('not_owner'); const def = PROPERTIES[propId]; if (!p.upkeep.arrears) return err('nothing_due');
    const n = def.upkeep * p.upkeep.arrears; const r = tx(st, [{ k: 'xfer', from: pAcct(pid), to: ACCT.VOID, n }], { pid, reason: 'arrears' }); if (!r.ok) return err(r.err);
    p.upkeep.arrears = 0; p.upkeep.dusty = false; st.dirty.props = true; return { ok: true, paid: n };
  }
  view(propId) {      // public snapshot sent to people inside
    const p = this.prop(propId); const st = this.state;
    const objects = Object.entries(p.objects).map(([id, o]) => ({ id: +id, d: st.items[id].d, o: st.items[id].o, ...o }));
    return { id: p.id, name: p.name, w: p.w, h: p.h, walls: p.walls, floors: p.floors, wallColor: p.wallColor, rev: p.rev, objects, owner: p.owner, access: p.access, rules: p.rules, entry: doorOf(p), cap: cap(p), count: objects.length, tier: p.tier };
  }
}
