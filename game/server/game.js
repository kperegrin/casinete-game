// Casinete Host: authoritative game server core (sessions, locations, movement, chat, looks, inventory, shops, progression).
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { Store, newState } from './persistence.js';
import { tx, audit, pAcct, ACCT, itemsAt, credit } from './ledger.js';
import { RoundRng } from './rng.js';
import { Housing, newProperty, spawnOf, doorOf, solidAt, roleOf, can } from './housing.js';
import * as M from '../shared/map.js';
import { DEFS, SHOPS, PROPERTIES, COSMETICS, FREE_LOOK, SKIN_COLORS, HAIR_COLORS, CLOTH_COLORS, HAIR_STYLES, BODIES, ACHIEVEMENTS, TITLES, xpForLevel, levelFromXp, sellValue, EMOTES } from '../shared/content.js';

export const SPEED = 5.2;
const BAD = ['fuck', 'shit', 'bitch', 'cunt', 'nigger', 'faggot'];
export const filterText = (t) => BAD.reduce((s, w) => s.replace(new RegExp(w, 'ig'), (m) => '*'.repeat(m.length)), t);
const sha = (s) => createHash('sha256').update(s).digest('hex');
const OUT = M.buildOutdoor();

export class Game {
  constructor(opts = {}) {
    this.opts = opts; this.log = opts.log || (() => {}); this.sessions = new Map(); this.byWs = new Map(); this.cmds = {}; this.tables = {}; this.trades = new Map(); this.parties = new Map(); this.friendReq = new Map(); this.seatClaims = new Map(); this.clock = opts.clock || (() => Date.now());
    this.store = new Store(opts.dir || path.resolve('saves', opts.world || 'default'));
    if (this.store.exists()) { const { state, recovery } = this.store.load(); this.state = state; for (const r of recovery) this.log('RECOVERY: ' + r); }
    else { this.state = newState(opts.world || 'Marigold Bay', { settings: opts.settings }); }
    const st = this.state; Object.assign(st.meta.settings, opts.settings || {});
    st.meta.dayOffset ??= 0;
    for (const def of Object.values(PROPERTIES)) if (!st.props[def.id]) st.props[def.id] = newProperty(def);
    this.housing = new Housing(st, {
      event: (pid, ev, n) => this.ev(pid, ev, n), placedDef: (pid, d) => this.ev(pid, 'placeUnique', 1, d),
      occupants: (propId) => this.members('home:' + propId).size, notify: (pid, text) => this.note(pid, text),
      seatsFreed: (propId, itemId) => this.freeSeatsOf(propId, itemId), rolesChanged: (propId, pid) => this.rolesChanged(propId, pid),
    });
    this.homeSolid = (propId, x, y) => solidAt(st, st.props[propId], x, y);
    this.outSolid = new Set(M.SOLID_TILES);
    this.initInteriors();
    for (const install of (opts.modules || [])) install(this);
    this.timers = { move: 0, save: 0, upkeep: 0, social: 0, slow: 0 };
    this.cooldownOps = {};
  }
  now() { return this.clock(); }
  today() { return Math.floor(this.now() / 86400e3) + (this.state.meta.dayOffset || 0); }

  // ---------------- interiors / locations ----------------
  initInteriors() {
    this.interiors = {};
    for (const [id, def] of Object.entries(M.INTERIORS)) {
      const solid = new Set(def.walls.map(([x, y]) => x + ',' + y));
      for (const t of def.things) if (t.w) { const x0 = Math.floor(t.x - t.w / 2), y0 = Math.floor(t.y - t.h / 2); for (let i = 0; i < t.w; i++) for (let j = 0; j < t.h; j++) solid.add((x0 + i) + ',' + (y0 + j)); } else if (['slots', 'shop', 'cashier', 'horses', 'props', 'salon', 'achievements'].includes(t.k)) solid.add(Math.floor(t.x) + ',' + Math.floor(t.y));
      this.interiors[id] = { ...def, id, solid };
    }
  }
  locKind(loc) { return loc === 'world' ? 'world' : loc.startsWith('home:') ? 'home' : 'public'; }
  isSolid(loc, x, y) {
    const tx_ = Math.floor(x), ty_ = Math.floor(y);
    if (loc === 'world') { if (tx_ < 0 || ty_ < 0 || tx_ >= M.W || ty_ >= M.H) return true; return this.outSolid.has(OUT[ty_ * M.W + tx_]); }
    if (loc.startsWith('home:')) return this.homeSolid(loc.slice(5), tx_, ty_);
    const it = this.interiors[loc]; if (!it) return true; if (tx_ < 0 || ty_ < 0 || tx_ >= it.w || ty_ >= it.h) return true; return it.solid.has(tx_ + ',' + ty_);
  }
  members(loc) { const s = new Set(); for (const se of this.sessions.values()) if (se.loc === loc) s.add(se.pid); return s; }
  things(loc) {
    if (loc === 'world') return [...M.OUTDOOR_THINGS, ...M.POSTCARDS];
    if (loc.startsWith('home:')) return [];
    return this.interiors[loc]?.things || [];
  }
  npcs(loc) { if (loc === 'world') return M.OUTDOOR_NPCS; return this.interiors[loc]?.npcs || []; }

  // ---------------- sessions ----------------
  send(s, obj) { try { if (s.ws.readyState === 1) s.ws.send(JSON.stringify(obj)); } catch { /* closed */ } }
  toPid(pid, obj) { const s = this.sessions.get(pid); if (s) this.send(s, obj); }
  toLoc(loc, obj, except) { for (const s of this.sessions.values()) if (s.loc === loc && s.pid !== except) this.send(s, obj); }
  toAll(obj) { for (const s of this.sessions.values()) this.send(s, obj); }
  note(pid, text, kind = 'info') { this.toPid(pid, { t: 'note', text, kind }); }
  online(pid) { return this.sessions.has(pid); }
  nameOf(pid) { return this.state.players[pid]?.name || '???'; }

  pub(pid) {
    const p = this.state.players[pid], s = this.sessions.get(pid);
    return { id: pid, name: p.name, look: p.look, title: p.title, level: p.level, x: s?.x, y: s?.y, dir: s?.dir || 0, emote: s?.emote || null, sit: s?.sit || null };
  }
  me(pid) {
    const p = this.state.players[pid];
    return { id: pid, name: p.name, coins: p.coins, stars: p.stars, xp: p.xp, level: p.level, bxp: p.bxp, sxp: p.sxp, exp: p.exp, title: p.title, titles: p.titles, look: p.look, props: p.props, friends: p.friends.map(f => ({ id: f, name: this.nameOf(f), online: this.online(f) })), ach: p.ach, daily: p.daily, stats: p.stats, favorites: p.favorites, blueprints: p.blueprints, found: p.found, casino: { net: p.casino.net, coolOff: p.casino.coolOff }, pending: p.pending, bio: p.bio, settings: p.settings };
  }
  invList(pid) {
    const out = []; for (const loc of ['inv:' + pid, 'eq:' + pid, 'mail:' + pid]) for (const it of itemsAt(this.state, loc)) out.push({ id: it.id, d: it.d, loc: loc.split(':')[0], ser: it.ser });
    return out;
  }
  pushMe(pid) { this.toPid(pid, { t: 'me', me: this.me(pid) }); }
  pushInv(pid) { const s = this.sessions.get(pid); if (s) { s.invDirty = true; } }

  createPlayer(name, tokenHash, look) {
    const st = this.state; const id = tokenHash.slice(0, 16);
    const p = { id, name, tokenHash, look: this.sanitizeLook(look, null), coins: 0, stars: 0, xp: 0, bxp: 0, sxp: 0, exp: 0, level: 1, title: null, titles: [], ach: {}, sets: {}, stats: { chat: 0 }, daily: { day: 0, streak: 0 }, friends: [], props: [], favorites: [], blueprints: [], found: [], settings: {}, bio: '', badges: [], casino: { day: this.today(), net: 0, coolOff: 0, sessionStart: 0 }, pending: null, pos: { loc: 'world', x: M.SPAWN.x, y: M.SPAWN.y }, firstSeen: this.now(), lastSeen: this.now(), playtime: 0, act: { day: 0, fish: 0, deliver: 0 }, sessionNo: 0 };
    st.players[id] = p; st.dirty.players = true;
    tx(st, [{ k: 'xfer', from: ACCT.MINT, to: pAcct(id), n: 5000 }], { pid: id, reason: 'starter' });       // starter package
    // starter clothes are free defs (no item needed)
    return p;
  }

  // ---------------- looks ----------------
  sanitizeLook(l, pid) {
    l = l || {};
    const n = (v, max, def = 0) => Number.isInteger(v) && v >= 0 && v < max ? v : def;
    const out = { body: n(l.body, BODIES.length, 1), skin: n(l.skin, SKIN_COLORS.length, 2), hairStyle: n(l.hairStyle, HAIR_STYLES.length, 1), hairColor: n(l.hairColor, HAIR_COLORS.length, 1), eyes: n(l.eyes, 6, 0), topColor: n(l.topColor, CLOTH_COLORS.length, 0), bottomColor: n(l.bottomColor, CLOTH_COLORS.length, 6), shoeColor: n(l.shoeColor, CLOTH_COLORS.length, 7), height: Math.max(-10, Math.min(10, Number.isInteger(l.height) ? l.height : 0)) };
    for (const slot of ['top', 'bottom', 'shoes', 'hat', 'glasses', 'back', 'acc', 'full']) out[slot] = typeof l[slot] === 'string' && DEFS[l[slot]]?.type === 'cosmetic' ? l[slot] : null;
    for (const [slot, def] of Object.entries(FREE_LOOK)) if (!out[slot] && !out.full) out[slot] = def;
    return out;
  }
  // Validates ownership of every worn cosmetic and moves items between inventory and equipped.
  setLook(pid, want, { fee = 0, free = false } = {}) {
    const st = this.state, p = st.players[pid];
    const look = this.sanitizeLook(want, pid); const ops = [];
    const eq = itemsAt(st, 'eq:' + pid); const keepIds = new Set();
    const slotOf = (d) => DEFS[d].slot;
    for (const slot of ['top', 'bottom', 'shoes', 'hat', 'glasses', 'back', 'acc', 'full']) {
      const d = look[slot]; if (!d) continue;
      const def = DEFS[d]; if (def.slot !== slot) return { err: 'bad_slot' };
      if (def.free) continue;
      if (slot === 'full' && (look.top && !DEFS[look.top].free || look.bottom && !DEFS[look.bottom].free)) return { err: 'conflict' };
      let it = eq.find(i => i.d === d && !keepIds.has(i.id));
      if (!it) { it = itemsAt(st, 'inv:' + pid).find(i => i.d === d && !keepIds.has(i.id)); if (!it) return { err: 'not_owned', d }; ops.push({ k: 'move', id: it.id, from: it.loc, to: 'eq:' + pid }); }
      keepIds.add(it.id);
    }
    if (look.full) { look.top = null; look.bottom = null; }
    for (const it of eq) if (!keepIds.has(it.id)) ops.push({ k: 'move', id: it.id, from: it.loc, to: 'inv:' + pid });
    if (fee) ops.unshift({ k: 'xfer', from: pAcct(pid), to: ACCT.VOID, n: fee });
    const r = tx(st, ops, { pid, reason: 'look' }); if (!r.ok) return { err: r.err };
    p.look = look; st.dirty.players = true;
    const s = this.sessions.get(pid); if (s) { this.toLoc(s.loc, { t: 'look', id: pid, look }); this.pushInv(pid); }
    return { ok: true, look };
  }

  // ---------------- progression ----------------
  addXp(pid, kind, n) {
    const p = this.state.players[pid]; if (!p || n <= 0) return;
    const key = { player: 'xp', builder: 'bxp', social: 'sxp', explorer: 'exp' }[kind] || 'xp';
    p[key] += n; if (key !== 'xp') p.xp += Math.ceil(n * 0.5);
    const lv = levelFromXp(p.xp); if (lv > p.level) { p.level = lv; this.note(pid, `Level up! You are now level ${lv}`, 'good'); const reward = lv * 100; credit(this.state, pid, reward, 'levelup'); this.note(pid, `+${reward} Coins level reward`, 'good'); if (lv % 5 === 0) { p.stars += 1; this.note(pid, '+1 Star milestone!', 'good'); } }
    this.state.dirty.players = true;
  }
  ev(pid, name, n = 1, uniq) {
    const p = this.state.players[pid]; if (!p) return;
    for (const a of ACHIEVEMENTS) {
      if (a.ev !== name) continue; const rec = p.ach[a.id] || (p.ach[a.id] = { p: 0, done: false });
      if (rec.done) continue;
      if (uniq !== undefined) { const key = name; p.sets[key] = p.sets[key] || []; if (p.sets[key].includes(uniq)) continue; p.sets[key].push(uniq); rec.p = p.sets[key].length; }
      else rec.p += n;
      if (rec.p >= a.target) { rec.done = true; rec.p = a.target; credit(this.state, pid, a.coins || 0, 'achv:' + a.id); if (a.stars) p.stars += a.stars; if (a.title && !p.titles.includes(a.title)) p.titles.push(a.title); this.note(pid, `🏆 Achievement: ${a.name} (+${a.coins} Coins${a.stars ? ', +' + a.stars + '★' : ''})`, 'good'); this.addXp(pid, 'player', 40); this.pushMe(pid); }
      this.state.dirty.players = true;
    }
  }

  // ---------------- message loop ----------------
  onConnect(ws, req) {
    const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req?.socket?.remoteAddress);
    const s = { ws, pid: null, loc: 'world', x: 0, y: 0, dir: 0, lastMv: this.now(), bucket: 60, bucketAt: this.now(), isHost: local, ip: req?.socket?.remoteAddress, chatTimes: [], strikes: 0, seat: null, invDirty: false, sit: null, emote: null };
    this.byWs.set(ws, s);
    ws.on('message', (raw) => { try { this.onMessage(s, raw.toString()); } catch (e) { this.log('handler error: ' + (e.stack || e)); this.send(s, { t: 'r', i: -1, ok: false, err: 'server_error' }); } });
    ws.on('close', () => this.onClose(s));
    ws.on('error', () => {});
  }
  onClose(s) {
    this.byWs.delete(s.ws);
    if (s.pid && this.sessions.get(s.pid) === s) { this.leaveWorld(s, 'left'); this.sessions.delete(s.pid); this.toAll({ t: 'presence', id: s.pid, online: false }); }
  }
  rate(s, cost = 1) {
    const now = this.now(); s.bucket = Math.min(this.opts.rateBurst ?? 80, s.bucket + (now - s.bucketAt) / 1000 * (this.opts.rateRefill ?? 40)); s.bucketAt = now;
    if (s.bucket < cost) { s.strikes++; return false; } s.bucket -= cost; return true;
  }
  onMessage(s, raw) {
    if (raw.length > 20000) { s.ws.close(); return; }
    const m = JSON.parse(raw);
    if (m.t === 'hello') return this.hello(s, m);
    if (!s.pid) return;
    if (m.t === 'mv') return this.onMove(s, m);
    if (m.t === 'drag') return this.onDrag(s, m);
    if (m.t !== 'c') return;
    if (!this.rate(s, 1)) { this.send(s, { t: 'r', i: m.i, ok: false, err: 'rate_limited' }); if (s.strikes > 200) s.ws.close(); return; }
    const fn = this.cmds[m.k];
    if (!fn) return this.send(s, { t: 'r', i: m.i, ok: false, err: 'unknown_command' });
    let res; try { res = fn.call(this, s, m) || { ok: true }; } catch (e) { this.log(`cmd ${m.k} failed: ${e.stack}`); res = { err: 'server_error' }; }
    this.send(s, { t: 'r', i: m.i, ok: !res.err, ...res });
  }

  hello(s, m) {
    const st = this.state;
    if (s.pid) return;
    if (m.proto !== 1) { this.send(s, { t: 'reject', reason: 'version_mismatch' }); return s.ws.close(); }
    const token = String(m.token || ''); if (token.length < 16) { this.send(s, { t: 'reject', reason: 'bad_token' }); return s.ws.close(); }
    const th = sha(token); const id = th.slice(0, 16);
    if (st.meta.banned?.[id]) { this.send(s, { t: 'reject', reason: 'banned' }); return s.ws.close(); }
    if (st.meta.settings.password && m.password !== st.meta.settings.password) { this.send(s, { t: 'reject', reason: 'wrong_password' }); return s.ws.close(); }
    let p = st.players[id]; let isNew = false;
    if (p && p.tokenHash !== th) { this.send(s, { t: 'reject', reason: 'bad_token' }); return s.ws.close(); }
    if (!p) {
      if (this.sessions.size >= (st.meta.settings.maxPlayers || 16)) { this.send(s, { t: 'reject', reason: 'full' }); return s.ws.close(); }
      let name = String(m.name || 'Guest').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 16) || 'Guest';
      if (st.meta.settings.filter) name = filterText(name);
      if (Object.values(st.players).some(o => o.name.toLowerCase() === name.toLowerCase())) name = name + '#' + id.slice(0, 3).toUpperCase();
      p = this.createPlayer(name, th, m.look); isNew = true;
    }
    const old = this.sessions.get(id); if (old) { old.ws.close(); this.leaveWorld(old, 'replaced'); }
    s.pid = id; this.sessions.set(id, s); p.lastSeen = this.now(); p.sessionNo++;
    if (s.isHost) st.meta.host = id;
    p.casino.sessionStart = this.now(); s.joinedAt = this.now();
    let loc = p.pos.loc, x = p.pos.x, y = p.pos.y;
    if (loc.startsWith('home:') || !this.interiors[loc] && loc !== 'world' || this.isSolid(loc, x, y)) { loc = 'world'; x = M.SPAWN.x; y = M.SPAWN.y; }
    s.loc = loc; s.x = x; s.y = y;
    this.send(s, { t: 'welcome', you: this.me(id), inv: this.invList(id), isNew, isHost: s.isHost, world: { name: st.meta.name, settings: { casino: st.meta.settings.casino, cheats: st.meta.settings.cheats && s.isHost, filter: st.meta.settings.filter }, interiors: Object.fromEntries(Object.entries(this.interiors).map(([k, v]) => [k, { name: v.name, w: v.w, h: v.h, floor: v.floor, walls: v.walls, things: v.things, npcs: v.npcs, exit: v.exit, music: v.music }])), props: this.propList(), recovery: st.recovery || [] }, serverTime: this.now() });
    this.enterLoc(s, loc, x, y, true);
    this.toAll({ t: 'presence', id, online: true, name: p.name });
    this.ev(id, 'join', 1);
    this.log(`${p.name} joined (${isNew ? 'new' : 'returning'})`);
    this.toAll({ t: 'chat', ch: 'system', text: `${p.name} joined` });
  }
  propList() { return Object.values(this.state.props).map(p => { const d = PROPERTIES[p.id]; return { id: p.id, name: p.name, tier: d.tier, price: d.price, w: d.w, h: d.h, cap: d.cap, minLevel: d.minLevel || 0, owner: p.owner, ownerName: p.owner ? this.nameOf(p.owner) : null, access: p.access, style: p.owner ? this.housing.style(p) : null, likes: Object.keys(p.likes || {}).length, dusty: p.upkeep?.dusty, upkeep: d.upkeep }; }); }

  leaveWorld(s, why) {
    const p = this.state.players[s.pid]; if (!p) return;
    this.leaveLoc(s); p.pos = { loc: s.loc.startsWith('home:') ? 'world' : s.loc, x: s.x, y: s.y }; p.lastSeen = this.now();
    p.playtime += Math.floor((this.now() - s.joinedAt) / 1000); this.state.dirty.players = true;
    this.housing.releaseAll(s.pid); this.freeSeatsOfPlayer(s.pid);
    for (const fn of this.leaveHooks || []) fn(s.pid);
    this.log(`${p.name} left (${why})`);
    this.toAll({ t: 'chat', ch: 'system', text: `${p.name} left` });
    this.store.save(this.state);        // flush on leave
  }

  // ---------------- locations ----------------
  leaveLoc(s) {
    const old = s.loc; s.sit && this.freeSeatsOfPlayer(s.pid); s.sit = null;
    this.toLoc(old, { t: 'leave', id: s.pid }, s.pid);
    if (old.startsWith('home:')) this.housing.releaseAll(s.pid);
    for (const fn of this.locHooks || []) fn(s.pid, old, null);
  }
  enterLoc(s, loc, x, y, initial = false) {
    if (!initial) this.leaveLoc(s);
    s.loc = loc; s.x = x; s.y = y; s.sit = null; s.emote = null; s.lastMv = this.now();
    const p = this.state.players[s.pid];
    let snap;
    if (loc === 'world') snap = { kind: 'world' };
    else if (loc.startsWith('home:')) snap = { kind: 'home', home: this.housing.view(loc.slice(5)), role: roleOf(this.state, this.state.props[loc.slice(5)], s.pid) };
    else snap = { kind: 'public', id: loc };
    const players = []; for (const o of this.sessions.values()) if (o.loc === loc && o.pid !== s.pid) players.push(this.pub(o.pid));
    this.send(s, { t: 'loc', loc, x, y, snap, players, tables: this.tablesIn(loc, s.pid), npcs: loc === 'world' ? undefined : undefined });
    this.toLoc(loc, { t: 'join', p: this.pub(s.pid) }, s.pid);
    for (const fn of this.locHooks || []) fn(s.pid, null, loc);
    this.pushInv(s.pid); this.pushMe(s.pid);
    if (loc.startsWith('home:')) {
      const prop = this.state.props[loc.slice(5)];
      if (prop.owner && prop.owner !== s.pid) { this.ev(s.pid, 'visitUnique', 1, prop.id); this.ev(prop.owner, 'hostUnique', 1, s.pid); this.addXp(s.pid, 'social', 8); prop.visitors[s.pid] = this.now(); }
      if (prop.owner && prop.rules && prop.owner !== s.pid) this.note(s.pid, `House rules: ${prop.rules}`);
    }
  }
  tablesIn(loc, pid) { return {}; }   // overridden by the casino module

  // ---------------- movement ----------------
  onMove(s, m) {
    const now = this.now(); const dt = Math.min(0.6, Math.max(0.02, (now - s.lastMv) / 1000));
    const x = +m.x, y = +m.y; if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const d = Math.hypot(x - s.x, y - s.y);
    if (s.sit && d > 0.3) { s.sit = null; this.freeSeatsOfPlayer(s.pid); this.toLoc(s.loc, { t: 'unsit', id: s.pid }); }
    if (d > SPEED * dt * 1.8 + 0.8 || this.isSolid(s.loc, x, y)) { s.strikes += d > 3 ? 2 : 0; this.send(s, { t: 'snap', x: s.x, y: s.y, seq: m.seq }); return; }
    s.lastMv = now; s.x = x; s.y = y; s.dir = m.d | 0; if (s.emote && d > 0.05) s.emote = null; s.moved = true;
    if (s.strikes > 300) { s.ws.close(); }
  }
  onDrag(s, m) { if (!s.loc.startsWith('home:')) return; const p = this.state.props[s.loc.slice(5)]; if (this.housing.leaseHolder(p, m.id) === s.pid) this.toLoc(s.loc, { t: 'drag', id: m.id, x: +m.x, y: +m.y, rot: m.rot | 0, by: s.pid }, s.pid); }
  near(s, x, y, r = 3.2) { return Math.hypot(s.x - x, s.y - y) <= r; }
  thingNear(s, id, r = 3.6) {
    const t = this.things(s.loc).find(t => t.id === id); if (!t) return null;
    const rr = Math.max(r, (t.w || 1) / 2 + 1.8); return this.near(s, t.x, t.y, rr) ? t : null;
  }

  // ---------------- seats ----------------
  claimSeat(s, key, slots, x, y, kind) {
    for (let i = 0; i < slots; i++) { const k = key + '#' + i; if (!this.seatClaims.has(k)) { this.freeSeatsOfPlayer(s.pid); this.seatClaims.set(k, s.pid); s.sit = { kind, key: k, x, y }; return { ok: true, slot: i }; } }
    return { err: 'occupied' };
  }
  freeSeatsOfPlayer(pid) { for (const [k, v] of this.seatClaims) if (v === pid) this.seatClaims.delete(k); const s = this.sessions.get(pid); if (s) s.sit = null; }
  freeSeatsOf(propId, itemId) { const pre = `home:${propId}:${itemId}#`; for (const [k, v] of this.seatClaims) if (k.startsWith(pre)) { this.seatClaims.delete(k); const s = this.sessions.get(v); if (s) { s.sit = null; this.toLoc(s.loc, { t: 'unsit', id: v }); } } }
  rolesChanged(propId, pid) { const s = this.sessions.get(pid); if (s && s.loc === 'home:' + propId) this.send(s, { t: 'role', role: roleOf(this.state, this.state.props[propId], pid) }); }

  // ---------------- tick ----------------
  tick(dtMs) {
    const t = this.timers; for (const k in t) t[k] += dtMs;
    for (const fn of this.tickHooks || []) fn(this.now());
    if (t.move >= 100) {                                   // 10 Hz position broadcast per location
      t.move = 0; const byLoc = new Map();
      for (const s of this.sessions.values()) { if (!s.moved) continue; s.moved = false; if (!byLoc.has(s.loc)) byLoc.set(s.loc, []); byLoc.get(s.loc).push([s.pid, +s.x.toFixed(2), +s.y.toFixed(2), s.dir]); }
      for (const [loc, arr] of byLoc) this.toLoc(loc, { t: 'pos', p: arr });
    }
    for (const s of this.sessions.values()) if (s.invDirty) { s.invDirty = false; this.send(s, { t: 'inv', inv: this.invList(s.pid) }); }
    if (t.upkeep >= 10000) {
      t.upkeep = 0;
      for (const s of this.sessions.values()) { this.housing.tickUpkeep(s.pid, 10); }
    }
    if (t.social >= 60000) {
      t.social = 0; const perLoc = new Map(); for (const s of this.sessions.values()) perLoc.set(s.loc, (perLoc.get(s.loc) || 0) + 1);
      for (const s of this.sessions.values()) { if (perLoc.get(s.loc) > 1) this.addXp(s.pid, 'social', 5); this.addXp(s.pid, 'player', 3); }
    }
    if (t.save >= (this.opts.saveEveryMs || 30000)) { t.save = 0; this.save(); }
    if (t.slow >= 5000) { t.slow = 0; this.store.maybeBackup(this.state, this.now(), this.opts.backupIntervals); }
  }
  save(force = false) { try { return this.store.save(this.state, { force }); } catch (e) { this.log('SAVE FAILED: ' + e.message); } }
  audit() { return audit(this.state); }
}
