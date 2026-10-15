// Sprite access layer: tileset PNG atlas (public/assets/tileset.*) when present, otherwise rendered on demand from the models.
import { renderModel, rotate, P } from './iso.js';
import { furniturePrims } from './models.js';
import { thingModel, buildingModel, treeModel } from './props.js';
import { renderCharacter } from './chars.js';
import { DEFS } from '/shared/content.js';
import { BUILDINGS, OUTDOOR_THINGS, INTERIORS } from '/shared/map.js';

const cache = new Map(); let atlas = null;
export const tilesetInfo = () => atlas ? { source: 'png', count: Object.keys(atlas.meta.sprites).length, scale: atlas.meta.scale } : { source: 'procedural' };
export async function loadTileset() {
  try {
    const meta = await (await fetch('/assets/tileset.json', { cache: 'no-store' })).json(); if (!meta?.sprites) throw new Error('bad tileset');
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = '/assets/tileset.png?v=' + (meta.version || 1); });
    atlas = { img, meta };
  } catch { atlas = null; }
  return tilesetInfo();
}
const fromAtlas = (key) => { const m = atlas?.meta.sprites[key]; return m ? { img: atlas.img, sx: m.x, sy: m.y, sw: m.w, sh: m.h, ox: m.ox, oy: m.oy, s: atlas.meta.scale } : null; };
const memo = (key, make, useAtlas = true) => { let s = cache.get(key); if (!s) { s = (useAtlas && fromAtlas(key)) || make(); cache.set(key, s); } return s; };

const SC = 2;                                   // static scenery is rendered at 2x so it stays crisp when zoomed in
const furnKey = (defId, rot, on) => `f:${defId}:${rot & 3}:${on ? 1 : 0}`;
const thingKey = (t) => `t:${t.k}:${t.shop || t.machine || ''}:${t.w || 1}x${t.h || 1}`;
const makeFurn = (defId, rot, on, scale = SC) => { const def = DEFS[defId]; const wl = def.layer === 'wall'; return renderModel(rotate(furniturePrims(defId, on), def.w, wl ? 1 : def.h, wl ? 0 : rot).prims, { scale }); };
export const furnitureSprite = (defId, rot = 0, on = false) => memo(furnKey(defId, rot, on), () => makeFurn(defId, rot, on));
export const thingSprite = (t) => memo(thingKey(t), () => renderModel(thingModel(t).prims, { scale: SC }));
export const buildingSprite = (b) => memo(`b:${b.id}`, () => renderModel(buildingModel(b).prims, { pad: 8, scale: SC }));
export const treeSprite = (v = 0) => memo(`tree:${v}`, () => renderModel(treeModel(v).prims, { scale: SC }));
// Everything the tileset exporter bakes into public/assets/tileset.png (characters stay procedural: they are recoloured per player)
export function* tilesetJobs(scale = SC) {
  for (const d of Object.values(DEFS)) if (d.type === 'furniture') { const wl = d.layer === 'wall'; const toggles = d.interact === 'toggle' || d.interact === 'music'; for (let r = 0; r < (wl ? 1 : 4); r++) for (const on of toggles ? [false, true] : [false]) yield [furnKey(d.id, r, on), () => makeFurn(d.id, r, on, scale)]; }
  for (let v = 0; v < 3; v++) yield [`tree:${v}`, () => renderModel(treeModel(v).prims, { scale })];
  const seen = new Set(); for (const t of [...OUTDOOR_THINGS, ...Object.values(INTERIORS).flatMap(i => i.things)]) { const k = thingKey(t); if (seen.has(k) || ['postcard', 'fish'].includes(t.k)) continue; seen.add(k); yield [k, () => renderModel(thingModel(t).prims, { scale })]; }
  for (const b of BUILDINGS) yield [`b:${b.id}`, () => renderModel(buildingModel(b).prims, { pad: 8, scale })];
}
export function characterSprite(look, dir, frame, sit) {
  const key = `c:${look.body}.${look.skin}.${look.hairStyle}.${look.hairColor}.${look.topColor}.${look.bottomColor}.${look.shoeColor}.${look.height}.${look.top}.${look.bottom}.${look.shoes}.${look.hat}.${look.glasses}.${look.back}.${look.acc}.${look.full}:${dir & 3}:${frame & 3}:${sit ? 1 : 0}`;
  if (cache.size > 900) { for (const k of cache.keys()) if (k.startsWith('c:')) cache.delete(k); }
  return memo(key, () => renderCharacter(look || {}, dir, frame, sit, 1), false);
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
const BASE_LOOK = { body: 1, skin: 2, hairStyle: 1, hairColor: 1, topColor: 4, bottomColor: 6, shoeColor: 7, top: 'top_basic', bottom: 'bottom_basic', shoes: 'shoes_basic' };
// Thumbnail for any inventory item: furniture sprite, a mannequin wearing the cosmetic, or null (caller falls back to its emoji).
export function itemThumb(defId, size = 56) {
  const def = DEFS[defId]; if (!def) return null;
  try {
    if (def.type === 'furniture') return furnitureThumb(defId, size);
    if (def.type === 'cosmetic' && def.slot) {
      const look = { ...BASE_LOOK, [def.slot]: defId }; const s = characterSprite(look, 0, 0, false); const head = def.slot === 'hat' || def.slot === 'glasses';
      const cv = document.createElement('canvas'); cv.width = cv.height = size; const c = cv.getContext('2d'); const w = s.sw / s.s, h = s.sh / s.s;
      const sy0 = head ? 0 : 0, sh = head ? h * 0.44 : h; const k = Math.min((size - 4) / w, (size - 4) / sh) * (head ? 1.0 : 1);
      c.drawImage(s.img, s.sx, s.sy + sy0 * s.s, s.sw, sh * s.s, (size - w * k) / 2, (size - sh * k) / 2, w * k, sh * k); return cv;
    }
  } catch (e) { /* fall through to emoji */ }
  return null;
}
