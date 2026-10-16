// World view: render loop, input, local movement, interaction targeting.
import { S, bus, setting } from './state.js';
import { cmd, sendRaw, errText } from './net.js';
import { T, OUT, outdoorCanvas, nameTag, bubble } from './art.js';
import { P, HW, HH, unproject, depthSort } from './iso.js';
import { furnitureSprite, thingSprite, buildingSprite, treeSprite, propSprite, characterSprite, drawSprite } from './sprites.js';
import { decorations } from './decor.js';
import { TOX, TOY, hash, diamond, terrainCanvas, waterTiles, wallSprite, doorFrameSprite, wallTall, WALL_TALL, WALL_LOW } from './isoworld.js';
import { FLOOR_COLORS, WALL_COLORS } from '/shared/content.js';
import { TEX, floorTexture, isoPattern } from './textures.js';
import { TILE as TT, W as MW, H as MH, BUILDINGS, SOLID_TILES, OUTDOOR_THINGS, POSTCARDS, OUTDOOR_NPCS, districtAt, INTERIORS } from '/shared/map.js';
import { DEFS } from '/shared/content.js';
import { sfx } from './audio.js';
import { toast, anyPanelOpen, $ } from './ui.js';

export const world = { canvas: null, ctx: null, cam: { x: 0, y: 0, zoom: 1 }, keys: new Set(), target: null, hooks: { overlay: [], mouse: null, mouseDown: null, mouseUp: null, wheel: null, keyDown: null }, openers: {}, time: 0, mouse: { x: 0, y: 0 }, chatFocus: false, interiorSolid: null, homeSolid: new Set(), found: new Set(), lastStep: 0 };
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

// ---- screen <-> tile (isometric): the floor plane is z = 0
export function screenToTile(mx, my) { const z = world.cam.zoom; const u = unproject((mx - world.cam.ox) / z, (my - world.cam.oy) / z); return { fx: u.x, fy: u.y }; }
world.tileToScreen = (fx, fy, zz = 0) => { const [X, Y] = P(fx, fy, zz); return { x: X * world.cam.zoom + world.cam.ox, y: Y * world.cam.zoom + world.cam.oy }; };

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
    if (world.hooks.mouse?.(e)) return; const hit = hitAt(e.clientX, e.clientY, ['player', 'npc']); if (!hit) return;
    if (hit.kind === 'player') return world.openers.player?.(hit.id);
    const n = npcsHere().find(q => q.id === hit.id); if (n) return Math.hypot(n.x - S.x, n.y - S.y) < 3 ? activate({ kind: 'npc', id: n.id, n }) : toast('Move closer to talk.');
  });
  canvas.addEventListener('wheel', (e) => { if (world.hooks.wheel?.(e)) return; world.cam.zoom = Math.max(0.5, Math.min(2.4, world.cam.zoom * (e.deltaY < 0 ? 1.1 : 0.9))); e.preventDefault(); }, { passive: false });
  requestAnimationFrame(frame);
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; world.time = now;
  if (S.me && S.world) { update(dt, now); render(now); } else renderAttract(now);
  requestAnimationFrame(frame);
}
function update(dt, now) {
  const k = world.keys; let sx = 0, sy = 0;           // screen-space intent: x right, y down
  if (!world.chatFocus && !S.frozen) { if (k.has('KeyA') || k.has('ArrowLeft')) sx -= 1; if (k.has('KeyD') || k.has('ArrowRight')) sx += 1; if (k.has('KeyW') || k.has('ArrowUp')) sy -= 1; if (k.has('KeyS') || k.has('ArrowDown')) sy += 1; }
  const gp = navigator.getGamepads?.()[0]; if (gp && !S.frozen) { const ax = gp.axes[0], ay = gp.axes[1]; if (Math.abs(ax) > 0.25) sx += ax; if (Math.abs(ay) > 0.25) sy += ay; if (gp.buttons[0]?.pressed && !world.gpA) { world.gpA = true; activate(world.target); } if (!gp.buttons[0]?.pressed) world.gpA = false; }
  const dx = sx + sy, dy = sy - sx;                    // isometric: screen-down is +x+y, screen-right is +x-y
  if ((dx || dy) && S.sit) { S.sit = null; }
  if ((dx || dy) && !S.buildFreeze) {
    const len = Math.hypot(dx, dy); const ux = dx / len, uy = dy / len; const sp = SPEED * dt;
    let nx = S.x + ux * sp, ny = S.y;
    if (!blocked(nx, ny)) S.x = nx; ny = S.y + uy * sp; if (!blocked(S.x, ny)) S.y = ny;
    const ax = Math.abs(ux), ay = Math.abs(uy);        // 4 facings: 0 +y, 1 +x, 2 -y, 3 -x (pure screen directions pick the facing that shows most of the character)
    S.dir = ax > ay + 0.01 ? (ux > 0 ? 1 : 3) : ay > ax + 0.01 ? (uy > 0 ? 0 : 2) : (sy < 0 ? 3 : sy > 0 ? 0 : sx > 0 ? 1 : 0);
    walkPhase += dt * 11; moved = true;
    if (now - world.lastStep > 260) { world.lastStep = now; sfx('step'); }
  }
  if (moved && now - lastSend > 66) { lastSend = now; moved = false; sendRaw({ t: 'mv', x: +S.x.toFixed(3), y: +S.y.toFixed(3), d: S.dir, seq: ++seq }); }
  const me = S.players.get(S.me.id); if (me) { me.x = S.x; me.y = S.y; me.dir = S.dir; me.walk = (dx || dy) && !S.buildFreeze ? walkPhase : 0; }
  for (const p of S.players.values()) if (p.id !== S.me.id) { const px = p.x; p.x += (p.tx - p.x) * Math.min(1, dt * 12); p.y += (p.ty - p.y) * Math.min(1, dt * 12); const mv = Math.hypot(p.tx - p.x, p.ty - p.y); p.walk = mv > 0.03 ? (p.walkPhase = (p.walkPhase || 0) + dt * 11) : 0; }
  world.target = S.frozen ? null : findTarget();
  const prompt = $('#prompt'); if (prompt) { if (world.target && !anyPanelOpen()) { prompt.classList.remove('hidden'); prompt.innerHTML = `<kbd>E</kbd> ${world.target.label}`; } else prompt.classList.add('hidden'); }
}

export function dayFraction() { return (((Date.now() + S.serverOffset) / 60000) % 40) / 40; }
export function isNight() { const f = dayFraction(); return f > 0.62 && f < 0.95; }

// ---------------- isometric scene ----------------
const probe = document.createElement('canvas'); probe.width = probe.height = 1; const pc = probe.getContext('2d', { willReadFrequently: true });
const sprRect = (s, X, Y) => ({ x0: X + s.ox, y0: Y + s.oy, x1: X + s.ox + s.sw / s.s, y1: Y + s.oy + s.sh / s.s });
function hitSprite(s, X, Y, px, py) {
  const lx = (px - (X + s.ox)) * s.s, ly = (py - (Y + s.oy)) * s.s; if (lx < 0 || ly < 0 || lx >= s.sw || ly >= s.sh) return false;
  pc.clearRect(0, 0, 1, 1); pc.drawImage(s.img, s.sx + Math.floor(lx), s.sy + Math.floor(ly), 1, 1, 0, 0, 1, 1); return pc.getImageData(0, 0, 1, 1).data[3] > 150;   // ignore the baked soft shadows
}
const toWorldPx = (mx, my) => [(mx - world.cam.ox) / world.cam.zoom, (my - world.cam.oy) / world.cam.zoom];
function hitAt(mx, my, kinds) { const [px, py] = toWorldPx(mx, my); for (let i = world.hits.length - 1; i >= 0; i--) { const h = world.hits[i]; if (kinds && !kinds.includes(h.kind)) continue; if (px < h.r.x0 || px > h.r.x1 || py < h.r.y0 || py > h.r.y1) continue; if (hitSprite(h.s, h.X, h.Y, px, py)) return h; } return null; }
world.hits = []; world.pickFurniture = (mx, my) => hitAt(mx, my, ['furn'])?.id ?? null;

// A drawable: sprite + depth box (tile units) + screen rect. `bb` orders it against the other drawables.
function item(kind, s, tx, ty, bb, o = {}) { const [X, Y] = P(tx, ty); return { kind, s, X, Y, bb, sr: sprRect(s, X, Y), ...o }; }
let staticOut = null;
function outdoorStatics() {
  if (staticOut) return staticOut; const out = [];
  for (const b of BUILDINGS) out.push(item('bld', buildingSprite(b), b.x, b.y, { x0: b.x, x1: b.x + b.w, y0: b.y, y1: b.y + b.h, z0: 0, z1: 130 }));
  const TV = [0, 0, 0, 1, 1, 3, 4];             // round tree ×3, pine ×2, cypress, blossom
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (OUT[y * MW + x] === TT.TREE) { const v = TV[Math.floor(hash(x, y, 3) * TV.length)]; out.push(item('tree', treeSprite(v), x, y, { x0: x + 0.3, x1: x + 0.7, y0: y + 0.3, y1: y + 0.7, z0: 0, z1: 80 })); }
  for (const d of decorations()) { const s = propSprite(d.name); if (!s) continue; const thin = d.w === 1 && d.h === 1; out.push(item('prop', s, d.x, d.y, thin ? { x0: d.x + 0.3, x1: d.x + 0.7, y0: d.y + 0.3, y1: d.y + 0.7, z0: 0, z1: 60 } : { x0: d.x, x1: d.x + d.w, y0: d.y, y1: d.y + d.h, z0: 0, z1: 30 })); }
  return staticOut = out;
}
const thingFoot = (t) => t.k === 'fountain' ? [Math.floor(t.x), Math.floor(t.y) - 1, 2, 2] : t.w ? [t.x - t.w / 2, t.y - t.h / 2, t.w, t.h] : [Math.floor(t.x), Math.floor(t.y), 1, 1];
function thingItems(now) {
  const out = [];
  for (const t of thingsHere()) {
    if (t.k === 'postcard' || t.k === 'fish') { const [X, Y] = P(t.x, t.y); out.push({ kind: 'fx', t, X, Y, s: null, bb: { x0: t.x - 0.2, x1: t.x + 0.2, y0: t.y - 0.2, y1: t.y + 0.2, z0: 0, z1: 6 }, sr: { x0: X - 20, x1: X + 20, y0: Y - 40, y1: Y + 20 }, draw: (c) => (t.k === 'postcard' ? drawPostcard : drawFishSpot)(c, X, Y, now) }); continue; }
    const [fx, fy, fw, fh] = thingFoot(t); const s = thingSprite(t); const big = t.k === 'fountain';
    out.push(item('thing', s, fx, fy, { x0: fx + (big ? 0.05 : 0), x1: fx + fw - (big ? 0.05 : 0), y0: fy, y1: fy + fh, z0: 0, z1: 70 }, { seat: t.k === 'sit' }));
  }
  return out;
}
function drawPostcard(c, X, Y, now) { const bob = Math.sin(now / 300 + X) * 2.5; c.save(); c.translate(X, Y - 16 + bob); c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.ellipse(0, 16 - bob, 7, 3, 0, 0, 7); c.fill(); c.fillStyle = '#fffaf0'; c.strokeStyle = '#b5543a'; c.lineWidth = 1.2; c.beginPath(); c.roundRect(-9, -6, 18, 12, 2); c.fill(); c.stroke(); c.beginPath(); c.moveTo(-9, -6); c.lineTo(0, 1); c.lineTo(9, -6); c.stroke(); c.fillStyle = '#ff5d8f'; c.fillRect(4, -4, 4, 4); c.restore(); }
function drawFishSpot(c, X, Y, now) { c.save(); c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1.5; for (let i = 0; i < 3; i++) { const ph = ((now / 1400) + i / 3) % 1; c.globalAlpha = 1 - ph; c.beginPath(); c.ellipse(X, Y, 6 + ph * 18, 3 + ph * 9, 0, 0, 7); c.stroke(); } c.globalAlpha = 1; c.fillStyle = '#e74c3c'; c.beginPath(); c.arc(X, Y - 2 + Math.sin(now / 250) * 1.2, 2.5, 0, 7); c.fill(); c.fillStyle = '#fff'; c.fillRect(X - 1, Y - 6 + Math.sin(now / 250) * 1.2, 2, 3); c.restore(); }

// Rooms (homes and public interiors) share one description: size, wall test, floor colours.
function room() {
  if (S.home) { const h = S.home, wc = WALL_COLORS[h.wallColor || 0]; return { w: h.w, h: h.h, wc, wall: (x, y) => h.walls[x + ',' + y] || 0, floor: (x, y) => { const i = h.floors[x + ',' + y] ?? 0; return floorTexture(FLOOR_COLORS[i] || FLOOR_COLORS[0], i); }, home: h }; }
  const d = S.world.interiors[S.loc]; if (!d._ws) { d._ws = new Set(d.walls.map(([x, y]) => x + ',' + y)); }
  const IW = { shop_furn: '#c98a5a', shop_cloth: '#d98bb8', townhall: '#9fb3c8', casino: '#4b2a5e', track: '#6f9a5a' };
  const base = S.loc === 'casino' ? TEX.stone('#4a3a5e') : S.loc === 'townhall' ? TEX.marble('#eef1f4') : S.loc === 'shop_cloth' ? TEX.tiles('#f1d7e8') : TEX.planks(d.floor);
  return { w: d.w, h: d.h, wc: IW[S.loc] || '#6a5a82', wall: (x, y) => d._ws.has(x + ',' + y) ? (x === d.exit.x && y === d.exit.y ? 2 : 1) : 0, floor: (x, y) => (S.loc === 'casino' && x >= 2 && x < 28 && y >= 3 && y < 13) ? TEX.casinoCarpet() : base, def: d };
}
export function drawFurnGhost(c, d, x, y, rot, { alpha = 0.72, tint = null, sel = false } = {}) {
  const def = DEFS[d]; if (!def) return; const wl = def.layer === 'wall'; const w = !wl && (rot & 1) ? def.h : def.w, h = wl ? 1 : (rot & 1) ? def.w : def.h;
  if (tint) { diamond(c, x, y, w, h); c.fillStyle = tint; c.fill(); }
  const [X, Y] = P(x, y); drawSprite(c, furnitureSprite(d, wl ? 0 : rot, false), X, Y, alpha);
  if (sel) { c.strokeStyle = '#fff'; c.lineWidth = 2.5; diamond(c, x, y, w, h); c.stroke(); c.strokeStyle = '#f2a93b'; c.lineWidth = 1.2; diamond(c, x, y, w, h); c.stroke(); }
}
export const roomBounds = () => { const r = room(); return { w: r.w, h: r.h }; };
const FLOOR_SHADE = (x, y) => (x + y) % 2 ? 'rgba(0,0,0,.055)' : 'rgba(255,255,255,.04)';

function seatHost(items, p) { for (const it of items) if (it.seat && p.x >= it.bb.x0 - 0.05 && p.x <= it.bb.x1 + 0.05 && p.y >= it.bb.y0 - 0.05 && p.y <= it.bb.y1 + 0.05) return it; return null; }

function render(now) {
  const c = world.ctx, dpr = world.dpr; c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = innerWidth, H = innerHeight, z = world.cam.zoom; const interior = S.loc !== 'world'; const cam = world.cam;
  let R = null, fixed = false; if (interior) { R = room(); const bw = (R.w + R.h) * HW * z, bh = ((R.w + R.h) * HH + WALL_TALL) * z; fixed = S.buildMode || (bw <= W - 60 && bh <= H - 120); }
  let [cx, cy] = fixed ? P(R.w / 2, R.h / 2, WALL_TALL / 2 - 8) : P(S.x, S.y, 22);
  cam.tx = cam.tx ?? cx; cam.ty = cam.ty ?? cy; cam.tx += (cx - cam.tx) * 0.18; cam.ty += (cy - cam.ty) * 0.18; cam.ox = W / 2 - cam.tx * z; cam.oy = H / 2 - cam.ty * z;
  c.fillStyle = interior ? '#171c2c' : '#3aa6d8'; c.fillRect(0, 0, W, H);
  c.save(); c.translate(cam.ox, cam.oy); c.scale(z, z); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.lineJoin = 'round';
  const view = { x0: -cam.ox / z - 60, y0: -cam.oy / z - 140, x1: (W - cam.ox) / z + 60, y1: (H - cam.oy) / z + 120 };
  const vis = (r) => r.x1 > view.x0 && r.x0 < view.x1 && r.y1 > view.y0 && r.y0 < view.y1;
  let items = []; const rugs = [];
  if (!interior) {
    c.drawImage(terrainCanvas(), -TOX, -TOY);
    c.fillStyle = 'rgba(255,255,255,.28)'; for (const [x, y] of waterTiles) { const [X, Y] = P(x + 0.5, y + 0.5, -10); if (X < view.x0 || X > view.x1 || Y < view.y0 || Y > view.y1) continue; const ph = Math.sin(now / 900 + hash(x, y) * 20); c.globalAlpha = 0.25 + 0.2 * ph; c.beginPath(); c.ellipse(X + ph * 6, Y, 9, 2.6, 0, 0, 7); c.fill(); } c.globalAlpha = 1;
    items = outdoorStatics().filter(it => vis(it.sr)); items.push(...thingItems(now));
    if (world.target?.kind === 'door') { const b = BUILDINGS.find(q => q.id === world.target.id); if (b) { c.fillStyle = `rgba(255,236,140,${0.35 + 0.2 * Math.sin(now / 200)})`; diamond(c, b.door[0], b.door[1]); c.fill(); } }
  } else {
    // floor
    const groups = new Map(); for (let y = 0; y < R.h; y++) for (let x = 0; x < R.w; x++) { if (R.wall(x, y) && wallTall((a, b) => R.wall(a, b), x, y)) continue; const t = R.floor(x, y); (groups.get(t) || groups.set(t, []).get(t)).push(x, y); }
    for (const [t, xy] of groups) { c.beginPath(); for (let i = 0; i < xy.length; i += 2) { const x = xy[i], y = xy[i + 1]; const a = P(x, y), b = P(x + 1, y), e = P(x + 1, y + 1), f = P(x, y + 1); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(e[0], e[1]); c.lineTo(f[0], f[1]); c.closePath(); } c.fillStyle = isoPattern(c, t); c.fill(); c.strokeStyle = c.fillStyle; c.lineWidth = 0.8; c.stroke(); }
    { const g = c.createLinearGradient(...P(0, 0), ...P(R.w, R.h)); g.addColorStop(0, 'rgba(0,0,0,.16)'); g.addColorStop(0.35, 'rgba(0,0,0,0)'); c.fillStyle = g; diamond(c, 0, 0, R.w, R.h); c.fill(); }   // soft ambient occlusion from the back walls
    // front edge of the floor slab
    items = []; const isW = (a, b) => R.wall(a, b);
    for (let y = 0; y < R.h; y++) for (let x = 0; x < R.w; x++) {
      const wt = R.wall(x, y); if (!wt) continue; const tall = wallTall(isW, x, y); const hasDecor = R.home?.objects.some(o => DEFS[o.d]?.layer === 'wall' && o.y === y && x >= o.x && x < o.x + DEFS[o.d].w);
      const H_ = tall || hasDecor ? WALL_TALL : WALL_LOW;
      if (wt === 2 && !tall && !hasDecor) { diamond(c, x, y); c.fillStyle = '#9b4b3a'; c.fill(); const fs = doorFrameSprite(); items.push(item('door', fs, x, y, { x0: x, x1: x + 1, y0: y + 0.3, y1: y + 0.6, z0: 0, z1: 46 })); continue; }
      const type = wt === 2 && R.home && S.home.entry && x === S.home.entry.x && y === S.home.entry.y ? 2 : wt;
      const ws = wallSprite(R.wc, type, H_); items.push(item('wall', ws, x, y, { x0: x, x1: x + 1, y0: y, y1: y + 1, z0: 0, z1: H_ }));
    }
    if (R.def?.exit) { const e = R.def.exit; diamond(c, e.x, e.y); c.fillStyle = '#2f8f5b'; c.fill(); c.fillStyle = '#fff'; c.font = '800 10px Nunito'; c.textAlign = 'center'; const [X, Y] = P(e.x + 0.5, e.y + 0.55); c.fillText('EXIT', X, Y + 3); }
    if (S.home) {
      for (const o of S.home.objects) {
        const def = DEFS[o.d]; if (!def || S.hideIds?.has(o.id)) continue; const lock = S.leases?.get(o.id); const on = o.state ? true : false; const rot = def.layer === 'wall' ? 0 : o.rot;
        const s = furnitureSprite(o.d, rot, on && (def.interact === 'toggle' || def.interact === 'music')); const w = (o.rot & 1) && def.layer !== 'wall' ? def.h : def.w, d = (o.rot & 1) && def.layer !== 'wall' ? def.w : def.h; const sel = S.selected?.has?.(o.id);
        if (def.layer === 'rug') { const [X, Y] = P(o.x, o.y); rugs.push({ kind: 'furn', id: o.id, s, X, Y, r: sprRect(s, X, Y), o, w, d, lock, sel }); continue; }
        const bb = def.layer === 'wall' ? { x0: o.x, x1: o.x + def.w, y0: o.y + 1, y1: o.y + 1.15, z0: 20, z1: 80 } : { x0: o.x, x1: o.x + w, y0: o.y, y1: o.y + d, z0: 0, z1: 44 };
        const it = item('furn', s, o.x, o.y, bb, { id: o.id, o, w, d, lock, sel, seat: def.interact === 'sit' || def.interact === 'lie', alpha: lock && lock !== S.me.id ? 0.85 : 1 }); items.push(it);
      }
    }
    items = items.filter(it => vis(it.sr)); items.push(...thingItems(now));
  }
  // rugs live on the floor (never depth-sorted against anything)
  for (const r of rugs) { if (!vis(r.r)) continue; drawSprite(c, r.s, r.X, r.Y); if (r.sel) { c.strokeStyle = '#fff'; c.lineWidth = 2; diamond(c, r.o.x, r.o.y, r.w, r.d); c.stroke(); } if (r.lock && r.lock !== S.me.id) { c.strokeStyle = '#f26b5b'; c.setLineDash([5, 4]); c.lineWidth = 2; diamond(c, r.o.x, r.o.y, r.w, r.d); c.stroke(); c.setLineDash([]); } }
  world.hits = rugs.filter(r => vis(r.r)).map(r => ({ kind: 'furn', id: r.id, s: r.s, X: r.X, Y: r.Y, r: r.r }));
  // characters
  const chars = []; const tags = [];
  const addChar = (kind, id, name, look, x, y, dir, walk, sit, extra = {}) => {
    const s = characterSprite(look, dir, walk ? Math.floor(walk / 1.6) & 3 : 0, !!sit); const seatH = 0; const [X, Y] = P(x - 0.5, y - 0.5, seatH); const bb = { x0: x - 0.22, x1: x + 0.22, y0: y - 0.22, y1: y + 0.22, z0: seatH, z1: seatH + 46 };
    const it = { kind, id, s, X, Y, bb, sr: sprRect(s, X, Y), char: true, cx: x, cy: y, seatH, ...extra }; if (vis(it.sr)) chars.push(it); return it;
  };
  for (const n of npcsHere()) { const dx = S.x - n.x, dy = S.y - n.y; const near = Math.hypot(dx, dy) < 5; const dir = near ? (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 0 : 2)) : 0; const it = addChar('npc', n.id, n.name, { ...n.look, body: n.look.body ?? 1, topColor: n.look.topColor ?? 3 }, n.x, n.y, dir, 0, false, { n }); it.tag = { name: n.name, color: '#ffd98e', npc: n }; }
  for (const p of S.players.values()) { const it = addChar('player', p.id, p.name, p.look, p.x, p.y, p.dir || 0, p.walk, p.sit, { p }); it.tag = { name: p.name, title: p.title, you: p.id === S.me.id, p }; }
  // build-mode ghosts of items being dragged by other players
  const all = items.concat(chars);
  const sorted = depthSort(all);
  const hosts = new Map(); for (const ch of chars) if (ch.p?.sit) { const h = seatHost(items, ch.p); if (h) { hosts.set(ch, h); ch.attached = true; const face = h.kind === 'furn' ? [0, 3, 2, 1][h.o.rot & 3] : 0; if (face !== (ch.p.dir || 0)) { ch.s = characterSprite(ch.p.look, face, 0, true); ch.sr = sprRect(ch.s, ch.X, ch.Y); } } }
  const attached = new Map(); for (const [ch, h] of hosts) { (attached.get(h) || attached.set(h, []).get(h)).push(ch); }
  const hitItems = [];
  const drawIt = (it) => {
    if (it.draw) { it.draw(c); return; }
    if (it.shadow) { const [sx, sy, r] = it.shadow; const [X, Y] = P(sx, sy); c.fillStyle = 'rgba(0,0,0,.17)'; c.beginPath(); c.ellipse(X, Y, r, r * 0.45, 0, 0, 7); c.fill(); }
    if (it.char) { const [X, Y] = P(it.cx, it.cy); c.fillStyle = 'rgba(0,0,0,.22)'; c.beginPath(); c.ellipse(X, Y, 13, 6, 0, 0, 7); c.fill(); }
    if (it.kind === 'furn') { if (it.sel) { c.strokeStyle = '#fff'; c.lineWidth = 2.5; diamond(c, it.o.x, it.o.y, it.w, it.d); c.stroke(); c.strokeStyle = '#f2a93b'; c.lineWidth = 1.2; diamond(c, it.o.x, it.o.y, it.w, it.d); c.stroke(); } }
    drawSprite(c, it.s, it.X, it.Y, it.alpha ?? 1);
    if (it.kind === 'furn' && it.lock && it.lock !== S.me.id) { c.fillStyle = 'rgba(242,107,91,.2)'; diamond(c, it.o.x, it.o.y, it.w, it.d); c.fill(); c.strokeStyle = '#f26b5b'; c.setLineDash([5, 4]); c.lineWidth = 2; diamond(c, it.o.x, it.o.y, it.w, it.d); c.stroke(); c.setLineDash([]); }
    if (it.kind === 'furn' || it.char) hitItems.push({ kind: it.kind === 'furn' ? 'furn' : it.kind, id: it.id, s: it.s, X: it.X, Y: it.Y, r: it.sr });
  };
  if (world.target && world.target.kind !== 'door') { const t = world.target; let ring = null; if (t.kind === 'thing') { const [fx, fy, fw, fh] = thingFoot(t.t); ring = [fx, fy, fw, fh]; } else if (t.kind === 'furn') { const o = S.home?.objects.find(q => q.id === t.id); if (o) { const df = DEFS[o.d]; ring = [o.x, o.y, (o.rot & 1) ? df.h : df.w, (o.rot & 1) ? df.w : df.h]; } } else if (t.kind === 'exit') { const e = S.home ? S.home.entry : S.world.interiors[S.loc].exit; ring = [e.x, e.y, 1, 1]; }
    if (ring) { c.strokeStyle = `rgba(255,236,140,${0.65 + 0.3 * Math.sin(now / 180)})`; c.lineWidth = 2.4; diamond(c, ring[0], ring[1], ring[2], ring[3]); c.stroke(); } }
  for (const it of sorted) { if (it.attached) continue; drawIt(it); for (const ch of attached.get(it) || []) drawIt(ch); }
  world.hits.push(...hitItems);
  // labels, bubbles, emotes (always on top)
  for (const ch of chars) {
    const top = ch.Y + ch.s.oy + 8; const cxs = P(ch.cx, ch.cy)[0];
    if (ch.tag) nameTag(c, ch.tag.name, cxs, top, { title: ch.tag.title, you: ch.tag.you, color: ch.tag.color });
    const key = ch.kind === 'npc' ? 'npc:' + ch.id : ch.id; const b = S.bubbles.get(key); const ty = top - (ch.tag?.title ? 34 : 22);
    if (b && b.until > now) bubble(c, b.text, cxs, ty); else if (ch.kind === 'npc' && Math.hypot(ch.n.x - S.x, ch.n.y - S.y) < 4 && ch.n.role !== 'dealer') { c.save(); c.fillStyle = '#fff'; c.strokeStyle = '#1f2a44'; c.lineWidth = 1.5; const by = ty - 4 + Math.sin(now / 250) * 2; c.beginPath(); c.roundRect(cxs - 11, by - 14, 22, 15, 6); c.fill(); c.stroke(); c.fillStyle = '#1f2a44'; for (let i = -1; i <= 1; i++) { c.beginPath(); c.arc(cxs + i * 5.5, by - 6.5, 1.6, 0, 7); c.fill(); } c.restore(); }
    if (ch.kind === 'player') { const e = S.emotes.get(ch.id); if (e && e.until > now) { c.font = `${28 + Math.sin(now / 120) * 3}px serif`; c.textAlign = 'center'; c.fillText(e.e, cxs, ty - 20 - (now % 1500) / 60); } }
  }
  c.restore();
  if (!interior) { const f = dayFraction(); const night = f > 0.62 && f < 0.95 ? Math.min(1, Math.min(f - 0.62, 0.95 - f) * 12) : 0; if (night > 0) { c.fillStyle = `rgba(14,20,60,${0.42 * night})`; c.fillRect(0, 0, W, H); } }
  for (const fn of world.hooks.overlay) { c.save(); c.translate(cam.ox, cam.oy); c.scale(z, z); fn(c, now); c.restore(); }
  drawMinimap();
}
// Menu background: a slow camera drift over the real town, with a few people strolling around the fountain.
const strollers = Array.from({ length: 7 }, (_, i) => ({ r: 2.6 + (i % 3) * 0.9, a: i * 0.9, sp: (i % 2 ? 1 : -1) * (0.18 + i * 0.02), look: { body: i % 3, skin: (i * 3) % 8, hairStyle: (i * 7) % 10, hairColor: (i * 5) % 10, topColor: (i * 3 + 1) % 10, bottomColor: (i * 7 + 2) % 10, shoeColor: 7, height: (i % 5) - 2, top: ['top_basic', 'top_hoodie', 'top_shirt', 'top_tank'][i % 4], bottom: ['bottom_basic', 'bottom_shorts', 'bottom_skirt', 'bottom_basic'][i % 4], shoes: 'shoes_basic', hat: [null, 'hat_cap', null, 'hat_beret', null, 'hat_party', null][i], glasses: [null, null, 'gl_sun', null, 'gl_round', null, null][i] } }));
function renderAttract(now) {
  const c = world.ctx, dpr = world.dpr || 1; if (!c) return; c.setTransform(dpr, 0, 0, dpr, 0, 0); const W = innerWidth, H = innerHeight; const z = 1.1;
  const t = now / 1000; const [cx, cy] = P(30.5 + Math.sin(t * 0.05) * 9, 19 + Math.cos(t * 0.037) * 6, 20); const ox = W / 2 - cx * z, oy = H / 2 - cy * z;
  c.fillStyle = '#3aa6d8'; c.fillRect(0, 0, W, H); c.save(); c.translate(ox, oy); c.scale(z, z);
  c.drawImage(terrainCanvas(), -TOX, -TOY);
  const view = { x0: -ox / z - 60, y0: -oy / z - 140, x1: (W - ox) / z + 60, y1: (H - oy) / z + 120 }; const vis = (r) => r.x1 > view.x0 && r.x0 < view.x1 && r.y1 > view.y0 && r.y0 < view.y1;
  const items = outdoorStatics().filter(it => vis(it.sr));
  for (const th of OUTDOOR_THINGS) { if (th.k === 'fish') continue; const [fx, fy, fw, fh] = thingFoot(th); items.push(item('thing', thingSprite(th), fx, fy, { x0: fx, x1: fx + fw, y0: fy, y1: fy + fh, z0: 0, z1: 70 })); }
  const chars = [];
  const addC = (look, x, y, dir, walk) => { const s = characterSprite(look, dir, walk ? Math.floor(walk / 1.6) & 3 : 0, false); const [X, Y] = P(x - 0.5, y - 0.5); chars.push({ kind: 'npc', s, X, Y, cx: x, cy: y, char: true, bb: { x0: x - 0.22, x1: x + 0.22, y0: y - 0.22, y1: y + 0.22, z0: 0, z1: 46 }, sr: sprRect(s, X, Y) }); };
  for (const n of OUTDOOR_NPCS) addC({ ...n.look, body: n.look.body ?? 1 }, n.x, n.y, 0, 0);
  for (const p of strollers) { const a = p.a + t * p.sp; const x = 31 + Math.cos(a) * p.r, y = 16 + Math.sin(a) * p.r * 0.8; const vx = -Math.sin(a) * p.sp, vy = Math.cos(a) * p.sp * 0.8; const dir = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 1 : 3) : (vy > 0 ? 0 : 2); addC(p.look, x, y, dir, t * 11); }
  for (const it of depthSort(items.concat(chars))) { if (it.char) { const [X, Y] = P(it.cx, it.cy); c.fillStyle = 'rgba(0,0,0,.22)'; c.beginPath(); c.ellipse(X, Y, 13, 6, 0, 0, 7); c.fill(); } drawSprite(c, it.s, it.X, it.Y); }
  c.restore();
}
function drawMinimap() {
  const mm = $('#minimap'); if (!mm) return; const c = mm.getContext('2d'); c.clearRect(0, 0, mm.width, mm.height);
  if (S.loc === 'world') {
    const sx = mm.width / MW, sy = mm.height / MH; c.drawImage(outdoorCanvas(), 0, 0, mm.width, mm.height);
    for (const p of S.players.values()) { c.fillStyle = p.id === S.me.id ? '#fff' : '#ffd24a'; c.beginPath(); c.arc(p.x * sx, p.y * sy, p.id === S.me.id ? 3.5 : 2.5, 0, 7); c.fill(); if (p.id === S.me.id) { c.strokeStyle = '#f26b5b'; c.lineWidth = 1.5; c.stroke(); } }
    c.font = '9px Nunito'; c.fillStyle = '#fff'; c.textAlign = 'center';
    for (const t of [['🏠', 5, 27], ['🛒', 5, 13], ['🎰', 46, 25], ['🐎', 58, 24], ['⛲', 31, 16]]) c.fillText(t[0], t[1] * sx, t[2] * sy);
  } else { c.fillStyle = '#1f2a44'; c.fillRect(0, 0, mm.width, mm.height); c.fillStyle = '#fff'; c.font = '700 12px Nunito'; c.textAlign = 'center'; c.fillText(S.home ? S.home.name : S.world.interiors[S.loc].name, mm.width / 2, mm.height / 2 - 4); c.font = '11px Nunito'; c.fillStyle = '#ffd98e'; c.fillText(`${S.players.size} here`, mm.width / 2, mm.height / 2 + 14); }
}
