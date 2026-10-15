// Social systems (friends, parties, trading, gifting), activities (fishing, courier) and Host/dev tools.
import * as M from '../shared/map.js';
import { DEFS, PROPERTIES } from '../shared/content.js';
import { tx, pAcct, ACCT, itemsAt, credit, audit } from './ledger.js';
import { spawnOf } from './housing.js';
import { RoundRng } from './rng.js';

export function install(g) {
  const st = g.state; const E = (e, x = {}) => ({ err: e, ...x });
  const byName = (name) => Object.values(st.players).find(p => p.name.toLowerCase() === String(name || '').toLowerCase());
  const target = (m) => st.players[m.id] || byName(m.name);

  // ---------- friends ----------
  g.cmds['friend.add'] = (s, m) => {
    const t = target(m); if (!t || t.id === s.pid) return E('no_player'); const me = st.players[s.pid]; if (me.friends.includes(t.id)) return E('already_friends');
    const set = g.friendReq.get(t.id) || new Set(); set.add(s.pid); g.friendReq.set(t.id, set);
    // mutual request = instant friendship
    if (g.friendReq.get(s.pid)?.has(t.id)) return g.cmds['friend.accept'](s, { id: t.id });
    g.toPid(t.id, { t: 'friendreq', from: me.name, fromId: s.pid }); return { ok: true, sent: true };
  };
  g.cmds['friend.accept'] = (s, m) => {
    const me = st.players[s.pid], o = st.players[m.id]; if (!o) return E('no_player');
    if (!g.friendReq.get(s.pid)?.has(o.id) && !g.friendReq.get(o.id)?.has(s.pid)) return E('no_request');
    for (const [a, b] of [[me, o], [o, me]]) if (!a.friends.includes(b.id)) a.friends.push(b.id);
    g.friendReq.get(s.pid)?.delete(o.id); g.friendReq.get(o.id)?.delete(s.pid); st.dirty.players = true;
    g.ev(s.pid, 'friend', 1); g.ev(o.id, 'friend', 1); g.pushMe(s.pid); g.pushMe(o.id); g.note(o.id, `${me.name} is now your friend!`, 'good'); return { ok: true };
  };
  g.cmds['friend.remove'] = (s, m) => { const me = st.players[s.pid], o = st.players[m.id]; if (!o) return E('no_player'); me.friends = me.friends.filter(x => x !== o.id); o.friends = o.friends.filter(x => x !== me.id); st.dirty.players = true; g.pushMe(s.pid); g.pushMe(o.id); return { ok: true }; };
  g.cmds['players.online'] = (s) => ({ ok: true, players: [...g.sessions.values()].map(o => ({ id: o.pid, name: g.nameOf(o.pid), level: st.players[o.pid].level, loc: o.loc.startsWith('home:') ? 'in a home' : (o.loc === 'world' ? (M.districtAt(o.x, o.y)?.name || 'Marigold Bay') : g.interiors[o.loc]?.name) })) });

  // ---------- party ----------
  const partyOfPid = new Map();
  g.partyOf = (pid) => { const id = partyOfPid.get(pid); return id ? g.parties.get(id) : null; };
  const pushParty = (party) => { for (const pid of party.members) g.toPid(pid, { t: 'party', party: party && { leader: party.leader, members: [...party.members].map(p => ({ id: p, name: g.nameOf(p) })) } }); };
  const leaveParty = (pid) => { const party = g.partyOf(pid); if (!party) return; party.members.delete(pid); partyOfPid.delete(pid); g.toPid(pid, { t: 'party', party: null }); if (party.members.size < 2) { for (const p of party.members) { partyOfPid.delete(p); g.toPid(p, { t: 'party', party: null }); } g.parties.delete(party.id); } else { if (party.leader === pid) party.leader = [...party.members][0]; pushParty(party); } };
  g.leaveHooks = g.leaveHooks || []; g.leaveHooks.push((pid) => { leaveParty(pid); cancelTradeOf(pid); });
  g.cmds['party.invite'] = (s, m) => {
    const t = target(m); if (!t || !g.online(t.id) || t.id === s.pid) return E('not_online'); if (g.partyOf(t.id)) return E('already_in_party');
    let party = g.partyOf(s.pid); if (!party) { party = { id: 'pt' + Date.now().toString(36), leader: s.pid, members: new Set([s.pid]) }; g.parties.set(party.id, party); partyOfPid.set(s.pid, party.id); }
    if (party.leader !== s.pid) return E('leader_only'); if (party.members.size >= 6) return E('party_full');
    party.invites = party.invites || new Set(); party.invites.add(t.id); g.toPid(t.id, { t: 'partyinvite', from: g.nameOf(s.pid), fromId: s.pid, party: party.id }); return { ok: true };
  };
  g.cmds['party.accept'] = (s, m) => { const party = g.parties.get(m.party); if (!party?.invites?.has(s.pid)) return E('no_invite'); if (g.partyOf(s.pid)) return E('already_in_party'); party.invites.delete(s.pid); party.members.add(s.pid); partyOfPid.set(s.pid, party.id); pushParty(party); return { ok: true }; };
  g.cmds['party.leave'] = (s) => { leaveParty(s.pid); return { ok: true }; };
  g.cmds['party.goto'] = (s) => {
    const party = g.partyOf(s.pid); if (!party) return E('no_party'); if (party.leader === s.pid) return E('you_are_leader'); const l = g.sessions.get(party.leader); if (!l) return E('leader_offline');
    if (l.loc.startsWith('home:')) { const ok = g.housing.canEnter(s.pid, l.loc.slice(5)); if (ok.err) return ok; }
    if (s.loc !== l.loc) g.enterLoc(s, l.loc, l.x + 0.5, l.y + 0.5); else { s.x = l.x + 0.6; s.y = l.y; g.send(s, { t: 'snap', x: s.x, y: s.y }); } return { ok: true };
  };

  // ---------- trading ----------
  const tradeOf = (pid) => { for (const t of g.trades.values()) if (t.a === pid || t.b === pid) return t; return null; };
  const view = (t, pid) => { const me = pid === t.a ? 'a' : 'b', th = me === 'a' ? 'b' : 'a'; const mk = (side) => ({ items: t.offer[side].items.map(id => ({ id, d: st.items[id]?.d })), coins: t.offer[side].coins }); return { t: 'trade', id: t.id, with: g.nameOf(t[th]), withId: t[th], mine: mk(me), theirs: mk(th), lock: { me: t.lock[me], them: t.lock[th] }, confirm: { me: t.confirm[me], them: t.confirm[th] }, lockedAt: t.lockedAt, state: t.state }; };
  const push = (t) => { g.toPid(t.a, view(t, t.a)); g.toPid(t.b, view(t, t.b)); };
  const cancelTradeOf = (pid, why = 'Trade cancelled.') => { const t = tradeOf(pid); if (!t) return; g.trades.delete(t.id); for (const p of [t.a, t.b]) g.toPid(p, { t: 'tradeend', ok: false, why }); };
  g.locHooks = g.locHooks || []; g.locHooks.push((pid, oldLoc) => { if (oldLoc) cancelTradeOf(pid, 'Trade cancelled (moved away).'); });
  g.cmds['trade.req'] = (s, m) => {
    const t = target(m); const o = t && g.sessions.get(t.id); if (!o || o.loc !== s.loc || t.id === s.pid) return E('not_nearby'); if (Math.hypot(o.x - s.x, o.y - s.y) > 12) return E('too_far');
    if (tradeOf(s.pid) || tradeOf(t.id)) return E('busy');
    const tr = { id: 'tr' + Date.now().toString(36), a: s.pid, b: t.id, state: 'pending', offer: { a: { items: [], coins: 0 }, b: { items: [], coins: 0 } }, lock: {}, confirm: {}, lockedAt: 0 };
    g.trades.set(tr.id, tr); g.toPid(t.id, { t: 'traderequest', from: g.nameOf(s.pid), id: tr.id }); return { ok: true };
  };
  g.cmds['trade.accept'] = (s, m) => { const t = g.trades.get(m.id); if (!t || t.b !== s.pid || t.state !== 'pending') return E('no_trade'); t.state = 'open'; push(t); return { ok: true }; };
  g.cmds['trade.decline'] = (s) => { cancelTradeOf(s.pid, 'Trade declined.'); return { ok: true }; };
  g.cmds['trade.offer'] = (s, m) => {
    const t = tradeOf(s.pid); if (!t || t.state !== 'open') return E('no_trade'); const side = t.a === s.pid ? 'a' : 'b';
    const items = [...new Set((m.items || []).map(Number))].slice(0, 20); const coins = Math.max(0, m.coins | 0);
    for (const id of items) { const it = st.items[id]; if (!it || it.loc !== 'inv:' + s.pid) return E('not_in_inventory'); if (!DEFS[it.d].tradable) return E('untradable', { d: it.d }); }
    if (coins > st.players[s.pid].coins) return E('insufficient_funds');
    t.offer[side] = { items, coins }; t.lock = {}; t.confirm = {}; t.lockedAt = 0; push(t); return { ok: true };
  };
  g.cmds['trade.lock'] = (s) => { const t = tradeOf(s.pid); if (!t || t.state !== 'open') return E('no_trade'); const side = t.a === s.pid ? 'a' : 'b'; t.lock[side] = true; if (t.lock.a && t.lock.b) t.lockedAt = g.now(); push(t); return { ok: true }; };
  g.cmds['trade.confirm'] = (s) => {
    const t = tradeOf(s.pid); if (!t || t.state !== 'open') return E('no_trade'); if (!(t.lock.a && t.lock.b)) return E('not_locked'); if (g.now() - t.lockedAt < (g.opts.tradeDelayMs ?? 3000)) return E('wait', { ms: 3000 - (g.now() - t.lockedAt) });
    const side = t.a === s.pid ? 'a' : 'b'; t.confirm[side] = true; push(t); if (!(t.confirm.a && t.confirm.b)) return { ok: true, waiting: true };
    const ops = []; const A = t.offer.a, B = t.offer.b;
    for (const id of A.items) ops.push({ k: 'move', id, from: 'inv:' + t.a, to: 'inv:' + t.b });
    for (const id of B.items) ops.push({ k: 'move', id, from: 'inv:' + t.b, to: 'inv:' + t.a });
    const tax = (n) => n > 10000 ? Math.floor((n - 10000) * 0.05) : 0;
    if (A.coins) { ops.push({ k: 'xfer', from: pAcct(t.a), to: pAcct(t.b), n: A.coins - tax(A.coins) }); if (tax(A.coins)) ops.push({ k: 'xfer', from: pAcct(t.a), to: ACCT.VOID, n: tax(A.coins) }); }
    if (B.coins) { ops.push({ k: 'xfer', from: pAcct(t.b), to: pAcct(t.a), n: B.coins - tax(B.coins) }); if (tax(B.coins)) ops.push({ k: 'xfer', from: pAcct(t.b), to: ACCT.VOID, n: tax(B.coins) }); }
    const r = tx(st, ops, { pid: s.pid, reason: 'trade:' + t.id }); g.trades.delete(t.id);
    for (const p of [t.a, t.b]) { g.toPid(p, { t: 'tradeend', ok: r.ok, why: r.ok ? 'Trade complete!' : 'Trade failed: ' + r.err }); if (r.ok) { g.ev(p, 'trade', 1); g.pushInv(p); g.pushMe(p); } }
    if (r.ok) g.save(); return { ok: r.ok, err: r.ok ? undefined : r.err };
  };
  g.cmds['trade.cancel'] = (s) => { cancelTradeOf(s.pid); return { ok: true }; };

  // ---------- gifting ----------
  g.cmds['gift.send'] = (s, m) => {
    const t = target(m); if (!t || t.id === s.pid) return E('no_player'); const it = st.items[m.item]; if (!it || it.loc !== 'inv:' + s.pid) return E('not_in_inventory'); if (!DEFS[it.d].tradable) return E('untradable');
    const r = tx(st, [{ k: 'move', id: it.id, from: it.loc, to: 'mail:' + t.id }], { pid: s.pid, reason: 'gift' }); if (!r.ok) return E(r.err);
    g.toPid(t.id, { t: 'note', text: `🎁 ${g.nameOf(s.pid)} sent you a gift: ${DEFS[it.d].name}${m.msg ? ' — "' + String(m.msg).slice(0, 80) + '"' : ''}. Open Inventory → Mailbox.`, kind: 'good' }); g.pushInv(t.id); g.pushInv(s.pid); return { ok: true };
  };

  // ---------- activities ----------
  const act = (p) => { if (p.act.day !== g.today()) p.act = { day: g.today(), fish: 0, deliver: 0 }; return p.act; };
  const reduce = (n, full = 8) => n < full ? 1 : n < full * 2 ? 0.4 : 0.1;
  g.interactors.fish = (s, t) => ({ ok: true, open: 'fish', thing: t.id });
  g.cmds['fish.cast'] = (s, m) => {
    const t = g.thingNear(s, m.thing, 3.5); if (!t || t.k !== 'fish') return E('too_far'); const p = st.players[s.pid]; if (act(p).fish >= 20) return E('not_biting');
    const rng = new RoundRng(); s.fish = { biteAt: g.now() + 2200 + rng.int(3800), window: 1700, bit: false, rng }; return { ok: true, wait: s.fish.biteAt - g.now() };
  };
  g.tickHooks = g.tickHooks || [];
  g.tickHooks.push((now) => { for (const s of g.sessions.values()) if (s.fish && !s.fish.bit && now >= s.fish.biteAt) { s.fish.bit = true; g.send(s, { t: 'bite', ms: s.fish.window }); } });
  g.cmds['fish.reel'] = (s) => {
    const f = s.fish; if (!f) return E('no_cast'); s.fish = null; const now = g.now(); const p = st.players[s.pid]; const a = act(p);
    if (now < f.biteAt - 150) return E('too_early'); if (now > f.biteAt + f.window + 250) return E('too_late');
    const n = a.fish++; const roll = f.rng.int(100); let d = 'fish_small';
    if (n < 8) d = roll < 5 ? 'fish_golden' : roll < 30 ? 'fish_big' : 'fish_small'; else if (n < 14) d = roll < 10 ? 'fish_big' : 'fish_small';
    const r = tx(st, [{ k: 'mint', d, loc: 'inv:' + s.pid, o: s.pid }], { pid: s.pid, reason: 'fish' }); g.pushInv(s.pid); g.ev(s.pid, 'fish', 1); g.addXp(s.pid, 'explorer', 6); st.dirty.players = true;
    return { ok: true, caught: d, name: DEFS[d].name, emoji: DEFS[d].emoji, left: Math.max(0, 20 - a.fish) };
  };
  g.cmds['courier.take'] = (s, m) => {
    const n = g.npcs(s.loc).find(n => n.id === 'pete'); if (!n || !g.near(s, n.x, n.y, 4)) return E('too_far'); if (s.parcel && s.parcel.until > g.now()) return { ok: true, again: true, target: s.parcel.bid, name: M.BUILDINGS.find(b => b.id === s.parcel.bid).name };
    const homes = M.BUILDINGS.filter(b => b.to.startsWith('home:') && st.props[b.id]?.owner && st.props[b.id].owner !== s.pid); const pool = homes.length ? homes : M.BUILDINGS.filter(b => b.to.startsWith('home:') && b.id[0] === 'h');
    const rng = new RoundRng(); const b = pool[rng.int(pool.length)]; s.parcel = { bid: b.id, until: g.now() + 240000 }; return { ok: true, target: b.id, name: b.name, door: b.door };
  };
  g.cmds['courier.deliver'] = (s, m) => {
    const par = s.parcel; if (!par || par.until < g.now()) return E('no_parcel'); const b = M.BUILDINGS.find(b => b.id === par.bid); if (s.loc !== 'world' || !g.near(s, b.door[0] + 0.5, b.door[1] + 0.5, 3)) return E('too_far');
    const p = st.players[s.pid]; const a = act(p); const base = 250 + new RoundRng().int(200); const amt = Math.round(base * reduce(a.deliver++, 8)); s.parcel = null;
    credit(st, s.pid, amt, 'courier'); g.ev(s.pid, 'deliver', 1); g.addXp(s.pid, 'player', 12); g.pushMe(s.pid); return { ok: true, amount: amt };
  };

  // ---------- Host / dev / admin ----------
  const host = (s) => s.isHost ? null : E('host_only');
  const cheat = (s) => host(s) || (st.meta.settings.cheats ? null : E('cheats_off'));
  g.cmds['dev.coins'] = (s, m) => cheat(s) || (credit(st, s.pid, Math.max(0, Math.min(1e9, m.n | 0)), 'dev'), g.pushMe(s.pid), { ok: true });
  g.cmds['dev.stars'] = (s, m) => cheat(s) || (st.players[s.pid].stars += Math.max(0, m.n | 0), st.dirty.players = true, g.pushMe(s.pid), { ok: true });
  g.cmds['dev.level'] = (s, m) => { const e = cheat(s); if (e) return e; const p = st.players[s.pid]; p.level = Math.max(1, Math.min(50, m.n | 0)); p.xp = Math.max(p.xp, Math.round(80 * Math.pow(p.level, 1.6))); st.dirty.players = true; g.pushMe(s.pid); return { ok: true }; };
  g.cmds['dev.item'] = (s, m) => { const e = cheat(s); if (e) return e; if (!DEFS[m.def]) return E('bad_def'); const q = Math.max(1, Math.min(50, m.qty | 0 || 1)); tx(st, Array.from({ length: q }, () => ({ k: 'mint', d: m.def, loc: 'inv:' + s.pid, o: s.pid })), { pid: s.pid, reason: 'dev' }); g.pushInv(s.pid); return { ok: true }; };
  g.cmds['dev.day'] = (s, m) => { const e = cheat(s); if (e) return e; st.meta.dayOffset += Math.max(1, m.n | 0 || 1); st.dirty.meta = true; return { ok: true, day: g.today() }; };
  g.cmds['dev.upkeep'] = (s) => { const e = cheat(s); if (e) return e; g.housing.tickUpkeep(s.pid, st.meta.settings.upkeepSec); g.pushMe(s.pid); g.toAll({ t: 'props', props: g.propList() }); return { ok: true }; };
  g.cmds['dev.race'] = (s) => { const e = cheat(s); if (e) return e; g.horses.endsAt = g.now(); return { ok: true }; };
  g.cmds['dev.tp'] = (s, m) => { const e = cheat(s); if (e) return e; if (m.loc && m.loc !== s.loc) { if (m.loc === 'world') g.enterLoc(s, 'world', +m.x || M.SPAWN.x, +m.y || M.SPAWN.y); else if (g.interiors[m.loc]) { const it = g.interiors[m.loc]; g.enterLoc(s, m.loc, it.exit.x + 0.5, it.exit.y - 1.2); } else return E('bad_loc'); } else { s.x = +m.x; s.y = +m.y; g.send(s, { t: 'snap', x: s.x, y: s.y }); } return { ok: true }; };
  g.cmds['admin.save'] = (s) => host(s) || (g.save(true), { ok: true });
  g.cmds['admin.backup'] = (s) => { const e = host(s); if (e) return e; g.save(true); g.store.backup('manual', st); return { ok: true }; };
  g.cmds['admin.info'] = (s) => {
    const e = host(s); if (e) return e; const a = audit(st);
    return { ok: true, audit: a, journal: g.store.verifyJournal(), backups: g.store.listBackups().slice(0, 12).map(b => ({ kind: b.kind, name: b.name })), settings: st.meta.settings, players: Object.values(st.players).map(p => ({ id: p.id, name: p.name, online: g.online(p.id), coins: p.coins, level: p.level, muted: p.muted > g.now() })), accts: st.accts, escrow: st.escrow, world: st.meta.name, recovery: st.recovery, ip: g.opts.lan };
  };
  g.cmds['admin.settings'] = (s, m) => { const e = host(s); if (e) return e; for (const k of ['casino', 'filter', 'cheats']) if (typeof m[k] === 'boolean') st.meta.settings[k] = m[k]; if (Number.isFinite(m.upkeepSec)) st.meta.settings.upkeepSec = Math.max(30, m.upkeepSec | 0); st.dirty.meta = true; g.toAll({ t: 'settings', settings: { casino: st.meta.settings.casino, filter: st.meta.settings.filter } }); return { ok: true }; };
  g.cmds['admin.kick'] = (s, m) => { const e = host(s); if (e) return e; const o = g.sessions.get(m.id); if (!o || o.isHost) return E('bad_target'); g.send(o, { t: 'reject', reason: 'kicked' }); o.ws.close(); return { ok: true }; };
  g.cmds['admin.ban'] = (s, m) => { const e = host(s); if (e) return e; const o = g.sessions.get(m.id); if (st.players[m.id]?.id === s.pid) return E('bad_target'); st.meta.banned = st.meta.banned || {}; st.meta.banned[m.id] = true; st.dirty.meta = true; if (o) { g.send(o, { t: 'reject', reason: 'banned' }); o.ws.close(); } return { ok: true }; };
  g.cmds['admin.mute'] = (s, m) => { const e = host(s); if (e) return e; const p = st.players[m.id]; if (!p) return E('no_player'); p.muted = g.now() + Math.max(1, m.minutes | 0 || 10) * 60000; st.dirty.players = true; return { ok: true }; };
  g.cmds['admin.announce'] = (s, m) => { const e = host(s); if (e) return e; g.toAll({ t: 'chat', ch: 'system', text: '📢 ' + String(m.text || '').slice(0, 140) }); return { ok: true }; };
}
