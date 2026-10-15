import { S, bus, fmt } from './state.js';
import { itemThumb } from './sprites.js';
import { DEFS, RARITY_COLOR } from '/shared/content.js';
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v; else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v); else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v; else if (v === true) el.setAttribute(k, ''); else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) { if (kid == null || kid === false) continue; el.append(kid.nodeType ? kid : document.createTextNode(String(kid))); }
  return el;
}
export const $ = (s, r = document) => r.querySelector(s);
export function toast(text, kind = 'info', ms = 3600) {
  const t = h('div', { class: 'toast ' + kind }, text); $('#toasts').append(t); setTimeout(() => t.remove(), ms); while ($('#toasts').children.length > 5) $('#toasts').firstChild.remove();
}
// ---- floating panels ----
const panels = new Map(); let z = 10;
export function openPanel(id, title, bodyFn, { x, y, w, onClose, modal } = {}) {
  closePanel(id, true);
  const body = h('div', { class: 'body' }); const head = h('header', {}, h('span', {}, title), h('button', { class: 'x', onclick: () => closePanel(id) }, '✕'));
  const el = h('div', { class: 'panel', style: { left: (x ?? Math.max(10, innerWidth / 2 - (w || 520) / 2 + panels.size * 18)) + 'px', top: (y ?? 70 + panels.size * 16) + 'px', width: (w ? w + 'px' : 'auto'), zIndex: ++z } }, head, body);
  el.addEventListener('mousedown', () => { el.style.zIndex = ++z; });
  let drag = null; head.addEventListener('mousedown', (e) => { if (e.target.tagName === 'BUTTON') return; drag = [e.clientX - el.offsetLeft, e.clientY - el.offsetTop]; });
  addEventListener('mousemove', (e) => { if (drag) { el.style.left = (e.clientX - drag[0]) + 'px'; el.style.top = Math.max(0, e.clientY - drag[1]) + 'px'; } }); addEventListener('mouseup', () => { drag = null; });
  $('#panels').append(el); const p = { el, body, onClose, id, title: head.firstChild }; panels.set(id, p);
  const render = () => { body.replaceChildren(...[].concat(bodyFn(p) || [])); }; p.render = render; render();
  return p;
}
export function closePanel(id, silent) { const p = panels.get(id); if (!p) return; p.el.remove(); panels.delete(id); if (!silent) p.onClose?.(); }
export const panelOpen = (id) => panels.has(id);
export const rerender = (id) => panels.get(id)?.render();
export const closeAll = () => { for (const id of [...panels.keys()]) closePanel(id); };
export const anyPanelOpen = () => panels.size > 0;
export function confirmBox(text, onYes, yesLabel = 'Confirm') {
  openPanel('confirm', 'Please confirm', (p) => h('div', { class: 'col', style: { width: '320px' } }, h('div', {}, text), h('div', { class: 'row' }, h('button', { class: 'btn alt grow', onclick: () => { closePanel('confirm'); onYes(); } }, yesLabel), h('button', { class: 'btn ghost grow', onclick: () => closePanel('confirm') }, 'Cancel'))), { w: 340 });
}
export function promptBox(title, label, def, onOk) {
  const input = h('input', { type: 'text', value: def || '' });
  openPanel('prompt', title, () => h('div', { class: 'col', style: { width: '300px' } }, h('label', {}, label), input, h('button', { class: 'btn', onclick: () => { closePanel('prompt'); onOk(input.value); } }, 'OK')), { w: 330 }); setTimeout(() => input.focus(), 30);
}
export const itemName = (d) => DEFS[d]?.name || d;
export function itemCard(d, { qty, price, own, onClick, sel, extra, fav, onFav } = {}) {
  const def = DEFS[d] || { emoji: '❓', name: d, rarity: 'common' };
  return h('div', { class: 'item rar-' + def.rarity + (sel ? ' sel' : ''), title: `${def.name} (${def.rarity})${def.w ? ` — ${def.w}×${def.h}` : ''}`, onclick: onClick },
    qty > 1 ? h('span', { class: 'qty' }, '×' + qty) : null, own ? h('span', { class: 'own' }, '✓ ' + own) : null,
    h('div', { class: 'em', style: def.color ? { filter: 'none' } : {} }, itemThumb(d) || def.emoji), h('div', { class: 'nm' }, def.name), price != null ? h('div', { class: 'pr' }, '🪙 ' + fmt(price)) : null, extra,
    onFav ? h('span', { class: 'fav' + (fav ? ' on' : ''), onclick: (e) => { e.stopPropagation(); onFav(); } }, '★') : null);
}
export const rarityChip = (r) => h('span', { class: 'chip', style: { background: RARITY_COLOR[r] + '66' } }, r);
