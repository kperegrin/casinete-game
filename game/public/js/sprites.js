// Sprite access layer: tileset PNG atlas (public/assets/tileset.*) when present, otherwise rendered on demand from the models.
import { renderModel, rotate, P } from './iso.js';
import { furniturePrims } from './models.js';
import { thingModel, buildingModel, treeModel } from './props.js';
import { renderCharacter } from './chars.js';
import { renderCharacter3d } from './char3d.js';
import { DEFS } from '/shared/content.js';

const cache = new Map(); let atlas = null;
export const tilesetInfo = () => atlas ? { source: 'png', count: Object.keys(atlas.meta.sprites).length, scale: atlas.meta.scale } : { source: 'procedural' };
export async function loadTileset() {
  try {
    const meta = await (await fetch('/assets/tileset.json', { cache: 'no-store' })).json(); if (!meta?.sprites) throw new Error('bad tileset');
    const pages = meta.pages || [{ file: 'tileset.png', v: meta.version }];
    const imgs = await Promise.all(pages.map(pg => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = '/assets/' + pg.file + '?v=' + (pg.v || 1); })));
    atlas = { imgs, meta };
  } catch { atlas = null; }
  return tilesetInfo();
}
const fromAtlas = (key) => { const m = atlas?.meta.sprites[key]; return m ? { img: atlas.imgs[m.p || 0], sx: m.x, sy: m.y, sw: m.w, sh: m.h, ox: m.ox, oy: m.oy, s: atlas.meta.scale } : null; };
export const hasSprite = (key) => !!atlas?.meta.sprites[key];
const memo = (key, make, useAtlas = true) => { let s = cache.get(key); if (!s) { s = (useAtlas && fromAtlas(key)) || make(); cache.set(key, s); } return s; };

const SC = 2;                                   // static scenery is rendered at 2x so it stays crisp when zoomed in
const furnKey = (defId, rot, on) => `f:${defId}:${rot & 3}:${on ? 1 : 0}`;
const thingKey = (t) => `t:${t.k}:${t.shop || t.machine || ''}:${t.w || 1}x${t.h || 1}`;
const makeFurn = (defId, rot, on, scale = SC) => { const def = DEFS[defId]; const wl = def.layer === 'wall'; return renderModel(rotate(furniturePrims(defId, on), def.w, wl ? 1 : def.h, wl ? 0 : rot).prims, { scale }); };
export const furnitureSprite = (defId, rot = 0, on = false) => memo(furnKey(defId, rot, on), () => makeFurn(defId, rot, on));
export const thingSprite = (t) => memo(thingKey(t), () => renderModel(thingModel(t).prims, { scale: SC }));
export const buildingSprite = (b) => memo(`b:${b.id}`, () => renderModel(buildingModel(b).prims, { pad: 8, scale: SC }));
export const treeSprite = (v = 0) => memo(`tree:${v}`, () => renderModel(treeModel(v % 3).prims, { scale: SC }));
export const propSprite = (name) => fromAtlas('p:' + name);          // street furniture only exists in the baked tileset
export function characterSprite(look, dir, frame, sit, scale = 2) {
  const key = `c${scale}:${look.body}.${look.skin}.${look.hairStyle}.${look.hairColor}.${look.topColor}.${look.bottomColor}.${look.shoeColor}.${look.height}.${look.top}.${look.bottom}.${look.shoes}.${look.hat}.${look.glasses}.${look.back}.${look.acc}.${look.full}:${dir & 3}:${frame & 3}:${sit ? 1 : 0}`;
  if (cache.size > 900) { for (const k of cache.keys()) if (k[0] === 'c' && k[1] !== ':') cache.delete(k); }
  return memo(key, () => renderCharacter3d(look || {}, dir, frame, sit, scale) || renderCharacter(look || {}, dir, frame, sit, 1), false);
}
export function drawSprite(c, s, X, Y, alpha = 1) {
  if (alpha !== 1) c.globalAlpha = alpha; c.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, X + s.ox, Y + s.oy, s.sw / s.s, s.sh / s.s); if (alpha !== 1) c.globalAlpha = 1;
}
// thumbnail canvas of a furniture piece for UI cards
export function furnitureThumb(defId, size = 64) {
  const s = furnitureSprite(defId, 0, false); const cv = document.createElement('canvas'); cv.width = cv.height = size; const c = cv.getContext('2d'); c.imageSmoothingQuality = 'high';
  const w = s.sw / s.s, h = s.sh / s.s; const k = Math.min((size - 4) / w, (size - 4) / h, 1.4); c.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, (size - w * k) / 2, (size - h * k) / 2 + 2, w * k, h * k); return cv;
}
export function characterThumb(look, size = 90, dir = 0) {
  const s = characterSprite(look, dir, 0, false); const cv = document.createElement('canvas'); cv.width = size; cv.height = size * 1.3; const c = cv.getContext('2d'); const w = s.sw / s.s, h = s.sh / s.s; const k = Math.min(cv.width / w, cv.height / h); c.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, (cv.width - w * k) / 2, (cv.height - h * k) / 2, w * k, h * k); return cv;
}
export const allFurnitureKeys = () => { const out = []; for (const d of Object.values(DEFS)) if (d.type === 'furniture') for (let r = 0; r < 4; r++) { out.push([d.id, r, false]); if (d.interact === 'toggle' || d.interact === 'music') out.push([d.id, r, true]); } return out; };
const boxes = new WeakMap();
function alphaBox(s) { let b = boxes.get(s.img); if (b) return b; const c = document.createElement('canvas'); c.width = s.sw; c.height = s.sh; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, 0, 0, s.sw, s.sh); const d = x.getImageData(0, 0, s.sw, s.sh).data; let x0 = s.sw, y0 = s.sh, x1 = 0, y1 = 0; for (let y = 0; y < s.sh; y++) for (let i = 0; i < s.sw; i++) if (d[(y * s.sw + i) * 4 + 3] > 30) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (y < y0) y0 = y; if (y > y1) y1 = y; } b = x1 > x0 ? { x0, y0, x1: x1 + 1, y1: y1 + 1 } : { x0: 0, y0: 0, x1: s.sw, y1: s.sh }; boxes.set(s.img, b); return b; }
const BASE_LOOK = { body: 1, skin: 2, hairStyle: 1, hairColor: 1, topColor: 4, bottomColor: 6, shoeColor: 7, top: 'top_basic', bottom: 'bottom_basic', shoes: 'shoes_basic' };
// Thumbnail for any inventory item: furniture sprite, a mannequin wearing the cosmetic, or null (caller falls back to its emoji).
export function itemThumb(defId, size = 56) {
  const def = DEFS[defId]; if (!def) return null;
  try {
    if (def.type === 'furniture') return furnitureThumb(defId, size);
    if (def.type === 'cosmetic' && def.slot) {
      const look = { ...BASE_LOOK, [def.slot]: defId }; const s = characterSprite(look, 0, 0, false);
      // crop the mannequin to the part of the body that wears the item
      const bb = alphaBox(s); const H = bb.y1 - bb.y0; const [f0, f1] = ({ hat: [0, 0.4], glasses: [0.1, 0.4], top: [0.32, 0.72], full: [0.32, 1], acc: [0.3, 0.6], back: [0.2, 0.8], bottom: [0.5, 0.95], shoes: [0.78, 1] })[def.slot] || [0, 1];
      const sy = bb.y0 + H * f0, sh = Math.max(8, H * (f1 - f0)); const sw = bb.x1 - bb.x0; const k = Math.min((size - 6) / sw, (size - 6) / sh);
      const cv = document.createElement('canvas'); cv.width = cv.height = size; const c = cv.getContext('2d'); c.imageSmoothingQuality = 'high';
      c.drawImage(s.img, s.sx + bb.x0, s.sy + sy, sw, sh, (size - sw * k) / 2, (size - sh * k) / 2, sw * k, sh * k); return cv;
    }
  } catch (e) { /* fall through to emoji */ }
  return null;
}
