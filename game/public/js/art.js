// All rendering helpers (Canvas 2D). Original "gumdrop diorama" look: rounded shapes, warm palette, emoji props.
import { TILE as TT, W as MW, H as MH, BUILDINGS, buildOutdoor } from '/shared/map.js';
import { characterSprite, drawSprite } from './sprites.js';
import { HH } from './iso.js';
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
  }
  return outCanvas = cv;
}

// ---------- characters ----------
// Legacy entry point used by the creator / profile / try-on previews: draws the isometric character sprite with its feet at (x,y).
export function drawChar(c, look, x, y, o = {}) {
  const frame = o.walk ? Math.floor(o.walk / 1.6) & 3 : 0; const s = characterSprite(look || {}, o.dir || 0, frame, !!o.sit);
  c.save(); c.translate(x, y); c.scale(0.62, 0.62); c.fillStyle = 'rgba(0,0,0,.22)'; c.beginPath(); c.ellipse(0, 0, 18, 8, 0, 0, 7); c.fill(); drawSprite(c, s, 0, -HH); c.restore();
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
