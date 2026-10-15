// Core commands: navigation, interaction, chat, looks, shopping, daily rewards, profiles.
import * as M from '../shared/map.js';
import { DEFS, SHOPS, PROPERTIES, EMOTES, sellValue, RARITY_COLOR } from '../shared/content.js';
import { tx, pAcct, ACCT, itemsAt, credit } from './ledger.js';
import { spawnOf, doorOf, roleOf, can } from './housing.js';
import { filterText } from './game.js';

export function install(g) {
  const st = g.state; const E = (e, x = {}) => ({ err: e, ...x });
  g.interactors = {};
  g.cmds['ping'] = (s, m) => ({ ok: true, t: g.now() });

  // ---------- doors ----------
  g.cmds['enter'] = (s, m) => {
    if (s.loc !== 'world') return E('not_outside');
    const b = M.BUILDINGS.find(b => b.id === m.id); if (!b) return E('no_building');
    if (!g.near(s, b.door[0] + 0.5, b.door[1] + 0.5, 3)) return E('too_far');
    if (b.to.startsWith('home:')) {
      const propId = b.to.slice(5); const ok = g.housing.canEnter(s.pid, propId);
      if (ok.err) { if (ok.canRing) g.ringDoor?.(s, propId); return ok; }
      const prop = st.props[propId]; const sp = spawnOf(prop);
      if (!prop.owner) return E('vacant', { propId });
      g.enterLoc(s, b.to, sp.x, sp.y); return { ok: true };
    }
    const it = g.interiors[b.to]; g.enterLoc(s, b.to, it.exit.x + 0.5, it.exit.y - 1.2); return { ok: true };
  };
  g.cmds['exit'] = (s) => {
    if (s.loc === 'world') return E('not_inside');
    if (s.loc.startsWith('home:')) {
      const prop = st.props[s.loc.slice(5)]; const d = doorOf(prop);
      if (!g.near(s, d.x + 0.5, d.y + 0.5, 3)) return E('too_far');
      const b = M.BUILDINGS.find(b => b.to === s.loc); const below = b.door[1] > b.y + b.h / 2 - 1;
      g.enterLoc(s, 'world', b.door[0] + 0.5, below ? b.door[1] + 1.5 : b.door[1] - 0.8); return { ok: true };
    }
    const it = g.interiors[s.loc]; if (!g.near(s, it.exit.x + 0.5, it.exit.y + 0.5, 3)) return E('too_far');
    g.enterLoc(s, 'world', it.exit.toX, it.exit.toY); return { ok: true };
  };
  g.cmds['peek'] = (s, m) => { const b = M.BUILDINGS.find(b => b.id === m.id); if (!b?.to.startsWith('home:')) return E('no_building'); const p = st.props[b.to.slice(5)]; return { ok: true, prop: g.propList().find(x => x.id === p.id), canEnter: g.housing.canEnter(s.pid, p.id) }; };

  // ---------- interaction ----------
  g.cmds['interact'] = (s, m) => {
    const t = g.thingNear(s, m.id); if (!t) return E('too_far');
    const fn = g.interactors[t.k]; if (!fn) return E('nothing_happens');
    return fn(s, t, m);
  };
  g.cmds['talk'] = (s, m) => { const n = g.npcs(s.loc).find(n => n.id === m.id); if (!n) return E('no_npc'); if (!g.near(s, n.x, n.y, 4.5)) return E('too_far'); return { ok: true, name: n.name, role: n.role, line: n.line }; };
  g.interactors.shop = (s, t) => ({ ok: true, open: 'shop', shop: t.shop });
  g.interactors.salon = () => ({ ok: true, open: 'salon' });
  g.interactors.props = () => ({ ok: true, open: 'props' });
  g.interactors.achievements = () => ({ ok: true, open: 'ach' });
  g.interactors.board = () => ({ ok: true, open: 'board' });
  g.interactors.fountain = (s) => { const p = st.players[s.pid]; if (p.stats.fountainDay === g.today()) return { ok: true, msg: 'The fountain glitters. You already made a wish today.' }; p.stats.fountainDay = g.today(); g.addXp(s.pid, 'explorer', 15); return { ok: true, msg: 'You made a wish! (+15 explorer XP)' }; };
  g.interactors.sit = (s, t) => { const r = g.claimSeat(s, `world:${t.id}`, 2, t.x, t.y, 'sit'); if (r.err) return r; s.x = t.x; s.y = t.y + (r.slot ? 0 : 0); g.toLoc(s.loc, { t: 'sit', id: s.pid, x: t.x + (r.slot ? 0.3 : -0.3), y: t.y, kind: 'sit' }); return { ok: true, x: t.x, y: t.y }; };
  g.interactors.postcard = (s, t) => {
    const p = st.players[s.pid]; if (p.found.includes(t.id)) return { ok: true, msg: 'You already collected this postcard.' };
    p.found.push(t.id); const reward = 50 + (t.id.length * 7) % 100; credit(st, s.pid, reward, 'postcard'); g.addXp(s.pid, 'explorer', 40); g.ev(s.pid, 'postcard', 1); g.pushMe(s.pid);
    return { ok: true, msg: `📮 Postcard ${p.found.length}/${M.POSTCARDS.length} found! +${reward} Coins`, found: p.found.length };
  };
  g.cmds['use'] = (s, m) => {         // use furniture in a home: sit/lie/toggle/storage/music
    if (!s.loc.startsWith('home:')) return E('not_home'); const propId = s.loc.slice(5); const p = st.props[propId]; const o = p.objects[m.id]; if (!o) return E('not_found');
    const it = st.items[m.id]; const def = DEFS[it.d]; if (!g.near(s, o.x + def.w / 2, o.y + def.h / 2, 4.2)) return E('too_far');
    if (def.interact === 'sit' || def.interact === 'lie') {
      const slots = def.slots || 1; const r = g.claimSeat(s, `home:${propId}:${m.id}`, slots, o.x, o.y, def.interact); if (r.err) return r;
      const px = o.x + (def.w >= 2 || def.h >= 2 ? (0.5 + r.slot * 0.9) : 0.5), py = o.y + 0.5; s.x = Math.min(px, o.x + def.w - 0.3); s.y = py;
      g.toLoc(s.loc, { t: 'sit', id: s.pid, x: s.x, y: s.y, kind: def.interact }); return { ok: true };
    }
    if (def.interact === 'toggle' || def.interact === 'music') { const r = g.housing.toggle(s.pid, propId, m.id); if (r.err) return r; g.toLoc(s.loc, { t: 'h', op: 'state', obj: r.obj }); return { ok: true }; }
    if (def.interact === 'storage') { if (!can(st, p, s.pid, 'storage')) return E('no_permission'); return { ok: true, open: 'storage', id: m.id, cap: def.cap, contents: g.housing.contents(m.id) }; }
    if (def.interact === 'play' || def.interact === 'use') return { ok: true, msg: def.interact === 'play' ? `You play with the ${def.name}. Fun!` : 'You browse the computer: photo album is empty (feature stub).' };
    return E('nothing_happens');
  };
  g.cmds['unsit'] = (s) => { if (s.sit) { g.freeSeatsOfPlayer(s.pid); g.toLoc(s.loc, { t: 'unsit', id: s.pid }); } return { ok: true }; };

  // ---------- chat / emotes ----------
  g.cmds['chat'] = (s, m) => {
    let text = String(m.text || '').trim().slice(0, 140); if (!text) return E('empty');
    const now = g.now(); s.chatTimes = s.chatTimes.filter(t => now - t < 10000); if (s.chatTimes.length >= 5) return E('slow_down'); s.chatTimes.push(now);
    const p = st.players[s.pid]; if (p.muted && p.muted > now) return E('muted');
    if (st.meta.settings.filter) text = filterText(text);
    const base = { t: 'chat', id: s.pid, name: p.name, text };
    p.stats.chat = (p.stats.chat || 0) + 1; g.ev(s.pid, 'chat', 1);
    const ch = m.ch || 'local';
    if (ch === 'whisper') {
      const to = Object.values(st.players).find(o => o.name.toLowerCase() === String(m.to || '').toLowerCase()); if (!to || !g.online(to.id)) return E('not_online');
      g.toPid(to.id, { ...base, ch: 'whisper', from: p.name }); g.toPid(s.pid, { ...base, ch: 'whisper', to: to.name }); return { ok: true };
    }
    if (ch === 'party') { const party = g.partyOf?.(s.pid); if (!party) return E('no_party'); for (const pid of party.members) g.toPid(pid, { ...base, ch: 'party' }); return { ok: true }; }
    if (ch === 'shout') { if (s.lastShout && now - s.lastShout < 30000) return E('shout_cooldown'); s.lastShout = now; g.toAll({ ...base, ch: 'shout' }); return { ok: true }; }
    for (const o of g.sessions.values()) { if (o.loc !== s.loc) continue; if (s.loc === 'world' && Math.hypot(o.x - s.x, o.y - s.y) > 25) continue; g.send(o, { ...base, ch: 'local' }); }
    return { ok: true };
  };
  g.cmds['emote'] = (s, m) => { const e = EMOTES.find(e => e.id === m.id); if (!e) return E('bad_emote'); s.emote = { id: e.id, t: g.now() }; g.toLoc(s.loc, { t: 'emote', id: s.pid, e: e.id }); return { ok: true }; };

  // ---------- looks / profile ----------
  g.cmds['look.set'] = (s, m) => {
    const p = st.players[s.pid]; const want = g.sanitizeLook(m.look, s.pid);
    if (m.mode === 'salon') {
      if (!(g.thingNear(s, 'salon', 6))) return E('too_far');
      const changed = ['body', 'skin', 'hairStyle', 'hairColor', 'eyes', 'height'].some(k => want[k] !== p.look[k]);
      const fee = changed && p.stats.salonFreeUsed ? 200 : 0; const r = g.setLook(s.pid, want, { fee }); if (r.err) return r;
      if (changed) p.stats.salonFreeUsed = true; g.pushMe(s.pid); return { ok: true, fee };
    }
    const merged = { ...p.look }; for (const k of ['top', 'bottom', 'shoes', 'hat', 'glasses', 'back', 'acc', 'full', 'topColor', 'bottomColor', 'shoeColor']) merged[k] = want[k];
    const r = g.setLook(s.pid, merged); if (r.err) return r; g.pushMe(s.pid); return { ok: true };
  };
  g.cmds['profile.get'] = (s, m) => {
    const p = st.players[m.id]; if (!p) return E('no_player');
    const homes = p.props.map(id => st.props[id]).filter(pr => pr.access === 'open').map(pr => ({ id: pr.id, name: pr.name, stars: g.housing.style(pr).stars }));
    return { ok: true, profile: { id: p.id, name: p.name, level: p.level, bxp: p.bxp, sxp: p.sxp, exp: p.exp, title: p.title, bio: p.bio, look: p.look, online: g.online(p.id), homes, ach: Object.values(p.ach).filter(a => a.done).length, friend: st.players[s.pid].friends.includes(p.id), playtime: p.playtime, badges: p.badges } };
  };
  g.cmds['bio.set'] = (s, m) => { st.players[s.pid].bio = filterText(String(m.text || '').slice(0, 140)); st.dirty.players = true; return { ok: true }; };
  g.cmds['title.set'] = (s, m) => { const p = st.players[s.pid]; if (m.title && !p.titles.includes(m.title)) return E('not_unlocked'); p.title = m.title || null; st.dirty.players = true; g.toLoc(s.loc, { t: 'title', id: s.pid, title: p.title }); g.pushMe(s.pid); return { ok: true }; };
  g.cmds['fav.toggle'] = (s, m) => { const p = st.players[s.pid]; if (!DEFS[m.def]) return E('bad_def'); const i = p.favorites.indexOf(m.def); if (i >= 0) p.favorites.splice(i, 1); else p.favorites.push(m.def); st.dirty.players = true; g.pushMe(s.pid); return { ok: true }; };
  g.cmds['settings.set'] = (s, m) => { const p = st.players[s.pid]; p.settings = { ...p.settings, ...(typeof m.settings === 'object' ? m.settings : {}) }; st.dirty.players = true; return { ok: true }; };

  // ---------- shops ----------
  const stockKey = (shop, def) => shop + ':' + def;
  const stockLeft = (e, shop) => { if (e.stock == null) return null; st.meta.stock = st.meta.stock || {}; const k = stockKey(shop, e.def); if (st.meta.stock[k] == null) st.meta.stock[k] = e.stock; return st.meta.stock[k]; };
  const priceOf = (shop, e) => Math.max(1, Math.round((e.price ?? DEFS[e.def].price) * SHOPS[shop].mult));
  const owned = (pid, d) => itemsAt(st, 'inv:' + pid).filter(i => i.d === d).length + itemsAt(st, 'eq:' + pid).filter(i => i.d === d).length;
  g.cmds['shop.view'] = (s, m) => {
    const sh = SHOPS[m.shop]; if (!sh) return E('no_shop'); const p = st.players[s.pid];
    const nearIt = g.things(s.loc).some(t => t.k === 'shop' && t.shop === m.shop && g.near(s, t.x, t.y, 6)); if (!nearIt && !m.remote) return E('too_far');
    const remote = !nearIt;
    const entries = sh.entries.map(e => { const d = DEFS[e.def]; const left = stockLeft(e, m.shop); return { def: e.def, price: Math.round(priceOf(m.shop, e) * (remote ? 1.1 : 1)), stock: left, minLevel: e.minLevel || 0, owned: owned(s.pid, e.def), perPlayer: e.perPlayer || null, bought: (p.stats.bought?.[e.def] || 0) }; });
    return { ok: true, shop: { id: sh.id, name: sh.name, remote }, entries };
  };
  g.cmds['shop.buy'] = (s, m) => {
    const sh = SHOPS[m.shop]; if (!sh) return E('no_shop'); const e = sh.entries.find(e => e.def === m.def); if (!e) return E('not_sold'); const p = st.players[s.pid];
    const nearIt = g.things(s.loc).some(t => t.k === 'shop' && t.shop === m.shop && g.near(s, t.x, t.y, 6)); if (!nearIt && !m.remote) return E('too_far');
    const qty = Math.max(1, Math.min(20, m.qty | 0 || 1)); if (e.minLevel && p.level < e.minLevel) return E('level_required', { level: e.minLevel });
    const left = stockLeft(e, m.shop); if (left !== null && left < qty) return E('sold_out');
    if (e.perPlayer && (p.stats.bought?.[e.def] || 0) + qty > e.perPlayer) return E('limit_reached');
    const unit = Math.round(priceOf(m.shop, e) * (nearIt ? 1 : 1.1)); if (m.price != null && m.price !== unit) return E('stale_price', { price: unit });
    const ops = [{ k: 'xfer', from: pAcct(s.pid), to: ACCT.VOID, n: unit * qty }]; for (let i = 0; i < qty; i++) ops.push({ k: 'mint', d: e.def, loc: 'inv:' + s.pid, o: s.pid });
    const r = tx(st, ops, { pid: s.pid, reason: 'buy:' + e.def, cmdKey: m.cid ? s.pid + ':' + m.cid : undefined }); if (!r.ok) return E(r.err);
    if (left !== null) { st.meta.stock[stockKey(m.shop, e.def)] -= qty; st.dirty.meta = true; }
    p.stats.bought = p.stats.bought || {}; p.stats.bought[e.def] = (p.stats.bought[e.def] || 0) + qty; st.dirty.players = true;
    g.ev(s.pid, 'buy', qty); if (DEFS[e.def].type === 'cosmetic') g.ev(s.pid, 'buyCosmetic', qty); g.addXp(s.pid, 'player', 3 * qty);
    g.pushInv(s.pid); g.pushMe(s.pid); if (unit * qty >= 10000) g.save(); return { ok: true, spent: unit * qty, qty };
  };
  g.cmds['shop.sell'] = (s, m) => {
    const it = st.items[m.id]; if (!it || it.loc !== 'inv:' + s.pid) return E('not_in_inventory'); const d = DEFS[it.d]; const v = sellValue(d); if (!v) return E('not_sellable');
    if (!g.things(s.loc).some(t => t.k === 'shop' && g.near(s, t.x, t.y, 6)) && !m.remote) return E('too_far');
    const r = tx(st, [{ k: 'destroy', id: it.id, from: it.loc }, { k: 'xfer', from: ACCT.VOID, to: pAcct(s.pid), n: v }], { pid: s.pid, reason: 'sell:' + it.d }); if (!r.ok) return E(r.err);
    g.pushInv(s.pid); g.pushMe(s.pid); return { ok: true, got: v };
  };

  // ---------- daily reward ----------
  g.cmds['daily.claim'] = (s) => {
    const p = st.players[s.pid]; const day = g.today(); if (p.daily.day === day) return E('already_claimed');
    p.daily.streak = p.daily.day === day - 1 ? p.daily.streak + 1 : Math.max(1, p.daily.streak - 1);
    const amt = 300 + 100 * (Math.min(p.daily.streak, 7) - 1); p.daily.day = day; credit(st, s.pid, amt, 'daily'); g.ev(s.pid, 'daily', 1); g.addXp(s.pid, 'player', 20);
    if (p.daily.streak % 7 === 0) { p.stars += 1; g.note(s.pid, '7-day streak: +1 Star!', 'good'); }
    st.dirty.players = true; g.pushMe(s.pid); return { ok: true, amount: amt, streak: p.daily.streak };
  };
  g.cmds['mail.claim'] = (s) => {
    const items = itemsAt(st, 'mail:' + s.pid); if (!items.length) return E('empty');
    const r = tx(st, items.map(i => ({ k: 'move', id: i.id, from: i.loc, to: 'inv:' + s.pid })), { pid: s.pid, reason: 'mail' }); if (!r.ok) return E(r.err);
    g.pushInv(s.pid); return { ok: true, n: items.length };
  };
}
