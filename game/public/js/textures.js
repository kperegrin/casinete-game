// Stylised tileable textures (Stardew/Habbo-like) painted procedurally, applied to the isometric ground with a pattern transform.
import { HW, HH } from './iso.js';
const cache = new Map();
const R = (seed) => { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) ^ Math.imul(s ^ (s >>> 13), 3266489917)) >>> 0) / 4294967296; };
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const tone = (hex, f, a = 1) => { const [r, g, b] = rgb(hex); const m = (v) => Math.max(0, Math.min(255, Math.round(f >= 1 ? v + (255 - v) * (f - 1) : v * f))); return `rgba(${m(r)},${m(g)},${m(b)},${a})`; };
export const TPX = 64;            // texture pixels per tile
function make(key, tiles, paint) { let cv = cache.get(key); if (cv) return cv; cv = document.createElement('canvas'); cv.width = cv.height = TPX * tiles; const c = cv.getContext('2d'); paint(c, cv.width, R(key.length * 7919 + key.charCodeAt(0) * 131 + (key.charCodeAt(key.length - 1) || 0))); cache.set(key, cv); return cv; }
const wrapDot = (c, W, x, y, r) => { for (const dx of [0, -W, W]) for (const dy of [0, -W, W]) { c.beginPath(); c.arc(x + dx, y + dy, r, 0, 7); c.fill(); } };
const wrapRect = (c, W, x, y, w, h) => { for (const dx of [0, -W]) for (const dy of [0, -W]) c.fillRect(x + dx, y + dy, w, h); };

export const TEX = {
  grass: (base = '#7cc35a') => make('grass' + base, 4, (c, W, r) => {
    c.fillStyle = base; c.fillRect(0, 0, W, W);
    for (let i = 0; i < 380; i++) { c.fillStyle = tone(base, r() < 0.5 ? 0.9 : 1.08, 0.55); wrapDot(c, W, r() * W, r() * W, 2 + r() * 5); }
    for (let i = 0; i < 520; i++) { const x = r() * W, y = r() * W, h = 3 + r() * 4; c.strokeStyle = tone(base, r() < 0.6 ? 0.72 : 1.22, 0.9); c.lineWidth = 1.4; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 3, y - h); c.stroke(); }
    for (let i = 0; i < 9; i++) { const x = r() * W, y = r() * W; c.fillStyle = ['#fff', '#ffe066', '#ff9fc4', '#c9a6ff'][i % 4]; for (let k = 0; k < 4; k++) wrapDot(c, W, x + Math.cos(k * 1.57) * 2.2, y + Math.sin(k * 1.57) * 2.2, 1.7); c.fillStyle = '#ffcf33'; wrapDot(c, W, x, y, 1.2); }
  }),
  cobble: (base = '#ddd2bd') => make('cobble' + base, 2, (c, W, r) => { r(); 
    c.fillStyle = tone(base, 0.86); c.fillRect(0, 0, W, W); const n = 6, s = W / n;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const off = (j % 2) * s / 2; const x = i * s + off + 2, y = j * s + 2, w = s - 4, h = s - 4; const f = 0.96 + r() * 0.08; c.fillStyle = tone(base, f); for (const dx of [0, -W]) { c.beginPath(); c.roundRect(x + dx, y, w, h, 5); c.fill(); } c.fillStyle = tone(base, f * 1.1, 0.7); for (const dx of [0, -W]) c.fillRect(x + dx + 3, y + 2, w - 6, 2); c.fillStyle = tone(base, 0.8, 0.35); for (const dx of [0, -W]) c.fillRect(x + dx + 2, y + h - 3, w - 4, 2); }
  }),
  asphalt: (base = '#5f6370') => make('asphalt' + base, 4, (c, W, r) => {
    c.fillStyle = base; c.fillRect(0, 0, W, W); for (let i = 0; i < 2600; i++) { c.fillStyle = tone(base, r() < 0.5 ? 0.82 : 1.18, 0.6); wrapRect(c, W, r() * W, r() * W, 1 + r() * 2, 1 + r() * 2); }
    c.strokeStyle = tone(base, 0.7, 0.6); c.lineWidth = 1; for (let k = 0; k < 3; k++) { let x = r() * W, y = r() * W; c.beginPath(); c.moveTo(x, y); for (let i = 0; i < 6; i++) { x += (r() - 0.5) * 18; y += r() * 10; c.lineTo(x, y); } c.stroke(); }
  }),
  sand: (base = '#efd8a0') => make('sand' + base, 4, (c, W, r) => {
    c.fillStyle = base; c.fillRect(0, 0, W, W); for (let i = 0; i < 1800; i++) { c.fillStyle = tone(base, r() < 0.5 ? 0.88 : 1.12, 0.7); wrapRect(c, W, r() * W, r() * W, 1.5, 1.5); }
    c.strokeStyle = tone(base, 0.9, 0.7); c.lineWidth = 1.5; for (let k = 0; k < 10; k++) { const y = r() * W, x = r() * W; c.beginPath(); for (let i = 0; i <= 30; i++) c.lineTo(x + i * 2, y + Math.sin(i / 3) * 2); c.stroke(); }
    for (let i = 0; i < 6; i++) { c.fillStyle = ['#fff6ea', '#f4b8a8', '#d9c4a0'][i % 3]; wrapDot(c, W, r() * W, r() * W, 2); }
  }),
  water: (base = '#3aa6d8') => make('water' + base, 4, (c, W, r) => {
    c.fillStyle = base; c.fillRect(0, 0, W, W); for (let i = 0; i < 70; i++) { c.fillStyle = tone(base, r() < 0.5 ? 0.92 : 1.1, 0.6); wrapDot(c, W, r() * W, r() * W, 6 + r() * 14); }
    c.strokeStyle = tone(base, 1.35, 0.55); c.lineWidth = 2; c.lineCap = 'round'; for (let k = 0; k < 22; k++) { const x = r() * W, y = r() * W, l = 8 + r() * 14; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + l / 2, y - 3, x + l, y); c.stroke(); }
  }),
  planks: (base = '#c9a27a', dir = 0) => make('planks' + base + dir, 4, (c, W, r) => {
    const n = 16, s = W / n; for (let i = 0; i < n; i++) { let y = 0; while (y < W) { const L = W * (0.3 + r() * 0.5); const f = 0.9 + r() * 0.18; c.fillStyle = tone(base, f); c.fillRect(i * s, y, s, L); c.strokeStyle = tone(base, f * 0.88, 0.5); c.lineWidth = 1; for (let k = 0; k < 2; k++) { const gx = i * s + 3 + r() * (s - 6); c.beginPath(); c.moveTo(gx, y + 2); c.bezierCurveTo(gx + 2, y + L * 0.3, gx - 2, y + L * 0.6, gx + 1, y + L - 2); c.stroke(); } c.fillStyle = tone(base, 0.62, 0.8); c.fillRect(i * s, y, s, 1.5); y += L; } c.fillStyle = tone(base, 0.6, 0.85); c.fillRect(i * s, 0, 1.5, W); c.fillStyle = tone(base, 1.12, 0.4); c.fillRect(i * s + 1.5, 0, 1, W); }
  }),
  tiles: (base = '#cfd8dc') => make('tiles' + base, 2, (c, W, r) => { const n = 4, s = W / n; c.fillStyle = tone(base, 0.72); c.fillRect(0, 0, W, W); for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const f = ((i + j) % 2 ? 0.94 : 1.04) + r() * 0.04; c.fillStyle = tone(base, f); c.fillRect(i * s + 1.5, j * s + 1.5, s - 3, s - 3); c.fillStyle = tone(base, f * 1.12, 0.6); c.fillRect(i * s + 3, j * s + 3, s - 8, 3); } }),
  marble: (base = '#f4efe6') => make('marble' + base, 2, (c, W, r) => { const n = 2, s = W / n; c.fillStyle = base; c.fillRect(0, 0, W, W); c.strokeStyle = tone(base, 0.82, 0.5); c.lineWidth = 1.2; for (let k = 0; k < 14; k++) { let x = r() * W, y = r() * W; c.beginPath(); c.moveTo(x, y); for (let i = 0; i < 8; i++) { x += (r() - 0.3) * 14; y += (r() - 0.5) * 10; c.lineTo(x, y); } c.stroke(); } c.fillStyle = tone(base, 0.75); for (let i = 0; i <= n; i++) { c.fillRect(i * s - 1, 0, 2, W); c.fillRect(0, i * s - 1, W, 2); } }),
  carpet: (base = '#a5d6a7') => make('carpet' + base, 2, (c, W, r) => { c.fillStyle = base; c.fillRect(0, 0, W, W); for (let i = 0; i < 1600; i++) { c.fillStyle = tone(base, r() < 0.5 ? 0.92 : 1.08, 0.6); wrapRect(c, W, r() * W, r() * W, 1, 1); } const s = W / 4; c.fillStyle = tone(base, 1.18, 0.55); for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const x = i * s + s / 2, y = j * s + s / 2; c.beginPath(); c.moveTo(x, y - 5); c.lineTo(x + 5, y); c.lineTo(x, y + 5); c.lineTo(x - 5, y); c.fill(); } }),
  casinoCarpet: () => make('casinoCarpet', 2, (c, W, r) => { c.fillStyle = '#6c1f3e'; c.fillRect(0, 0, W, W); const s = W / 4; for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const x = i * s + s / 2, y = j * s + s / 2; c.strokeStyle = 'rgba(226,178,60,.75)'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y - s * 0.38); c.lineTo(x + s * 0.38, y); c.lineTo(x, y + s * 0.38); c.lineTo(x - s * 0.38, y); c.closePath(); c.stroke(); c.fillStyle = (i + j) % 2 ? '#e2b23c' : '#2a8fbd'; c.beginPath(); c.arc(x, y, 3, 0, 7); c.fill(); } for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(0,0,0,${0.06 + r() * 0.06})`; wrapRect(c, W, r() * W, r() * W, 1, 1); } }),
  stone: (base = '#6d6d78') => make('stone' + base, 2, (c, W, r) => { c.fillStyle = tone(base, 0.7); c.fillRect(0, 0, W, W); const rows = 4, s = W / rows; for (let j = 0; j < rows; j++) { let x = -(j % 2) * s * 0.5; while (x < W) { const w = s * (0.8 + r() * 0.6); const f = 0.9 + r() * 0.2; c.fillStyle = tone(base, f); for (const dx of [0, W, -W]) { c.beginPath(); c.roundRect(x + dx + 1.5, j * s + 1.5, w - 3, s - 3, 3); c.fill(); } x += w; } } }),
  dirt: (base = '#cdb892') => make('dirt' + base, 4, (c, W, r) => { c.fillStyle = base; c.fillRect(0, 0, W, W); for (let i = 0; i < 900; i++) { c.fillStyle = tone(base, r() < 0.5 ? 0.85 : 1.1, 0.7); wrapDot(c, W, r() * W, r() * W, 1 + r() * 2); } for (let i = 0; i < 40; i++) { c.fillStyle = tone('#9aa3a8', 0.9 + r() * 0.3); wrapDot(c, W, r() * W, r() * W, 2 + r() * 2.5); } }),
};
// floor colour index -> material (keeps the existing colour palette, adds texture)
export function floorTexture(color, idx) {
  if (idx === 0 || idx === 1 || idx === 2) return TEX.planks(color);
  if (idx === 4 || idx === 6 || idx === 10) return TEX.carpet(color);
  if (idx === 8 || idx === 9) return TEX.stone(color);
  if (idx === 11) return TEX.marble(color);
  return TEX.tiles(color);
}
// pattern mapped onto the isometric ground plane (texture square -> tile diamond), world aligned
const pats = new WeakMap();
export function isoPattern(c, cv) { let m = pats.get(cv); if (!m) pats.set(cv, m = new Map()); let p = m.get(c); if (!p) { p = c.createPattern(cv, 'repeat'); p.setTransform(new DOMMatrix([HW / TPX, HH / TPX, -HW / TPX, HH / TPX, 0, 0])); m.set(c, p); } return p; }
export { tone };
