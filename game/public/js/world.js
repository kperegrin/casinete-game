// World view: render loop, input, local movement, interaction targeting.
import { S, bus, setting } from './state.js';
import { cmd, sendRaw, errText } from './net.js';
import { T, OUT, outdoorCanvas, drawChar, nameTag, bubble, drawFurniture, drawHome, drawThing, THING_ICON } from './art.js';
import { W as MW, H as MH, BUILDINGS, SOLID_TILES, OUTDOOR_THINGS, POSTCARDS, OUTDOOR_NPCS, districtAt, INTERIORS } from '/shared/map.js';
import { DEFS } from '/shared/content.js';
import { sfx } from './audio.js';
import { toast, anyPanelOpen, $ } from './ui.js';

export const world = { canvas: null, ctx: null, cam: { x: 0, y: 0, zoom: 1.6 }, keys: new Set(), target: null, hooks: { overlay: [], mouse: null, mouseDown: null, mouseUp: null, wheel: null, keyDown: null }, openers: {}, time: 0, mouse: { x: 0, y: 0 }, chatFocus: false, interiorSolid: null, homeSolid: new Set(), found: new Set(), lastStep: 0 };
const SPEED = 4.6;
let lastSend = 0, seq = 0, walkPhase = 0, last = performance.now(), moved = false;

export function setupHomeSolid() {
  const set = new Set(); if (!S.home) { world.homeSolid = set; return; }
  for (const o of S.home.objects) { const d = DEFS[o.d]; if (!d || d.layer !== 'floor') continue; const w = (o.rot & 1) ? d.h : d.w, h = (o.rot & 1) ? d.w : d.h; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set.add((o.x + i) + ',' + (o.y + j)); }
  world.homeSolid = set;
}
export function setupInterior(id) {
  const def = S.world.interiors[id]; const solid = new Set(def.walls.map(([x, y]) => x + ',' + y));
  for (const t of def.things) if (t.w) { const x0 = Math.floor(t.x - t.w / 2), y0 = Math.floor(t.y - t.h / 2); for (let i = 0; i < t.w; i++) for (let j = 0; j < t.h; j++) solid.add((x0 + i) + ',' + (y0 + j)); } else if (['slots', 'shop', 'cashier', 'horses', 'props', 'salon', 'achievements'].includes(t.k)) solid.add(Math.floor(t.x) + ',' + Math.floor(t.y));
  world.interiorSolid = solid;
}
export function solidAt(x, y) {
  const tx = Math.floor(x), ty = Math.floor(y);
  if (S.loc === 'world') { if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return true; return SOLID_TILES.has(OUT[ty * MW + tx]); }
  if (S.home) { const w = S.home.walls[tx + ',' + ty]; if (w === 1 || w === 3) return true; if (tx < 0 || ty < 0 || tx >= S.home.w || ty >= S.home.h) return true; return world.homeSolid.has(tx + ',' + ty); }
  const def = S.world.interiors[S.loc]; if (tx < 0 || ty < 0 || tx >= def.w || ty >= def.h) return true; return world.interiorSolid.has(tx + ',' + ty);
}
const blocked = (x, y, r = 0.26) => solidAt(x - r, y - r) || solidAt(x + r, y - r) || solidAt(x - r, y + r * 0.6) || solidAt(x + r, y + r * 0.6);

export const thingsHere = () => S.loc === 'world' ? [...OUTDOOR_THINGS, ...POSTCARDS.filter(p => !S.me.found.includes(p.id))] : S.loc.startsWith('home:') ? [] : (S.world.interiors[S.loc]?.things || []);
export const npcsHere = () => S.loc === 'world' ? OUTDOOR_NPCS : S.loc.startsWith('home:') ? [] : (S.world.interiors[S.loc]?.npcs || []);

export function screenToTile(mx, my) { const z = world.cam.zoom * T; return { fx: (mx - world.cam.ox) / z, fy: (my - world.cam.oy) / z }; }

function findTarget() {
  let best = null; const consider = (c) => { if (!best || c.dist < best.dist) best = c; };
  const px = S.x, py = S.y;
  if (S.loc === 'world') {
    for (const b of BUILDINGS) { const d = Math.hypot(b.door[0] + 0.5 - px, b.door[1] + 0.5 - py); if (d < 1.9) consider({ kind: 'door', id: b.id, label: `Enter ${b.name}`, dist: d }); }
  } else if (S.home) {
    const d = S.home.entry; const dd = Math.hypot(d.x + 0.5 - px, d.y + 0.5 - py); if (dd < 1.9) consider({ kind: 'exit', label: 'Leave home', dist: dd });
    if (!S.buildMode) for (const o of S.home.objects) { const df = DEFS[o.d]; if (!df.interact) continue; const w = (o.rot & 1) ? df.h : df.w, h = (o.rot & 1) ? df.w : df.h; const dist = Math.hypot(o.x + w / 2 - px, o.y + h / 2 - py) - Math.max(w, h) / 2; if (dist < 1.5) consider({ kind: 'furn', id: o.id, label: ({ sit: 'Sit', lie: 'Lie down', toggle: 'Switch on/off', storage: 'Open storage', play: 'Play', music: 'Play music', use: 'Use' })[df.interact] + ` — ${df.name}`, dist }); }
  } else {
    const ex = S.world.interiors[S.loc].exit; const dd = Math.hypot(ex.x + 0.5 - px, ex.y + 0.5 - py); if (dd < 1.9) consider({ kind: 'exit', label: 'Exit', dist: dd });
  }
  if (!S.home || !S.buildMode) {
    for (const t of thingsHere()) { const rr = Math.max(1.9, (t.w || 1) / 2 + 1.4); const d = Math.hypot(t.x - px, t.y - py); if (d < rr) consider({ kind: 'thing', id: t.id, t, label: t.label || t.k, dist: d - (t.w ? t.w / 2 : 0) }); }
    for (const n of npcsHere()) { const d = Math.hypot(n.x - px, n.y - py); if (d < 2.3) consider({ kind: 'npc', id: n.id, n, label: `Talk to ${n.name}`, dist: d + 0.3 }); }
    for (const p of S.players.values()) { if (p.id === S.me.id) continue; const d = Math.hypot(p.x - px, p.y - py); if (d < 2.4) consider({ kind: 'player', id: p.id, label: `${p.name}…`, dist: d + 0.6 }); }
  }
  return best;
}
export async function activate(tg) {
  if (!tg) return;
  if (tg.kind === 'door') { const r = await cmd('enter', { id: tg.id }); if (r.ok) sfx('door'); else if (r.err === 'vacant') world.openers.vacant?.(r.propId); else { toast(errText(r), 'warn'); if (r.canRing) world.openers.ring?.(tg.id); } }
  else if (tg.kind === 'exit') { const r = await cmd('exit'); if (r.ok) sfx('door'); else toast(errText(r), 'warn'); }
  else if (tg.kind === 'thing') {
    const r = await cmd('interact', { id: tg.id }); if (!r.ok) return toast(errText(r), 'warn'); if (r.msg) toast(r.msg, 'good', 4200);
    if (r.open) world.openers[r.open]?.(r); else if (tg.t.k === 'sit') { S.sit = true; sfx('click'); }
  }
  else if (tg.kind === 'npc') { const r = await cmd('talk', { id: tg.id }); if (r.ok) { S.bubbles.set('npc:' + tg.id, { text: r.line, until: performance.now() + 5000 }); world.openers.npc?.(tg.n, r); sfx('click'); } }
  else if (tg.kind === 'furn') { const r = await cmd('use', { id: tg.id }); if (!r.ok) return toast(errText(r), 'warn'); if (r.msg) toast(r.msg, 'good'); if (r.open) world.openers[r.open]?.(r); else sfx('click'); }
  else if (tg.kind === 'player') world.openers.player?.(tg.id);
}

export function startWorld(canvas) {
  world.canvas = canvas; world.ctx = canvas.getContext('2d');
  const resize = () => { const dpr = Math.min(2, devicePixelRatio || 1); canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; world.dpr = dpr; }; resize(); addEventListener('resize', resize);
  addEventListener('keydown', (e) => {
    if (world.chatFocus || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
    if (world.hooks.keyDown?.(e)) return;
    world.keys.add(e.code); if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
    if (e.code === 'KeyE' && !anyPanelOpen()) activate(world.target);
  });
  addEventListener('keyup', (e) => world.keys.delete(e.code));
  addEventListener('blur', () => world.keys.clear());
  canvas.addEventListener('mousemove', (e) => { world.mouse.x = e.clientX; world.mouse.y = e.clientY; });
  canvas.addEventListener('mousedown', (e) => { if (world.hooks.mouseDown?.(e)) return; });
  addEventListener('mouseup', (e) => { world.hooks.mouseUp?.(e); });
  canvas.addEventListener('click', (e) => {
    if (world.hooks.mouse?.(e)) return; const { fx, fy } = screenToTile(e.clientX, e.clientY);
    for (const p of S.players.values()) if (p.id !== S.me.id && Math.abs(p.x - fx) < 0.8 && Math.abs(p.y - 0.8 - fy) < 1) return world.openers.player?.(p.id);
    for (const n of npcsHere()) if (Math.hypot(n.x - fx, n.y - 0.6 - fy) < 0.9) return Math.hypot(n.x - S.x, n.y - S.y) < 3 ? activate({ kind: 'npc', id: n.id, n }) : toast('Move closer to talk.');
  });
  canvas.addEventListener('wheel', (e) => { if (world.hooks.wheel?.(e)) return; world.cam.zoom = Math.max(0.8, Math.min(3, world.cam.zoom * (e.deltaY < 0 ? 1.1 : 0.9))); e.preventDefault(); }, { passive: false });
  requestAnimationFrame(frame);
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; world.time = now;
  if (S.me && S.world) { update(dt, now); render(now); }
  requestAnimationFrame(frame);
}
function update(dt, now) {
  const k = world.keys; let dx = 0, dy = 0;
  if (!world.chatFocus && !S.frozen) { if (k.has('KeyA') || k.has('ArrowLeft')) dx -= 1; if (k.has('KeyD') || k.has('ArrowRight')) dx += 1; if (k.has('KeyW') || k.has('ArrowUp')) dy -= 1; if (k.has('KeyS') || k.has('ArrowDown')) dy += 1; }
  const gp = navigator.getGamepads?.()[0]; if (gp && !S.frozen) { const ax = gp.axes[0], ay = gp.axes[1]; if (Math.abs(ax) > 0.25) dx += ax; if (Math.abs(ay) > 0.25) dy += ay; if (gp.buttons[0]?.pressed && !world.gpA) { world.gpA = true; activate(world.target); } if (!gp.buttons[0]?.pressed) world.gpA = false; }
  if ((dx || dy) && S.sit) { S.sit = null; }
  if ((dx || dy) && !S.buildFreeze) {
    const len = Math.hypot(dx, dy); dx /= len; dy /= len; const sp = SPEED * dt;
    let nx = S.x + dx * sp, ny = S.y;
    if (!blocked(nx, ny)) S.x = nx; ny = S.y + dy * sp; if (!blocked(S.x, ny)) S.y = ny;
    S.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 0 : 2); walkPhase += dt * 11; moved = true;
    if (now - world.lastStep > 260) { world.lastStep = now; sfx('step'); }
  }
  if (moved && now - lastSend > 66) { lastSend = now; moved = false; sendRaw({ t: 'mv', x: +S.x.toFixed(3), y: +S.y.toFixed(3), d: S.dir, seq: ++seq }); }
  const me = S.players.get(S.me.id); if (me) { me.x = S.x; me.y = S.y; me.dir = S.dir; me.walk = (dx || dy) ? walkPhase : 0; }
  for (const p of S.players.values()) if (p.id !== S.me.id) { const px = p.x; p.x += (p.tx - p.x) * Math.min(1, dt * 12); p.y += (p.ty - p.y) * Math.min(1, dt * 12); const mv = Math.hypot(p.tx - p.x, p.ty - p.y); p.walk = mv > 0.03 ? (p.walkPhase = (p.walkPhase || 0) + dt * 11) : 0; }
  world.target = S.frozen ? null : findTarget();
  const prompt = $('#prompt'); if (prompt) { if (world.target && !anyPanelOpen()) { prompt.classList.remove('hidden'); prompt.innerHTML = `<kbd>E</kbd> ${world.target.label}`; } else prompt.classList.add('hidden'); }
}

export function dayFraction() { return (((Date.now() + S.serverOffset) / 60000) % 40) / 40; }
export function isNight() { const f = dayFraction(); return f > 0.62 && f < 0.95; }

function render(now) {
  const c = world.ctx, cv = world.canvas, dpr = world.dpr; c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = innerWidth, H = innerHeight; const z = world.cam.zoom; const unit = T * z;
  const interior = S.loc !== 'world'; const iw = S.home ? S.home.w : interior ? S.world.interiors[S.loc].w : MW, ih = S.home ? S.home.h : interior ? S.world.interiors[S.loc].h : MH;
  let cx = S.x * unit, cy = (S.y - 0.6) * unit; if (interior) { const fit = Math.min(1, (W - 40) / (iw * unit), (H - 40) / (ih * unit)); if (fit >= 1 || S.buildMode) { cx = iw * unit / 2; cy = ih * unit / 2; } }
  const cam = world.cam; cam.tx = cam.tx ?? cx; cam.ty = cam.ty ?? cy; cam.tx += (cx - cam.tx) * 0.18; cam.ty += (cy - cam.ty) * 0.18; cam.ox = W / 2 - cam.tx; cam.oy = H / 2 - cam.ty;
  c.fillStyle = interior ? '#171c2c' : '#3aa6d8'; c.fillRect(0, 0, W, H);
  c.save(); c.translate(cam.ox, cam.oy); c.scale(z, z); c.imageSmoothingEnabled = true;
  const draws = [];
  if (!interior) {
    c.drawImage(outdoorCanvas(), 0, 0);
    // animated water sparkles
    c.fillStyle = '#ffffff30'; for (let i = 0; i < 40; i++) { const wx = ((i * 97 + now / 40) % (MW * T)); const wy = (40 + (i * 13) % 4) * T + 6; c.fillRect(wx, wy, 14, 2); }
  } else if (S.home) {
    drawHome(c, S.home);
  } else {
    const def = S.world.interiors[S.loc]; c.fillStyle = def.floor; c.fillRect(0, 0, def.w * T, def.h * T);
    for (let y = 0; y < def.h; y++) for (let x = 0; x < def.w; x++) { c.fillStyle = (x + y) % 2 ? '#0000000f' : '#ffffff0f'; c.fillRect(x * T, y * T, T, T); }
    if (S.loc === 'casino') { c.fillStyle = '#7a1d3a55'; c.fillRect(2 * T, 3 * T, 26 * T, 10 * T); }
    for (const [x, y] of def.walls) { c.fillStyle = '#5a4a6b'; c.fillRect(x * T, y * T, T, T); c.fillStyle = '#463757'; c.fillRect(x * T, y * T + T - 6, T, 6); }
    c.fillStyle = '#5a3a1c'; c.fillRect(def.exit.x * T + 4, def.exit.y * T + 2, T - 8, T - 2); c.fillStyle = '#fff'; c.font = '700 9px Nunito'; c.textAlign = 'center'; c.fillText('EXIT', def.exit.x * T + T / 2, def.exit.y * T + T - 5);
  }
  // things (flat) and furniture
  if (S.home) {
    for (const o of S.home.objects) { const lock = S.leases?.get(o.id); const ghostMoved = S.dragGhosts?.get(o.id); const sel = S.selected?.has?.(o.id);
      const def = DEFS[o.d]; if (!def) continue; if (ghostMoved || S.hideIds?.has(o.id)) continue; const h = (def.layer === 'floor') ? 1 : 0; draws.push({ y: o.y + ((o.rot & 1) ? def.w : def.h) + (def.layer === 'rug' ? -50 : def.layer === 'wall' ? -10 : 0), f: () => drawFurniture(c, o.d, o.x * T, o.y * T, o.rot, { state: o.state, time: now, locked: !!lock && lock !== S.me.id, tint: lock && lock !== S.me.id ? '#f26b5b44' : null, sel }) }); }
    if (S.dragGhosts) for (const [id, g] of S.dragGhosts) draws.push({ y: g.y + 5, f: () => drawFurniture(c, g.d, g.x * T, g.y * T, g.rot, { ghost: 1, tint: g.by !== S.me.id ? '#2bb3a366' : null }) });
  } else for (const t of thingsHere()) draws.push({ y: t.y - 100, f: () => drawThing(c, t, now) });
  for (const n of npcsHere()) { const phase = now / 1000 + n.x; const dy = n.role === 'ambient' || n.role === 'guide' ? 0 : 0; draws.push({ y: n.y, f: () => { drawChar(c, { ...n.look, body: 1, topColor: n.look.topColor ?? 3 }, n.x * T, n.y * T, { dir: 0, walk: 0 }); nameTag(c, n.name, n.x * T, n.y * T - 66, { color: '#ffd98e' }); const b = S.bubbles.get('npc:' + n.id); if (b && b.until > now) bubble(c, b.text, n.x * T, n.y * T - 70); else if (S.world && Math.hypot(n.x - S.x, n.y - S.y) < 4 && n.role !== 'dealer') { c.font = '16px serif'; c.textAlign = 'center'; c.fillText('💬', n.x * T + 16, n.y * T - 78 + Math.sin(now / 250) * 2); } } }); }
  for (const p of S.players.values()) {
    const sit = S.players.get(p.id)?.sit; draws.push({ y: p.y + 0.01, f: () => {
      drawChar(c, p.look, p.x * T, p.y * T, { dir: p.dir, walk: p.walk, sit: !!sit }); nameTag(c, p.name, p.x * T, p.y * T - 66, { title: p.title, you: p.id === S.me.id });
      const b = S.bubbles.get(p.id); if (b && b.until > now) bubble(c, b.text, p.x * T, p.y * T - 70); const e = S.emotes.get(p.id); if (e && e.until > now) { c.font = `${30 + Math.sin(now / 120) * 3}px serif`; c.textAlign = 'center'; c.fillText(e.e, p.x * T, p.y * T - 82 - (now % 1500) / 60); }
    } });
  }
  draws.sort((a, b) => a.y - b.y); for (const d of draws) d.f();
  if (!interior) { // night tint with window glow
    const f = dayFraction(); const night = f > 0.62 && f < 0.95 ? Math.min(1, Math.min(f - 0.62, 0.95 - f) * 12) : 0;
    c.restore(); c.save(); if (night > 0) { c.fillStyle = `rgba(14,20,60,${0.42 * night})`; c.fillRect(0, 0, W, H); }
  }
  c.restore();
  for (const fn of world.hooks.overlay) { c.save(); c.translate(cam.ox, cam.oy); c.scale(z, z); fn(c, now); c.restore(); }
  drawMinimap();
}
function drawMinimap() {
  const mm = $('#minimap'); if (!mm) return; const c = mm.getContext('2d'); c.clearRect(0, 0, mm.width, mm.height);
  if (S.loc === 'world') {
    const sx = mm.width / MW, sy = mm.height / MH; c.drawImage(outdoorCanvas(), 0, 0, mm.width, mm.height);
    for (const p of S.players.values()) { c.fillStyle = p.id === S.me.id ? '#fff' : '#ffd24a'; c.beginPath(); c.arc(p.x * sx, p.y * sy, p.id === S.me.id ? 3.5 : 2.5, 0, 7); c.fill(); if (p.id === S.me.id) { c.strokeStyle = '#f26b5b'; c.lineWidth = 1.5; c.stroke(); } }
    c.font = '9px Nunito'; c.fillStyle = '#fff'; c.textAlign = 'center';
    for (const t of [['🏠', 5, 22], ['🛒', 5, 13], ['🎰', 46, 25], ['🐎', 58, 24], ['⛲', 31, 16]]) c.fillText(t[0], t[1] * sx, t[2] * sy);
  } else { c.fillStyle = '#1f2a44'; c.fillRect(0, 0, mm.width, mm.height); c.fillStyle = '#fff'; c.font = '700 12px Nunito'; c.textAlign = 'center'; c.fillText(S.home ? S.home.name : S.world.interiors[S.loc].name, mm.width / 2, mm.height / 2 - 4); c.font = '11px Nunito'; c.fillStyle = '#ffd98e'; c.fillText(`${S.players.size} here`, mm.width / 2, mm.height / 2 + 14); }
}
