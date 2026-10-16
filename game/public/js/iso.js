// Isometric 3D-ish renderer (2:1 projection). Models are lists of primitives (boxes, cylinders, spheres, cones, flat decals).
// A model is rendered once into a sprite (canvas) and cached / baked into the tileset.
export const TW = 64, TH = 32, HW = 32, HH = 16;
export const P = (x, y, z = 0) => [(x - y) * HW, (x + y) * HH - z];
export const unproject = (X, Y) => ({ x: (X / HW + Y / HH) / 2, y: (Y / HH - X / HW) / 2 });
const SQ = Math.SQRT2;

// ---------- colour helpers ----------
const hexRgb = (h) => { if (h[0] === 'r') { const m = h.match(/\d+/g).map(Number); return m; } const n = parseInt(h.length === 4 ? '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3] : h, 16); const s = h.length === 4 ? 0 : 1; const v = parseInt(h.slice(1).length === 3 ? h.slice(1).split('').map(c => c + c).join('') : h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
export const shade = (hex, f) => { const [r, g, b] = hexRgb(hex); const m = (v) => Math.max(0, Math.min(255, Math.round(f > 1 ? v + (255 - v) * (f - 1) : v * f))); return `rgb(${m(r)},${m(g)},${m(b)})`; };
const FACE = { top: 1.16, left: 0.86, right: 0.64 };
const EDGE = 'rgba(20,12,30,0.32)';

// ---------- primitive constructors ----------
export const box = (x, y, z, w, d, h, c, f) => ({ t: 'b', x, y, z, w, d, h, c, f });
export const cyl = (x, y, z, r, h, c) => ({ t: 'c', x, y, z, r, h, c });
export const sph = (x, y, z, r, c, sy = 1) => ({ t: 's', x, y, z, r, c, sy });
export const cone = (x, y, z, r, h, c) => ({ t: 'k', x, y, z, r, h, c });
export const flat = (x, y, z, w, d, c, border) => ({ t: 'p', x, y, z, w, d, c, border });
export const vface = (face, at, u0, u1, z0, z1, c, border) => ({ t: 'f', face, at, u0, u1, z0, z1, c, border });
export const glowSpot = (x, y, z, r, c) => ({ t: 'g', x, y, z, r, c });

const poly = (c, pts, fill, stroke = EDGE) => { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); } };

export function drawPrim(c, p) {
  const pt = (x, y, z) => P(x, y, z);
  if (p.t === 'b') {
    const { x, y, z, w, d, h } = p; const f = p.f || {};
    poly(c, [pt(x, y + d, z), pt(x + w, y + d, z), pt(x + w, y + d, z + h), pt(x, y + d, z + h)], f.left || shade(p.c, FACE.left));
    poly(c, [pt(x + w, y, z), pt(x + w, y + d, z), pt(x + w, y + d, z + h), pt(x + w, y, z + h)], f.right || shade(p.c, FACE.right));
    poly(c, [pt(x, y, z + h), pt(x + w, y, z + h), pt(x + w, y + d, z + h), pt(x, y + d, z + h)], f.top || shade(p.c, FACE.top));
  } else if (p.t === 'c') {
    const [X, Y] = pt(p.x, p.y, p.z); const rx = p.r * HW * SQ, ry = p.r * HH * SQ;
    const g = c.createLinearGradient(X - rx, 0, X + rx, 0); g.addColorStop(0, shade(p.c, 1.05)); g.addColorStop(0.55, shade(p.c, 0.82)); g.addColorStop(1, shade(p.c, 0.55));
    c.beginPath(); c.moveTo(X - rx, Y - p.h); c.lineTo(X - rx, Y); c.ellipse(X, Y, rx, ry, 0, Math.PI, 0, true); c.lineTo(X + rx, Y - p.h); c.closePath(); c.fillStyle = g; c.fill(); c.strokeStyle = EDGE; c.lineWidth = 1; c.stroke();
    c.beginPath(); c.ellipse(X, Y - p.h, rx, ry, 0, 0, 7); c.fillStyle = shade(p.c, FACE.top); c.fill(); c.stroke();
  } else if (p.t === 's') {
    const [X, Y] = pt(p.x, p.y, p.z); const r = p.r * HW * SQ; const sy = p.sy || 1;
    const g = c.createRadialGradient(X - r * 0.35, Y - r * 0.4 * sy, r * 0.1, X, Y, r); g.addColorStop(0, shade(p.c, 1.35)); g.addColorStop(0.5, shade(p.c, 1)); g.addColorStop(1, shade(p.c, 0.58));
    c.beginPath(); c.ellipse(X, Y - r * sy, r, r * sy, 0, 0, 7); c.fillStyle = g; c.fill(); c.strokeStyle = EDGE; c.lineWidth = 1; c.stroke();
  } else if (p.t === 'k') {
    const [X, Y] = pt(p.x, p.y, p.z); const rx = p.r * HW * SQ, ry = p.r * HH * SQ;
    const g = c.createLinearGradient(X - rx, 0, X + rx, 0); g.addColorStop(0, shade(p.c, 1.1)); g.addColorStop(1, shade(p.c, 0.55));
    c.beginPath(); c.moveTo(X - rx, Y); c.ellipse(X, Y, rx, ry, 0, Math.PI, 0, true); c.lineTo(X, Y - p.h); c.closePath(); c.fillStyle = g; c.fill(); c.strokeStyle = EDGE; c.stroke();
  } else if (p.t === 'p') {
    const { x, y, z, w, d } = p; poly(c, [pt(x, y, z), pt(x + w, y, z), pt(x + w, y + d, z), pt(x, y + d, z)], p.c, p.border ? p.border : 'rgba(0,0,0,0.12)');
    if (p.border && p.inset) { const i = p.inset; poly(c, [pt(x + i, y + i, z), pt(x + w - i, y + i, z), pt(x + w - i, y + d - i, z), pt(x + i, y + d - i, z)], p.border, null); }
  } else if (p.t === 'f') {
    const { at, u0, u1, z0, z1 } = p; const q = p.face === 'y' ? (u, z) => pt(u, at, z) : (u, z) => pt(at, u, z);
    poly(c, [q(u0, z0), q(u1, z0), q(u1, z1), q(u0, z1)], p.c, p.border || EDGE);
  } else if (p.t === 'g') {
    const [X, Y] = pt(p.x, p.y, p.z); const r = p.r; const g = c.createRadialGradient(X, Y, 1, X, Y, r); g.addColorStop(0, p.c); g.addColorStop(1, 'rgba(255,230,140,0)'); c.fillStyle = g; c.beginPath(); c.arc(X, Y, r, 0, 7); c.fill();
  }
}

// ---------- bounds / depth ----------
export function bboxOf(p) {
  if (p.t === 'b') return { x0: p.x, x1: p.x + p.w, y0: p.y, y1: p.y + p.d, z0: p.z, z1: p.z + p.h };
  if (p.t === 'c' || p.t === 'k') return { x0: p.x - p.r, x1: p.x + p.r, y0: p.y - p.r, y1: p.y + p.r, z0: p.z, z1: p.z + p.h };
  if (p.t === 's') return { x0: p.x - p.r, x1: p.x + p.r, y0: p.y - p.r, y1: p.y + p.r, z0: p.z, z1: p.z + p.r * 2 * HW * SQ / 1 };
  if (p.t === 'p') return { x0: p.x, x1: p.x + p.w, y0: p.y, y1: p.y + p.d, z0: p.z, z1: p.z + 0.5 };
  if (p.t === 'f') return p.face === 'y' ? { x0: p.u0, x1: p.u1, y0: p.at, y1: p.at + 0.01, z0: p.z0, z1: p.z1 } : { x0: p.at, x1: p.at + 0.01, y0: p.u0, y1: p.u1, z0: p.z0, z1: p.z1 };
  return { x0: p.x - 0.01, x1: p.x + 0.01, y0: p.y - 0.01, y1: p.y + 0.01, z0: p.z + 200, z1: p.z + 201 };   // glow always last
}
const E = 0.001;
// Generic painter's sort for axis-aligned boxes (Kahn topological sort with centre-sum tie-break).
export function depthSort(items) {
  const n = items.length; const before = Array.from({ length: n }, () => []); const indeg = new Array(n).fill(0);
  const link = (i, j) => { const ab = relation(items[i].bb, items[j].bb); if (ab === 1) { before[i].push(j); indeg[j]++; } else if (ab === -1) { before[j].push(i); indeg[i]++; } };
  if (n && items[0].sr) {          // sweep-and-prune on screen rectangles: only sprites that can overlap on screen need an order
    const order = items.map((_, i) => i).sort((a, b) => items[a].sr.x0 - items[b].sr.x0);
    for (let oi = 0; oi < n; oi++) { const i = order[oi], si = items[i].sr; for (let oj = oi + 1; oj < n; oj++) { const j = order[oj], sj = items[j].sr; if (sj.x0 >= si.x1) break; if (sj.y0 >= si.y1 || sj.y1 <= si.y0) continue; link(i, j); } }
  } else for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) link(i, j);
  const key = (it) => (it.bb.x0 + it.bb.x1 + it.bb.y0 + it.bb.y1) + (it.bb.z0 + it.bb.z1) / 4000 + (it.prio || 0) * 0.0001;
  const ready = []; for (let i = 0; i < n; i++) if (!indeg[i]) ready.push(i);
  const out = []; const done = new Array(n).fill(false);
  while (out.length < n) {
    if (!ready.length) { let best = -1; for (let i = 0; i < n; i++) if (!done[i] && (best < 0 || key(items[i]) < key(items[best]))) best = i; ready.push(best); indeg[best] = 0; }
    let bi = 0; for (let k = 1; k < ready.length; k++) if (key(items[ready[k]]) < key(items[ready[bi]])) bi = k;
    const i = ready.splice(bi, 1)[0]; if (done[i]) continue; done[i] = true; out.push(items[i]);
    for (const j of before[i]) if (--indeg[j] === 0 && !done[j]) ready.push(j);
  }
  return out;
}
// 1: a must be drawn before b, -1: b before a, 0: unrelated (they cannot overlap on screen in a way that matters)
function relation(a, b) {
  const ox = a.x0 < b.x1 - E && a.x1 > b.x0 + E, oy = a.y0 < b.y1 - E && a.y1 > b.y0 + E;
  if (ox && oy) { if (a.z1 <= b.z0 + E) return 1; if (b.z1 <= a.z0 + E) return -1; return 0; }
  const aBehind = a.x1 <= b.x0 + E || a.y1 <= b.y0 + E, bBehind = b.x1 <= a.x0 + E || b.y1 <= a.y0 + E;
  if (aBehind && !bBehind) return 1; if (bBehind && !aBehind) return -1; return 0;
}

// ---------- model transform + render ----------
export function rotate(prims, W, D, rot) {
  let out = prims, w = W, d = D;
  for (let r = 0; r < (rot & 3); r++) {
    out = out.map(p => {
      const q = { ...p };
      if (p.t === 'b' || p.t === 'p') { q.x = d - p.y - p.d; q.y = p.x; q.w = p.d; q.d = p.w; if (p.f) q.f = { top: p.f.top, left: p.f.right, right: p.f.left }; }
      else if (p.t === 'c' || p.t === 's' || p.t === 'k' || p.t === 'g') { q.x = d - p.y; q.y = p.x; }
      return q;
    });
    [w, d] = [d, w];
  }
  return { prims: out, W: w, D: d };
}
export function renderModel(prims, { scale = 1, pad = 6, minW = 0, extraTop = 0, extraSide = 0, post = null } = {}) {
  // bounds in screen px (scale 1)
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; const ext = (X, Y) => { x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); };
  for (const p of prims) {
    const bb = bboxOf(p);
    if (p.t === 'c' || p.t === 'k') { const [X, Y] = P(p.x, p.y, p.z); const rx = p.r * HW * SQ, ry = p.r * HH * SQ; ext(X - rx, Y + ry); ext(X + rx, Y + ry); ext(X - rx, Y - p.h - ry); ext(X + rx, Y - p.h - ry); }
    else if (p.t === 's') { const [X, Y] = P(p.x, p.y, p.z); const r = p.r * HW * SQ; ext(X - r, Y); ext(X + r, Y - 2 * r * (p.sy || 1)); }
    else if (p.t === 'g') { const [X, Y] = P(p.x, p.y, p.z); ext(X - p.r, Y - p.r); ext(X + p.r, Y + p.r); }
    else for (const [x, y, z] of [[bb.x0, bb.y0, bb.z0], [bb.x1, bb.y0, bb.z0], [bb.x0, bb.y1, bb.z0], [bb.x1, bb.y1, bb.z0], [bb.x0, bb.y0, bb.z1], [bb.x1, bb.y0, bb.z1], [bb.x0, bb.y1, bb.z1], [bb.x1, bb.y1, bb.z1]]) { const [X, Y] = P(x, y, z); ext(X, Y); }
  }
  if (x1 < x0) { x0 = y0 = 0; x1 = y1 = 1; }
  y0 -= extraTop; x0 -= extraSide; x1 += extraSide;
  const w = Math.ceil(Math.max(minW, x1 - x0 + pad * 2)), h = Math.ceil(y1 - y0 + pad * 2);
  const cv = typeof OffscreenCanvas !== 'undefined' && false ? new OffscreenCanvas(w * scale, h * scale) : Object.assign(document.createElement('canvas'), { width: Math.ceil(w * scale), height: Math.ceil(h * scale) });
  const c = cv.getContext('2d'); c.scale(scale, scale); c.translate(-x0 + pad, -y0 + pad); c.lineJoin = 'round';
  const items = prims.map(p => ({ p, bb: bboxOf(p) })); for (const p of depthSort(items)) drawPrim(c, p.p);
  if (post) post(c);
  return { img: cv, sx: 0, sy: 0, sw: cv.width, sh: cv.height, ox: x0 - pad, oy: y0 - pad, s: scale };   // (ox,oy): screen position of the model origin inside the sprite is (-ox,-oy)
}
