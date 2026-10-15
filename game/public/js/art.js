// All rendering helpers (Canvas 2D). Original "gumdrop diorama" look: rounded shapes, warm palette, emoji props.
import { TILE as TT, W as MW, H as MH, BUILDINGS, buildOutdoor } from '/shared/map.js';
import { SKIN_COLORS, HAIR_COLORS, CLOTH_COLORS, DEFS, FLOOR_COLORS, WALL_COLORS } from '/shared/content.js';
export const T = 32;
const rr = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
const shade = (hex, f) => { const n = parseInt(hex.slice(1), 16); const r = Math.max(0, Math.min(255, ((n >> 16) & 255) * f)), g = Math.max(0, Math.min(255, ((n >> 8) & 255) * f)), b = Math.max(0, Math.min(255, (n & 255) * f)); return `rgb(${r | 0},${g | 0},${b | 0})`; };
export { shade };

// ---------- outdoor map prerender ----------
let outCanvas = null; export const OUT = buildOutdoor();
export function outdoorCanvas() {
  if (outCanvas) return outCanvas; const cv = document.createElement('canvas'); cv.width = MW * T; cv.height = MH * T; const c = cv.getContext('2d');
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const t = OUT[y * MW + x]; let col = '#7ec85a';
    if (t === TT.ROAD) col = '#6b6f7a'; else if (t === TT.PAVE) col = (x + y) % 2 ? '#e4d9c3' : '#d8cdb9'; else if (t === TT.SAND) col = (x * 7 + y * 3) % 5 ? '#f0d9a0' : '#e8cf92'; else if (t === TT.WATER) col = '#3aa6d8';
    else if (t === TT.POND) col = '#58b9e8'; else if (t === TT.BUILDING) col = '#8c8278'; else if (t === TT.PIER) col = '#a8794a'; else if (t === TT.FOUNTAIN) col = '#e4d9c3'; else if (t === TT.GRASS || t === TT.TREE || t === TT.FLOWER || t === TT.DOOR) col = (x + y) % 2 ? '#7ec85a' : '#76c152';
    c.fillStyle = col; c.fillRect(x * T, y * T, T, T);
    if (t === TT.ROAD && (x % 3 === 0) && (OUT[(y + 1) * MW + x] !== TT.ROAD || OUT[(y - 1) * MW + x] !== TT.ROAD)) { c.fillStyle = '#f3e9a8'; c.fillRect(x * T + 4, y * T + T - 3, T - 8, 3); }
    if (t === TT.PIER) { c.strokeStyle = '#7d5530'; c.beginPath(); c.moveTo(x * T, y * T + T / 2); c.lineTo(x * T + T, y * T + T / 2); c.stroke(); }
    if (t === TT.TREE) { c.fillStyle = '#0003'; c.beginPath(); c.ellipse(x * T + 16, y * T + 26, 12, 5, 0, 0, 7); c.fill(); c.fillStyle = '#7a4b25'; c.fillRect(x * T + 13, y * T + 14, 6, 14); c.fillStyle = '#2f9e4f'; c.beginPath(); c.arc(x * T + 16, y * T + 11, 13, 0, 7); c.fill(); c.fillStyle = '#3fb560'; c.beginPath(); c.arc(x * T + 12, y * T + 8, 7, 0, 7); c.fill(); }
    if (t === TT.FLOWER) { for (let i = 0; i < 4; i++) { c.fillStyle = ['#ff7aa8', '#ffd24a', '#fff', '#b06cff'][i]; c.beginPath(); c.arc(x * T + 6 + (i % 2) * 14, y * T + 7 + (i >> 1) * 14, 4, 0, 7); c.fill(); } }
  }
  c.fillStyle = '#9fd9f2'; c.beginPath(); c.arc(31 * T, 16 * T, 30, 0, 7); c.fill(); c.strokeStyle = '#8c8278'; c.lineWidth = 4; c.stroke(); c.fillStyle = '#ffffffaa'; c.beginPath(); c.arc(31 * T, 16 * T, 10, 0, 7); c.fill();
  for (const b of BUILDINGS) {
    const x = b.x * T, y = b.y * T, w = b.w * T, h = b.h * T;
    c.fillStyle = '#0003'; rr(c, x + 4, y + 6, w, h, 8); c.fill();
    c.fillStyle = b.color; rr(c, x, y, w, h, 8); c.fill();
    c.fillStyle = b.roof; rr(c, x - 3, y - 3, w + 6, Math.min(h * 0.42, 54), 8); c.fill();
    c.fillStyle = '#fff3'; for (let i = 0; i < w / T - 1; i += 1) c.fillRect(x + 6 + i * T, y + Math.min(h * 0.42, 54) + 10, 20, 16);
    c.fillStyle = '#fff'; c.font = '800 13px Nunito,system-ui'; c.textAlign = 'center'; c.fillText(b.name, x + w / 2, y + 17, w - 8);
    const [dx, dy] = b.door; c.fillStyle = '#5a3a1c'; rr(c, dx * T + 3, dy * T + 2, T - 6, T - 2, 5); c.fill(); c.fillStyle = '#ffd24a'; c.beginPath(); c.arc(dx * T + T - 9, dy * T + T / 2 + 2, 2.2, 0, 7); c.fill();
    if (b.id === 'casino') { c.font = '28px serif'; c.fillText('🎰', x + w / 2, y + h - 12); }
    if (b.id === 'track') { c.font = '26px serif'; c.fillText('🐎', x + w / 2, y + h - 10); }
  }
  return outCanvas = cv;
}

// ---------- characters ----------
export function drawChar(c, look, x, y, o = {}) {
  look = look || {}; const body = [0.88, 1, 1.14][look.body ?? 1] || 1, hs = 1 + (look.height || 0) * 0.012, ph = o.walk || 0, dir = o.dir || 0; const sit = o.sit;
  const skin = SKIN_COLORS[look.skin ?? 2] || SKIN_COLORS[2], hair = HAIR_COLORS[look.hairColor ?? 1] || HAIR_COLORS[1];
  const topC = CLOTH_COLORS[look.topColor ?? 0], botC = CLOTH_COLORS[look.bottomColor ?? 6], shoeC = CLOTH_COLORS[look.shoeColor ?? 7];
  c.save(); c.translate(x, y); c.scale(hs, hs); if (sit) c.translate(0, 5);
  c.fillStyle = '#0003'; c.beginPath(); c.ellipse(0, 0, 11 * body, 4.5, 0, 0, 7); c.fill();
  const bob = sit ? 0 : Math.sin(ph) * 1.2; const leg = sit ? 0 : Math.sin(ph) * 3.5;
  if (look.back && DEFS[look.back]) { c.font = '20px serif'; c.textAlign = 'center'; c.fillText(DEFS[look.back].emoji, 0, -22 + bob); }
  const full = look.full && DEFS[look.full];
  if (!sit) { c.fillStyle = full ? skin : botC; c.fillRect(-6 * body, -13, 5 * body, 11 + leg * 0.4); c.fillRect(1 * body, -13, 5 * body, 11 - leg * 0.4); c.fillStyle = look.shoes && DEFS[look.shoes] && !DEFS[look.shoes].free ? '#8b5a2b' : shoeC; c.fillRect(-7 * body, -2 + leg * 0.4, 7 * body, 3); c.fillRect(0, -2 - leg * 0.4, 7 * body, 3); }
  else { c.fillStyle = botC; c.fillRect(-6 * body, -9, 12 * body, 6); c.fillStyle = shoeC; c.fillRect(-7 * body, -4, 5, 4); c.fillRect(3 * body, -4, 5, 4); }
  c.fillStyle = topC; if (full) { c.beginPath(); c.moveTo(-7 * body, -27 + bob); c.lineTo(7 * body, -27 + bob); c.lineTo(10 * body, -8); c.lineTo(-10 * body, -8); c.closePath(); c.fill(); } else { rr(c, -8 * body, -28 + bob, 16 * body, 17, 5); c.fill(); }
  if (look.top === 'top_hoodie') { c.fillStyle = shade(topC, 0.8); c.fillRect(-4 * body, -28 + bob, 8 * body, 4); }
  if (look.top === 'top_suit') { c.fillStyle = '#fff'; c.fillRect(-2, -26 + bob, 4, 12); }
  c.fillStyle = skin; c.beginPath(); c.arc(-9.5 * body, -19 + bob + (sit ? 0 : -leg * 0.3), 3, 0, 7); c.arc(9.5 * body, -19 + bob + (sit ? 0 : leg * 0.3), 3, 0, 7); c.fill();
  const hy = -37 + bob; c.fillStyle = skin; c.beginPath(); c.arc(0, hy, 10, 0, 7); c.fill();
  const st = look.hairStyle ?? 1; c.fillStyle = hair;
  const cap = (r = 10.6) => { c.beginPath(); c.arc(0, hy - 0.5, r, Math.PI, 0); c.closePath(); c.fill(); };
  if (st === 0) { c.beginPath(); c.arc(0, hy - 1, 10.4, Math.PI * 1.05, Math.PI * 1.95); c.lineTo(0, hy - 3); c.fill(); }
  else if (st === 1) { cap(); c.fillRect(-10.6, hy - 1, 3, 4); c.fillRect(7.6, hy - 1, 3, 4); }
  else if (st === 2) { cap(); c.fillRect(-11, hy - 1, 4, 11); c.fillRect(7, hy - 1, 4, 11); }
  else if (st === 3) { cap(); c.fillRect(-11, hy - 1, 4, 22); c.fillRect(7, hy - 1, 4, 22); c.fillRect(-9, hy + 5, 18, 5); }
  else if (st === 4) { for (let i = -2; i <= 2; i++) { c.beginPath(); c.arc(i * 4.5, hy - 8 + Math.abs(i), 5.5, 0, 7); c.fill(); } c.beginPath(); c.arc(-9, hy, 4, 0, 7); c.arc(9, hy, 4, 0, 7); c.fill(); }
  else if (st === 5) { cap(9.5); for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * 3 - 2, hy - 8); c.lineTo(i * 3, hy - 17 + Math.abs(i)); c.lineTo(i * 3 + 2, hy - 8); c.fill(); } }
  else if (st === 6) { cap(); c.beginPath(); c.arc(0, hy + 2, 3, 0, 7); c.arc(0, hy + 12, 4.5, 0, 7); c.fill(); }
  else if (st === 7) { cap(); c.beginPath(); c.arc(0, hy - 13, 5, 0, 7); c.fill(); }
  else if (st === 8) { c.fillRect(-3, hy - 17, 6, 12); c.fillRect(-10, hy - 2, 20, 3); }
  if (dir !== 3 && dir !== 2) {
    const ex = dir === 1 ? 3 : 0; c.fillStyle = '#222'; c.beginPath(); c.arc(-3.6 + ex, hy + 1, 1.5, 0, 7); c.arc(3.6 + ex, hy + 1, 1.5, 0, 7); c.fill();
    c.strokeStyle = '#a0522d'; c.lineWidth = 1.2; c.beginPath(); c.arc(ex, hy + 4, 3, 0.15, Math.PI - 0.15); c.stroke();
  }
  if (look.glasses && DEFS[look.glasses]) { c.font = '14px serif'; c.textAlign = 'center'; c.fillText(DEFS[look.glasses].emoji, 0, hy + 5); }
  if (look.hat && DEFS[look.hat]) { c.font = '22px serif'; c.textAlign = 'center'; c.fillText(DEFS[look.hat].emoji, 0, hy - 6); }
  if (look.acc && DEFS[look.acc]) { c.font = '12px serif'; c.textAlign = 'center'; c.fillText(DEFS[look.acc].emoji, 0, -22 + bob); }
  c.restore();
}
export function nameTag(c, name, x, y, { title, color = '#fff', you } = {}) {
  c.save(); c.font = '800 12px Nunito,system-ui'; c.textAlign = 'center'; const w = c.measureText(name).width + 12; c.fillStyle = you ? '#2bb3a3dd' : '#1f2a44cc'; rr(c, x - w / 2, y - 12, w, 17, 8); c.fill(); c.fillStyle = color; c.fillText(name, x, y + 1);
  if (title) { c.font = '700 10px Nunito,system-ui'; c.fillStyle = '#ffd98e'; c.fillText(title, x, y - 16); } c.restore();
}
export function bubble(c, text, x, y, color = '#fff') {
  c.save(); c.font = '700 12px Nunito,system-ui'; c.textAlign = 'center'; const words = text.split(' '); const lines = []; let cur = ''; for (const w of words) { if ((cur + ' ' + w).length > 26) { lines.push(cur); cur = w; } else cur = (cur ? cur + ' ' : '') + w; } lines.push(cur);
  const wd = Math.max(...lines.map(l => c.measureText(l).width)) + 14, ht = lines.length * 15 + 8; const by = y - ht - 8;
  c.fillStyle = color; c.shadowColor = '#0004'; c.shadowBlur = 6; rr(c, x - wd / 2, by, wd, ht, 9); c.fill(); c.beginPath(); c.moveTo(x - 5, by + ht); c.lineTo(x, by + ht + 7); c.lineTo(x + 5, by + ht); c.fill(); c.shadowBlur = 0;
  c.fillStyle = '#222'; lines.forEach((l, i) => c.fillText(l, x, by + 17 + i * 15)); c.restore();
}

// ---------- furniture / rooms ----------
export function drawFurniture(c, d, x, y, rot, { state = 0, ghost = 0, tint, time = 0, locked = false, sel = false } = {}) {
  const def = DEFS[d]; if (!def) return; const w = ((rot & 1) ? def.h : def.w) * T, h = ((rot & 1) ? def.w : def.h) * T; const col = def.color || '#aaa';
  c.save(); c.globalAlpha = ghost ? 0.65 : 1;
  if (def.layer === 'rug') { c.fillStyle = col; rr(c, x + 2, y + 2, w - 4, h - 4, 9); c.fill(); c.strokeStyle = shade(col, 1.35); c.lineWidth = 3; rr(c, x + 7, y + 7, w - 14, h - 14, 6); c.stroke(); }
  else if (def.layer === 'wall') { c.fillStyle = shade(col, 0.85); rr(c, x + 3, y + 3, w - 6, h - 4, 4); c.fill(); c.fillStyle = col; rr(c, x + 5, y + 5, w - 10, h - 9, 3); c.fill(); }
  else { c.fillStyle = '#0003'; rr(c, x + 3, y + 5, w - 2, h - 2, 8); c.fill(); c.fillStyle = shade(col, 0.78); rr(c, x + 1, y + 3, w - 2, h - 3, 8); c.fill(); c.fillStyle = col; rr(c, x + 1, y + 1, w - 2, h - 6, 8); c.fill(); }
  if (state && def.light) { const rad = 40 + def.light * 22; const g = c.createRadialGradient(x + w / 2, y + h / 2, 2, x + w / 2, y + h / 2, rad); g.addColorStop(0, '#ffe08acc'); g.addColorStop(1, '#ffe08a00'); c.fillStyle = g; c.globalCompositeOperation = 'lighter'; c.beginPath(); c.arc(x + w / 2, y + h / 2, rad, 0, 7); c.fill(); c.globalCompositeOperation = 'source-over'; }
  if (state && d === 'tv') { c.fillStyle = `hsl(${(time / 8) % 360},70%,60%)`; rr(c, x + 6, y + 4, w - 12, h - 14, 4); c.fill(); }
  const sz = Math.min(w, h) * (def.layer === 'rug' ? 0.55 : 0.68); c.font = `${Math.max(14, sz)}px serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(def.emoji, x + w / 2, y + h / 2 - (def.layer === 'floor' ? 2 : 0)); c.textBaseline = 'alphabetic';
  if (tint) { c.fillStyle = tint; rr(c, x, y, w, h, 8); c.fill(); }
  if (locked) { c.strokeStyle = '#f26b5b'; c.setLineDash([5, 4]); c.lineWidth = 2; rr(c, x, y, w, h, 8); c.stroke(); c.setLineDash([]); }
  if (sel) { c.strokeStyle = '#fff'; c.lineWidth = 4; rr(c, x - 1, y - 1, w + 2, h + 2, 9); c.stroke(); c.strokeStyle = '#f2a93b'; c.lineWidth = 2; rr(c, x - 1, y - 1, w + 2, h + 2, 9); c.stroke(); }
  c.restore();
}
export function drawHome(c, home) {
  const wc = WALL_COLORS[home.wallColor || 0];
  c.fillStyle = '#222a3c'; c.fillRect(-300, -300, (home.w + 20) * T, (home.h + 20) * T);
  for (let y = 0; y < home.h; y++) for (let x = 0; x < home.w; x++) {
    const wt = home.walls[x + ',' + y]; const fc = home.floors[x + ',' + y]; const px = x * T, py = y * T;
    if (wt === 1 || wt === 3) {
      c.fillStyle = shade(wc, 0.92); c.fillRect(px, py, T, T); c.fillStyle = wc; c.fillRect(px, py, T, T - 6); c.fillStyle = shade(wc, 0.7); c.fillRect(px, py + T - 6, T, 6);
      if (wt === 3) { c.fillStyle = '#9fd9f2'; rr(c, px + 4, py + 4, T - 8, T - 14, 3); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.moveTo(px + T / 2, py + 4); c.lineTo(px + T / 2, py + T - 10); c.moveTo(px + 4, py + (T - 6) / 2); c.lineTo(px + T - 4, py + (T - 6) / 2); c.stroke(); }
    } else {
      c.fillStyle = fc != null ? FLOOR_COLORS[fc] : FLOOR_COLORS[0]; c.fillRect(px, py, T, T); c.fillStyle = (x + y) % 2 ? '#0000000d' : '#ffffff0d'; c.fillRect(px, py, T, T);
      if (wt === 2) { const entry = y === home.h - 1; c.fillStyle = '#5a3a1c'; rr(c, px + 4, py + 2, T - 8, T - 2, 4); c.fill(); c.fillStyle = '#ffd24a'; c.beginPath(); c.arc(px + T - 9, py + T / 2, 2, 0, 7); c.fill(); if (entry) { c.fillStyle = '#fff'; c.font = '700 9px Nunito'; c.textAlign = 'center'; c.fillText('EXIT', px + T / 2, py + T - 5); } }
    }
  }
}
export const THING_ICON = { shop: '🛒', salon: '💇', props: '🏠', achievements: '🏆', roulette: '🎡', blackjack: '🃏', poker: '♠️', slots: '🎰', cashier: '💰', horses: '🐎', sit: '🪑', fish: '🎣', postcard: '📮', fountain: '⛲', board: '📋' };
export function drawThing(c, t, time) {
  const x = t.x * T, y = t.y * T; c.save(); c.textAlign = 'center'; c.textBaseline = 'middle';
  if (t.w) { const w = t.w * T, h = t.h * T; const col = { roulette: '#118a4d', blackjack: '#1c7d4f', poker: '#17603e' }[t.k] || '#555'; c.fillStyle = '#0004'; rr(c, x - w / 2 + 3, y - h / 2 + 5, w, h, 14); c.fill(); c.fillStyle = '#5a3a1c'; rr(c, x - w / 2, y - h / 2, w, h, 14); c.fill(); c.fillStyle = col; rr(c, x - w / 2 + 5, y - h / 2 + 5, w - 10, h - 10, 11); c.fill(); c.font = `${Math.min(h, 56) * 0.62}px serif`; c.fillText(THING_ICON[t.k] || '?', x, y); }
  else if (t.k === 'slots') { c.fillStyle = '#0004'; rr(c, x - 13, y - 17, 28, 36, 6); c.fill(); c.fillStyle = t.machine === 'clover' ? '#2e8b57' : '#d4a017'; rr(c, x - 15, y - 19, 28, 36, 6); c.fill(); c.font = '22px serif'; c.fillText('🎰', x - 1, y - 2); c.fillStyle = '#fff'; c.font = '700 8px Nunito'; c.fillText(t.machine === 'clover' ? 'CLOVER' : 'BOARDWALK', x - 1, y + 12); }
  else if (t.k === 'postcard') { c.font = `${16 + Math.sin(time / 300) * 2}px serif`; c.fillText('📮', x, y); }
  else if (t.k === 'sit' || t.k === 'fountain' || t.k === 'board') { c.font = '24px serif'; c.fillText(THING_ICON[t.k], x, y); }
  else { c.fillStyle = '#ffffff55'; c.beginPath(); c.arc(x, y, 18 + Math.sin(time / 250) * 2, 0, 7); c.fill(); c.font = '26px serif'; c.fillText(THING_ICON[t.k] || '❔', x, y); }
  c.restore();
}
