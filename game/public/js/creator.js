import { h, $ } from './ui.js';
import { drawChar } from './art.js';
import { SKIN_COLORS, HAIR_COLORS, CLOTH_COLORS, HAIR_STYLES, BODIES } from '/shared/content.js';

export const defaultLook = () => ({ body: 1, skin: 2, hairStyle: 1, hairColor: 1, eyes: 0, topColor: 0, bottomColor: 6, shoeColor: 7, height: 0, top: 'top_basic', bottom: 'bottom_basic', shoes: 'shoes_basic', hat: null, glasses: null, back: null, acc: null, full: null });
export const randomLook = () => { const r = (n) => Math.floor(Math.random() * n); return { ...defaultLook(), body: r(3), skin: r(8), hairStyle: r(10), hairColor: r(10), topColor: r(10), bottomColor: r(10), shoeColor: r(10), height: r(11) - 5 }; };

// Character creator widget. look is mutated live; `onChange` fires on every edit.
export function creatorWidget(look, { onChange, appearanceOnly = true } = {}) {
  const cv = h('canvas', { width: 260, height: 330, class: 'avatar-prev' }); const dirs = [0, 1, 2, 3]; let d = 0, t0 = 0;
  const draw = () => { const c = cv.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 260, 330); c.save(); c.translate(130, 285); c.scale(4.6, 4.6); drawChar(c, look, 0, 0, { dir: d, walk: 0 }); c.restore(); };
  const changed = () => { draw(); onChange?.(look); }; changed();
  const sw = (arr, key) => h('div', { class: 'swatches' }, arr.map((col, i) => h('div', { class: 'sw' + (look[key] === i ? ' on' : ''), style: { background: col }, onclick: (e) => { look[key] = i; e.target.parentNode.querySelectorAll('.sw').forEach((s, j) => s.classList.toggle('on', j === i)); changed(); } })));
  const opts = (items, key) => h('div', { class: 'row wrap' }, items.map((n, i) => h('button', { class: 'tab' + (look[key] === i ? ' on' : ''), onclick: (e) => { look[key] = i; e.target.parentNode.querySelectorAll('.tab').forEach((s, j) => s.classList.toggle('on', j === i)); changed(); } }, n)));
  const slider = h('input', { type: 'range', min: -10, max: 10, value: look.height || 0, oninput: (e) => { look.height = +e.target.value; changed(); } });
  const controls = h('div', { class: 'col grow', style: { minWidth: '320px' } },
    h('b', {}, 'Body type'), opts(BODIES, 'body'), h('b', {}, 'Height'), slider,
    h('b', {}, 'Skin tone'), sw(SKIN_COLORS, 'skin'), h('b', {}, 'Hair style'), opts(HAIR_STYLES, 'hairStyle'), h('b', {}, 'Hair color'), sw(HAIR_COLORS, 'hairColor'),
    appearanceOnly ? [h('b', {}, 'Shirt color'), sw(CLOTH_COLORS, 'topColor'), h('b', {}, 'Pants color'), sw(CLOTH_COLORS, 'bottomColor'), h('b', {}, 'Shoe color'), sw(CLOTH_COLORS, 'shoeColor')] : null);
  const turn = h('button', { class: 'btn sm ghost', onclick: () => { d = (d + 1) % 4; draw(); } }, '⟳ Turn');
  const rnd = h('button', { class: 'btn sm alt', onclick: () => { Object.assign(look, randomLook(), { hat: look.hat, glasses: look.glasses, back: look.back, acc: look.acc, full: look.full, top: look.top, bottom: look.bottom, shoes: look.shoes }); render(); changed(); } }, '🎲 Randomize');
  const root = h('div', { class: 'row wrap', style: { alignItems: 'flex-start' } }, h('div', { class: 'col' }, cv, h('div', { class: 'row' }, turn, rnd)), controls);
  const render = () => { const n = creatorWidget(look, { onChange, appearanceOnly }); root.replaceWith(n.root); Object.assign(api, n); }; const api = { root, redraw: draw };
  return api;
}
