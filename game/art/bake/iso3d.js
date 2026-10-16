// Offline isometric renderer: three.js scene -> transparent sprite that matches the game's 2:1 projection exactly.
// Tile units: x = tile x, z = tile y, y = up (1 unit = one tile width). Screen: X = (x - z) * 32, Y = (x + z) * 16 - y * ZPX.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
export { THREE };
export const K = 32 * Math.SQRT2;                    // screen px per unit along the ground axes (1x)
export const ZPX = K * Math.cos(Math.PI / 6);         // screen px per unit of height (= 39.19)
const DIR = new THREE.Vector3(Math.cos(Math.PI / 6) * Math.SQRT1_2, 0.5, Math.cos(Math.PI / 6) * Math.SQRT1_2);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.setClearColor(0x000000, 0);

// ---------- model loading ----------
const loader = new GLTFLoader(); const cache = new Map();
export async function load(path) {
  if (!cache.has(path)) cache.set(path, new Promise((res, rej) => loader.load('/art/models/' + path + (path.endsWith('.glb') ? '' : '.gltf'), (g) => res(g.scene), undefined, rej)));
  const src = await cache.get(path); const o = src.clone(true);
  o.traverse(m => { if (m.isMesh) { m.material = m.material.clone(); m.castShadow = true; m.receiveShadow = true; } });
  return o;
}
// Recolour texels by hue range, keeping each texel's shading: rules [{ hue: [from, to] (deg), sat: min saturation, to: '#hex' }].
const texCache = new Map();
const hsl = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, s, l]; };
export function recolor(obj, rules) {
  obj.traverse(m => {
    if (!m.isMesh || !m.material.map) return; const img = m.material.map.image; const key = (img.src || img.currentSrc || m.material.map.uuid) + JSON.stringify(rules);
    let tex = texCache.get(key);
    if (!tex) {
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const c = cv.getContext('2d'); c.drawImage(img, 0, 0);
      const d = c.getImageData(0, 0, cv.width, cv.height); const px = d.data;
      const R = rules.map(r => { const t = new THREE.Color(r.to); const [th, ts, tl] = hsl(t.r * 255, t.g * 255, t.b * 255); return { ...r, th, ts, tl, ref: r.ref ?? 0.6 }; });
      for (let i = 0; i < px.length; i += 4) {
        const [h, s, l] = hsl(px[i], px[i + 1], px[i + 2]);
        for (const r of R) { const [a, b] = r.hue; const inHue = a <= b ? (h >= a && h <= b) : (h >= a || h <= b); if (!inHue || s < (r.sat ?? 0.25) || (r.lmin != null && l < r.lmin) || (r.lmax != null && l > r.lmax)) continue;
          const c2 = new THREE.Color().setHSL(r.th / 360, Math.min(1, r.ts * (r.keepSat ? s / 0.7 : 1)), Math.max(0.03, Math.min(0.97, r.tl + (l - r.ref) * 0.9)));
          px[i] = c2.r * 255; px[i + 1] = c2.g * 255; px[i + 2] = c2.b * 255; break; }
      }
      c.putImageData(d, 0, 0); tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = m.material.map.flipY; tex.magFilter = m.material.map.magFilter; tex.minFilter = m.material.map.minFilter; tex.wrapS = m.material.map.wrapS; tex.wrapT = m.material.map.wrapT; texCache.set(key, tex);
    }
    m.material.map = tex; m.material.needsUpdate = true;
  });
  return obj;
}
export const HUE = { yellow: [36, 62], blue: [180, 230], brown: [5, 32], green: [70, 170], orange: [15, 35], red: [345, 12], teal: [160, 195] };
// Uniformly scale + centre an object so its footprint fits `w × d` (tile units) centred at (cx, cz), standing on y = y0.
export const KS = 0.52;                                // KayKit units -> tiles (common scale so sizes stay consistent)
export function fit(obj, { w, d, cx, cz, y0 = 0, fill = 0.96, maxH = Infinity, stretch = false, height = null, kmax = KS }) {
  obj.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(obj); const s = b.getSize(new THREE.Vector3());
  let k = Math.min((w * fill) / s.x, (d * fill) / s.z, maxH / s.y, kmax); if (height) k = height / s.y;
  if (stretch) { const sx = typeof stretch === 'number' ? stretch : (w * fill) / s.x / k; obj.scale.multiply(new THREE.Vector3(stretch === 'z' ? 1 : sx, 1, stretch === 'x' || typeof stretch === 'number' ? 1 : (d * fill) / s.z / k)); }
  obj.scale.multiplyScalar(k); obj.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(obj); const c = b2.getCenter(new THREE.Vector3());
  obj.position.x += cx - c.x; obj.position.z += cz - c.z; obj.position.y += y0 - b2.min.y; obj.updateMatrixWorld(true); return obj;
}
// ---------- procedural parts in the same soft style ----------
const MAT = new Map();
export const mat = (color, o = {}) => { const key = color + JSON.stringify(o); if (!MAT.has(key)) MAT.set(key, new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: o.rough ?? 0.75, metalness: o.metal ?? 0, emissive: new THREE.Color(o.emissive || '#000'), emissiveIntensity: o.ei ?? 1, transparent: !!o.opacity, opacity: o.opacity ?? 1, map: o.map || null })); return MAT.get(key); };
const shadowed = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
// rounded box from its min corner (x, y=up, z) and size (w, h, d), corner radius r (tile units)
export function rbox(x, y, z, w, h, d, color, r = 0.04, o = {}) { const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001); const g = rr > 0.002 ? new RoundedBoxGeometry(w, h, d, 3, rr) : new THREE.BoxGeometry(w, h, d); const m = shadowed(new THREE.Mesh(g, o.material || mat(color, o))); m.position.set(x + w / 2, y + h / 2, z + d / 2); return m; }
export function cyl(x, y, z, r, h, color, o = {}) { const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(o.r2 ?? r, r, h, o.seg || 28), o.material || mat(color, o))); m.position.set(x, y + h / 2, z); return m; }
export function sph(x, y, z, r, color, o = {}) { const m = shadowed(new THREE.Mesh(new THREE.SphereGeometry(r, 28, 18), o.material || mat(color, o))); m.position.set(x, y + r * (o.sy ?? 1), z); m.scale.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1); return m; }
export function cone(x, y, z, r, h, color, o = {}) { const m = shadowed(new THREE.Mesh(new THREE.ConeGeometry(r, h, o.seg || 24), o.material || mat(color, o))); m.position.set(x, y + h / 2, z); return m; }
export function torus(x, y, z, r, t, color, o = {}) { const m = shadowed(new THREE.Mesh(new THREE.TorusGeometry(r, t, 12, 32), o.material || mat(color, o))); m.position.set(x, y, z); m.rotation.x = Math.PI / 2; return m; }
// a flat textured quad (canvas drawn by `paint(ctx, w, h)`) facing +z (face 'z') or +x (face 'x'), or lying on top (face 'y')
export function decal(x, y, z, w, h, paint, face = 'z', o = {}) {
  const cv = document.createElement('canvas'); const res = o.res || 128; cv.width = Math.round(res * w); cv.height = Math.round(res * h); paint(cv.getContext('2d'), cv.width, cv.height);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: o.rough ?? 0.6, transparent: true, emissive: o.glow ? new THREE.Color('#fff') : new THREE.Color('#000'), emissiveMap: o.glow ? tex : null, emissiveIntensity: o.glow || 0 }));
  m.receiveShadow = true;
  if (face === 'z') m.position.set(x + w / 2, y + h / 2, z); else if (face === 'x') { m.rotation.y = Math.PI / 2; m.position.set(x, y + h / 2, z - w / 2); } else { m.rotation.x = -Math.PI / 2; m.position.set(x + w / 2, y, z + h / 2); }
  return m;
}
export const group = (...kids) => { const g = new THREE.Group(); for (const k of kids.flat()) if (k) g.add(k); return g; };

// ---------- render ----------
export function lightRig(scene, center, size, o = {}) {
  scene.add(new THREE.HemisphereLight(o.sky || '#fff6ea', o.ground || '#7d6f66', o.hemi ?? 1.55));
  const sun = new THREE.DirectionalLight(o.sun || '#fff1dc', o.sunI ?? 2.1); const span = Math.max(4, size * 1.6);
  sun.position.set(center.x - 0.35 * span, center.y + 1.6 * span, center.z + 1.0 * span); sun.target.position.copy(center);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02; sun.shadow.radius = 4;
  const sc = sun.shadow.camera; sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.near = 0.1; sc.far = span * 6;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight('#dfe8ff', o.fill ?? 0.55); fill.position.set(center.x + span, center.y + span * 0.6, center.z - span * 0.2); scene.add(fill);
}
// Renders `obj` (already placed in tile units) and returns { canvas, ox, oy, s } where (ox, oy) is the 1x-pixel offset of the
// sprite's top-left corner from the projected world origin (tile corner 0,0 at height 0).
export function renderSprite(obj, { scale = 2, shadow = 0.26, outline = true, light = {}, cropAlpha = 2 } = {}) {
  const scene = new THREE.Scene(); scene.add(obj); obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj); const size = box.getSize(new THREE.Vector3()); const center = box.getCenter(new THREE.Vector3());
  lightRig(scene, center, Math.max(size.x, size.y, size.z), light);
  if (shadow) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: shadow })); pl.rotation.x = -Math.PI / 2; pl.position.set(center.x, 0.0005, center.z); pl.receiveShadow = true; scene.add(pl); }
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 500); cam.position.copy(DIR).multiplyScalar(100); cam.up.set(0, 1, 0); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(true);
  const inv = cam.matrixWorldInverse; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  const m = 0.9 + size.y * 0.4;                                   // margin for the cast shadow
  for (const X of [box.min.x - m, box.max.x + m]) for (const Y of [box.min.y, box.max.y]) for (const Z of [box.min.z - m, box.max.z + m]) { const v = new THREE.Vector3(X, Y, Z).applyMatrix4(inv); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
  const ppu = K * scale; x0 = Math.floor(x0 * ppu) / ppu; y1 = Math.ceil(y1 * ppu) / ppu;
  const W = Math.ceil((x1 - x0) * ppu), H = Math.ceil((y1 - y0) * ppu); x1 = x0 + W / ppu; y0 = y1 - H / ppu;
  cam.left = x0; cam.right = x1; cam.top = y1; cam.bottom = y0; cam.updateProjectionMatrix();
  renderer.setSize(W, H, false); renderer.render(scene, cam);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d'); c.drawImage(renderer.domElement, 0, 0);
  if (outline) drawOutline(c, W, H, scale);
  // crop to visible pixels
  const d = c.getImageData(0, 0, W, H).data; let cx0 = W, cy0 = H, cx1 = -1, cy1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > cropAlpha) { if (x < cx0) cx0 = x; if (x > cx1) cx1 = x; if (y < cy0) cy0 = y; if (y > cy1) cy1 = y; }
  if (cx1 < 0) { cx0 = cy0 = 0; cx1 = cy1 = 0; }
  const out = document.createElement('canvas'); out.width = cx1 - cx0 + 1; out.height = cy1 - cy0 + 1; out.getContext('2d').drawImage(cv, -cx0, -cy0);
  scene.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose?.(); });
  return { canvas: out, ox: x0 * K + cx0 / scale, oy: -y1 * K + cy0 / scale, s: scale };
}
// 1px (at 1x) soft dark rim around opaque pixels — gives sprites the crisp "pixel game" read.
function drawOutline(c, W, H, scale) {
  const img = c.getImageData(0, 0, W, H); const a = img.data; const src = new Uint8ClampedArray(a); const r = Math.max(1, Math.round(scale * 0.75));
  const solid = (x, y) => x >= 0 && y >= 0 && x < W && y < H && src[(y * W + x) * 4 + 3] > 200;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4; if (src[i + 3] > 200) continue; let near = false;
    for (let dy = -r; dy <= r && !near; dy++) for (let dx = -r; dx <= r; dx++) if ((dx || dy) && dx * dx + dy * dy <= r * r + 0.5 && solid(x + dx, y + dy)) { near = true; break; }
    if (!near) continue; const al = 0.62; const ba = src[i + 3] / 255; const na = al + ba * (1 - al);
    a[i] = (38 * al + src[i] * ba * (1 - al)) / na; a[i + 1] = (26 * al + src[i + 1] * ba * (1 - al)) / na; a[i + 2] = (44 * al + src[i + 2] * ba * (1 - al)) / na; a[i + 3] = na * 255;
  }
  c.putImageData(img, 0, 0);
}
