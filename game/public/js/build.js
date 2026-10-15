// Build mode: furniture placement, moving (with leases), rotating, multi-select, copy/paste, undo/redo, walls/doors/windows, floors, blueprints.
import { S, bus, fmt } from './state.js';
import { cmd, sendRaw, errText } from './net.js';
import { h, $, toast, openPanel, closePanel, rerender, panelOpen, itemCard, confirmBox, promptBox } from './ui.js';
import { world, screenToTile, setupHomeSolid, drawFurnGhost } from './world.js';
import { P } from './iso.js';
import { diamond, wallSprite, WALL_LOW } from './isoworld.js';
import { drawSprite } from './sprites.js';
import { sfx } from './audio.js';
import { DEFS, ROLE_CAPS, WALL_COST, DOOR_COST, WINDOW_COST, FLOOR_COLORS, WALL_COLORS } from '/shared/content.js';
import { openShop } from './panels.js';

const B = { tool: 'select', held: null, rot: 0, floor: 0, sel: new Set(), undo: [], redo: [], drag: null, marquee: null, rect: null, clip: null, paste: null, pending: new Set(), q: '', cat: 'All', bp: null, lastSend: 0 };
const caps = () => { const c = ROLE_CAPS[S.role] || []; return (k) => c.includes('*') || c.includes(k); };
const objById = (id) => S.home?.objects.find(o => o.id === id);
const size = (d, rot) => { const df = DEFS[d]; return (rot & 1) ? { w: df.h, h: df.w } : { w: df.w, h: df.h }; };
const tilesOf = (d, x, y, rot, wallLayer) => { const s = wallLayer ? { w: DEFS[d].w, h: 1 } : size(d, rot); const t = []; for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) t.push([x + i, y + j]); return t; };

// advisory client-side validation (the Host re-validates everything)
function check(d, x, y, rot, ignore) {
  const home = S.home, def = DEFS[d]; const tiles = tilesOf(d, x, y, rot, def.layer === 'wall');
  for (const [a, b] of tiles) if (a < 0 || b < 0 || a >= home.w || b >= home.h) return 'Out of bounds';
  if (def.layer === 'wall') { for (const [a, b] of tiles) if (home.walls[a + ',' + b] !== 1) return 'Needs a wall'; }
  else { for (const [a, b] of tiles) if (home.walls[a + ',' + b]) return 'Wall in the way'; const door = home.entry; if (def.layer === 'floor') for (const [a, b] of tiles) if (a === door.x && b >= home.h - 2) return 'Keep the entrance clear'; }
  for (const o of home.objects) { if (ignore && ignore.has(o.id)) continue; const od = DEFS[o.d]; if (od.layer !== def.layer) continue; const ot = tilesOf(o.d, o.x, o.y, o.rot, od.layer === 'wall'); for (const [a, b] of tiles) for (const [c, e] of ot) if (a === c && b === e) return 'Overlaps ' + od.name; }
  return null;
}
const available = (d) => S.inv.filter(i => i.loc === 'inv' && i.d === d && !B.pending.has(i.id));

export function installBuild() {
  bus.on('toggleBuild', (m) => toggle(m === 'off'));
  bus.on('placeItem', ({ d }) => { if (!S.buildMode) toggle(false); if (!S.buildMode) return; hold(d); });
  bus.on('applyBlueprint', (bp) => { if (!S.buildMode) toggle(false); if (S.buildMode) startBlueprint(bp); });
  bus.on('home', onHomeMsg); bus.on('drag', (m) => { const o = objById(m.id); if (o && m.by !== S.me.id) { S.dragGhosts.set(m.id, { d: o.d, x: m.x, y: m.y, rot: m.rot, by: m.by, t: performance.now() }); } });
  setInterval(() => { for (const [id, g] of S.dragGhosts || []) if (performance.now() - g.t > 1500) S.dragGhosts.delete(id); }, 500);
  bus.on('inv', () => { if (S.buildMode) rerender('builddrawer'); });
  bus.on('loc', () => { B.sel.clear(); B.undo = []; B.redo = []; });
  world.hooks.overlay.push(overlay); world.hooks.mouse = onClick; world.hooks.mouseDown = onDown; world.hooks.mouseUp = onUp; world.hooks.keyDown = onKey;
  addEventListener('mousemove', onMove);
  addEventListener('contextmenu', (e) => { if (S.buildMode && e.target.id === 'cv') { e.preventDefault(); B.held = null; B.paste = null; B.bp = null; setTool('select'); } });
}

function toggle(forceOff) {
  if (S.buildMode || forceOff) { S.buildMode = false; closePanel('builddrawer', true); $('#buildbar')?.remove(); B.sel.clear(); S.selected = B.sel; S.hideIds = null; B.drag = null; B.held = null; if (S.home) cmd('h.release', { ids: [...(S.leases?.keys?.() || [])].filter(id => S.leases.get(id) === S.me.id) }); return; }
  if (!S.home) return toast('Build mode works inside a home. Enter yours (or a friend’s, if they gave you a role).', 'warn');
  const c = caps(); if (!(c('place') || c('walls') || c('floors'))) return toast(`You are a ${S.role} here — ask the owner for the Decorator or Builder role.`, 'warn', 5000);
  S.buildMode = true; S.selected = B.sel; setTool('select'); buildBar(); drawer(); sfx('open');
}
function setTool(t) { B.tool = t; B.held = t === 'place' ? B.held : null; B.paste = null; B.bp = null; B.rect = null; document.querySelectorAll('#buildbar .tl').forEach(b => b.classList.toggle('on', b.dataset.t === t)); }
function hold(d) { B.held = d; B.rot = 0; setTool('place'); B.held = d; document.querySelectorAll('#buildbar .tl').forEach(b => b.classList.toggle('on', b.dataset.t === 'place')); }

function buildBar() {
  $('#buildbar')?.remove(); const c = caps();
  const tl = (t, ico, label, ok = true) => h('button', { class: 'tl', 'data-t': t, disabled: !ok, title: label, onclick: () => { setTool(t); sfx('click'); } }, ico + ' ' + label);
  const wallSw = h('div', { class: 'swatches' }, WALL_COLORS.map((col, i) => h('div', { class: 'sw' + (S.home.wallColor === i ? ' on' : ''), style: { background: col }, title: 'Wall color', onclick: async () => { if (!c('floors')) return; const r = await cmd('h.wallcolor', { color: i }); if (!r.ok) toast(errText(r), 'warn'); } })));
  const floorSw = h('div', { class: 'swatches' }, FLOOR_COLORS.map((col, i) => h('div', { class: 'sw' + (B.floor === i ? ' on' : ''), style: { background: col }, title: 'Floor color (drag a rectangle with the Floor tool)', onclick: (e) => { B.floor = i; setTool('floor'); e.target.parentNode.querySelectorAll('.sw').forEach((s, j) => s.classList.toggle('on', j === i)); } })));
  const bar = h('div', { id: 'buildbar' }, h('b', {}, '🔨 BUILD'),
    tl('select', '🖱️', 'Select/Move'), tl('place', '🪑', 'Place', c('place')), tl('wall', '🧱', `Wall (${WALL_COST}🪙)`, c('walls')), tl('door', '🚪', `Door (${DOOR_COST})`, c('walls')), tl('window', '🪟', `Window (${WINDOW_COST})`, c('walls')), tl('erase', '🧽', 'Erase', c('walls') || c('moveOwn')), tl('floor', '🎨', 'Floor', c('floors')), tl('bpsave', '📐', 'Blueprint', c('blueprint')),
    h('span', { style: { opacity: 0.5 } }, '|'), h('button', { class: 'tl', title: 'Rotate (R)', onclick: () => rotate(1) }, '⟳'), h('button', { class: 'tl', title: 'Undo (Ctrl+Z)', onclick: undo }, '↶'), h('button', { class: 'tl', title: 'Redo (Ctrl+Y)', onclick: redo }, '↷'), h('button', { class: 'tl', title: 'Delete selected', onclick: delSel }, '🗑'), h('button', { class: 'tl', title: 'Copy (Ctrl+C)', onclick: copySel }, '⎘'), h('button', { class: 'tl', title: 'Paste (Ctrl+V)', onclick: pasteMode }, '📋'),
    h('span', { style: { opacity: 0.5 } }, '|'), h('span', { title: 'Wall colour' }, '🏠', wallSw), h('span', { title: 'Floor colour' }, '▦', floorSw), h('button', { class: 'tl', onclick: () => toggle(true) }, '✔ Done'));
  $('#hud').append(bar); setTool(B.tool);
}
function drawer() {
  openPanel('builddrawer', '🪑 Furniture', () => {
    const mine = S.inv.filter(i => i.loc === 'inv' && DEFS[i.d].type === 'furniture'); const groups = new Map(); for (const i of mine) groups.set(i.d, (groups.get(i.d) || 0) + 1);
    const cats = ['All', ...new Set([...groups.keys()].map(d => DEFS[d].cat))]; const q = B.q.toLowerCase();
    const list = [...groups.entries()].filter(([d]) => (B.cat === 'All' || DEFS[d].cat === B.cat) && (!q || DEFS[d].name.toLowerCase().includes(q)));
    return h('div', { class: 'col', style: { width: '270px' } }, h('div', { class: 'row' }, h('input', { type: 'text', placeholder: '🔍 search', class: 'grow', value: B.q, oninput: (e) => { B.q = e.target.value; rerender('builddrawer'); setTimeout(() => { const i = $('#panels input[placeholder="🔍 search"]'); i?.focus(); i?.setSelectionRange(99, 99); }); } }), h('button', { class: 'btn sm', title: 'Buy more furniture', onclick: () => openShop('furn', true) }, '🛒')),
      h('select', { onchange: (e) => { B.cat = e.target.value; rerender('builddrawer'); } }, cats.map(c => h('option', { value: c, selected: B.cat === c }, c))),
      h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(2,1fr)', maxHeight: '55vh', overflow: 'auto' } }, list.length ? list.map(([d, n]) => itemCard(d, { qty: n, sel: B.held === d, onClick: () => { hold(d); rerender('builddrawer'); sfx('click'); } })) : h('div', { class: 'muted' }, 'Your inventory has no furniture. Buy some at Home & Hearth or tap 🛒.')),
      h('small', { class: 'muted' }, 'Click to hold, click the floor to place. R rotates. Right-click cancels. Select tool: drag to move, Shift+drag to multi-select.'),
      h('div', { class: 'muted' }, `Objects ${S.home.objects.length}/${S.home.cap}`));
  }, { w: 300, x: 8, y: 60 });
}

// ---------------- home state updates from the Host ----------------
function onHomeMsg(m) {
  if (!S.home) return; const home = S.home; const mine = m.by === S.me.id;
  const upsert = (obj) => { const i = home.objects.findIndex(o => o.id === obj.id); if (i >= 0) home.objects[i] = { ...home.objects[i], ...obj }; else home.objects.push(obj); S.dragGhosts?.delete(obj.id); S.leases?.delete(obj.id); };
  switch (m.op) {
    case 'place': upsert(m.obj); if (!mine) sfx('place'); break;
    case 'move': upsert(m.obj); break;
    case 'moveGroup': m.objs.forEach(upsert); break;
    case 'state': upsert(m.obj); break;
    case 'remove': home.objects = home.objects.filter(o => o.id !== m.id); B.sel.delete(m.id); S.dragGhosts?.delete(m.id); S.leases?.delete(m.id); if (!mine) sfx('remove'); break;
    case 'wall': if (m.type) home.walls[m.x + ',' + m.y] = m.type; else delete home.walls[m.x + ',' + m.y]; break;
    case 'floors': for (const [x, y] of m.tiles) { if (m.color === null) delete home.floors[x + ',' + y]; else home.floors[x + ',' + y] = m.color; } break;
    case 'wallcolor': home.wallColor = m.color; break;
    case 'lease': for (const id of m.ids) S.leases.set(id, m.by); break;
    case 'release': for (const id of m.ids) { S.leases.delete(id); S.dragGhosts?.delete(id); } break;
    case 'resize': case 'full': Object.assign(home, m.home); break;
  }
  setupHomeSolid(); if (S.buildMode) rerender('builddrawer');
}

// ---------------- input ----------------
let mouseTile = { x: 0, y: 0, fx: 0, fy: 0 };
const mouseRaw = { x: 0, y: 0 };
function onMove(e) { mouseRaw.x = e.clientX; mouseRaw.y = e.clientY; if (!S.buildMode) return; const { fx, fy } = screenToTile(e.clientX, e.clientY); mouseTile = { x: Math.floor(fx), y: Math.floor(fy), fx, fy }; if (B.drag) { B.drag.cur = mouseTile; const now = performance.now(); if (now - B.lastSend > 100) { B.lastSend = now; for (const m of B.drag.items) sendRaw({ t: 'drag', id: m.id, x: m.ox + (mouseTile.x - B.drag.start.x), y: m.oy + (mouseTile.y - B.drag.start.y), rot: m.rot }); } } if (B.marquee) B.marquee.cur = mouseTile; if (B.rect) B.rect.cur = mouseTile; }
const ghostPos = (d, rot) => { const s = size(d, rot); return { x: Math.round(mouseTile.fx - s.w / 2), y: Math.round(mouseTile.fy - s.h / 2) }; };
function objAt(tx, ty) { let best = null; for (const o of S.home.objects) { const df = DEFS[o.d]; for (const [a, b] of tilesOf(o.d, o.x, o.y, o.rot, df.layer === 'wall')) if (a === tx && b === ty) { const pri = df.layer === 'floor' ? 3 : df.layer === 'wall' ? 2 : 1; if (!best || pri > best.pri) best = { o, pri }; } } return best?.o || null; }

function onClick(e) {
  if (!S.buildMode || e.button !== 0) return false; if (B.suppressClick) { B.suppressClick = false; return true; }
  handleClick(); return true;
}
async function handleClick() {
  const { x, y } = mouseTile;
  if (B.tool === 'place' && B.held) { await placeHeld(); return true; }
  if (B.paste) { await doPaste(); return true; }
  if (B.bp) { await applyBp(); return true; }
  if (B.tool === 'door' || B.tool === 'window') { const r = await cmd('h.wall', { x, y, type: B.tool === 'door' ? 2 : 3 }); if (!r.ok) toast(errText(r), 'warn'); else sfx('place'); return true; }
  if (B.tool === 'erase') { const pk = world.pickFurniture(mouseRaw.x, mouseRaw.y); const o = (pk != null ? objById(pk) : null) || objAt(x, y); if (o) { await removeObj(o); return true; } const r = await cmd('h.wall', { x, y, type: 0 }); if (r.ok) sfx('remove'); else if (r.err !== 'tile_occupied') toast(errText(r), 'warn'); return true; }
  return false;
}
async function placeHeld() {
  const d = B.held; const inv = available(d)[0]; if (!inv) { toast('You are out of those — buy more with 🛒.', 'warn'); B.held = null; setTool('select'); return; }
  const { x, y } = ghostPos(d, B.rot); const bad = check(d, x, y, B.rot); if (bad) { sfx('error'); toast(bad, 'warn', 1800); return; }
  B.pending.add(inv.id); const r = await cmd('h.place', { item: inv.id, x, y, rot: B.rot }); B.pending.delete(inv.id);
  if (!r.ok) { toast(errText(r), 'warn'); sfx('error'); return; } sfx('place'); pushUndo(placeUndo(r.obj.id, d, x, y, B.rot));
  if (!available(d).length) { toast(`That was your last ${DEFS[d].name}.`); B.held = null; setTool('select'); }
}
const placeUndo = (id, d, x, y, rot) => { const ref = { id }; return { label: 'place ' + DEFS[d].name,
  undo: async () => { const r = await cmd('h.remove', { id: ref.id }); return r.ok; },
  redo: async () => { const inv = available(d)[0]; if (!inv) return false; const r = await cmd('h.place', { item: inv.id, x, y, rot }); if (r.ok) ref.id = r.obj.id; return r.ok; } }; };
const removeUndo = (o) => { const ref = { id: o.id }; return { label: 'remove ' + DEFS[o.d].name,
  undo: async () => { const inv = available(o.d)[0]; if (!inv) return false; const r = await cmd('h.place', { item: inv.id, x: o.x, y: o.y, rot: o.rot }); if (r.ok) ref.id = r.obj.id; return r.ok; },
  redo: async () => (await cmd('h.remove', { id: ref.id })).ok }; };
const moveUndo = (moves) => ({ label: 'move', undo: async () => (await cmd('h.moveGroup', { moves: moves.map(m => ({ id: m.id, x: m.fx, y: m.fy, rot: m.frot })) })).ok, redo: async () => (await cmd('h.moveGroup', { moves: moves.map(m => ({ id: m.id, x: m.tx, y: m.ty, rot: m.trot })) })).ok });
function pushUndo(u) { B.undo.push(u); if (B.undo.length > 100) B.undo.shift(); B.redo = []; }
async function undo() { const u = B.undo.pop(); if (!u) return toast('Nothing to undo'); const ok = await u.undo(); if (ok) { B.redo.push(u); sfx('rotate'); } else toast('Could not undo — something changed (or an item is missing).', 'warn'); }
async function redo() { const u = B.redo.pop(); if (!u) return toast('Nothing to redo'); const ok = await u.redo(); if (ok) { B.undo.push(u); sfx('rotate'); } else toast('Could not redo.', 'warn'); }
async function removeObj(o) { const r = await cmd('h.remove', { id: o.id }); if (r.ok) { sfx('remove'); pushUndo(removeUndo(o)); } else toast(errText(r), 'warn'); return r.ok; }
async function delSel() { const objs = [...B.sel].map(objById).filter(Boolean); if (!objs.length) return toast('Select something first (click it).'); for (const o of objs) await removeObj(o); B.sel.clear(); }
function rotate(dir) {
  if (B.paste) { B.paste.rot = (B.paste.rot + dir + 4) % 4; return; }
  if (B.held) { B.rot = (B.rot + dir + 4) % 4; sfx('rotate'); return; }
  const objs = [...B.sel].map(objById).filter(Boolean); if (!objs.length) return;
  (async () => { const moves = []; for (const o of objs) { const nr = (o.rot + dir + 4) % 4; const r = await cmd('h.move', { id: o.id, x: o.x, y: o.y, rot: nr }); if (r.ok) { moves.push({ id: o.id, fx: o.x, fy: o.y, frot: o.rot, tx: o.x, ty: o.y, trot: nr }); } else toast(errText(r), 'warn'); } if (moves.length) { sfx('rotate'); pushUndo(moveUndo(moves)); } })();
}
function copySel() { const objs = [...B.sel].map(objById).filter(Boolean); if (!objs.length) return toast('Select furniture first.'); const x0 = Math.min(...objs.map(o => o.x)), y0 = Math.min(...objs.map(o => o.y)); B.clip = objs.map(o => ({ d: o.d, dx: o.x - x0, dy: o.y - y0, rot: o.rot })); toast(`Copied ${objs.length} item(s). Ctrl+V to paste (uses items you own).`, 'good'); }
function pasteMode() { if (!B.clip) return toast('Nothing copied.'); setTool('select'); B.paste = { items: B.clip, rot: 0 }; }
async function doPaste() {
  const base = { x: mouseTile.x, y: mouseTile.y }; const used = new Set(); let placed = 0, missing = 0, bad = 0; const created = [];
  for (const it of B.paste.items) {
    const inv = available(it.d).find(i => !used.has(i.id)); if (!inv) { missing++; continue; }
    const x = base.x + it.dx, y = base.y + it.dy; if (check(it.d, x, y, it.rot)) { bad++; continue; }
    used.add(inv.id); B.pending.add(inv.id); const r = await cmd('h.place', { item: inv.id, x, y, rot: it.rot }); B.pending.delete(inv.id); if (r.ok) { placed++; created.push({ id: r.obj.id, d: it.d, x, y, rot: it.rot }); } else bad++;
  }
  if (created.length) { sfx('place'); pushUndo({ label: 'paste', undo: async () => { let ok = true; for (const c of created) ok = (await cmd('h.remove', { id: c.id })).ok && ok; return ok; }, redo: async () => { let ok = true; for (const c of created) { const inv = available(c.d)[0]; if (!inv) { ok = false; continue; } const r = await cmd('h.place', { item: inv.id, x: c.x, y: c.y, rot: c.rot }); if (r.ok) c.id = r.obj.id; else ok = false; } return ok; } }); }
  toast(`Pasted ${placed}${missing ? ` · ${missing} skipped (not owned — buy more with 🛒)` : ''}${bad ? ` · ${bad} blocked` : ''}`, missing || bad ? 'warn' : 'good'); B.paste = null;
}
function onKey(e) {
  if (!S.buildMode) { return false; }
  const ctrl = e.ctrlKey || e.metaKey;
  if (e.code === 'KeyR') { rotate(1); return true; } if (e.code === 'KeyQ') { rotate(-1); return true; } if (e.code === 'KeyE' && (B.held || B.sel.size)) { rotate(1); return true; }
  if (e.code === 'Delete' || e.code === 'Backspace') { delSel(); e.preventDefault(); return true; }
  if (ctrl && e.code === 'KeyZ') { e.shiftKey ? redo() : undo(); e.preventDefault(); return true; } if (ctrl && e.code === 'KeyY') { redo(); e.preventDefault(); return true; }
  if (ctrl && e.code === 'KeyC') { copySel(); e.preventDefault(); return true; } if (ctrl && e.code === 'KeyV') { pasteMode(); e.preventDefault(); return true; }
  if (ctrl && e.code === 'KeyD') { copySel(); if (B.clip) { B.paste = { items: B.clip, rot: 0 }; } e.preventDefault(); return true; }
  if (ctrl && e.code === 'KeyA') { B.sel.clear(); S.home.objects.forEach(o => B.sel.add(o.id)); e.preventDefault(); return true; }
  if (e.code === 'Escape') { if (B.held || B.paste || B.bp || B.sel.size) { B.held = null; B.paste = null; B.bp = null; B.sel.clear(); setTool('select'); } else toggle(true); return true; }
  return false;
}

function onDown(e) {
  if (!S.buildMode || e.button !== 0) return false; startDown(e); return true;
}
async function startDown(e) {
  const { x, y } = mouseTile;
  if (B.tool === 'select') {
    const pk = world.pickFurniture(e.clientX, e.clientY); const o = (pk != null ? objById(pk) : null) || objAt(x, y);
    if (o) {
      if (e.shiftKey) { B.sel.has(o.id) ? B.sel.delete(o.id) : B.sel.add(o.id); B.suppressClick = true; return true; }
      if (!B.sel.has(o.id)) { B.sel.clear(); B.sel.add(o.id); }
      const ids = [...B.sel]; const items = ids.map(objById).filter(Boolean).map(ob => ({ id: ob.id, d: ob.d, ox: ob.x, oy: ob.y, rot: ob.rot }));
      const drag = { start: { x, y }, cur: { x, y }, items, moved: false }; B.drag = drag; S.hideIds = new Set(ids);
      const r = await cmd('h.lease', { ids });
      if (!r.ok) { if (B.drag === drag) { B.drag = null; S.hideIds = null; } toast(r.err === 'locked' ? `${S.players.get(r.by)?.name || 'Someone'} is moving that right now.` : errText(r), 'warn'); return; }
      for (const id of ids) S.leases.set(id, S.me.id); if (!B.drag) cmd('h.release', { ids });
      return;
    }
    if (!e.shiftKey) B.sel.clear(); B.marquee = { start: { x, y }, cur: { x, y } }; return true;
  }
  if (['wall', 'floor', 'bpsave'].includes(B.tool)) { B.rect = { start: { x, y }, cur: { x, y }, shift: e.shiftKey }; return true; }
  return false;
}
async function onUp(e) {
  if (!S.buildMode) return;
  if (B.drag) {
    const d = B.drag; B.drag = null; const dx = mouseTile.x - d.start.x, dy = mouseTile.y - d.start.y; S.hideIds = null;
    if (dx || dy) {
      const moves = d.items.map(m => ({ id: m.id, x: m.ox + dx, y: m.oy + dy, rot: m.rot }));
      const r = await cmd('h.moveGroup', { moves }); if (r.ok) { sfx('place'); pushUndo(moveUndo(d.items.map(m => ({ id: m.id, fx: m.ox, fy: m.oy, frot: m.rot, tx: m.ox + dx, ty: m.oy + dy, trot: m.rot })))); } else { toast(errText(r), 'warn'); sfx('error'); }
      B.suppressClick = true;
    }
    cmd('h.release', { ids: d.items.map(m => m.id) }); for (const m of d.items) S.leases.delete(m.id); return;
  }
  if (B.marquee) { const m = B.marquee; B.marquee = null; const x0 = Math.min(m.start.x, m.cur.x), x1 = Math.max(m.start.x, m.cur.x), y0 = Math.min(m.start.y, m.cur.y), y1 = Math.max(m.start.y, m.cur.y); if (x0 !== x1 || y0 !== y1) { for (const o of S.home.objects) { const ts = tilesOf(o.d, o.x, o.y, o.rot, DEFS[o.d].layer === 'wall'); if (ts.some(([a, b]) => a >= x0 && a <= x1 && b >= y0 && b <= y1)) B.sel.add(o.id); } B.suppressClick = true; } return; }
  if (B.rect) {
    const r = B.rect; B.rect = null; const x0 = Math.min(r.start.x, r.cur.x), x1 = Math.max(r.start.x, r.cur.x), y0 = Math.min(r.start.y, r.cur.y), y1 = Math.max(r.start.y, r.cur.y);
    if (B.tool === 'wall') {
      let tiles = []; if (r.shift || e.shiftKey) { for (let x = x0; x <= x1; x++) { tiles.push([x, y0], [x, y1]); } for (let y = y0 + 1; y < y1; y++) tiles.push([x0, y], [x1, y]); }
      else if (Math.abs(r.cur.x - r.start.x) >= Math.abs(r.cur.y - r.start.y)) { for (let x = x0; x <= x1; x++) tiles.push([x, r.start.y]); } else for (let y = y0; y <= y1; y++) tiles.push([r.start.x, y]);
      const res = await cmd('h.walls', { tiles, type: 1 }); if (res.ok) { sfx('place'); if (res.skipped) toast(`${res.done} wall(s) built, ${res.skipped} skipped (${res.lastError?.replace(/_/g, ' ')})`, 'warn'); } else toast(errText(res), 'warn'); B.suppressClick = true;
    } else if (B.tool === 'floor') { const tiles = []; for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) if (!S.home.walls[x + ',' + y]) tiles.push([x, y]); const res = await cmd('h.floors', { tiles, color: e.altKey ? null : B.floor }); if (res.ok) sfx('place'); else toast(errText(res), 'warn'); B.suppressClick = true; }
    else if (B.tool === 'bpsave') { B.suppressClick = true; promptBox('Save blueprint', 'Name', 'My room', async (name) => { const res = await cmd('bp.save', { name, x0, y0, x1, y1 }); toast(res.ok ? '📐 Blueprint saved (Inventory → Blueprints)' : errText(res), res.ok ? 'good' : 'warn'); }); }
  }
}

// ---------------- blueprints ----------------
async function startBlueprint(bp) {
  const r = await cmd('bp.bom', { id: bp.id }); if (!r.ok) return toast(errText(r), 'warn');
  const missing = r.bom.filter(b => b.missing > 0); const cost = missing.reduce((a, b) => a + b.missing * b.price, 0);
  openPanel('bpbom', `📐 ${bp.name} — bill of materials`, () => h('div', { class: 'col', style: { width: '420px' } }, h('table', { class: 't' }, r.bom.map(b => h('tr', {}, h('td', {}, DEFS[b.d]?.emoji + ' ' + (DEFS[b.d]?.name || b.d)), h('td', {}, `${b.have}/${b.need}`), h('td', { class: b.missing ? 'bad' : 'good' }, b.missing ? `missing ${b.missing} (🪙${fmt(b.missing * b.price)})` : '✓')))), h('div', {}, `Walls: ${bp.walls.length} × 🪙${WALL_COST} = 🪙${bp.walls.length * WALL_COST}`),
    missing.length ? h('div', { class: 'bad' }, `Missing items would cost about 🪙${fmt(cost)} at shop prices.`) : null,
    h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => { closePanel('bpbom'); B.bp = { bp, skip: !!missing.length }; toast('Click where the top-left corner of the blueprint should go. Right-click cancels.'); } }, missing.length ? 'Place what I own' : 'Place blueprint'), missing.length ? h('button', { class: 'btn alt', onclick: () => { closePanel('bpbom'); openShop('furn', true); } }, '🛒 Buy missing') : null)), { w: 450, y: 80 });
}
async function applyBp() {
  const { bp, skip } = B.bp; const r = await cmd('bp.apply', { id: bp.id, x: mouseTile.x, y: mouseTile.y, skipInvalid: skip }); B.bp = null;
  if (r.ok) { sfx('place'); toast(`Blueprint applied: ${r.placed} items${r.skipped ? `, ${r.skipped} skipped` : ''}`, 'good'); } else toast(errText(r) + (r.d ? ` (${DEFS[r.d]?.name})` : ''), 'warn');
}

// ---------------- overlay (isometric) ----------------
function overlay(c, now) {
  if (!S.buildMode || !S.home) return; const home = S.home; c.lineJoin = 'round';
  c.strokeStyle = 'rgba(255,255,255,.16)'; c.lineWidth = 1; c.beginPath();
  for (let x = 0; x <= home.w; x++) { c.moveTo(...P(x, 0)); c.lineTo(...P(x, home.h)); } for (let y = 0; y <= home.h; y++) { c.moveTo(...P(0, y)); c.lineTo(...P(home.w, y)); } c.stroke();
  const { x, y } = mouseTile; const tileBox = (tx, ty, col) => { diamond(c, tx, ty); c.fillStyle = col; c.fill(); };
  const rectOf = (m) => ({ x0: Math.min(m.start.x, m.cur.x), x1: Math.max(m.start.x, m.cur.x), y0: Math.min(m.start.y, m.cur.y), y1: Math.max(m.start.y, m.cur.y) });
  const label = (txt, tx, ty, col = '#fff') => { const [X, Y] = P(tx, ty, 48); c.font = '700 12px Nunito'; c.textAlign = 'left'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.6)'; c.strokeText(txt, X, Y); c.fillStyle = col; c.fillText(txt, X, Y); };
  if (B.tool === 'place' && B.held && !B.drag) { const g = ghostPos(B.held, B.rot); const bad = check(B.held, g.x, g.y, B.rot); drawFurnGhost(c, B.held, g.x, g.y, B.rot, { tint: bad ? 'rgba(255,42,42,.4)' : 'rgba(42,255,106,.3)' }); if (bad) label(bad, g.x, g.y); }
  else if (B.paste) { for (const it of B.paste.items) { const bad = check(it.d, x + it.dx, y + it.dy, it.rot); drawFurnGhost(c, it.d, x + it.dx, y + it.dy, it.rot, { tint: bad ? 'rgba(255,42,42,.4)' : 'rgba(42,255,106,.3)' }); } }
  else if (B.bp) { for (const it of B.bp.bp.items) drawFurnGhost(c, it.d, x + it.x, y + it.y, it.rot, {}); c.strokeStyle = '#f2a93b'; c.lineWidth = 2; diamond(c, x, y, B.bp.bp.w, B.bp.bp.h); c.stroke(); }
  else if (['wall', 'door', 'window', 'erase', 'floor'].includes(B.tool) && !B.rect) tileBox(x, y, B.tool === 'erase' ? 'rgba(255,74,74,.4)' : 'rgba(255,255,255,.3)');
  if (B.drag) { const dx = mouseTile.x - B.drag.start.x, dy = mouseTile.y - B.drag.start.y; const ign = new Set(B.drag.items.map(m => m.id)); for (const m of B.drag.items) { const bad = check(m.d, m.ox + dx, m.oy + dy, m.rot, ign); drawFurnGhost(c, m.d, m.ox + dx, m.oy + dy, m.rot, { sel: true, tint: bad ? 'rgba(255,42,42,.4)' : 'rgba(255,255,255,.12)' }); } }
  if (B.marquee) { const r = rectOf(B.marquee); c.strokeStyle = '#f2a93b'; c.fillStyle = 'rgba(242,169,59,.16)'; c.lineWidth = 2; diamond(c, r.x0, r.y0, r.x1 - r.x0 + 1, r.y1 - r.y0 + 1); c.fill(); c.stroke(); }
  if (B.rect) { const r = rectOf(B.rect); c.lineWidth = 2;
    if (B.tool === 'wall') {
      const ws = wallSprite(WALL_COLORS[home.wallColor || 0], 1, WALL_LOW); const cells = []; const hollow = B.rect.shift;
      if (hollow) { for (let tx = r.x0; tx <= r.x1; tx++) for (let ty = r.y0; ty <= r.y1; ty++) if (tx === r.x0 || tx === r.x1 || ty === r.y0 || ty === r.y1) cells.push([tx, ty]); } else if (Math.abs(B.rect.cur.x - B.rect.start.x) >= Math.abs(B.rect.cur.y - B.rect.start.y)) { for (let tx = r.x0; tx <= r.x1; tx++) cells.push([tx, B.rect.start.y]); } else for (let ty = r.y0; ty <= r.y1; ty++) cells.push([B.rect.start.x, ty]);
      cells.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1])); for (const [tx, ty] of cells) { const [X, Y] = P(tx, ty); drawSprite(c, ws, X, Y, 0.7); }
      label(`${cells.length} walls · 🪙${cells.length * WALL_COST}${hollow ? '' : ' (hold Shift for a room outline)'}`, r.x0, r.y0);
    } else { c.strokeStyle = B.tool === 'floor' ? '#fff' : '#f2a93b'; diamond(c, r.x0, r.y0, r.x1 - r.x0 + 1, r.y1 - r.y0 + 1); if (B.tool === 'floor') { c.fillStyle = FLOOR_COLORS[B.floor] + 'cc'; c.fill(); } c.stroke(); } }
  for (const [id, by] of S.leases) { if (by === S.me.id) continue; const o = objById(id); if (!o) continue; label('✋ ' + (S.players.get(by)?.name || '?'), o.x, o.y, '#f26b5b'); }
  for (const [id, g] of S.dragGhosts) { const o = objById(id); if (o) drawFurnGhost(c, o.d, g.x, g.y, g.rot, { tint: 'rgba(43,179,163,.35)' }); label('✋ ' + (S.players.get(g.by)?.name || '?'), g.x, g.y, '#2bb3a3'); }
}
