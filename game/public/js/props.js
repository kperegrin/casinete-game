// Props: world things (tables, counters, slot machines…), buildings, trees. Footprint origin = top-left tile corner.
import { box, cyl, sph, cone, flat, vface, glowSpot, shade, renderModel } from './iso.js';
import { furniturePrims } from './models.js';
import { DEFS } from '/shared/content.js';
const WOOD = '#a67c52', WOOD_D = '#7d5a38', GOLD = '#e0b43a', GLASS = '#a9dcef';

const slot = (c) => [box(0.14, 0.2, 0, 0.72, 0.6, 62, c), box(0.12, 0.5, 30, 0.76, 0.4, 6, shade(c, 1.2)), vface('y', 0.5, 0.2, 0.8, 38, 56, '#101a35'), vface('y', 0.505, 0.24, 0.4, 42, 52, '#ff4d4d', null), vface('y', 0.505, 0.42, 0.58, 42, 52, '#ffd23d', null), vface('y', 0.505, 0.6, 0.76, 42, 52, '#4cd137', null), box(0.88, 0.45, 34, 0.04, 0.05, 20, '#ccc'), sph(0.9, 0.47, 54, 0.05, '#e84118'), box(0.14, 0.2, 62, 0.72, 0.6, 7, '#ffd23d'), sph(0.3, 0.5, 70, 0.04, '#fff'), sph(0.7, 0.5, 70, 0.04, '#fff')];
const chipStack = (x, y, z, cols) => cols.map((c, i) => cyl(x, y, z + i * 2, 0.09, 2, c));

export function thingModel(t) {
  const W = t.w || 1, D = t.h || 1; let prims = [];
  if (t.k === 'roulette') {
    prims = [box(0, 0, 0, W, D, 14, '#6b4a2b'), flat(0.1, 0.1, 14.2, W - 0.2, D - 0.2, '#118a4d', '#caa84a'), cyl(0.95, D / 2, 14, 0.7, 5, '#2a2a2a'), cyl(0.95, D / 2, 19, 0.58, 1, '#c1272d'), cyl(0.95, D / 2, 20, 0.42, 1, '#1a1a1a'), cyl(0.95, D / 2, 21, 0.2, 2, GOLD), sph(0.95, D / 2 - 0.4, 22, 0.04, '#fff')];
    for (let i = 0; i < 8; i++) for (let j = 0; j < 3; j++) prims.push(flat(1.9 + i * 0.26, 0.55 + j * 0.62, 14.4, 0.23, 0.55, (i + j) % 2 ? '#c1272d' : '#1a1a1a'));
    prims.push(...chipStack(3.4, 0.35, 14.5, ['#2b6cb0', '#c05621', '#2b6cb0']), ...chipStack(3.6, D - 0.35, 14.5, ['#2d3748', '#805ad5']));
  } else if (t.k === 'blackjack') {
    prims = [box(0, 0, 0, W, D, 14, '#6b4a2b'), flat(0.08, 0.08, 14.2, W - 0.16, D - 0.16, '#1c7d4f', '#caa84a'), flat(0.6, 0.2, 14.4, 0.3, 0.42, '#fff'), flat(1.0, 0.2, 14.4, 0.3, 0.42, '#fff', '#c0392b'), flat(1.5, 1.1, 14.4, 0.3, 0.42, '#fff'), flat(1.9, 1.1, 14.4, 0.3, 0.42, '#fff', '#c0392b'), ...chipStack(3.0, 0.8, 14.5, ['#c53030', '#2b6cb0', '#c53030']), ...[0.7, 1.7, 2.7].map(x => cyl(x, 1.55, 14.4, 0.12, 0.6, '#0e5a38'))];
  } else if (t.k === 'poker') {
    prims = [box(0, 0, 0, W, D, 14, '#4a3321'), flat(0.1, 0.1, 14.2, W - 0.2, D - 0.2, '#17603e', '#caa84a')];
    for (let i = 0; i < 5; i++) prims.push(flat(1.0 + i * 0.4, D / 2 - 0.2, 14.4, 0.3, 0.4, '#fff', i > 2 ? '#c0392b' : undefined));
    prims.push(cyl(0.5, D - 0.5, 14.4, 0.12, 2, '#fff'), ...chipStack(3.3, 0.7, 14.5, ['#2b6cb0', '#c0392b', '#2b6cb0', '#c0392b']), ...chipStack(3.2, D - 0.6, 14.5, ['#805ad5', '#2d3748']));
  } else if (t.k === 'slots') prims = slot(t.machine === 'clover' ? '#2e8b57' : '#c9961a');
  else if (t.k === 'shop') {
    const col = { furn: '#e8803a', curio: '#8e5bd1', hardware: '#6c7a89', cloth: '#e85d9a' }[t.shop] || '#888';
    prims = [box(0.02, 0.1, 0, 0.96, 0.8, 28, WOOD), box(0, 0.06, 28, 1, 0.88, 4, '#efe6d2'), box(0.08, 0.9, 4, 0.84, 0.04, 20, shade(WOOD, 1.15)), box(0.1, 0.12, 4, 0.04, 0.04, 56, '#555'), box(0.86, 0.12, 4, 0.04, 0.04, 56, '#555'), box(0.04, 0.1, 44, 0.92, 0.06, 18, col), box(0.2, 0.3, 32, 0.18, 0.18, 8, '#c0392b'), box(0.48, 0.4, 32, 0.2, 0.2, 6, '#2e86c1'), cyl(0.75, 0.55, 32, 0.1, 9, '#27ae60')];
  } else if (t.k === 'salon') {
    prims = [box(0.2, 0.3, 0, 0.6, 0.5, 14, '#c0392b'), box(0.2, 0.28, 14, 0.6, 0.12, 22, '#c0392b'), cyl(0.5, 0.55, 0, 0.1, 6, '#999'), box(0.1, 0.05, 0, 0.8, 0.06, 64, '#d9c28f'), vface('y', 0.11, 0.16, 0.84, 12, 58, '#bfe9ff', '#fff'), sph(0.2, 0.15, 60, 0.05, '#fff'), sph(0.8, 0.15, 60, 0.05, '#fff')];
  } else if (t.k === 'props') {
    prims = [box(0.04, 0.1, 0, 0.92, 0.8, 26, '#8a8f9a'), box(0.0, 0.06, 26, 1, 0.88, 4, '#d8dce2'), box(0.3, 0.3, 30, 0.4, 0.4, 12, '#f2c9a0'), cone(0.5, 0.5, 42, 0.32, 14, '#d9714f'), box(0.46, 0.7, 30, 0.1, 0.05, 8, '#5a3a1c')];
  } else if (t.k === 'achievements') {
    prims = [box(0.1, 0.4, 0, 0.06, 0.06, 56, '#555'), box(0.84, 0.4, 0, 0.06, 0.06, 56, '#555'), box(0.06, 0.38, 20, 0.88, 0.1, 40, '#7a5a3a'), vface('y', 0.49, 0.12, 0.88, 24, 56, '#f4e9c8'), vface('y', 0.495, 0.2, 0.4, 36, 50, '#e74c3c', null), vface('y', 0.495, 0.5, 0.8, 40, 52, '#3498db', null), cyl(0.5, 0.7, 0, 0.12, 4, GOLD), cyl(0.5, 0.7, 4, 0.04, 8, GOLD), cyl(0.5, 0.7, 12, 0.12, 8, GOLD)];
  } else if (t.k === 'cashier') {
    prims = [box(0.02, 0.1, 0, 0.96, 0.8, 34, '#4a3b6b'), box(0, 0.06, 34, 1, 0.88, 5, '#d8c28a'), vface('y', 0.9, 0.12, 0.88, 40, 70, 'rgba(170,220,240,0.55)', '#fff'), box(0.04, 0.1, 70, 0.92, 0.8, 5, '#caa84a'), cyl(0.3, 0.55, 39, 0.1, 2, GOLD), cyl(0.3, 0.55, 41, 0.1, 2, GOLD), glowSpot(0.5, 0.5, 60, 38, 'rgba(255,220,120,0.35)')];
  } else if (t.k === 'horses') {
    prims = [box(0.02, 0.1, 0, 0.96, 0.8, 34, '#3a6b3a'), box(0, 0.06, 34, 1, 0.88, 4, '#e8dcc0'), vface('y', 0.9, 0.12, 0.88, 40, 66, 'rgba(170,220,240,0.5)', '#fff')];
    for (let i = 0; i < 5; i++) prims.push(box(-0.05 + i * 0.22, 0.06, 66, 0.2, 0.9, 5, i % 2 ? '#c0392b' : '#fff'));
    prims.push(cyl(0.5, 0.55, 38, 0.1, 6, '#8d5b2e'), sph(0.5, 0.55, 44, 0.07, '#8d5b2e'));
  } else if (t.k === 'sit') {
    prims = [box(0.08, 0.35, 0, 0.1, 0.4, 10, '#555'), box(0.82, 0.35, 0, 0.1, 0.4, 10, '#555'), box(0.04, 0.3, 10, 0.92, 0.5, 4, WOOD), box(0.04, 0.28, 14, 0.92, 0.08, 14, shade(WOOD, 1.1)), box(0.04, 0.28, 28, 0.92, 0.1, 2, WOOD_D)];
  } else if (t.k === 'board') {
    prims = [box(0.1, 0.4, 0, 0.08, 0.08, 52, '#555'), box(0.82, 0.4, 0, 0.08, 0.08, 52, '#555'), box(0.04, 0.38, 24, 0.92, 0.12, 34, '#7a5a3a'), vface('y', 0.505, 0.1, 0.9, 28, 54, '#f2e3b3'), vface('y', 0.51, 0.18, 0.4, 36, 50, '#fff', '#999'), vface('y', 0.51, 0.5, 0.82, 32, 46, '#fff6c0', '#999'), box(0.04, 0.34, 56, 0.92, 0.2, 5, '#5a3a22')];
  } else if (t.k === 'fountain') {
    prims = [cyl(1, 1, 0, 0.98, 12, '#c9ced2'), cyl(1, 1, 12, 0.84, 1.5, '#78cdee'), cyl(1, 1, 12, 0.5, 14, '#b5bcc2'), cyl(1, 1, 26, 0.55, 5, '#c9ced2'), cyl(1, 1, 31, 0.44, 1, '#8fd8f5'), cyl(1, 1, 31, 0.1, 16, '#b5bcc2'), sph(1, 1, 46, 0.1, '#cfefff')];
  } else prims = [box(0.1, 0.1, 0, 0.8, 0.8, 20, '#888')];
  return { prims, W, D };
}

// ---------- buildings ----------
const BH = { furn: 66, cloth: 66, hall: 84, casino: 104, track: 58, h1: 54, h2: 54, h3: 56, h4: 54, h5: 62, h6: 62, c1: 74, c2: 92 };
export function buildingModel(b) {
  const W = b.w, D = b.h, H = BH[b.id] || 60; const body = b.color, roof = b.roof; const p = [box(0, 0, 0, W, D, H, body)];
  const dx = b.door[0] - b.x; const win = (face, at, u, z, w = 0.7, h = 18) => [vface(face, at, u, u + w, z, z + h, GLASS, '#fff'), vface(face, at + (face === 'y' ? 0.01 : 0.01), u + w / 2 - 0.02, u + w / 2 + 0.02, z, z + h, '#fff', null)];
  const rows = H > 90 ? [14, 52] : H > 60 ? [32] : [28];
  for (const z of rows) { for (let u = 0.5; u < W - 0.8; u += 1.5) { if (Math.abs(u + 0.35 - (dx + 0.5)) < 1.0 && z < 34) continue; p.push(...win('y', D, u, z)); } for (let u = 0.5; u < D - 0.8; u += 1.5) p.push(...win('x', W, u, z)); }
  // door + awning on the +y face
  p.push(vface('y', D, dx + 0.12, dx + 0.88, 0, 26, '#5a3a1c', '#2a1a0c'), vface('y', D + 0.01, dx + 0.2, dx + 0.8, 14, 22, '#a9dcef', null), sph(dx + 0.78, D + 0.02, 11, 0.025, GOLD), box(dx - 0.3, D, 28, 1.6, 0.55, 4, b.id === 'casino' ? '#ff2d95' : shade(roof, 1.15)));
  if (['furn', 'cloth', 'hall'].includes(b.id)) { p.push(box(dx - 0.55, D, 0, 0.12, 0.12, 28, '#eee'), box(dx + 1.0, D, 0, 0.12, 0.12, 28, '#eee')); }
  if (b.id === 'casino') {
    p.push(box(-0.15, -0.15, H, W + 0.3, D + 0.3, 5, GOLD), box(0.6, 0.6, H + 5, W - 1.2, D - 1.2, 12, '#3a3f78'), box(W / 2 - 3, D - 0.9, H + 10, 6, 0.5, 22, '#ff2d95'), box(W / 2 - 2.7, D - 0.88, H + 14, 5.4, 0.12, 14, '#ffe44d'), sph(W / 2, D / 2, H + 17, 0.9, GOLD), glowSpot(W / 2, D, H + 18, 90, 'rgba(255,60,170,0.35)'));
    for (const x of [0.1, W - 0.4]) p.push(cyl(x + 0.15, D + 0.2, 0, 0.18, H - 4, '#e8dcc0'));
  } else if (b.id === 'track') {
    for (let i = 0; i < W; i += 1) p.push(box(i, 0, H, 1, D, 6, i % 2 ? '#c0392b' : '#f4f1ea')); for (const x of [0.5, W - 0.5]) p.push(cyl(x, D - 0.3, H, 0.04, 22, '#999'), box(x, D - 0.3, H + 14, 0.3, 0.03, 8, '#e84118'));
  } else {
    p.push(box(-0.14, -0.14, H, W + 0.28, D + 0.28, 6, roof)); if (W > 3 && D > 3) { p.push(box(0.5, 0.5, H + 6, W - 1, D - 1, 8, shade(roof, 1.12))); if (W > 5 && D > 4) p.push(box(1.2, 1.1, H + 14, W - 2.4, D - 2.2, 8, shade(roof, 1.22))); }
    if (/^h|^c/.test(b.id)) p.push(box(W - 1.4, 0.6, H + 6, 0.5, 0.5, 18, BRICK()));
    if (b.id === 'c1' || b.id === 'c2') for (let i = 0; i < 4; i++) p.push(cyl(dx - 1 + i * 0.9, D + 0.55, 0, 0.14, H - 6, '#f4efe6'));
  }
  return { prims: p, W, D };
}
const BRICK = () => '#b5543a';

export function treeModel(v = 0) {
  if (v === 1) return { prims: [cyl(0.5, 0.5, 0, 0.08, 14, '#6b4a2b'), cone(0.5, 0.5, 8, 0.4, 24, '#2f8f4e'), cone(0.5, 0.5, 24, 0.32, 22, '#37a05a'), cone(0.5, 0.5, 40, 0.22, 20, '#44b368')], W: 1, D: 1 };
  if (v === 2) return { prims: [sph(0.5, 0.5, 0, 0.3, '#3aa05a', 0.85), sph(0.35, 0.58, 4, 0.2, '#48b86a'), sph(0.65, 0.45, 4, 0.2, '#2f8f4e')], W: 1, D: 1 };
  return { prims: [cyl(0.5, 0.5, 0, 0.1, 30, '#7a4b25'), sph(0.5, 0.5, 22, 0.46, '#34a853'), sph(0.34, 0.6, 38, 0.3, '#46bb64'), sph(0.64, 0.42, 42, 0.28, '#2d9a4a'), sph(0.5, 0.5, 56, 0.2, '#52c870')], W: 1, D: 1 };
}
