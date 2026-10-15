// Isometric scenery: baked terrain for the outdoor map, wall/door sprites for homes and interiors, diamond helpers.
import { P, HW, HH, shade, renderModel, box } from './iso.js';
import { TILE as TT, W as MW, H as MH } from '/shared/map.js';
import { OUT } from './art.js';

export const TOX = MH * HW + HW * 2, TOY = 60;          // terrain canvas origin (screen px of tile (0,0)'s top vertex)
export const hash = (x, y, s = 0) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2147483647)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export function diamond(c, x, y, w = 1, d = 1, z = 0) { const a = P(x, y, z), b = P(x + w, y, z), e = P(x + w, y + d, z), f = P(x, y + d, z); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(e[0], e[1]); c.lineTo(f[0], f[1]); c.closePath(); }
const quad = (c, pts, fill, stroke) => { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke === true ? fill : stroke; c.lineWidth = 1; c.stroke(); } };

// ---------- outdoor terrain ----------
const tileAt = (x, y) => (x < 0 || y < 0 || x >= MW || y >= MH) ? -1 : OUT[y * MW + x];
let terrain = null; export const waterTiles = [];
export function terrainCanvas() {
  if (terrain) return terrain;
  const cv = document.createElement('canvas'); cv.width = (MW + MH) * HW + HW * 4; cv.height = (MW + MH) * HH + TOY + 40; const c = cv.getContext('2d'); c.translate(TOX, TOY); c.lineJoin = 'round';
  const side = (x, y, z, depth, col, l, r) => {
    if (l) quad(c, [P(x, y + 1, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z - depth), P(x, y + 1, z - depth)], shade(col, 0.86), true);
    if (r) quad(c, [P(x + 1, y, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z - depth), P(x + 1, y, z - depth)], shade(col, 0.64), true);
  };
  const top = (x, y, z, col) => { diamond(c, x, y, 1, 1, z); c.fillStyle = col; c.fill(); c.strokeStyle = col; c.lineWidth = 1; c.stroke(); };
  for (let s = 0; s <= MW + MH - 2; s++) for (let x = Math.max(0, s - MH + 1); x <= Math.min(MW - 1, s); x++) {
    const y = s - x; const t = OUT[y * MW + x]; const n = hash(x, y); const nR = tileAt(x + 1, y), nD = tileAt(x, y + 1);
    const wet = (v) => v === -1 || v === TT.WATER; const pond = (v) => v === TT.POND;
    if (t === TT.WATER) { waterTiles.push([x, y]); top(x, y, -10, n > 0.7 ? '#40abdb' : n < 0.25 ? '#379fd0' : '#3aa6d8'); continue; }
    if (t === TT.POND) { top(x, y, -5, n > 0.6 ? '#66c3ee' : '#58b9e8'); continue; }
    let col = '#7ec85a', z = 0;
    if (t === TT.ROAD) col = '#6b6f7a'; else if (t === TT.PAVE) col = (x + y) % 2 ? '#e4d9c3' : '#d8cdb9'; else if (t === TT.SAND) col = n > 0.8 ? '#e8cf92' : '#f0d9a0';
    else if (t === TT.BUILDING) col = '#bdb3a2'; else if (t === TT.PIER) col = (x + y * 3) % 2 ? '#a8794a' : '#b6855a'; else if (t === TT.FOUNTAIN) { col = '#d5dce0'; } else if (t === TT.DOOR) col = '#d8cdb9'; else if (t === TT.PATH) col = '#cdb892';
    else col = n > 0.66 ? '#82cc5e' : n < 0.33 ? '#76c152' : '#7ec85a';
    const land = t === TT.PIER ? '#7d5530' : (t === TT.SAND || t === TT.PAVE || t === TT.ROAD) ? '#c9a66b' : '#9c7a4d';
    top(x, y, z, col);
    side(x, y, z, 10, land, wet(nD), wet(nR)); side(x, y, z, 5, '#8c8278', pond(nD), pond(nR));
    if (t === TT.PAVE || t === TT.FOUNTAIN) { c.strokeStyle = 'rgba(0,0,0,.07)'; c.lineWidth = 1; diamond(c, x, y); c.stroke(); }
    if (t === TT.GRASS && n > 0.72) { c.strokeStyle = '#5ea83c'; c.lineWidth = 1.2; const [X, Y] = P(x + 0.3 + n * 0.3, y + 0.4); for (const dx of [-3, 0, 3]) { c.beginPath(); c.moveTo(X + dx, Y); c.lineTo(X + dx - 1, Y - 4 - (dx ? 0 : 2)); c.stroke(); } }
    if (t === TT.SAND && n > 0.5) { c.fillStyle = 'rgba(160,120,60,.25)'; const [X, Y] = P(x + n, y + 0.5); c.fillRect(X, Y, 2, 1); c.fillRect(X + 9, Y + 4, 2, 1); }
    if (t === TT.PIER) { c.strokeStyle = 'rgba(60,35,15,.35)'; c.lineWidth = 1; for (let k = 1; k < 4; k++) { const a = P(x, y + k / 4), b = P(x + 1, y + k / 4); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); } }
    if (t === TT.ROAD) {                               // lane dashes between the two road rows / columns
      const R = (a, b) => tileAt(a, b) === TT.ROAD; c.fillStyle = '#f3e9a8';
      if (R(x, y - 1) && R(x - 1, y) && R(x + 1, y) && !R(x, y - 2) && x % 2 === 0) quad(c, [P(x + 0.15, y - 0.04), P(x + 0.85, y - 0.04), P(x + 0.85, y + 0.04), P(x + 0.15, y + 0.04)], '#f3e9a8');
      if (R(x - 1, y) && R(x, y - 1) && R(x, y + 1) && !R(x - 2, y) && y % 2 === 0) quad(c, [P(x - 0.04, y + 0.15), P(x + 0.04, y + 0.15), P(x + 0.04, y + 0.85), P(x - 0.04, y + 0.85)], '#f3e9a8');
    }
    if (t === TT.DOOR) quad(c, [P(x + 0.18, y + 0.35), P(x + 0.82, y + 0.35), P(x + 0.82, y + 0.8), P(x + 0.18, y + 0.8)], '#9b4b3a', 'rgba(0,0,0,.2)');
    if (t === TT.FLOWER) for (let i = 0; i < 5; i++) { const [X, Y] = P(x + 0.2 + hash(x, y, i) * 0.6, y + 0.2 + hash(x, y, i + 9) * 0.6); c.fillStyle = '#4a9a3a'; c.fillRect(X, Y - 4, 1, 4); c.fillStyle = ['#ff7aa8', '#ffd24a', '#fff', '#b06cff', '#ff8a4a'][i]; c.beginPath(); c.arc(X + 0.5, Y - 5, 2.4, 0, 7); c.fill(); }
  }
  return terrain = cv;
}

// ---------- walls ----------
export const WALL_TALL = 66, WALL_LOW = 22;
const wallCache = new Map();
export function wallSprite(col, type, H) {
  const key = col + '|' + type + '|' + H; let s = wallCache.get(key); if (s) return s;
  const cv = document.createElement('canvas'); cv.width = 68; cv.height = H + 40; const c = cv.getContext('2d'); c.translate(34, H + 4); c.lineJoin = 'round';
  const L = [P(0, 1, 0), P(1, 1, 0), P(1, 1, H), P(0, 1, H)], R = [P(1, 0, 0), P(1, 1, 0), P(1, 1, H), P(1, 0, H)], T = [P(0, 0, H), P(1, 0, H), P(1, 1, H), P(0, 1, H)];
  quad(c, L, shade(col, 0.88), true); quad(c, R, shade(col, 0.66), true);
  quad(c, [P(0, 1, 0), P(1, 1, 0), P(1, 1, 5), P(0, 1, 5)], shade(col, 0.7), true); quad(c, [P(1, 0, 0), P(1, 1, 0), P(1, 1, 5), P(1, 0, 5)], shade(col, 0.5), true);
  quad(c, T, shade(col, 1.14), true); c.strokeStyle = 'rgba(20,12,30,.28)'; c.lineWidth = 1; c.beginPath(); c.moveTo(...P(0, 1, H)); c.lineTo(...P(1, 1, H)); c.lineTo(...P(1, 0, H)); c.stroke();
  c.beginPath(); c.moveTo(...P(0, 1, 0)); c.lineTo(...P(1, 1, 0)); c.lineTo(...P(1, 0, 0)); c.stroke();
  const faceQ = (face, u0, u1, z0, z1, fill, stroke) => quad(c, face === 'L' ? [P(u0, 1, z0), P(u1, 1, z0), P(u1, 1, z1), P(u0, 1, z1)] : [P(1, u0, z0), P(1, u1, z0), P(1, u1, z1), P(1, u0, z1)], fill, stroke);
  if (type === 3 && H > 40) for (const f of ['L', 'R']) { faceQ(f, 0.14, 0.86, H * 0.38, H * 0.84, f === 'L' ? '#b9e4f5' : '#8ec3d8', '#f8f8f8'); faceQ(f, 0.48, 0.52, H * 0.38, H * 0.84, '#f8f8f8'); faceQ(f, 0.14, 0.86, H * 0.6, H * 0.63, '#f8f8f8'); }
  if (type === 3 && H <= 40) quad(c, [P(0.1, 0.1, H), P(0.9, 0.1, H), P(0.9, 0.9, H), P(0.1, 0.9, H)], 'rgba(170,220,240,.75)', '#fff');
  if (type === 2 && H > 40) for (const f of ['L', 'R']) { faceQ(f, 0.16, 0.84, 0, H * 0.72, f === 'L' ? '#7a4f2c' : '#5a3a1f', '#3a2410'); faceQ(f, 0.26, 0.74, H * 0.3, H * 0.62, f === 'L' ? '#8a5c34' : '#684425'); const [kx, ky] = f === 'L' ? P(0.72, 1, H * 0.34) : P(1, 0.72, H * 0.34); c.fillStyle = '#ffd24a'; c.beginPath(); c.arc(kx, ky, 1.8, 0, 7); c.fill(); }
  s = { img: cv, sx: 0, sy: 0, sw: cv.width, sh: cv.height, ox: -34, oy: -(H + 4), s: 1 }; wallCache.set(key, s); return s;
}
const doorCache = new Map();
export function doorFrameSprite(accent = '#7a5a3a') {
  let s = doorCache.get(accent); if (s) return s;
  s = renderModel([box(0.04, 0.4, 0, 0.1, 0.12, 40, accent), box(0.86, 0.4, 0, 0.1, 0.12, 40, accent), box(0.0, 0.38, 40, 1.0, 0.16, 6, shade(accent, 1.15)), box(0.14, 0.44, 40, 0.72, 0.04, 2, '#ffd24a')], { pad: 4 }); doorCache.set(accent, s); return s;
}
// only the two back walls (x = 0 and y = 0) stand tall; everything else is cut away so the room stays visible from the camera
export function wallTall(isWall, x, y) { return x === 0 || y === 0; }
