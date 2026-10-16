// What every baked sprite is made of.  Tile units; footprint origin (0,0) = top-left tile corner; front of a model faces +z.
import { THREE, load, recolor, fit, rbox, cyl, sph, cone, torus, decal, group, mat, HUE, KS } from './iso3d.js';
import * as paint from './paint.js';
import { DEFS } from '/shared/content.js';
const KF = (n) => 'kaykit-furniture/' + n, KR = (n) => 'kaykit-restaurant/' + n, KC = (n) => 'kaykit-city/' + n, KH = (n) => 'kaykit-halloween/' + n, KA = (n) => 'kenney-arena/' + n + '.glb', KN = (n) => 'kenney-city/' + n + '.glb';
export const C = { wood: '#b27052', woodD: '#9b5a45', woodDD: '#7d3d2c', woodL: '#c8855f', metal: '#aab8be', steel: '#798388', dark: '#3c4246', black: '#1d2024', white: '#f1f4f5', gold: '#e2b23c', glass: '#bfe8f5', felt: '#178a4f', cream: '#f4ead2' };
// a GLTF part fitted into the footprint box (x, z, w, d)
export async function part(path, box, o = {}) { const m = await load(path); if (o.rotY) m.rotation.y = o.rotY * Math.PI / 180; if (o.recolor) recolor(m, o.recolor); return fit(m, { cx: box.x + box.w / 2, cz: box.z + box.d / 2, w: box.w, d: box.d, ...o }); }
const B = (x, z, w, d) => ({ x, z, w, d });
const glowPool = (cx, cz, r, color = '#ffd27a', a = 0.55) => decal(cx - r, 0.004, cz - r, r * 2, r * 2, (c, w, h) => { const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, hexA(color, a)); g.addColorStop(1, hexA(color, 0)); c.fillStyle = g; c.fillRect(0, 0, w, h); }, 'y', { glow: 1, res: 64 });
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
const books = async (x, y, z, w) => { const g = new THREE.Group(); let cx = x; let i = 0; while (cx < x + w - 0.08) { const b = await part(KF('book_set'), B(cx, z, 0.26, 0.2), { y0: y, kmax: 0.32 }); g.add(b); cx += 0.27; i++; } return g; };

export const F = {
  bed_single: () => part(KF('bed_single_A'), B(0, 0, 1, 2)),
  bed_double: () => part(KF('bed_double_A'), B(0, 0, 2, 2), { recolor: [{ hue: HUE.blue, to: '#f59ab5' }] }),
  bed_canopy: async () => { const bed = await part(KF('bed_double_B'), B(0, 0, 2, 2), { recolor: [{ hue: HUE.blue, to: '#b58ae0' }] }); const posts = [[0.1, 0.1], [1.9, 0.1], [0.1, 1.9], [1.9, 1.9]].map(([x, z]) => cyl(x, 0, z, 0.045, 1.55, C.woodDD)); const top = rbox(0.04, 1.5, 0.04, 1.92, 0.08, 1.92, '#e9d7fb', 0.03); const drape = [rbox(0.06, 1.0, 0.04, 0.06, 0.5, 1.92, '#d5b8f5', 0.03), rbox(1.88, 1.0, 0.04, 0.06, 0.5, 1.92, '#d5b8f5', 0.03), rbox(0.04, 1.1, 0.04, 1.92, 0.4, 0.06, '#d5b8f5', 0.03)]; return group(bed, posts, top, drape); },
  sofa_2: () => part(KF('couch_pillows'), B(0, 0, 2, 1), { recolor: [{ hue: HUE.yellow, to: '#e8795e' }, { hue: HUE.blue, to: '#ffe2a8' }] }),
  sofa_3: () => part(KF('couch_pillows'), B(0, 0, 3, 1), { stretch: 1.45, kmax: KS, recolor: [{ hue: HUE.yellow, to: '#4f93dc' }, { hue: HUE.blue, to: '#ffd36b' }] }),
  sofa_velvet: () => part(KF('couch_pillows'), B(0, 0, 3, 1), { stretch: 1.45, recolor: [{ hue: HUE.yellow, to: '#8236a0' }, { hue: HUE.blue, to: '#e9c14a' }, { hue: HUE.brown, sat: 0.2, to: '#c9a227' }] }),
  armchair: () => part(KF('armchair_pillows'), B(0, 0, 1, 1), { recolor: [{ hue: HUE.yellow, to: '#c27a4c' }, { hue: HUE.blue, to: '#f2e3c6' }] }),
  chair_dining: () => part(KF('chair_A_wood'), B(0, 0, 1, 1)),
  stool: () => part(KF('chair_stool'), B(0, 0, 1, 1), { kmax: 0.75, recolor: [{ hue: HUE.blue, to: '#d84a4a' }] }),
  beanbag: () => group(sph(0.5, 0, 0.52, 0.4, '#ff9a3c', { sy: 0.62, rough: 0.9 }), sph(0.5, 0.25, 0.36, 0.26, '#ffad5c', { sy: 0.7, rough: 0.9 })),
  table_dining: async () => { const t = await part(KF('table_medium'), B(0, 0, 2, 2)); return group(t, await part(KF('cactus_small_A'), B(0.8, 0.8, 0.4, 0.4), { y0: topOf(t) }), await part(KF('book_single'), B(0.3, 1.2, 0.4, 0.4), { y0: topOf(t), rotY: -15 })); },
  table_coffee: async () => { const t = await part(KF('table_low'), B(0, 0, 2, 1)); return group(t, await part(KF('book_single'), B(0.55, 0.3, 0.4, 0.4), { y0: topOf(t), rotY: 20 }), await part(KF('cactus_small_B'), B(1.2, 0.3, 0.35, 0.35), { y0: topOf(t) })); },
  desk: async () => { const t = await part(KF('table_medium_long'), B(0, 0, 2, 1), { stretch: 'z', fill: 0.9 }); const y = topOf(t); return group(t, rbox(1.3, 0.05, 0.2, 0.6, y - 0.08, 0.6, C.woodD, 0.03), rbox(1.32, y - 0.32, 0.79, 0.56, 0.12, 0.02, C.woodL, 0.01), rbox(1.32, y - 0.52, 0.79, 0.56, 0.12, 0.02, C.woodL, 0.01), await part(KF('lamp_table'), B(0.15, 0.15, 0.4, 0.4), { y0: y }), await part(KF('book_set'), B(0.7, 0.2, 0.5, 0.3), { y0: y, kmax: 0.35 })); },
  wardrobe: () => group(rbox(0.06, 0, 0.14, 0.88, 1.6, 0.76, C.woodD, 0.05), rbox(0.03, 1.58, 0.11, 0.94, 0.07, 0.82, C.woodDD, 0.03), rbox(0.11, 0.08, 0.89, 0.38, 1.42, 0.03, C.wood, 0.02), rbox(0.51, 0.08, 0.89, 0.38, 1.42, 0.03, C.wood, 0.02), sph(0.44, 0.8, 0.93, 0.03, C.gold), sph(0.56, 0.8, 0.93, 0.03, C.gold), rbox(0.08, 0, 0.16, 0.84, 0.06, 0.72, C.woodDD, 0.02)),
  dresser: () => part(KF('cabinet_medium_decorated'), B(0, 0, 2, 1), { kmax: 0.62 }),
  chest: () => { const g = group(rbox(0.12, 0, 0.22, 0.76, 0.42, 0.56, C.wood, 0.05), rbox(0.1, 0.4, 0.2, 0.8, 0.04, 0.6, C.woodDD, 0.02)); const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.78, 24, 1, false, 0, Math.PI), mat(C.woodL)); lid.rotation.z = Math.PI / 2; lid.position.set(0.5, 0.44, 0.5); lid.castShadow = true; g.add(lid); for (const x of [0.2, 0.74]) g.add(rbox(x, 0, 0.21, 0.06, 0.45, 0.58, C.gold, 0.01, { metal: 0.5, rough: 0.4 })); g.add(rbox(0.44, 0.28, 0.77, 0.12, 0.16, 0.04, C.gold, 0.02, { metal: 0.6, rough: 0.35 })); return g; },
  bookshelf: async () => { const g = group(rbox(0.06, 0, 0.2, 0.88, 1.62, 0.66, C.woodD, 0.03)); g.add(rbox(0.12, 0.06, 0.24, 0.76, 1.5, 0.62, '#5e3427', 0.01)); for (const y of [0.06, 0.45, 0.85, 1.24]) { g.add(rbox(0.1, y, 0.24, 0.8, 0.05, 0.64, C.wood, 0.01)); g.add(await books(0.14, y + 0.05, 0.5, 0.72)); } return g; },
  shelf_wall: async () => { const s = await part(KF('shelf_B_large_decorated'), B(0, 1.0, 2, 0.4), { y0: 0.95, kmax: 0.62 }); return s; },
  tv: async (on) => { const t = await part(KF('table_low'), B(0, 0, 2, 1), { kmax: 0.6 }); const y = topOf(t); return group(t, rbox(0.25, y, 0.38, 1.5, 0.82, 0.08, C.black, 0.04), decal(0.31, y + 0.06, 0.465, 1.38, 0.7, (c, w, h) => paint.screen(c, w, h, on ? 'tv' : 'off'), 'z', { glow: on ? 0.9 : 0 }), rbox(0.85, y, 0.3, 0.3, 0.05, 0.2, C.black, 0.02), on ? glowPool(1, 1.2, 0.9, '#9fd8ff', 0.35) : null); },
  pc_desk: async (on = true) => { const t = await part(KF('table_medium_long'), B(0, 0, 2, 1), { stretch: 'z', fill: 0.9 }); const y = topOf(t); return group(t, rbox(0.55, y, 0.25, 0.9, 0.56, 0.06, C.black, 0.03), decal(0.6, y + 0.06, 0.315, 0.8, 0.46, (c, w, h) => paint.screen(c, w, h, 'pc'), 'z', { glow: 0.7 }), rbox(0.95, y, 0.3, 0.1, 0.1, 0.1, C.dark, 0.02), rbox(0.6, y, 0.55, 0.7, 0.03, 0.22, '#e6e8ea', 0.01), rbox(1.45, y, 0.6, 0.12, 0.02, 0.18, '#e6e8ea', 0.01), rbox(1.55, 0, 0.2, 0.3, 0.62, 0.62, C.dark, 0.03), decal(1.6, 0.42, 0.825, 0.06, 0.06, (c, w, h) => { c.fillStyle = '#5effa0'; c.fillRect(0, 0, w, h); }, 'z', { glow: 1 })); },
  jukebox: (on) => { const g = group(rbox(0.12, 0, 0.25, 0.76, 0.95, 0.55, '#c8342c', 0.06), rbox(0.16, 0.06, 0.78, 0.68, 0.36, 0.04, '#e8c56a', 0.02)); const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.55, 32, 1, false, -Math.PI / 2, Math.PI), mat('#d6453d')); arch.rotation.x = Math.PI / 2; arch.rotation.z = Math.PI / 2; arch.position.set(0.5, 0.95, 0.525); arch.castShadow = true; g.add(arch); g.add(decal(0.2, 0.5, 0.805, 0.6, 0.38, (c, w, h) => { paint.grad(c, w, h, on ? ['#ffe27a', '#ff7ac8', '#7ad4ff'] : ['#8a6f3a', '#6f3a5a', '#3a5a6f'], false); c.fillStyle = 'rgba(0,0,0,.35)'; for (let i = 0; i < 5; i++) c.fillRect(w * 0.1, h * (0.15 + i * 0.16), w * 0.8, h * 0.06); }, 'z', { glow: on ? 1 : 0 })); g.add(rbox(0.3, 1.1, 0.79, 0.4, 0.12, 0.02, '#f4f4f4', 0.02, { emissive: on ? '#ffd27a' : '#000', ei: 0.6 })); if (on) g.add(glowPool(0.5, 1.0, 0.8, '#ff7ac8', 0.35)); return g; },
  lamp_floor: async (on) => group(await part(KF('lamp_standing'), B(0, 0, 1, 1), { fill: 0.7, recolor: on ? [{ hue: [0, 360], sat: 0, lmin: 0.8, to: '#fff3c4', ref: 0.9 }] : undefined }), on ? glowPool(0.5, 0.5, 1.2) : null),
  lamp_table: async (on) => { const t = await part(KF('cabinet_small'), B(0.1, 0.1, 0.8, 0.8)); return group(t, await part(KF('lamp_table'), B(0.25, 0.25, 0.5, 0.5), { y0: topOf(t), kmax: 0.5 }), on ? glowPool(0.5, 0.5, 0.9) : null); },
  chandelier: (on) => { const g = group(cyl(1, 1.7, 1, 0.015, 0.7, C.gold), torus(1, 1.62, 1, 0.45, 0.04, C.gold, { metal: 0.6, rough: 0.35 }), sph(1, 1.5, 1, 0.1, C.gold, { metal: 0.5 })); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const x = 1 + Math.cos(a) * 0.45, z = 1 + Math.sin(a) * 0.45; g.add(cyl(x, 1.62, z, 0.03, 0.12, C.cream), sph(x, 1.74, z, 0.04, '#fff3b0', { emissive: on ? '#ffd27a' : '#000', ei: 1.5 })); g.add(sph(x, 1.45, z, 0.035, '#dff6ff', { opacity: 0.8, rough: 0.1 })); } if (on) g.add(glowPool(1, 1, 1.3, '#ffe9a8', 0.4)); return g; },
  neon_sign: (on) => group(rbox(0.1, 0.85, 1.0, 1.8, 0.62, 0.05, '#20142b', 0.03), decal(0.13, 0.88, 1.055, 1.74, 0.56, (c, w, h) => paint.neon(c, w, h, on), 'z', { glow: on ? 1.4 : 0, res: 160 })),
  rug_round: () => part(KF('rug_oval_A'), B(0, 0, 2, 2), { stretch: true, recolor: [{ hue: HUE.yellow, to: '#e07a5f' }, { hue: HUE.blue, to: '#e07a5f' }] }),
  rug_long: () => part(KF('rug_rectangle_stripes_A'), B(0, 0, 3, 2), { stretch: true, recolor: [{ hue: [20, 62], to: '#3d85c6' }] }),
  rug_royal: () => part(KF('rug_rectangle_B'), B(0, 0, 4, 3), { stretch: true, recolor: [{ hue: HUE.blue, to: '#9440ad' }, { hue: HUE.yellow, to: '#e2b23c' }] }),
  painting: async () => group(await part(KF('pictureframe_medium'), B(0.15, 1.0, 0.7, 0.12), { y0: 0.85, kmax: 0.75 }), decal(0.27, 0.97, 1.075, 0.46, 0.56, (c, w, h) => paint.landscape(c, w, h, 0), 'z')),
  painting_big: async () => group(await part(KF('pictureframe_large_A'), B(0.1, 1.0, 1.8, 0.12), { y0: 0.82, kmax: 0.8 }), decal(0.27, 0.96, 1.075, 1.46, 0.6, (c, w, h) => paint.landscape(c, w, h, 1), 'z')),
  plant_small: () => part(KF('cactus_medium_A'), B(0, 0, 1, 1), { fill: 0.7, kmax: 0.9 }),
  plant_big: async () => group(cyl(0.5, 0, 0.5, 0.26, 0.36, '#c8643c', { r2: 0.3 }), cyl(0.5, 0.36, 0.5, 0.27, 0.02, '#5a3a24'), await part(KA('tree'), B(0.1, 0.1, 0.8, 0.8), { y0: 0.34, kmax: 0.9, height: 1.25 })),
  aquarium: (on) => { const g = group(rbox(0.05, 0, 0.12, 1.9, 0.5, 0.76, C.woodD, 0.04), rbox(0.08, 0.5, 0.15, 1.84, 0.62, 0.7, '#7fd3ea', 0.02, { opacity: 0.45, rough: 0.1 }), rbox(0.1, 0.5, 0.17, 1.8, 0.48, 0.66, '#3fa9c9', 0.01, { opacity: 0.55, emissive: on ? '#3fa9c9' : '#000', ei: 0.4 }), rbox(0.05, 1.12, 0.12, 1.9, 0.06, 0.76, C.dark, 0.02), rbox(0.1, 0.5, 0.17, 1.8, 0.06, 0.66, '#e8d29a', 0.01)); for (const [x, y, z, col] of [[0.5, 0.75, 0.45, '#ff8a3c'], [1.2, 0.85, 0.5, '#ffd23c'], [1.5, 0.66, 0.36, '#ff5d8f'], [0.85, 0.62, 0.62, '#7ad4ff']]) g.add(sph(x, y, z, 0.05, col, { sx: 1.6 }), cone(x - 0.08, y + 0.03, z, 0.035, 0.06, col)); for (const x of [0.3, 1.0, 1.65]) g.add(cone(x, 0.56, 0.45, 0.06, 0.36, '#3aa05a')); return g; },
  fridge: () => part(KR('fridge_A_decorated'), B(0, 0, 1, 1), { kmax: 0.62 }),
  stove: async (on) => group(await part(KR('stove_single'), B(0, 0, 1, 1), { kmax: 0.62 }), on ? cone(0.5, 0.66, 0.5, 0.1, 0.1, '#4aa8ff', { emissive: '#4aa8ff', ei: 1.5 }) : null),
  counter: async () => group(await part(KR('kitchencounter_straight_A_decorated'), B(0, 0, 1, 1), { kmax: 0.62 }), await part(KR('kitchencounter_sink'), B(1, 0, 1, 1), { kmax: 0.62 })),
  bathtub: () => { const g = group(rbox(0.06, 0, 0.12, 1.88, 0.55, 0.78, C.white, 0.16, { rough: 0.35 }), rbox(0.16, 0.38, 0.22, 1.68, 0.18, 0.58, '#9fd8f0', 0.12, { rough: 0.1 })); g.add(cyl(0.18, 0.55, 0.5, 0.03, 0.22, C.metal, { metal: 0.7, rough: 0.3 }), rbox(0.14, 0.72, 0.47, 0.18, 0.04, 0.06, C.metal, 0.02, { metal: 0.7 })); for (const x of [0.15, 1.8]) for (const z of [0.18, 0.82]) g.add(sph(x, 0, z, 0.06, C.gold, { metal: 0.6 })); return g; },
  toilet: () => group(rbox(0.3, 0, 0.32, 0.4, 0.38, 0.5, C.white, 0.14, { rough: 0.35 }), rbox(0.26, 0.38, 0.26, 0.48, 0.06, 0.6, C.white, 0.06, { rough: 0.3 }), rbox(0.24, 0.4, 0.12, 0.52, 0.5, 0.2, C.white, 0.06, { rough: 0.35 }), rbox(0.42, 0.86, 0.19, 0.16, 0.03, 0.06, C.metal, 0.01, { metal: 0.7 })),
  sink: () => group(cyl(0.5, 0, 0.45, 0.1, 0.62, C.white, { r2: 0.14 }), rbox(0.18, 0.6, 0.22, 0.64, 0.16, 0.5, C.white, 0.08, { rough: 0.3 }), rbox(0.26, 0.7, 0.3, 0.48, 0.07, 0.36, '#cfe6f2', 0.06, { rough: 0.15 }), cyl(0.5, 0.74, 0.27, 0.03, 0.16, C.metal, { metal: 0.7, rough: 0.3 }), rbox(0.22, 0.95, 0.1, 0.56, 0.6, 0.04, '#dff3ff', 0.03, { rough: 0.05, metal: 0.3 }), rbox(0.19, 0.92, 0.08, 0.62, 0.66, 0.03, C.wood, 0.02)),
  arcade: (on = true) => group(rbox(0.16, 0, 0.18, 0.68, 1.45, 0.62, '#3a3fd9', 0.04), rbox(0.14, 0.62, 0.62, 0.72, 0.1, 0.32, '#2a2fb0', 0.03), decal(0.22, 0.78, 0.69, 0.56, 0.5, (c, w, h) => paint.screen(c, w, h, 'arcade'), 'z', { glow: 0.9 }), rbox(0.14, 1.32, 0.66, 0.72, 0.16, 0.06, '#ffd23c', 0.02, { emissive: '#ffb000', ei: 0.4 }), cyl(0.35, 0.72, 0.75, 0.025, 0.08, C.black), sph(0.35, 0.78, 0.75, 0.04, '#e53935'), sph(0.55, 0.72, 0.78, 0.035, '#43a047'), sph(0.65, 0.72, 0.78, 0.035, '#fbc02d')),
  pinball: (on = true) => group(rbox(0.12, 0.5, 0.06, 0.76, 0.24, 1.88, '#ff4f9a', 0.04), decal(0.16, 0.745, 0.1, 0.68, 1.6, (c, w, h) => { paint.grad(c, w, h, ['#2a1650', '#5a1f7a']); c.fillStyle = '#ffd23c'; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(w * (0.3 + i * 0.2), h * 0.3, w * 0.08, 0, 7); c.fill(); } c.strokeStyle = '#7ad4ff'; c.lineWidth = w * 0.03; c.beginPath(); c.moveTo(w * 0.2, h * 0.85); c.lineTo(w * 0.42, h * 0.92); c.moveTo(w * 0.8, h * 0.85); c.lineTo(w * 0.58, h * 0.92); c.stroke(); }, 'y', { glow: 0.5 }), rbox(0.12, 0.5, 0.0, 0.76, 0.8, 0.12, '#ff4f9a', 0.04), decal(0.16, 0.6, 0.125, 0.68, 0.62, (c, w, h) => { paint.grad(c, w, h, ['#ffe14d', '#ff7ac8']); c.fillStyle = '#2a1650'; c.font = `bold ${h * 0.22}px sans-serif`; c.textAlign = 'center'; c.fillText('BALL', w / 2, h * 0.45); c.fillText('ROLL', w / 2, h * 0.75); }, 'z', { glow: 0.8 }), ...[[0.18, 0.1], [0.78, 0.1], [0.18, 1.85], [0.78, 1.85]].map(([x, z]) => cyl(x, 0, z, 0.035, 0.52, C.steel))),
  piano: () => { const g = group(rbox(0.1, 0.55, 0.1, 1.8, 0.32, 1.3, '#16161b', 0.08, { rough: 0.25 }), rbox(0.1, 0.55, 1.4, 1.8, 0.26, 0.42, '#16161b', 0.05, { rough: 0.25 }), decal(0.18, 0.815, 1.42, 1.64, 0.3, paint.keys, 'y')); const lid = rbox(0.1, 0.87, 0.1, 1.8, 0.03, 1.3, '#1d1d24', 0.02, { rough: 0.2 }); lid.rotation.x = -0.5; lid.position.y += 0.35; lid.position.z -= 0.05; g.add(lid); for (const [x, z] of [[0.25, 0.3], [1.75, 0.3], [1.0, 1.65]]) g.add(cyl(x, 0, z, 0.05, 0.56, '#16161b')); g.add(rbox(0.6, 0, 1.9, 0.8, 0.42, 0.08, '#16161b', 0.02), rbox(0.55, 0.42, 1.88, 0.9, 0.06, 0.12, '#2a2a33', 0.02)); return g; },
  fireplace: (on) => { const g = group(rbox(0.05, 0, 0.35, 1.9, 1.2, 0.55, '#b5543a', 0.03, { map: tex(paint.brick, 2, 1.2) }), rbox(0.0, 1.15, 0.3, 2.0, 0.1, 0.66, C.cream, 0.03), rbox(0.55, 0, 0.82, 0.9, 0.7, 0.1, '#2a1a12', 0.04), rbox(0.5, 0, 0.88, 1.0, 0.06, 0.14, '#8c8278', 0.02)); g.add(rbox(0.65, 0.04, 0.8, 0.7, 0.08, 0.1, C.woodDD, 0.03)); if (on) { for (const [x, h, col] of [[0.8, 0.36, '#ff8a2a'], [1.0, 0.48, '#ffb43c'], [1.2, 0.34, '#ff6a1a'], [1.0, 0.28, '#fff0a0']]) g.add(cone(x, 0.08, 0.86, 0.11, h, col, { emissive: col, ei: 1.4 })); g.add(glowPool(1, 1.3, 1.1, '#ff9a3c', 0.5)); } return g; },
  fountain_small: () => group(cyl(1, 0, 1, 0.95, 0.32, '#c9ced2'), cyl(1, 0.26, 1, 0.82, 0.05, '#7fd3ee', { emissive: '#3fa9c9', ei: 0.15, rough: 0.1 }), cyl(1, 0.3, 1, 0.16, 0.5, '#b5bcc2'), cyl(1, 0.8, 1, 0.4, 0.1, '#c9ced2'), cyl(1, 0.86, 1, 0.33, 0.03, '#8fd8f5', { rough: 0.1 }), cyl(1, 0.9, 1, 0.06, 0.28, '#b5bcc2'), sph(1, 1.14, 1, 0.09, '#dff6ff', { opacity: 0.85, rough: 0.05 })),
  throne: () => group(rbox(0.14, 0, 0.18, 0.72, 0.5, 0.68, C.gold, 0.05, { metal: 0.55, rough: 0.35 }), rbox(0.2, 0.5, 0.24, 0.6, 0.08, 0.56, '#c0283b', 0.04), rbox(0.14, 0.5, 0.14, 0.72, 1.05, 0.14, C.gold, 0.05, { metal: 0.55, rough: 0.35 }), rbox(0.22, 0.62, 0.27, 0.56, 0.8, 0.04, '#c0283b', 0.03), rbox(0.1, 0.5, 0.18, 0.1, 0.3, 0.68, C.gold, 0.04, { metal: 0.5 }), rbox(0.8, 0.5, 0.18, 0.1, 0.3, 0.68, C.gold, 0.04, { metal: 0.5 }), sph(0.5, 1.56, 0.2, 0.07, '#e53950'), sph(0.18, 1.5, 0.2, 0.05, '#3c8bff'), sph(0.82, 1.5, 0.2, 0.05, '#3c8bff')),
  home_roulette: () => group(cyl(1, 0, 1, 0.22, 0.55, C.woodDD, { r2: 0.3 }), cyl(1, 0.55, 1, 0.92, 0.14, C.woodD), cyl(1, 0.69, 1, 0.84, 0.02, C.felt), decal(0.35, 0.715, 0.35, 1.3, 1.3, paint.rouletteWheel, 'y', { res: 160 }), sph(1, 0.73, 1, 0.07, C.gold, { metal: 0.6 })),
  home_poker: () => { const g = group(cyl(1, 0, 1, 0.25, 0.55, C.woodDD, { r2: 0.32 }), cyl(1, 0.55, 1, 0.95, 0.14, C.woodD, { seg: 8 }), cyl(1, 0.69, 1, 0.82, 0.02, C.felt, { seg: 8 }), decal(0.3, 0.715, 0.3, 1.4, 1.4, (c, w, h) => paint.felt(c, w, h, 'poker'), 'y', { res: 128 })); for (const [x, z, col] of [[0.55, 0.7, '#c62828'], [1.45, 0.7, '#1e63c6'], [1.4, 1.35, '#2a2a2a'], [0.6, 1.3, '#e8c56a']]) for (let i = 0; i < 3; i++) g.add(cyl(x, 0.72 + i * 0.025, z, 0.06, 0.022, col)); return g; },
  slot_cabinet: () => slotModel('#d4a017'),
  trophy_case: async () => group(rbox(0.12, 0, 0.18, 0.76, 0.3, 0.64, C.woodD, 0.03), rbox(0.14, 0.3, 0.2, 0.72, 1.0, 0.6, C.glass, 0.03, { opacity: 0.3, rough: 0.05 }), rbox(0.12, 1.3, 0.18, 0.76, 0.08, 0.64, C.woodD, 0.03), await part(KA('trophy'), B(0.25, 0.25, 0.5, 0.5), { y0: 0.32, height: 0.55 }), rbox(0.16, 0.7, 0.22, 0.68, 0.03, 0.56, C.glass, 0.01, { opacity: 0.4 })),
  statue: async () => group(rbox(0.15, 0, 0.15, 0.7, 0.3, 0.7, '#d9d4c8', 0.03), await part(KA('statue'), B(0.1, 0.1, 0.8, 0.8), { y0: 0.3, height: 1.25 })),
  pumpkin: async (on) => group(await part(KH('pumpkin_orange_jackolantern'), B(0.1, 0.1, 0.8, 0.8), { kmax: 0.62 }), on ? sph(0.5, 0.15, 0.5, 0.12, '#ffcf5a', { emissive: '#ffb030', ei: 2 }) : null, on ? glowPool(0.5, 0.5, 0.8, '#ffa53c', 0.5) : null),
  xmas_tree: async (on) => { const t = await part(KH('tree_pine_yellow_large'), B(0, 0, 1, 1), { height: 1.7, recolor: [{ hue: [20, 70], sat: 0.3, to: '#2f8f4e' }] }); const g = group(t, cyl(0.5, 0, 0.5, 0.2, 0.18, '#c0392b')); const cols = ['#e53935', '#fbc02d', '#1e88e5', '#fff']; for (let i = 0; i < 14; i++) { const y = 0.35 + (i / 14) * 1.15, r = 0.36 * (1 - (y - 0.3) / 1.5); const a = i * 2.4; g.add(sph(0.5 + Math.cos(a) * r, y, 0.5 + Math.sin(a) * r, 0.04, cols[i % 4], { emissive: on ? cols[i % 4] : '#000', ei: on ? 1 : 0 })); } g.add(sph(0.5, 1.72, 0.5, 0.08, C.gold, { emissive: on ? '#ffd23c' : '#000', ei: 1.2 })); if (on) g.add(glowPool(0.5, 0.5, 0.9, '#ffe9a8', 0.4)); return g; },
  golden_horseshoe: () => { const g = group(rbox(0.3, 0, 0.3, 0.4, 0.18, 0.4, C.woodD, 0.03)); const t = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 12, 28, Math.PI * 1.4), mat(C.gold, { metal: 0.7, rough: 0.3 })); t.position.set(0.5, 0.45, 0.5); t.rotation.z = -Math.PI * 0.2 - Math.PI / 2 + Math.PI; t.castShadow = true; g.add(t); return g; },
};
function slotModel(col) { return group(rbox(0.14, 0, 0.2, 0.72, 1.5, 0.6, col, 0.05, { metal: 0.25, rough: 0.45 }), rbox(0.12, 0.58, 0.62, 0.76, 0.12, 0.3, shade(col, 0.8), 0.03), decal(0.22, 0.86, 0.805, 0.56, 0.36, (c, w, h) => paint.screen(c, w, h, 'slots'), 'z', { glow: 0.5 }), rbox(0.16, 0.82, 0.78, 0.68, 0.44, 0.03, '#1b2340', 0.02), rbox(0.12, 1.36, 0.62, 0.76, 0.18, 0.18, '#ff3f6b', 0.04, { emissive: '#ff3f6b', ei: 0.5 }), cyl(0.9, 0.9, 0.5, 0.025, 0.36, C.metal, { metal: 0.7 }), sph(0.9, 1.25, 0.5, 0.06, '#e53935')); }
const shade = (hex, f) => { const c = new THREE.Color(hex); c.multiplyScalar(f); return '#' + c.getHexString(); };
function tex(painter, w, h) { const cv = document.createElement('canvas'); cv.width = 128 * w; cv.height = 128 * h; painter(cv.getContext('2d'), cv.width, cv.height); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; }
export function topOf(o) { o.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o).max.y; }

// place a furniture model rotated `rot` quarter turns, footprint top-left at the origin (same convention as the 2D renderer)
export async function furniture(id, rot = 0, on = false) {
  const def = DEFS[id]; const make = F[id]; if (!make) return null; const inner = await make(on);
  if (def.layer === 'wall') rot = 0;
  const w = def.w, d = def.layer === 'wall' ? 1 : def.h; const pivot = new THREE.Group(); inner.position.x -= w / 2; inner.position.z -= d / 2; pivot.add(inner);
  pivot.rotation.y = -(rot & 3) * Math.PI / 2; const W = (rot & 1) ? d : w, D = (rot & 1) ? w : d; const root = new THREE.Group(); pivot.position.set(W / 2, 0, D / 2); root.add(pivot); return root;
}

// ---------------------------------------------------------------- interior props ("things")
const register = () => group(rbox(0, 0, 0, 0.34, 0.16, 0.28, '#4a4f63', 0.03), rbox(0.04, 0.16, 0.02, 0.26, 0.14, 0.04, '#2b2f3a', 0.02), decal(0.06, 0.18, 0.065, 0.22, 0.1, (c, w, h) => { c.fillStyle = '#5effa0'; c.fillRect(0, 0, w, h); c.fillStyle = '#103a20'; c.font = `bold ${h * 0.7}px monospace`; c.fillText('$12', w * 0.1, h * 0.8); }, 'z', { glow: 0.8 }));
const at = (o, x, y, z) => { o.position.x += x; o.position.y += y; o.position.z += z; return o; };
async function shopCounter(shop) {
  const col = { furn: '#e8803a', curio: '#8e5bd1', hardware: '#6c7a89', cloth: '#e85d9a' }[shop] || '#888';
  const ctr = await part(KR('kitchencounter_straight_A'), B(0, 0, 1, 1), { kmax: 0.62, recolor: [{ hue: HUE.orange, to: col }] }); const y = topOf(ctr);
  const g = group(ctr, at(register(), 0.1, y, 0.25));
  if (shop === 'furn') g.add(await part(KF('lamp_table'), B(0.5, 0.2, 0.4, 0.4), { y0: y, kmax: 0.45 }));
  if (shop === 'curio') g.add(sph(0.7, y + 0.06, 0.45, 0.14, '#b9a6ff', { opacity: 0.85, rough: 0.05, emissive: '#7a5cff', ei: 0.35 }), cyl(0.7, y, 0.45, 0.1, 0.07, C.gold));
  if (shop === 'hardware') g.add(rbox(0.5, y, 0.3, 0.4, 0.16, 0.22, '#d84a4a', 0.03), rbox(0.6, y + 0.16, 0.38, 0.2, 0.04, 0.04, C.dark, 0.01));
  if (shop === 'cloth') for (let i = 0; i < 3; i++) g.add(rbox(0.5, y + i * 0.05, 0.3, 0.4, 0.05, 0.32, ['#e85d9a', '#5ea3e8', '#ffd36b'][i], 0.02));
  g.add(cyl(0.08, y, 0.08, 0.02, 0.9, C.steel), cyl(0.92, y, 0.08, 0.02, 0.9, C.steel), rbox(0.02, y + 0.82, 0.02, 0.96, 0.08, 0.22, col, 0.03), decal(0.06, y + 0.9, 0.245, 0.88, 0.0001 + 0.0, () => {}, 'z'));
  return g;
}
function bigTable(kind, W, D) {
  const g = group(); const rim = C.woodDD;
  if (kind === 'poker') { const t = cyl(0, 0, 0, 1, 1, rim); t.geometry = new THREE.CylinderGeometry(1, 1, 0.12, 48); t.scale.set(W / 2 * 0.96, 1, D / 2 * 0.92); t.position.set(W / 2, 0.62, D / 2); g.add(t); const f = cyl(0, 0, 0, 1, 1, C.felt); f.geometry = new THREE.CylinderGeometry(1, 1, 0.02, 48); f.scale.set(W / 2 * 0.86, 1, D / 2 * 0.8); f.position.set(W / 2, 0.69, D / 2); g.add(f); g.add(decal(W * 0.12, 0.705, D * 0.14, W * 0.76, D * 0.72, (c, w, h) => paint.felt(c, w, h, 'poker'), 'y', { res: 96 })); g.add(cyl(W / 2, 0, D / 2, 0.3, 0.56, rim, { r2: 0.4 })); for (const [x, z, col] of [[1.1, 0.8, '#c62828'], [2.9, 0.8, '#1e63c6'], [2.8, 2.2, '#2a2a2a'], [1.2, 2.1, '#e8c56a'], [2, 1.6, '#c62828']]) for (let i = 0; i < 4; i++) g.add(cyl(x, 0.71 + i * 0.025, z, 0.07, 0.022, col)); return g; }
  g.add(rbox(0.05, 0.56, 0.05, W - 0.1, 0.14, D - 0.1, rim, 0.07), rbox(0.15, 0.66, 0.15, W - 0.3, 0.04, D - 0.3, C.felt, 0.02), decal(0.18, 0.705, 0.18, W - 0.36, D - 0.36, (c, w, h) => paint.felt(c, w, h, kind), 'y', { res: 110 }));
  for (const [x, z] of [[0.35, 0.35], [W - 0.35, 0.35], [0.35, D - 0.35], [W - 0.35, D - 0.35]]) g.add(cyl(x, 0, z, 0.08, 0.56, rim));
  if (kind === 'roulette') { g.add(cyl(0.95, 0.7, D / 2, 0.66, 0.1, C.woodD), decal(0.33, 0.805, D / 2 - 0.62, 1.24, 1.24, paint.rouletteWheel, 'y', { res: 160 }), cyl(0.95, 0.8, D / 2, 0.06, 0.12, C.gold, { metal: 0.6 })); for (const [x, z, col] of [[3.3, 0.45, '#1e63c6'], [3.55, D - 0.45, '#c62828']]) for (let i = 0; i < 4; i++) g.add(cyl(x, 0.71 + i * 0.025, z, 0.07, 0.022, col)); }
  if (kind === 'blackjack') { g.add(rbox(W / 2 - 0.25, 0.71, 0.18, 0.5, 0.18, 0.22, '#5a3a24', 0.03)); for (let i = 0; i < 3; i++) g.add(rbox(0.9 + i * 1.0, 0.71, D - 0.75, 0.22, 0.01, 0.3, '#fafafa', 0.01)); for (const [x, col] of [[0.7, '#c62828'], [3.3, '#1e63c6']]) for (let i = 0; i < 4; i++) g.add(cyl(x, 0.71 + i * 0.025, 0.4, 0.07, 0.022, col)); }
  return g;
}
export async function thing(t) {
  const W = t.w || 1, D = t.h || 1;
  if (t.k === 'roulette' || t.k === 'blackjack' || t.k === 'poker') return bigTable(t.k, W, D);
  if (t.k === 'slots') return slotModel(t.machine === 'clover' ? '#2e8b57' : '#c9961a');
  if (t.k === 'shop') return shopCounter(t.shop);
  if (t.k === 'salon') return group(cyl(0.5, 0, 0.55, 0.08, 0.3, C.steel, { metal: 0.6 }), cyl(0.5, 0, 0.55, 0.25, 0.04, C.steel, { metal: 0.6 }), rbox(0.22, 0.32, 0.3, 0.56, 0.14, 0.5, '#c0392b', 0.06), rbox(0.22, 0.42, 0.24, 0.56, 0.62, 0.12, '#c0392b', 0.06), rbox(0.16, 0.42, 0.3, 0.08, 0.2, 0.46, C.black, 0.03), rbox(0.76, 0.42, 0.3, 0.08, 0.2, 0.46, C.black, 0.03), rbox(0.1, 0.4, 0.04, 0.8, 1.15, 0.05, C.gold, 0.03, { metal: 0.5 }), rbox(0.15, 0.45, 0.09, 0.7, 1.05, 0.01, '#d9f2ff', 0.01, { rough: 0.02, metal: 0.6 }));
  if (t.k === 'props') { const d = await part(KF('table_medium_long'), B(0, 0, 1, 1), { kmax: 0.5 }); const y = topOf(d); return group(d, rbox(0.3, y, 0.3, 0.36, 0.2, 0.3, '#f2c9a0', 0.02), cone(0.48, y + 0.2, 0.45, 0.28, 0.18, '#d9714f', { seg: 4 }), rbox(0.1, y, 0.62, 0.3, 0.01, 0.22, '#fafafa', 0.005)); }
  if (t.k === 'achievements') return group(cyl(0.18, 0, 0.5, 0.04, 1.3, C.steel), cyl(0.82, 0, 0.5, 0.04, 1.3, C.steel), rbox(0.06, 0.55, 0.45, 0.88, 0.8, 0.06, C.woodD, 0.03), decal(0.1, 0.6, 0.512, 0.8, 0.7, (c, w, h) => { c.fillStyle = '#f4e9c8'; c.fillRect(0, 0, w, h); c.fillStyle = '#7d3d2c'; c.font = `bold ${h * 0.13}px sans-serif`; c.textAlign = 'center'; c.fillText('HALL OF FAME', w / 2, h * 0.17); for (let i = 0; i < 3; i++) { c.fillStyle = ['#e2b23c', '#c0c6cc', '#cd7f32'][i]; c.beginPath(); c.arc(w * (0.22 + i * 0.28), h * 0.5, h * 0.12, 0, 7); c.fill(); c.fillStyle = '#7d3d2c'; c.fillRect(w * (0.12 + i * 0.28), h * 0.72, w * 0.2, h * 0.05); } }, 'z'), await part(KA('trophy'), B(0.35, 0.55, 0.3, 0.3), { y0: 0, height: 0.45 }));
  if (t.k === 'cashier') return group(rbox(0.02, 0, 0.12, 0.96, 0.85, 0.8, '#4a3b6b', 0.04), rbox(0, 0.85, 0.08, 1, 0.08, 0.88, C.gold, 0.03, { metal: 0.5 }), rbox(0.06, 0.93, 0.85, 0.88, 0.75, 0.03, C.glass, 0.02, { opacity: 0.35, rough: 0.05 }), rbox(0.04, 1.66, 0.1, 0.92, 0.1, 0.84, '#4a3b6b', 0.03), rbox(0.15, 0.93, 0.3, 0.3, 0.1, 0.16, C.gold, 0.02, { metal: 0.7, rough: 0.3 }), rbox(0.2, 1.03, 0.32, 0.22, 0.08, 0.12, C.gold, 0.02, { metal: 0.7, rough: 0.3 }), decal(0.12, 1.69, 0.945, 0.76, 0.14, (c, w, h) => paint.sign(c, w, h, 'CASHIER', '#4a3b6b', '#ffe08a'), 'z', { glow: 0.4 }));
  if (t.k === 'horses') { const g = group(rbox(0.02, 0, 0.12, 0.96, 0.85, 0.8, '#3a6b3a', 0.04), rbox(0, 0.85, 0.08, 1, 0.06, 0.88, C.cream, 0.02), rbox(0.06, 0.91, 0.85, 0.88, 0.7, 0.03, C.glass, 0.02, { opacity: 0.35, rough: 0.05 })); for (let i = 0; i < 5; i++) g.add(rbox(-0.05 + i * 0.22, 1.62, 0.04, 0.22, 0.08, 0.98, i % 2 ? '#c0392b' : '#fafafa', 0.02)); g.add(decal(0.1, 0.5, 0.925, 0.8, 0.22, (c, w, h) => paint.sign(c, w, h, 'BETS', '#2a4a2a', '#ffe08a'), 'z')); return g; }
  if (t.k === 'sit') return part(KC('bench'), B(0, 0, 1, 1), { kmax: 99, fill: 0.92 });
  if (t.k === 'board') return group(cyl(0.15, 0, 0.5, 0.04, 1.25, C.woodDD), cyl(0.85, 0, 0.5, 0.04, 1.25, C.woodDD), rbox(0.06, 0.55, 0.46, 0.88, 0.62, 0.06, C.woodD, 0.03), rbox(0.04, 1.15, 0.4, 0.92, 0.08, 0.18, '#8a3b2a', 0.03), decal(0.1, 0.6, 0.522, 0.8, 0.52, (c, w, h) => { c.fillStyle = '#d9b98a'; c.fillRect(0, 0, w, h); const notes = [['#fff8c4', 0.05, 0.08], ['#c4ecff', 0.4, 0.12], ['#ffd0e0', 0.68, 0.06], ['#fff', 0.15, 0.52], ['#d6ffc4', 0.55, 0.5]]; for (const [col, x, y] of notes) { c.fillStyle = col; c.fillRect(w * x, h * y, w * 0.28, h * 0.38); c.fillStyle = 'rgba(0,0,0,.35)'; for (let i = 0; i < 3; i++) c.fillRect(w * (x + 0.03), h * (y + 0.1 + i * 0.08), w * 0.2, h * 0.025); c.fillStyle = '#e53935'; c.beginPath(); c.arc(w * (x + 0.14), h * (y + 0.04), h * 0.025, 0, 7); c.fill(); } }, 'z'));
  if (t.k === 'fountain') { const g = await part(KN('pavement-fountain'), B(0, 0, 2, 2), { kmax: 2, fill: 1 }); return g; }
  return rbox(0.1, 0, 0.1, 0.8, 0.5, 0.8, '#888', 0.05);
}

// ---------------------------------------------------------------- buildings
const BH = { furn: 2.1, cloth: 2.1, hall: 2.6, casino: 3.1, track: 1.7, h1: 1.65, h2: 1.65, h3: 1.65, h4: 1.65, h5: 1.75, h6: 1.75, c1: 2.2, c2: 2.6 };
function wallTex(kind, base, w, h) {
  return tex((c, W, H) => {
    if (kind === 'brick') return paint.brick(c, W, H, base);
    c.fillStyle = base; c.fillRect(0, 0, W, H);
    if (kind === 'siding') { for (let y = 0; y < H; y += H / 14) { c.fillStyle = 'rgba(0,0,0,.09)'; c.fillRect(0, y + H / 14 - 3, W, 3); c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(0, y, W, 2); } }
    if (kind === 'stucco') { for (let i = 0; i < W * H / 60; i++) { c.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.07)'; c.fillRect(Math.random() * W, Math.random() * H, 2, 2); } }
    if (kind === 'casino') { c.fillStyle = 'rgba(255,215,120,.12)'; for (let x = 0; x < W; x += W / 12) c.fillRect(x, 0, 3, H); }
  }, w, h);
}
function roofTex(base) { return tex((c, W, H) => { c.fillStyle = base; c.fillRect(0, 0, W, H); const rh = H / 10; for (let r = 0; r < 10; r++) for (let x = -(r % 2) * 16; x < W; x += 32) { c.fillStyle = 'rgba(0,0,0,.14)'; c.fillRect(x, r * rh + rh - 3, 30, 3); c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(x + 1, r * rh, 28, 2); c.fillStyle = 'rgba(0,0,0,.1)'; c.fillRect(x + 30, r * rh, 2, rh); } }, 3, 3); }
function texMat(t, rx, ry, o = {}) { const m = new THREE.MeshStandardMaterial({ map: t.clone(), roughness: o.rough ?? 0.85 }); m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping; m.map.repeat.set(rx, ry); m.map.needsUpdate = true; return m; }
function windowOn(face, at, u, y, w, h, o = {}) {           // a framed window on the +z ('z') or +x ('x') face
  const g = new THREE.Group(); const frame = o.frame || '#f4f1ea', glassC = o.glass || '#9fd3ea';
  const add = (m) => g.add(m);
  if (face === 'z') { add(rbox(u - 0.04, y - 0.04, at - 0.02, w + 0.08, h + 0.08, 0.06, frame, 0.015)); add(rbox(u, y, at + 0.02, w, h, 0.02, glassC, 0.005, { rough: 0.1, metal: 0.2, emissive: o.lit ? '#ffcf70' : '#000', ei: 0.6 })); add(rbox(u + w / 2 - 0.015, y, at + 0.035, 0.03, h, 0.02, frame, 0.005)); add(rbox(u, y + h / 2 - 0.015, at + 0.035, w, 0.03, 0.02, frame, 0.005)); add(rbox(u - 0.07, y - 0.08, at - 0.02, w + 0.14, 0.05, 0.12, frame, 0.015)); if (o.shutter) { add(rbox(u - 0.16, y, at, 0.1, h, 0.04, o.shutter, 0.01)); add(rbox(u + w + 0.06, y, at, 0.1, h, 0.04, o.shutter, 0.01)); } if (o.box) { add(rbox(u - 0.02, y - 0.2, at, w + 0.04, 0.13, 0.14, C.woodD, 0.02)); for (let i = 0; i < 4; i++) add(sph(u + 0.05 + i * (w / 4), y - 0.08, at + 0.07, 0.05, ['#ff7aa8', '#ffd24a', '#fff', '#b06cff'][i])); } }
  else { add(rbox(at - 0.02, y - 0.04, u - 0.04, 0.06, h + 0.08, w + 0.08, frame, 0.015)); add(rbox(at + 0.02, y, u, 0.02, h, w, glassC, 0.005, { rough: 0.1, metal: 0.2, emissive: o.lit ? '#ffcf70' : '#000', ei: 0.6 })); add(rbox(at + 0.035, y, u + w / 2 - 0.015, 0.02, h, 0.03, frame, 0.005)); add(rbox(at + 0.035, y + h / 2 - 0.015, u, 0.02, 0.03, w, frame, 0.005)); add(rbox(at - 0.02, y - 0.08, u - 0.07, 0.12, 0.05, w + 0.14, frame, 0.015)); if (o.shutter) { add(rbox(at, y, u - 0.16, 0.04, h, 0.1, o.shutter, 0.01)); add(rbox(at, y, u + w + 0.06, 0.04, h, 0.1, o.shutter, 0.01)); } }
  return g;
}
function gableRoof(W, D, rise, color, over = 0.18) {         // ridge along x
  const shape = new THREE.Shape(); shape.moveTo(-D / 2 - over, 0); shape.lineTo(0, rise); shape.lineTo(D / 2 + over, 0); shape.lineTo(-D / 2 - over, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: W + over * 2, bevelEnabled: false }); const m = new THREE.Mesh(geo, texMat(roofTex(color), (W + 2 * over) / 1.2, 1)); m.rotation.y = Math.PI / 2; m.position.set(-over, 0, D / 2); m.castShadow = true; m.receiveShadow = true;
  // uv fix: simple planar mapping for the slopes
  const pos = geo.attributes.position, uv = geo.attributes.uv; for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getZ(i) / 1.2, (pos.getY(i) + Math.abs(pos.getX(i))) / 1.0); uv.needsUpdate = true;
  return m;
}
function hipRoof(W, D, rise, color, over = 0.2) { const geo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1, false, Math.PI / 4); const m = new THREE.Mesh(geo, texMat(roofTex(color), 2, 2)); m.scale.set(W + over * 2, rise, D + over * 2); m.position.set(W / 2, rise / 2, D / 2); m.castShadow = true; m.receiveShadow = true; return m; }
const PALETTE_WALL = { furn: 'brick', cloth: 'stucco', hall: 'stucco', casino: 'casino', track: 'siding' };
export async function building(b) {
  const W = b.w, D = b.h, H = BH[b.id] || 1.8; const dx = b.door[0] - b.x; const house = /^[hc]\d$/.test(b.id);
  const kind = house ? 'siding' : PALETTE_WALL[b.id] || 'stucco'; const wallC = b.id === 'furn' ? '#c06a45' : b.color;
  const g = group(); const wm = texMat(wallTex(kind, wallC, 2, 2), W / 1.6, H / 1.6);
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), wm); body.position.set(W / 2, H / 2, D / 2); body.castShadow = body.receiveShadow = true; g.add(body);
  g.add(rbox(-0.04, 0, -0.04, W + 0.08, 0.16, D + 0.08, '#8c8278', 0.02));            // plinth
  const trim = b.id === 'casino' ? C.gold : '#f4f1ea';
  // windows
  const rows = H > 2.4 ? [0.55, 1.45, 2.2].filter(y => y < H - 0.5) : H > 1.9 ? [0.6, 1.35] : [0.55];
  const shutter = house ? shade(b.roof, 0.95) : null; const lit = false;
  for (const y of rows) {
    for (let u = 0.45; u < W - 0.6; u += house ? 1.4 : 1.15) { if (Math.abs(u + 0.3 - (dx + 0.5)) < 0.75 && y < 1.2) continue; g.add(windowOn('z', D, u, y, 0.6, 0.55, { frame: trim, shutter, box: house && y < 1, lit })); }
    for (let u = 0.45; u < D - 0.6; u += house ? 1.4 : 1.15) g.add(windowOn('x', W, u, y, 0.6, 0.55, { frame: trim, shutter, lit }));
  }
  // door + steps + porch light
  g.add(rbox(dx + 0.12, 0, D - 0.02, 0.76, 1.05, 0.06, trim, 0.02), rbox(dx + 0.18, 0, D + 0.02, 0.64, 0.98, 0.04, b.id === 'casino' ? '#7a1d3a' : '#7a4f2c', 0.02), sph(dx + 0.74, 0.5, D + 0.07, 0.03, C.gold, { metal: 0.6 }), rbox(dx - 0.05, 0, D, 1.1, 0.06, 0.4, '#a8a29d', 0.02));
  if (!house || b.id === 'c1' || b.id === 'c2') { // awning + shop sign
    const aw = b.id === 'casino' ? '#c2185b' : b.roof; const n = 7; for (let i = 0; i < n; i++) { const s = rbox(dx - 0.6 + i * (2.2 / n), 1.18, D, 2.2 / n, 0.05, 0.55, i % 2 ? '#fafafa' : aw, 0.01); s.rotation.x = 0.35; g.add(s); }
  }
  if (!house) { const sw = Math.min(W - 0.6, 4.2); g.add(rbox(W / 2 - sw / 2 - 0.05, H - 0.62, D - 0.02, sw + 0.1, 0.5, 0.08, trim, 0.03), decal(W / 2 - sw / 2, H - 0.58, D + 0.065, sw, 0.42, (c, w, h) => paint.sign(c, w, h, b.name.toUpperCase(), b.id === 'casino' ? '#2a1238' : shade(b.roof, 0.7), b.id === 'casino' ? '#ffd76a' : '#fff4d6'), 'z', { glow: b.id === 'casino' ? 0.9 : 0.15, res: 110 })); }
  // roofs
  if (house) {
    g.add(rbox(-0.06, H - 0.08, -0.06, W + 0.12, 0.1, D + 0.12, '#f4f1ea', 0.02));
    if (b.id === 'c1' || b.id === 'c2') { g.add(at(hipRoof(W, D, 1.3, b.roof), 0, H, 0)); for (let i = 0; i < 4; i++) g.add(cyl(dx - 1.0 + i * 0.95, 0, D + 0.55, 0.12, H - 0.1, '#f4efe6')); g.add(rbox(dx - 1.3, H - 0.25, D, 3.6, 0.2, 0.75, '#f4efe6', 0.03)); }
    else { const gr = gableRoof(W, D, 1.0, b.roof); gr.position.y = H; g.add(gr); g.add(rbox(W - 1.4, H + 0.3, 0.6, 0.38, 0.9, 0.38, '#b5543a', 0.03)); }
  } else if (b.id === 'casino') {
    g.add(rbox(-0.12, H, -0.12, W + 0.24, 0.16, D + 0.24, C.gold, 0.03, { metal: 0.5, rough: 0.35 }), rbox(0.5, H + 0.16, 0.5, W - 1, 0.3, D - 1, '#3a3f78', 0.04));
    g.add(sph(W / 2, H + 0.3, D / 2, 1.0, C.gold, { metal: 0.7, rough: 0.25, sy: 0.75 }));
    for (const x of [0.15, W - 0.45]) g.add(cyl(x + 0.15, 0, D + 0.25, 0.16, H - 0.1, '#efe4c9'));
    g.add(rbox(W / 2 - 2.6, H + 0.45, D - 0.7, 5.2, 0.9, 0.12, '#1b0f2b', 0.05), decal(W / 2 - 2.5, H + 0.5, D - 0.575, 5.0, 0.8, (c, w, h) => { c.fillStyle = '#1b0f2b'; c.fillRect(0, 0, w, h); c.font = `900 ${h * 0.62}px Nunito, sans-serif`; c.textAlign = 'center'; c.shadowColor = '#ff2d95'; c.shadowBlur = h * 0.2; c.fillStyle = '#ffe36b'; c.fillText('★ CASINO ★', w / 2, h * 0.72); c.shadowBlur = 0; for (let i = 0; i < 24; i++) { c.fillStyle = i % 2 ? '#ffe36b' : '#ff6bb5'; c.beginPath(); c.arc(w * (i + 0.5) / 24, h * 0.07, h * 0.04, 0, 7); c.arc(w * (i + 0.5) / 24, h * 0.93, h * 0.04, 0, 7); c.fill(); } }, 'z', { glow: 1.2, res: 120 }));
    g.add(rbox(dx - 0.6, 0.002, D, 2.2, 0.02, 1.1, '#b71c3c', 0.01));
  } else if (b.id === 'track') {
    for (let i = 0; i < W; i++) { const s = rbox(i, H, -0.1, 1, 0.12, D + 0.5, i % 2 ? '#c0392b' : '#f4f1ea', 0.02); s.rotation.x = -0.12; g.add(s); } for (const x of [0.3, W - 0.3]) g.add(cyl(x, H, D - 0.3, 0.03, 0.8, C.steel), rbox(x, H + 0.55, D - 0.3, 0.4, 0.22, 0.02, '#e84118', 0.01));
  } else {
    g.add(rbox(-0.08, H, -0.08, W + 0.16, 0.16, D + 0.16, shade(b.roof, 1.0), 0.03), rbox(0.15, H + 0.16, 0.15, W - 0.3, 0.04, D - 0.3, '#8c8278', 0.01));
    g.add(rbox(1, H + 0.2, 1, 0.8, 0.4, 0.6, '#aab8be', 0.04), rbox(1.1, H + 0.6, 1.1, 0.6, 0.05, 0.4, '#798388', 0.02));
    if (b.id === 'hall') { g.add(await part(KC('watertower'), B(W - 2.4, 0.6, 1.6, 1.6), { y0: H + 0.16, height: 1.5, kmax: 99 })); g.add(cyl(W / 2, H + 0.16, D - 1, 0.03, 1.2, C.steel), rbox(W / 2, H + 0.9, D - 1, 0.6, 0.38, 0.02, '#3c6fd1', 0.01)); for (const x of [dx - 0.7, dx + 1.4]) g.add(cyl(x + 0.15, 0, D + 0.25, 0.13, H - 0.2, '#f4efe6')); }
  }
  return g;
}

// ---------------------------------------------------------------- nature + street furniture
export async function tree(v) {
  if (v === 0 || v === 4) { const leaf = (x, y, z, r, col) => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), new THREE.MeshStandardMaterial({ color: col, roughness: 0.9, flatShading: true })); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m; };
    const tones = v ? ['#e58fb0', '#f2a9c4', '#d97a9f'] : ['#4caf50', '#5fbf5a', '#3f9a48'];
    return group(cyl(0.5, 0, 0.5, 0.08, 0.95, '#8a5a36', { r2: 0.06 }), leaf(0.5, 1.15, 0.5, 0.42, tones[0]), leaf(0.3, 0.95, 0.62, 0.28, tones[1]), leaf(0.7, 1.0, 0.42, 0.3, tones[2]), leaf(0.52, 1.5, 0.48, 0.24, tones[1])); }
  if (v === 1) return part(KH('tree_pine_yellow_large'), B(0, 0, 1, 1), { height: 2.0, kmax: 99, recolor: [{ hue: [20, 70], sat: 0.3, to: '#3fa35a', ref: 0.42 }] });
  if (v === 2) return part(KC('bush'), B(0.1, 0.1, 0.8, 0.8), { height: 0.62, kmax: 99 });
  return part(KA('tree'), B(0, 0, 1, 1), { height: 1.9, kmax: 99 });
}
export const PROPS = {
  streetlight: () => part(KC('streetlight'), B(0, 0, 1, 1), { height: 2.1, kmax: 99 }),
  hydrant: () => part(KC('firehydrant'), B(0.2, 0.2, 0.6, 0.6), { height: 0.45, kmax: 99 }),
  trash: () => part(KC('trash_A'), B(0.1, 0.1, 0.8, 0.8), { height: 0.6, kmax: 99 }),
  dumpster: () => part(KC('dumpster'), B(0, 0, 2, 1), { kmax: 99 }),
  bush: () => part(KC('bush'), B(0.1, 0.1, 0.8, 0.8), { height: 0.62, kmax: 99 }),
  lantern: () => part(KH('lantern_standing'), B(0.2, 0.2, 0.6, 0.6), { height: 1.15, kmax: 99 }),
  car_taxi: () => part(KC('car_taxi'), B(0, 0, 2, 1), { kmax: 99, fill: 0.92, rotY: 90 }),
  car_sedan: () => part(KC('car_sedan'), B(0, 0, 2, 1), { kmax: 99, fill: 0.92, rotY: 90 }),
  car_hatchback: () => part(KC('car_hatchback'), B(0, 0, 2, 1), { kmax: 99, fill: 0.92, rotY: 90 }),
  car_police: () => part(KC('car_police'), B(0, 0, 2, 1), { kmax: 99, fill: 0.92, rotY: 90 }),
  trafficlight: () => part(KC('trafficlight_A'), B(0, 0, 1, 1), { height: 2.0, kmax: 99 }),
  planter: () => group(rbox(0.08, 0, 0.08, 0.84, 0.32, 0.84, '#c9b89a', 0.04), rbox(0.14, 0.3, 0.14, 0.72, 0.03, 0.72, '#5a3a24', 0.01), ...Array.from({ length: 9 }, (_, i) => sph(0.25 + (i % 3) * 0.25, 0.32, 0.25 + Math.floor(i / 3) * 0.25, 0.1, ['#ff7aa8', '#ffd24a', '#fafafa', '#b06cff', '#ff8a4a'][i % 5])), ...Array.from({ length: 6 }, (_, i) => sph(0.2 + (i % 3) * 0.3, 0.3, 0.35 + Math.floor(i / 3) * 0.35, 0.12, '#4a9a3a'))),
  parasol: () => { const g = group(cyl(0.5, 0, 0.5, 0.025, 1.3, '#e8e2d5')); const top = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.3, 12, 1, true), mat('#ff6b5b', { rough: 0.8 })); top.position.set(0.5, 1.35, 0.5); top.castShadow = true; g.add(top); const t2 = new THREE.Mesh(new THREE.ConeGeometry(0.76, 0.3, 12, 1, true, 0, Math.PI / 6), mat('#fafafa')); t2.position.copy(top.position); for (let i = 0; i < 6; i++) { const s = t2.clone(); s.rotation.y = i * Math.PI / 3; g.add(s); } g.add(rbox(0.05, 0, 0.75, 0.9, 0.04, 0.4, '#5ec2e8', 0.02)); return g; },
  rock: () => group(sph(0.5, 0, 0.5, 0.28, '#9aa3a8', { sy: 0.6, sx: 1.2 }), sph(0.3, 0, 0.62, 0.16, '#8a9398', { sy: 0.7 })),
  boat: () => group(rbox(0.1, 0, 0.3, 1.8, 0.26, 0.5, '#f4f1ea', 0.12), rbox(0.2, 0.18, 0.36, 1.6, 0.06, 0.38, '#3c8bff', 0.04), cyl(1.0, 0.24, 0.55, 0.025, 1.2, C.woodD), rbox(1.02, 0.5, 0.55, 0.6, 0.8, 0.01, '#fafafa', 0.005)),
};
export const PROP_FOOT = { dumpster: [2, 1], car_taxi: [2, 1], car_sedan: [2, 1], car_hatchback: [2, 1], car_police: [2, 1], boat: [2, 1] };

// ---------------------------------------------------------------- key dispatcher (used by the bake tools)
export async function build(key) {
  const [kind, a, b, c] = key.split(':');
  if (kind === 'f') return furniture(a, +b || 0, c === '1');
  if (kind === 't') { const [w, h] = (c || '1x1').split('x').map(Number); const t = { k: a, shop: a === 'shop' ? b : undefined, machine: a === 'slots' ? b : undefined, w: w > 1 || h > 1 ? w : undefined, h: w > 1 || h > 1 ? h : undefined }; return thing(t); }
  if (kind === 'b') { const { BUILDINGS } = await import('/shared/map.js'); return building(BUILDINGS.find(x => x.id === a)); }
  if (kind === 'tree') return tree(+a);
  if (kind === 'p') return PROPS[a]?.();
  return null;
}
export function spriteOptions(key) { const [kind, a] = key.split(':'); if (kind === 'f' && DEFS[a]?.layer === 'wall') return { shadow: 0 }; if (kind === 'b') return { shadow: 0.3 }; return {}; }
