// 2D helpers: top-down minimap art, name tags, chat bubbles and the avatar-preview entry point (drawChar).
import { TILE as TT, W as MW, H as MH, BUILDINGS, buildOutdoor } from '/shared/map.js';
import { characterSprite, drawSprite } from './sprites.js';
import { HH } from './iso.js';
export const T = 32;
const rr = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
const shade = (hex, f) => { const n = parseInt(hex.slice(1), 16); const r = Math.max(0, Math.min(255, ((n >> 16) & 255) * f)), g = Math.max(0, Math.min(255, ((n >> 8) & 255) * f)), b = Math.max(0, Math.min(255, (n & 255) * f)); return `rgb(${r | 0},${g | 0},${b | 0})`; };
export { shade };

// ---------- outdoor map prerender ----------
let outCanvas = null; export const OUT = buildOutdoor();
export function outdoorCanvas() {          // top-down map used by the minimap and the phone map
  if (outCanvas) return outCanvas; const cv = document.createElement('canvas'); cv.width = MW * T; cv.height = MH * T; const c = cv.getContext('2d');
  const h = (x, y) => { let v = Math.imul(x, 374761393) + Math.imul(y, 668265263); v = Math.imul(v ^ (v >>> 13), 1274126177); return ((v ^ (v >>> 16)) >>> 0) / 4294967296; };
  const COL = { [TT.ROAD]: '#5f6370', [TT.PAVE]: '#ddd2bd', [TT.SAND]: '#efd8a0', [TT.WATER]: '#3aa6d8', [TT.POND]: '#5cbbe6', [TT.BUILDING]: '#c9bfae', [TT.PIER]: '#b6855a', [TT.FOUNTAIN]: '#ddd2bd', [TT.DOOR]: '#ddd2bd', [TT.PATH]: '#cdb892' };
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) { const t = OUT[y * MW + x]; c.fillStyle = COL[t] || '#7cc35a'; c.fillRect(x * T, y * T, T, T); c.fillStyle = `rgba(${h(x, y) < 0.5 ? '0,0,0' : '255,255,255'},${0.03 + h(y, x) * 0.05})`; c.fillRect(x * T, y * T, T, T); }
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) { const t = OUT[y * MW + x]; if (t === TT.TREE) { c.fillStyle = '#0003'; c.beginPath(); c.arc(x * T + 18, y * T + 19, 12, 0, 7); c.fill(); c.fillStyle = h(x, y) < 0.4 ? '#2f8f4e' : '#3fa35a'; c.beginPath(); c.arc(x * T + 16, y * T + 16, 12, 0, 7); c.fill(); c.fillStyle = '#ffffff22'; c.beginPath(); c.arc(x * T + 12, y * T + 12, 5, 0, 7); c.fill(); } if (t === TT.FLOWER) { for (let i = 0; i < 5; i++) { c.fillStyle = ['#ff7aa8', '#ffd24a', '#fff', '#b06cff', '#ff8a4a'][i]; c.beginPath(); c.arc(x * T + 6 + h(x, i) * 20, y * T + 6 + h(i, y) * 20, 3.5, 0, 7); c.fill(); } } }
  c.fillStyle = '#9fd9f2'; c.beginPath(); c.arc(31 * T, 16 * T, 26, 0, 7); c.fill(); c.strokeStyle = '#b5bcc2'; c.lineWidth = 6; c.stroke();
  for (const b of BUILDINGS) { const x = b.x * T, y = b.y * T, w = b.w * T, hh = b.h * T; c.fillStyle = '#0004'; rr(c, x + 6, y + 8, w, hh, 6); c.fill(); c.fillStyle = b.id === 'casino' ? '#3a3f78' : b.roof; rr(c, x, y, w, hh, 6); c.fill(); c.strokeStyle = '#0003'; c.lineWidth = 3; c.stroke(); if (/^[hc]\d$/.test(b.id)) { c.strokeStyle = '#ffffff40'; c.beginPath(); c.moveTo(x + 6, y + hh / 2); c.lineTo(x + w - 6, y + hh / 2); c.stroke(); } if (b.id === 'casino') { c.fillStyle = '#e2b23c'; c.beginPath(); c.arc(x + w / 2, y + hh / 2, 26, 0, 7); c.fill(); } const [dx, dy] = b.door; c.fillStyle = '#fff'; c.beginPath(); c.arc(dx * T + T / 2, dy * T + T - 4, 6, 0, 7); c.fill(); }
  return outCanvas = cv;
}

// ---------- characters ----------
// Legacy entry point used by the creator / profile / try-on previews: draws the isometric character sprite with its feet at (x,y).
export function drawChar(c, look, x, y, o = {}) {
  const frame = o.walk ? Math.floor(o.walk / 1.6) & 3 : 0; const px = Math.abs(c.getTransform().a) * 0.62 * (devicePixelRatio || 1); const s = characterSprite(look || {}, o.dir || 0, frame, !!o.sit, Math.max(2, Math.min(6, Math.ceil(px))));
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
