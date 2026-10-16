// Chibi 3D characters rendered at runtime with three.js into isometric sprites (same camera + lights as the baked tileset).
import * as THREE from '../vendor/three.module.min.js';
import { RoundedBoxGeometry } from '../vendor/RoundedBoxGeometry.js';
import { SKIN_COLORS, HAIR_COLORS, CLOTH_COLORS } from '/shared/content.js';

const K = 32 * Math.SQRT2;
const DIR = new THREE.Vector3(Math.cos(Math.PI / 6) * Math.SQRT1_2, 0.5, Math.cos(Math.PI / 6) * Math.SQRT1_2);
let renderer = null, scene = null, cam = null, root = null;
// fixed frustum around a 1×1 tile footprint, 2 tiles tall: every character sprite has the same size + anchor (per pixel scale)
const frames = new Map();
function frustum(SCALE) { if (frames.has(SCALE)) return frames.get(SCALE); const cx = [], cy = []; const c = new THREE.OrthographicCamera(); c.position.copy(DIR).multiplyScalar(100); c.lookAt(0, 0, 0); c.updateMatrixWorld(true); const inv = c.matrixWorldInverse;
  for (const x of [-0.45, 1.45]) for (const y of [-0.05, 2.0]) for (const z of [-0.45, 1.45]) { const v = new THREE.Vector3(x, y, z).applyMatrix4(inv); cx.push(v.x); cy.push(v.y); }
  const ppu = K * SCALE; const l = Math.floor(Math.min(...cx) * ppu) / ppu, t = Math.ceil(Math.max(...cy) * ppu) / ppu; const W = Math.ceil((Math.max(...cx) - l) * ppu), H = Math.ceil((t - Math.min(...cy)) * ppu); const f = { l, r: l + W / ppu, t, b: t - H / ppu, W, H, SCALE }; frames.set(SCALE, f); return f; }
export function available() {
  if (renderer) return true;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setClearColor(0, 0);
    scene = new THREE.Scene(); scene.add(new THREE.HemisphereLight('#fff6ea', '#7d6f66', 1.55)); const sun = new THREE.DirectionalLight('#fff1dc', 2.1); sun.position.set(-1.5, 8, 6); scene.add(sun); const fill = new THREE.DirectionalLight('#dfe8ff', 0.55); fill.position.set(6, 4, -1); scene.add(fill);
    cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 500); cam.position.copy(DIR).multiplyScalar(100); cam.up.set(0, 1, 0); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(true);
    return true;
  } catch (e) { renderer = null; return false; }
}
const mats = new Map(); const M = (c, o = {}) => { const k = c + JSON.stringify(o); if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: o.rough ?? 0.7, metalness: o.metal ?? 0, emissive: new THREE.Color(o.em || '#000'), side: o.side || THREE.FrontSide })); return mats.get(k); };
const geos = new Map(); const RB = (w, h, d, r) => { const k = [w, h, d, r].map(v => v.toFixed(3)).join(); if (!geos.has(k)) geos.set(k, new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001))); return geos.get(k); };
// box centred at (x, y, z) — everything in tile units, the character stands at the origin facing +z
const box = (x, y, z, w, h, d, c, r = 0.03, o) => { const m = new THREE.Mesh(RB(w, h, d, r), M(c, o)); m.position.set(x, y, z); return m; };
const ball = (x, y, z, r, c, s = [1, 1, 1], o) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), M(c, o)); m.position.set(x, y, z); m.scale.set(...s); return m; };
const tube = (x, y, z, r1, r2, h, c, seg = 20, o) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), M(c, o)); m.position.set(x, y, z); return m; };
const pivot = (x, y, z, ...kids) => { const g = new THREE.Group(); g.position.set(x, y, z); for (const k of kids) if (k) g.add(k); return g; };
const shade = (hex, f) => { const c = new THREE.Color(hex); if (f > 1) c.lerp(new THREE.Color('#fff'), f - 1); else c.multiplyScalar(f); return '#' + c.getHexString(); };

function build(look, frame, sit) {
  const g = new THREE.Group();
  const skin = SKIN_COLORS[look.skin ?? 2] || SKIN_COLORS[2], hair = HAIR_COLORS[look.hairColor ?? 1] || HAIR_COLORS[1];
  const bw = [0.88, 1, 1.14][look.body ?? 1] || 1; const full = look.full; const top = full ? null : (look.top || 'top_basic'); const bottom = full ? null : (look.bottom || 'bottom_basic');
  let topC = CLOTH_COLORS[look.topColor ?? 0], botC = CLOTH_COLORS[look.bottomColor ?? 6], shoeC = CLOTH_COLORS[look.shoeColor ?? 7];
  if (top === 'top_suit') topC = '#2c3e50'; if (bottom === 'bottom_slacks') botC = '#555b66'; if (full === 'top_gown') topC = '#7b3fb0';
  const swing = sit ? 0 : [0, 0.55, 0, -0.55][frame & 3];
  const hipY = 0.33, tw = 0.32 * bw, legX = 0.085 * bw;
  // ---- legs (+ shoes), pivot at the hip
  const legCol = (full || bottom === 'bottom_skirt') ? skin : botC;
  for (const [sx, s] of [[-1, swing], [1, -swing]]) {
    const leg = pivot(sx * legX, hipY, 0);
    leg.add(box(0, -0.15, 0, 0.12 * bw, 0.3, 0.13, legCol, 0.035));
    if (bottom === 'bottom_shorts') { leg.children[0].material = M(skin); leg.add(box(0, -0.06, 0, 0.13 * bw, 0.14, 0.14, botC, 0.035)); }
    if (bottom === 'bottom_skirt' || full) leg.children[0].material = M(skin);
    const sh = look.shoes || 'shoes_basic';
    if (sh === 'shoes_boots') leg.add(box(0, -0.25, 0.015, 0.14 * bw, 0.14, 0.17, '#6b4a2b', 0.035));
    else if (sh === 'shoes_heels') { leg.add(box(0, -0.29, 0.025, 0.12 * bw, 0.05, 0.17, '#c0392b', 0.02)); leg.add(box(0, -0.31, -0.045, 0.04, 0.05, 0.03, '#c0392b', 0.01)); }
    else if (sh === 'shoes_sandals') { leg.add(box(0, -0.315, 0.03, 0.13 * bw, 0.03, 0.19, '#d9b38c', 0.01)); leg.add(box(0, -0.29, 0.06, 0.13 * bw, 0.02, 0.03, '#a8794a', 0.008)); }
    else { leg.add(box(0, -0.29, 0.03, 0.135 * bw, 0.07, 0.19, shoeC, 0.03)); leg.add(box(0, -0.322, 0.03, 0.14 * bw, 0.025, 0.2, '#fafafa', 0.01)); }
    if (sit) leg.rotation.x = -Math.PI / 2 + 0.08; else leg.rotation.x = s;
    g.add(leg);
  }
  // ---- torso
  const torso = box(0, hipY + 0.17, 0, tw, 0.36, 0.2, topC, 0.06); g.add(torso);
  if (bottom && bottom !== 'bottom_skirt') g.add(box(0, hipY + 0.03, 0, tw + 0.01, 0.07, 0.21, botC, 0.03), box(0, hipY + 0.06, 0, tw + 0.015, 0.025, 0.215, '#3a2a1a', 0.01));
  if (bottom === 'bottom_skirt') g.add(tube(0, hipY - 0.02, 0, tw * 0.55, tw * 0.95, 0.2, botC, 24));
  if (full === 'top_dress') g.add(tube(0, hipY - 0.04, 0, tw * 0.55, tw * 1.05, 0.26, topC, 24));
  if (full === 'top_gown') { g.add(tube(0, hipY - 0.12, 0, tw * 0.55, tw * 1.25, 0.46, topC, 28)); for (let i = 0; i < 10; i++) { const a = i * 2.3, y = 0.05 + (i % 5) * 0.08; g.add(ball(Math.cos(a) * tw * 1.0, y, Math.sin(a) * tw * 1.0, 0.012, '#fff', [1, 1, 1], { em: '#fff' })); } }
  if (top === 'top_suit') { g.add(box(0, hipY + 0.24, 0.1, 0.1, 0.2, 0.012, '#f4f4f4', 0.005), box(0, hipY + 0.32, 0.108, 0.07, 0.035, 0.012, '#c0392b', 0.005)); }
  if (top === 'top_shirt') { g.add(box(0, hipY + 0.33, 0.06, tw * 0.6, 0.05, 0.1, shade(topC, 1.2), 0.02)); for (let i = 0; i < 3; i++) g.add(ball(0, hipY + 0.1 + i * 0.07, 0.102, 0.008, '#fafafa')); }
  if (top === 'top_hoodie') { g.add(box(0, hipY + 0.33, -0.1, tw * 0.8, 0.12, 0.08, shade(topC, 0.85), 0.04), box(0, hipY + 0.08, 0.1, tw * 0.7, 0.08, 0.012, shade(topC, 0.85), 0.01)); for (const sx of [-1, 1]) g.add(box(sx * 0.03, hipY + 0.24, 0.104, 0.01, 0.1, 0.008, '#fafafa', 0.003)); }
  if (top === 'top_tank') { torso.material = M(topC); }
  // ---- arms, pivot at the shoulder
  const longSleeve = top === 'top_hoodie' || top === 'top_shirt' || top === 'top_suit' || full === 'top_gown'; const noSleeve = top === 'top_tank';
  for (const [sx, s] of [[-1, -swing], [1, swing]]) {
    const arm = pivot(sx * (tw / 2 + 0.05), hipY + 0.32, 0);
    arm.add(box(0, -0.13, 0, 0.09, 0.27, 0.1, longSleeve ? topC : skin, 0.035));
    if (!longSleeve && !noSleeve) arm.add(box(0, -0.04, 0, 0.1, 0.1, 0.11, topC, 0.035));
    arm.add(ball(0, -0.29, 0.005, 0.048, skin));
    if (look.acc === 'acc_ring' && sx > 0) arm.add(ball(0, -0.27, 0.04, 0.014, '#ffd54a', [1, 1, 1], { metal: 0.6, rough: 0.3 }));
    arm.rotation.x = sit ? -0.5 : s * 0.8; arm.rotation.z = sx * 0.06; g.add(arm);
  }
  if (look.acc === 'acc_chain') { const t = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 8, 24), M('#ffd54a', { metal: 0.6, rough: 0.3 })); t.position.set(0, hipY + 0.33, 0.02); t.rotation.x = Math.PI / 2 - 0.35; g.add(t); }
  // ---- back items
  if (look.back === 'back_pack') g.add(box(0, hipY + 0.18, -0.15, tw * 0.85, 0.3, 0.12, '#c0562f', 0.05), box(0, hipY + 0.12, -0.215, tw * 0.6, 0.12, 0.03, '#8a3b1f', 0.02));
  if (look.back === 'back_cape') { const cape = box(0, hipY + 0.06, -0.13, tw * 1.15, 0.62, 0.025, '#c62828', 0.012); cape.rotation.x = 0.12; g.add(cape); }
  if (look.back === 'back_wings') for (const sx of [-1, 1]) { const w = pivot(sx * 0.06, hipY + 0.28, -0.13); for (let i = 0; i < 3; i++) w.add(ball(sx * (0.1 + i * 0.07), 0.05 - i * 0.06, -0.02, 0.08 - i * 0.012, '#fbfbff', [1.2, 0.5, 0.25])); w.rotation.y = sx * 0.35; g.add(w); }
  // ---- head
  const headY = hipY + 0.36 + 0.2; const head = pivot(0, headY, 0); g.add(head);
  head.add(box(0, 0, 0, 0.42, 0.38, 0.36, skin, 0.1)); head.add(box(0, -0.2, 0, 0.1, 0.06, 0.1, shade(skin, 0.9), 0.02));
  for (const sx of [-1, 1]) { head.add(box(sx * 0.085, -0.015, 0.181, 0.055, 0.075, 0.012, '#24202e', 0.012)); head.add(box(sx * 0.085 - 0.012, 0.005, 0.188, 0.016, 0.018, 0.005, '#ffffff', 0.004)); head.add(ball(sx * 0.14, -0.08, 0.176, 0.03, '#ff8a8a', [1.2, 0.7, 0.2])); }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 16, Math.PI), M('#8a3a2a')); mouth.position.set(0, -0.08, 0.182); mouth.rotation.z = Math.PI; head.add(mouth);
  head.add(box(0, -0.035, 0.185, 0.03, 0.03, 0.02, shade(skin, 0.93), 0.01));
  addHair(head, look.hairStyle ?? 1, hair, !!look.hat);
  if (look.glasses) addGlasses(head, look.glasses);
  if (look.hat) addHat(head, look.hat);
  // overall size, sitting pose
  const hs = (1 + (look.height || 0) * 0.012) * 1.12; g.scale.setScalar(hs);
  g.position.y = sit ? -0.02 : 0.004;
  if (!sit && (frame & 1)) g.position.y += 0.015;
  return g;
}
function addHair(head, st, c, hat) {
  const add = (m) => head.add(m); const top = (h = 0.13, w = 0.45, d = 0.4, y = 0.17) => add(box(0, y, -0.005, w, h, d, c, 0.065));
  if (st === 9) return;
  if (st === 0) { add(box(0, 0.16, -0.01, 0.43, 0.07, 0.38, c, 0.035)); add(box(0, 0.04, -0.17, 0.43, 0.2, 0.04, c, 0.02)); return; }
  if (st === 8) { add(box(0, 0.2, -0.02, 0.09, 0.14, 0.42, c, 0.04)); return; }
  if (!hat || st === 3 || st === 2 || st === 6) top(); else top(0.06, 0.44, 0.39, 0.16);
  add(box(0, 0.02, -0.185, 0.44, 0.3, 0.06, c, 0.04));                                        // back
  if (!hat) add(box(-0.06, 0.12, 0.17, 0.32, 0.08, 0.06, c, 0.03));                            // fringe
  for (const sx of [-1, 1]) add(box(sx * 0.215, 0.05, -0.02, 0.04, st === 2 || st === 3 ? 0.3 : 0.18, 0.3, c, 0.02));
  if (st === 2) for (const sx of [-1, 1]) add(box(sx * 0.215, -0.13, 0.0, 0.05, 0.12, 0.28, c, 0.03));
  if (st === 3) { add(box(0, -0.2, -0.19, 0.4, 0.34, 0.06, c, 0.03)); for (const sx of [-1, 1]) add(box(sx * 0.22, -0.2, -0.04, 0.05, 0.36, 0.22, c, 0.03)); }
  if (st === 4 && !hat) for (let i = 0; i < 9; i++) add(ball(-0.16 + (i % 3) * 0.16, 0.2 + (i % 2) * 0.03, -0.14 + Math.floor(i / 3) * 0.13, 0.09, c));
  if (st === 5 && !hat) for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 8), M(c)); m.position.set(-0.16 + i * 0.08, 0.28, -0.04 + (i % 2) * 0.06); m.rotation.z = (i - 2) * -0.18; add(m); }
  if (st === 6) { add(ball(0, 0.0, -0.27, 0.07, c)); add(box(0, -0.16, -0.28, 0.08, 0.26, 0.08, c, 0.04)); }
  if (st === 7 && !hat) add(ball(0, 0.28, -0.06, 0.1, c));
}
function addGlasses(head, id) {
  if (id === 'gl_round') { for (const sx of [-1, 1]) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.009, 8, 20), M('#2b2b2b')); t.position.set(sx * 0.085, -0.015, 0.19); head.add(t); } head.add(box(0, -0.01, 0.19, 0.08, 0.012, 0.01, '#2b2b2b', 0.004)); }
  else if (id === 'gl_sun') { for (const sx of [-1, 1]) head.add(box(sx * 0.085, -0.015, 0.192, 0.11, 0.07, 0.015, '#15151b', 0.02, { rough: 0.15 })); head.add(box(0, 0.0, 0.192, 0.06, 0.015, 0.012, '#15151b', 0.004)); }
  else if (id === 'gl_star') { const sh = new THREE.Shape(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.026 : 0.06, a = Math.PI / 2 + i * Math.PI / 5; (i ? sh.lineTo : sh.moveTo).call(sh, Math.cos(a) * r, Math.sin(a) * r); } const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.015, bevelEnabled: false }); for (const sx of [-1, 1]) { const m = new THREE.Mesh(geo, M('#ff4fa3', { rough: 0.3 })); m.position.set(sx * 0.09, -0.015, 0.183); head.add(m); } }
}
function addHat(head, id) {
  const y = 0.2;
  if (id === 'hat_cap') { head.add(ball(0, y - 0.02, -0.01, 0.23, '#3a7bd5', [1, 0.55, 0.95])); head.add(box(0, y - 0.02, 0.22, 0.28, 0.025, 0.16, '#2a5ca8', 0.012)); }
  else if (id === 'hat_beret') { const b = ball(0.03, y + 0.02, -0.02, 0.24, '#8e2b3c', [1.05, 0.3, 1]); b.rotation.z = -0.2; head.add(b); head.add(ball(0.05, y + 0.1, -0.02, 0.025, '#6d1f2d')); }
  else if (id === 'hat_top' || id === 'hat_vip') { const col = id === 'hat_vip' ? '#5a5e68' : '#1b1b22'; head.add(tube(0, y - 0.01, 0, 0.29, 0.29, 0.03, col, 28)); head.add(tube(0, y + 0.14, 0, 0.17, 0.18, 0.3, col, 28)); head.add(tube(0, y + 0.04, 0, 0.183, 0.183, 0.06, id === 'hat_vip' ? '#e0b43a' : '#c0392b', 28)); }
  else if (id === 'hat_crown') { head.add(tube(0, y + 0.03, 0, 0.19, 0.19, 0.1, '#e0b43a', 24, { metal: 0.6, rough: 0.3 })); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const m = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 6), M('#e0b43a', { metal: 0.6, rough: 0.3 })); m.position.set(Math.cos(a) * 0.17, y + 0.14, Math.sin(a) * 0.17); head.add(m); head.add(ball(Math.cos(a) * 0.19, y + 0.03, Math.sin(a) * 0.19, 0.022, ['#e74c3c', '#3498db', '#2ecc71'][i % 3])); } }
  else if (id === 'hat_party') { const m = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.36, 20), M('#ff5db1')); m.position.set(0, y + 0.17, 0); m.rotation.z = 0.12; head.add(m); head.add(tube(0, y + 0.06, 0, 0.13, 0.13, 0.04, '#ffe44d', 20)); head.add(ball(-0.02, y + 0.35, 0, 0.04, '#4dd2ff')); }
  else if (id === 'hat_cowboy') { head.add(tube(0, y - 0.02, 0, 0.36, 0.36, 0.03, '#8b5a2b', 28)); const c = box(0, y + 0.08, 0, 0.3, 0.18, 0.26, '#a56a35', 0.07); head.add(c); head.add(tube(0, y + 0.02, 0, 0.16, 0.16, 0.04, '#5a3a1c', 24)); }
}
// render one frame: dir 0 +y, 1 +x, 2 -y, 3 -x (world facing) -> sprite { img, sx, sy, sw, sh, ox, oy, s }
export function renderCharacter3d(look, dir, frame = 0, sit = false, scale = 2) {
  if (!available()) return null; const FR = frustum(scale); renderer.setSize(FR.W, FR.H, false); cam.left = FR.l; cam.right = FR.r; cam.top = FR.t; cam.bottom = FR.b; cam.updateProjectionMatrix();
  if (root) scene.remove(root); root = new THREE.Group(); const body = build(look || {}, frame, sit); body.rotation.y = [0, Math.PI / 2, Math.PI, -Math.PI / 2][dir & 3]; body.position.x = 0.5; body.position.z = 0.5; root.add(body); scene.add(root);
  renderer.render(scene, cam);
  const cv = document.createElement('canvas'); cv.width = FR.W; cv.height = FR.H; const c = cv.getContext('2d'); c.drawImage(renderer.domElement, 0, 0); outline(c, FR.W, FR.H);
  return { img: cv, sx: 0, sy: 0, sw: FR.W, sh: FR.H, ox: FR.l * K, oy: -FR.t * K, s: scale };
}
function outline(c, W, H) {
  const img = c.getImageData(0, 0, W, H); const a = img.data; const src = new Uint8ClampedArray(a); const solid = (x, y) => x >= 0 && y >= 0 && x < W && y < H && src[(y * W + x) * 4 + 3] > 200;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (src[i + 3] > 200) continue; if (!(solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1) || solid(x + 1, y + 1) || solid(x - 1, y - 1) || solid(x + 1, y - 1) || solid(x - 1, y + 1))) continue; const al = 0.62, ba = src[i + 3] / 255, na = al + ba * (1 - al); a[i] = (38 * al + src[i] * ba * (1 - al)) / na; a[i + 1] = (26 * al + src[i + 1] * ba * (1 - al)) / na; a[i + 2] = (44 * al + src[i + 2] * ba * (1 - al)) / na; a[i + 3] = na * 255; }
  c.putImageData(img, 0, 0);
}
