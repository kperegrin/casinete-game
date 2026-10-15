// Housing commands: ownership, access, collaborative building, furniture, blueprints.
import { PROPERTIES, DEFS } from '../shared/content.js';
import { roleOf, spawnOf, can } from './housing.js';
import { itemsAt } from './ledger.js';
import * as M from '../shared/map.js';

export function install(g) {
  const st = g.state, H = g.housing; const E = (e, x = {}) => ({ err: e, ...x });
  const here = (s, m) => { const propId = m.prop || (s.loc.startsWith('home:') ? s.loc.slice(5) : null); return propId; };
  const inHome = (s, m) => s.loc.startsWith('home:') && (!m.prop || m.prop === s.loc.slice(5));
  const bc = (propId, obj, except) => g.toLoc('home:' + propId, obj, except);
  const refresh = (pid) => { g.pushInv(pid); g.pushMe(pid); };
  const townHall = (s) => s.loc === 'townhall' && g.thingNear(s, 'props', 7);

  // ----- Town Hall: browse / buy / sell -----
  g.cmds['prop.list'] = (s) => ({ ok: true, props: g.propList(), mine: st.players[s.pid].props });
  g.cmds['prop.buy'] = (s, m) => {
    if (!townHall(s)) return E('too_far'); const r = H.buy(s.pid, m.id); if (r.err) return r;
    g.save(); refresh(s.pid); g.toAll({ t: 'props', props: g.propList() }); g.note(s.pid, `You bought ${st.props[m.id].name}! Find it on the map.`, 'good'); return r;
  };
  g.cmds['prop.sell'] = (s, m) => {
    if (!townHall(s)) return E('too_far'); const occupants = [...g.members('home:' + m.id)];
    const r = H.sell(s.pid, m.id); if (r.err) return r;
    for (const pid of occupants) { const o = g.sessions.get(pid); if (o) { g.note(pid, 'The property was sold. You were moved outside.'); const b = g.kickOut(o); } }
    g.save(); refresh(s.pid); g.toAll({ t: 'props', props: g.propList() }); return r;
  };
  g.kickOut = (o) => { const bb = M.BUILDINGS.find(b => b.to === o.loc); g.enterLoc(o, 'world', bb ? bb.door[0] + 0.5 : M.SPAWN.x, bb ? (bb.door[1] > bb.y + bb.h / 2 - 1 ? bb.door[1] + 1.5 : bb.door[1] - 0.8) : M.SPAWN.y); };
  g.cmds['prop.pay'] = (s, m) => { if (!townHall(s)) return E('too_far'); const r = H.payArrears(s.pid, m.id); if (!r.err) refresh(s.pid); return r; };
  g.cmds['prop.transfer'] = (s, m) => { const r = H.transfer(s.pid, m.id, m.to); if (!r.err) { g.save(); refresh(s.pid); g.pushMe(m.to); g.toAll({ t: 'props', props: g.propList() }); } return r; };
  g.cmds['prop.upgrade'] = (s, m) => { const r = H.upgrade(s.pid, m.id, m.kind); if (!r.err) { refresh(s.pid); if (m.kind === 'expand') { const v = H.view(m.id); bc(m.id, { t: 'h', op: 'resize', home: v }); } g.toAll({ t: 'props', props: g.propList() }); } return r; };
  g.cmds['prop.info'] = (s, m) => {
    const p = st.props[m.id]; if (!p) return E('no_property'); if (!can(st, p, s.pid, 'roles') && p.owner !== s.pid && !can(st, p, s.pid, 'enter')) return E('no_permission');
    const owner = p.owner === s.pid || can(st, p, s.pid, 'roles');
    return { ok: true, info: { id: p.id, name: p.name, owner: p.owner, ownerName: p.owner && g.nameOf(p.owner), access: p.access, rules: p.rules, cap: PROPERTIES[p.id].cap + p.extraCap, count: Object.keys(p.objects).length, w: p.w, h: p.h, roles: Object.entries(p.roles).map(([pid, role]) => ({ pid, name: g.nameOf(pid), role })), ban: p.ban.map(pid => ({ pid, name: g.nameOf(pid) })), upkeep: p.upkeep, upkeepCost: PROPERTIES[p.id].upkeep, style: H.style(p), likes: Object.keys(p.likes).length, audit: owner ? p.audit.slice(-40).reverse().map(a => ({ ...a, name: g.nameOf(a.pid) })) : [], role: roleOf(st, p, s.pid), mayManage: owner } };
  };
  g.cmds['prop.access'] = (s, m) => { const r = H.setAccess(s.pid, m.id, m.mode); if (!r.err) g.toAll({ t: 'props', props: g.propList() }); return r; };
  g.cmds['prop.rules'] = (s, m) => H.setRules(s.pid, m.id, m.rules, m.name);
  g.cmds['prop.role'] = (s, m) => { const target = Object.values(st.players).find(p => p.name.toLowerCase() === String(m.name || '').toLowerCase()); if (!target) return E('no_player'); return H.setRole(s.pid, m.id, target.id, m.role); };
  g.cmds['prop.ban'] = (s, m) => { const target = Object.values(st.players).find(p => p.name.toLowerCase() === String(m.name || '').toLowerCase()); if (!target) return E('no_player'); const r = H.ban(s.pid, m.id, target.id); if (!r.err) { const o = g.sessions.get(target.id); if (o && o.loc === 'home:' + m.id) { g.note(target.id, 'You were banned from this home.'); g.kickOut(o); } } return r; };
  g.cmds['prop.unban'] = (s, m) => H.unban(s.pid, m.id, m.pid);
  g.cmds['prop.kick'] = (s, m) => { const propId = here(s, m); const p = st.props[propId]; if (!p || !can(st, p, s.pid, 'kick')) return E('no_permission'); const o = g.sessions.get(m.pid); if (!o || o.loc !== 'home:' + propId || m.pid === p.owner) return E('not_here'); g.note(m.pid, 'You were asked to leave.'); g.kickOut(o); return { ok: true }; };
  g.cmds['prop.invite'] = (s, m) => {
    const propId = here(s, m); const target = st.players[m.pid] || Object.values(st.players).find(p => p.name.toLowerCase() === String(m.name || '').toLowerCase()); if (!target) return E('no_player');
    const r = H.invite(s.pid, propId, target.id); if (r.err) return r;
    g.toPid(target.id, { t: 'invite', from: g.nameOf(s.pid), fromId: s.pid, prop: propId, name: st.props[propId].name }); return { ok: true };
  };
  g.cmds['prop.goto'] = (s, m) => {   // accept an invitation: teleport home-to-home regardless of lock (token checked in canEnter)
    const ok = H.canEnter(s.pid, m.id); if (ok.err) return ok; const prop = st.props[m.id]; if (!prop.owner) return E('vacant'); const sp = spawnOf(prop); g.enterLoc(s, 'home:' + m.id, sp.x, sp.y); return { ok: true };
  };
  g.cmds['prop.home'] = (s) => { const p = st.players[s.pid]; const id = p.props[0]; if (!id) return E('no_home'); const sp = spawnOf(st.props[id]); g.enterLoc(s, 'home:' + id, sp.x, sp.y); return { ok: true }; };
  g.ringDoor = (s, propId) => { const p = st.props[propId]; if (!p.owner) return; p.doorBells = p.doorBells || {}; g.toPid(p.owner, { t: 'doorbell', from: g.nameOf(s.pid), fromId: s.pid, prop: propId }); for (const [pid, role] of Object.entries(p.roles)) if (role === 'coowner') g.toPid(pid, { t: 'doorbell', from: g.nameOf(s.pid), fromId: s.pid, prop: propId }); };
  g.cmds['prop.ring'] = (s, m) => { g.ringDoor(s, m.id); return { ok: true }; };
  g.cmds['prop.answer'] = (s, m) => { const p = st.props[m.prop]; if (!p || !can(st, p, s.pid, 'invite')) return E('no_permission'); if (m.accept) { H.invite(s.pid, m.prop, m.pid); g.toPid(m.pid, { t: 'invite', from: g.nameOf(s.pid), fromId: s.pid, prop: m.prop, name: p.name }); } else g.note(m.pid, 'Nobody answered the door.'); return { ok: true }; };
  g.cmds['prop.like'] = (s, m) => { const propId = here(s, m); const r = H.like(s.pid, propId); if (!r.err) { g.addXp(st.props[propId].owner, 'builder', 10); g.note(st.props[propId].owner, `${g.nameOf(s.pid)} liked your home ❤️`); } return r; };

  // ----- editing -----
  g.cmds['h.place'] = (s, m) => {
    if (!inHome(s, m)) return E('not_home'); const propId = s.loc.slice(5);
    const r = H.place(s.pid, propId, m.item, m.x | 0, m.y | 0, m.rot | 0, m.cid ? s.pid + ':' + m.cid : undefined); if (r.err) return r;
    bc(propId, { t: 'h', op: 'place', obj: r.obj, by: s.pid }); g.addXp(s.pid, 'builder', 2); refresh(s.pid); return { ok: true, obj: r.obj };
  };
  g.cmds['h.move'] = (s, m) => {
    if (!inHome(s, m)) return E('not_home'); const propId = s.loc.slice(5);
    const r = H.move(s.pid, propId, m.id, m.x | 0, m.y | 0, m.rot | 0, m.rev); if (r.err) return r; H.release(s.pid, propId, [m.id]);
    bc(propId, { t: 'h', op: 'move', obj: r.obj, by: s.pid }); return { ok: true, obj: r.obj };
  };
  g.cmds['h.moveGroup'] = (s, m) => {
    if (!inHome(s, m)) return E('not_home'); const propId = s.loc.slice(5); const r = H.moveGroup(s.pid, propId, m.moves); if (r.err) return r;
    H.release(s.pid, propId, m.moves.map(x => x.id)); bc(propId, { t: 'h', op: 'moveGroup', objs: r.objs, by: s.pid }); return { ok: true, objs: r.objs };
  };
  g.cmds['h.remove'] = (s, m) => {
    if (!inHome(s, m)) return E('not_home'); const propId = s.loc.slice(5); const r = H.remove(s.pid, propId, m.id); if (r.err) return r;
    bc(propId, { t: 'h', op: 'remove', id: m.id, by: s.pid }); refresh(s.pid); if (r.returnedTo !== s.pid) { g.pushInv(r.returnedTo); g.note(r.returnedTo, `${g.nameOf(s.pid)} removed your item — it is back in your inventory.`); } return { ok: true };
  };
  g.cmds['h.lease'] = (s, m) => { if (!inHome(s, m)) return E('not_home'); const ids = (m.ids || []).slice(0, 200); const r = H.lease(s.pid, s.loc.slice(5), ids); if (r.err) return r; bc(s.loc.slice(5), { t: 'h', op: 'lease', ids, by: s.pid }, s.pid); return { ok: true }; };
  g.cmds['h.release'] = (s, m) => { if (!inHome(s, m)) return E('not_home'); const ids = (m.ids || []).slice(0, 200); H.release(s.pid, s.loc.slice(5), ids); bc(s.loc.slice(5), { t: 'h', op: 'release', ids, by: s.pid }, s.pid); return { ok: true }; };
  g.cmds['h.wall'] = (s, m) => { if (!inHome(s, m)) return E('not_home'); const propId = s.loc.slice(5); const r = H.setWall(s.pid, propId, m.x | 0, m.y | 0, m.type | 0); if (r.err) return r; if (!r.nochange) { bc(propId, { t: 'h', op: 'wall', x: r.x, y: r.y, type: r.type, by: s.pid }); g.addXp(s.pid, 'builder', 1); g.pushMe(s.pid); } return { ok: true }; };
  g.cmds['h.walls'] = (s, m) => {            // batch of wall edits (rectangle / line tools); stops at first hard error but keeps what was applied
    if (!inHome(s, m)) return E('not_home'); const propId = s.loc.slice(5); const list = (m.tiles || []).slice(0, 200); let done = 0, last = null;
    for (const [x, y] of list) { const r = H.setWall(s.pid, propId, x | 0, y | 0, m.type | 0); if (r.err) { last = r.err; if (r.err === 'insufficient_funds') break; continue; } if (!r.nochange) { done++; bc(propId, { t: 'h', op: 'wall', x: r.x, y: r.y, type: r.type, by: s.pid }); } }
    if (done) { g.addXp(s.pid, 'builder', Math.min(done, 5)); g.pushMe(s.pid); } return { ok: true, done, skipped: list.length - done, lastError: last };
  };
  g.cmds['h.floors'] = (s, m) => { if (!inHome(s, m)) return E('not_home'); const propId = s.loc.slice(5); const r = H.setFloors(s.pid, propId, m.tiles, m.color); if (r.err) return r; bc(propId, { t: 'h', op: 'floors', tiles: m.tiles, color: m.color, by: s.pid }); return { ok: true }; };
  g.cmds['h.wallcolor'] = (s, m) => { if (!inHome(s, m)) return E('not_home'); const propId = s.loc.slice(5); const r = H.setWallColor(s.pid, propId, m.color | 0); if (r.err) return r; bc(propId, { t: 'h', op: 'wallcolor', color: m.color | 0 }); return { ok: true }; };
  g.cmds['h.storeIn'] = (s, m) => { if (!inHome(s, m)) return E('not_home'); const r = H.storeIn(s.pid, s.loc.slice(5), m.container, m.item); if (!r.err) refresh(s.pid); return { ...r, contents: H.contents(m.container) }; };
  g.cmds['h.storeOut'] = (s, m) => { if (!inHome(s, m)) return E('not_home'); const r = H.storeOut(s.pid, s.loc.slice(5), m.container, m.item); if (!r.err) refresh(s.pid); return { ...r, contents: H.contents(m.container) }; };
  g.cmds['h.contents'] = (s, m) => { if (!inHome(s, m)) return E('not_home'); return { ok: true, contents: H.contents(m.container) }; };
  g.cmds['h.snapshot'] = (s) => { if (!s.loc.startsWith('home:')) return E('not_home'); return { ok: true, home: H.view(s.loc.slice(5)) }; };

  // ----- blueprints -----
  g.cmds['bp.save'] = (s, m) => { if (!inHome(s, m)) return E('not_home'); const r = H.blueprintSave(s.pid, s.loc.slice(5), m.name, { x0: m.x0 | 0, y0: m.y0 | 0, x1: m.x1 | 0, y1: m.y1 | 0 }); if (!r.err) g.pushMe(s.pid); return r.err ? r : { ok: true, bp: r.bp.id }; };
  g.cmds['bp.bom'] = (s, m) => { const bp = st.players[s.pid].blueprints.find(b => b.id === m.id); if (!bp) return E('no_blueprint'); return { ok: true, bom: H.blueprintBom(s.pid, bp), wallsCost: bp.walls.length * 5 }; };
  g.cmds['bp.apply'] = (s, m) => {
    if (!inHome(s, m)) return E('not_home'); const propId = s.loc.slice(5); const before = JSON.stringify(Object.keys(st.props[propId].objects));
    const r = H.blueprintApply(s.pid, propId, m.id, m.x | 0, m.y | 0, !!m.skipInvalid); if (r.err) return r;
    bc(propId, { t: 'h', op: 'full', home: H.view(propId) }); refresh(s.pid); return r;
  };
  g.cmds['bp.delete'] = (s, m) => { const p = st.players[s.pid]; p.blueprints = p.blueprints.filter(b => b.id !== m.id); st.dirty.players = true; g.pushMe(s.pid); return { ok: true }; };
}
