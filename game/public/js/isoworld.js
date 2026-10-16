// Isometric scenery: baked terrain for the outdoor map, wall/door sprites for homes and interiors, diamond helpers.
import { P, HW, HH, shade, renderModel, box } from './iso.js';
import { TILE as TT, W as MW, H as MH } from '/shared/map.js';
import { OUT } from './art.js';
import { TEX, isoPattern } from './textures.js';

export const TOX = MH * HW + HW * 2, TOY = 60;          // terrain canvas origin (screen px of tile (0,0)'s top vertex)
export const hash = (x, y, s = 0) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2147483647)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export function diamond(c, x, y, w = 1, d = 1, z = 0) { const a = P(x, y, z), b = P(x + w, y, z), e = P(x + w, y + d, z), f = P(x, y + d, z); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(e[0], e[1]); c.lineTo(f[0], f[1]); c.closePath(); }
const quad = (c, pts, fill, stroke) => { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke === true ? fill : stroke; c.lineWidth = 1; c.stroke(); } };

// ---------- outdoor terrain ----------
const tileAt = (x, y) => (x < 0 || y < 0 || x >= MW || y >= MH) ? -1 : OUT[y * MW + x];
let terrain = null; export const waterTiles = [];
const MATERIAL = (t) => t === TT.ROAD ? 'road' : (t === TT.PAVE || t === TT.FOUNTAIN || t === TT.DOOR || t === TT.BUILDING) ? 'pave' : t === TT.SAND ? 'sand' : t === TT.WATER ? 'water' : t === TT.POND ? 'pond' : t === TT.PIER ? 'pier' : t === TT.PATH ? 'dirt' : t === -1 ? 'void' : 'grass';
export function terrainCanvas() {
  if (terrain) return terrain;
  const cv = document.createElement('canvas'); cv.width = (MW + MH) * HW + HW * 4; cv.height = (MW + MH) * HH + TOY + 40; const c = cv.getContext('2d'); c.translate(TOX, TOY); c.lineJoin = 'round';
  const tex = { grass: TEX.grass(), road: TEX.asphalt(), pave: TEX.cobble(), sand: TEX.sand(), water: TEX.water(), pond: TEX.water('#5cbbe6'), pier: TEX.planks('#b6855a'), dirt: TEX.dirt(), bld: TEX.cobble('#c9bfae') };
  const side = (x, y, z, depth, col, l, r) => {
    if (l) { quad(c, [P(x, y + 1, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z - depth), P(x, y + 1, z - depth)], shade(col, 0.86), true); quad(c, [P(x, y + 1, z - depth * 0.45), P(x + 1, y + 1, z - depth * 0.45), P(x + 1, y + 1, z - depth * 0.55), P(x, y + 1, z - depth * 0.55)], shade(col, 0.74)); }
    if (r) { quad(c, [P(x + 1, y, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z - depth), P(x + 1, y, z - depth)], shade(col, 0.64), true); quad(c, [P(x + 1, y, z - depth * 0.45), P(x + 1, y + 1, z - depth * 0.45), P(x + 1, y + 1, z - depth * 0.55), P(x + 1, y, z - depth * 0.55)], shade(col, 0.55)); }
  };
  const top = (x, y, z, pat) => { c.save(); c.translate(0, -z); diamond(c, x, y); c.fillStyle = isoPattern(c, pat); c.fill(); c.lineWidth = 1; c.strokeStyle = c.fillStyle; c.stroke(); c.restore(); };
  for (let s = 0; s <= MW + MH - 2; s++) for (let x = Math.max(0, s - MH + 1); x <= Math.min(MW - 1, s); x++) {
    const y = s - x; const t = OUT[y * MW + x]; const nR = tileAt(x + 1, y), nD = tileAt(x, y + 1);
    const wet = (v) => v === -1 || v === TT.WATER; const pond = (v) => v === TT.POND;
    if (t === TT.WATER) { waterTiles.push([x, y]); top(x, y, -10, tex.water); continue; }
    if (t === TT.POND) { top(x, y, -5, tex.pond); continue; }
    const m = MATERIAL(t); top(x, y, 0, t === TT.BUILDING ? tex.bld : tex[m]);
    const land = t === TT.PIER ? '#7d5530' : (t === TT.SAND || t === TT.PAVE || t === TT.ROAD) ? '#c9a66b' : '#9c7a4d';
    side(x, y, 0, 10, land, wet(nD), wet(nR)); side(x, y, 0, 5, '#8c8278', pond(nD), pond(nR));
    if (t === TT.ROAD) {                               // lane dashes between the two road rows / columns
      const Rd = (a, b) => tileAt(a, b) === TT.ROAD;
      if (Rd(x, y - 1) && Rd(x - 1, y) && Rd(x + 1, y) && !Rd(x, y - 2) && x % 2 === 0) quad(c, [P(x + 0.15, y - 0.04), P(x + 0.85, y - 0.04), P(x + 0.85, y + 0.04), P(x + 0.15, y + 0.04)], '#f3e9a8');
      if (Rd(x - 1, y) && Rd(x, y - 1) && Rd(x, y + 1) && !Rd(x - 2, y) && y % 2 === 0) quad(c, [P(x - 0.04, y + 0.15), P(x + 0.04, y + 0.15), P(x + 0.04, y + 0.85), P(x - 0.04, y + 0.85)], '#f3e9a8');
    }
    if (t === TT.DOOR) quad(c, [P(x + 0.18, y + 0.35), P(x + 0.82, y + 0.35), P(x + 0.82, y + 0.8), P(x + 0.18, y + 0.8)], '#9b4b3a', 'rgba(0,0,0,.2)');
    if (t === TT.FLOWER) for (let i = 0; i < 9; i++) { const [X, Y] = P(x + 0.15 + hash(x, y, i) * 0.7, y + 0.15 + hash(x, y, i + 9) * 0.7); c.fillStyle = '#3f8a35'; c.fillRect(X, Y - 5, 1.2, 5); c.fillStyle = ['#ff7aa8', '#ffd24a', '#fff', '#b06cff', '#ff8a4a'][i % 5]; c.beginPath(); c.arc(X + 0.6, Y - 6, 2.6, 0, 7); c.fill(); c.fillStyle = '#ffe9a0'; c.beginPath(); c.arc(X + 0.6, Y - 6, 0.9, 0, 7); c.fill(); }
  }
  // borders between materials: kerbs between road and pavement, dark rims on grass, foam on the shore
  const seg = (a, b, col, w) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); };
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const m = MATERIAL(OUT[y * MW + x]); if (m === 'water' || m === 'pond') continue;
    for (const [nx, ny, a, b] of [[x, y - 1, [x, y], [x + 1, y]], [x, y + 1, [x, y + 1], [x + 1, y + 1]], [x - 1, y, [x, y], [x, y + 1]], [x + 1, y, [x + 1, y], [x + 1, y + 1]]]) {
      const n = MATERIAL(tileAt(nx, ny)); if (n === m) continue; const A = P(a[0], a[1]), Bp = P(b[0], b[1]);
      if (m === 'pave' && n === 'road') { seg(A, Bp, '#f2ede2', 3.2); seg([A[0], A[1] + 1.6], [Bp[0], Bp[1] + 1.6], 'rgba(70,60,50,.35)', 1); }
      else if (m === 'grass' && n !== 'water' && n !== 'void') seg(A, Bp, 'rgba(58,110,40,.55)', 2);
      else if ((n === 'water' || n === 'pond') && ny >= y && nx >= x) { const dz = n === 'water' ? 10 : 5; seg([A[0], A[1] + dz + 2], [Bp[0], Bp[1] + dz + 2], 'rgba(255,255,255,.75)', 2.2); }
    }
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
  // wallpaper: soft vertical stripes + small motifs, wainscot panel, chair rail, skirting
  const wain = Math.min(H * 0.38, 24);
  for (const [face, f] of [['L', 0.88], ['R', 0.66]]) {
    const q = (u0, u1, z0, z1) => face === 'L' ? [P(u0, 1, z0), P(u1, 1, z0), P(u1, 1, z1), P(u0, 1, z1)] : [P(1, u0, z0), P(1, u1, z0), P(1, u1, z1), P(1, u0, z1)];
    if (H > 40) { for (let u = 0; u < 1; u += 0.25) quad(c, q(u + 0.03, u + 0.1, wain, H), shade(col, f * 1.06)); for (let u = 0.17; u < 1; u += 0.25) for (let z = wain + 8; z < H - 6; z += 12) { const [X, Y] = face === 'L' ? P(u, 1, z) : P(1, u, z); c.fillStyle = shade(col, f * 0.9); c.beginPath(); c.arc(X, Y, 1.3, 0, 7); c.fill(); } }
    quad(c, q(0, 1, 0, wain), shade(col, f * 0.86)); for (let u = 0.06; u < 1; u += 0.5) quad(c, q(u, u + 0.38, 4, wain - 4), shade(col, f * 0.92));
    quad(c, q(0, 1, wain - 1, wain + 2), shade('#ffffff', f * 0.95)); quad(c, q(0, 1, 0, 4), shade(col, f * 0.6));
    if (H > 40) quad(c, q(0, 1, H - 4, H), shade('#ffffff', f * 0.92));
  }
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
