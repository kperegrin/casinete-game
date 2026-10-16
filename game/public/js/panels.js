import { itemThumb } from './sprites.js';
// Inventory, shops, Town Hall, property management, settings, phone, host panel, misc dialogs.
import { S, bus, fmt, saveSettings } from './state.js';
import { cmd, errText, disconnect } from './net.js';
import { h, $, toast, openPanel, closePanel, rerender, panelOpen, confirmBox, promptBox, itemCard, itemName, rarityChip, closeAll } from './ui.js';
import { world } from './world.js';
import { sfx, getVol, setVol, BUSES } from './audio.js';
import { DEFS, SHOPS, PROPERTIES, UPGRADES, ROLES, FLOOR_COLORS, EMOTES, ACHIEVEMENTS, RARITY_COLOR, RARITIES, xpForLevel, sellValue, SKIN_COLORS, CLOTH_COLORS } from '/shared/content.js';
import { creatorWidget } from './creator.js';

const catOf = (d) => { const def = DEFS[d]; return def.type === 'furniture' ? def.cat : def.type === 'cosmetic' ? 'Cosmetics' : def.type === 'collectible' ? 'Collectibles' : 'Misc'; };
const sorters = { name: (a, b) => DEFS[a.d].name.localeCompare(DEFS[b.d].name), rarity: (a, b) => RARITIES.indexOf(DEFS[b.d].rarity) - RARITIES.indexOf(DEFS[a.d].rarity), value: (a, b) => (DEFS[b.d].price || 0) - (DEFS[a.d].price || 0), newest: (a, b) => b.id - a.id };
const callErr = (r) => { toast(errText(r), 'warn'); sfx('error'); };

export function installPanels() {
  bus.on('openInventory', () => openInventory()); bus.on('openPhone', () => openPhone()); bus.on('openEmotes', () => openEmotes()); bus.on('openSettings', () => openSettings()); bus.on('openHost', () => openHost());
  bus.on('inv', () => { rerender('inv'); rerender('shop'); rerender('storage'); }); bus.on('me', () => { rerender('shop'); rerender('inv'); rerender('prop'); rerender('props'); rerender('ach'); });
  bus.on('props', () => { rerender('props'); rerender('prop'); });
  Object.assign(world.openers, {
    shop: (r) => openShop(r.shop), salon: () => openSalon(), props: () => openTownHall(), ach: () => openAch(), board: () => openBoard(), storage: (r) => openStorage(r), npc: (n, r) => npcDialog(n, r),
    vacant: (id) => { const p = S.props.find(x => x.id === id); openPanel('vacant', p?.name || 'For sale', () => h('div', { class: 'col', style: { width: '300px' } }, h('div', {}, 'This home is for sale! Visit the Town Hall (north-west) to buy it.'), p ? h('div', { class: 'muted' }, `${p.tier} · ${p.w}×${p.h} tiles · 🪙 ${fmt(p.price)}`) : null, h('button', { class: 'btn', onclick: () => closePanel('vacant') }, 'OK')), { w: 330 }); },
    ring: (id) => confirmBox('The door is closed. Ring the doorbell?', async () => { const r = await cmd('prop.ring', { id }); toast(r.ok ? '🔔 You rang the doorbell. Wait for an answer…' : errText(r)); }, '🔔 Ring'),
    cashier: (r) => bus.emit('openCashier', r),
  });
  window.addEventListener('keydown', (e) => { if (e.code === 'KeyM' && S.me && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) { world.cam.zoom = S.loc === 'world' ? 1.0 : 1.1; } });
  bus.on('welcome', () => { if (S.isHost) toast('You are the Host: press F2 for the Host panel.', 'info', 6000); });
}

// ---------------- Inventory ----------------
let invState = { tab: 'items', cat: 'All', q: '', sort: 'newest', sel: null };
export function openInventory(tab) {
  if (tab) invState.tab = tab; if (panelOpen('inv')) return closePanel('inv');
  openPanel('inv', '🎒 Inventory', () => {
    const items = S.inv.filter(i => i.loc === 'inv'); const groups = new Map(); for (const i of items) { (groups.get(i.d) || groups.set(i.d, []).get(i.d)).push(i); }
    const tabs = h('div', { class: 'tabs' }, [['items', '🎒 Items'], ['wardrobe', '👕 Wardrobe'], ['mail', '📬 Mailbox (' + S.inv.filter(i => i.loc === 'mail').length + ')'], ['bp', '📐 Blueprints']].map(([k, n]) => h('button', { class: 'tab' + (invState.tab === k ? ' on' : ''), onclick: () => { invState.tab = k; rerender('inv'); } }, n)));
    if (invState.tab === 'wardrobe') return [tabs, wardrobe()];
    if (invState.tab === 'mail') return [tabs, mailbox()];
    if (invState.tab === 'bp') return [tabs, blueprints()];
    const cats = ['All', '★ Favorites', ...new Set(items.map(i => catOf(i.d)))];
    const q = invState.q.toLowerCase(); let list = [...groups.entries()].map(([d, arr]) => ({ d, arr, id: Math.max(...arr.map(x => x.id)) })).filter(g => (invState.cat === 'All' || (invState.cat === '★ Favorites' ? S.me.favorites.includes(g.d) : catOf(g.d) === invState.cat)) && (!q || DEFS[g.d].name.toLowerCase().includes(q) || (DEFS[g.d].cat || '').toLowerCase().includes(q)));
    list.sort((a, b) => sorters[invState.sort](a, b));
    const sel = invState.sel && groups.get(invState.sel) ? invState.sel : null;
    const detail = sel ? invDetail(sel, groups.get(sel)) : h('div', { class: 'muted', style: { padding: '12px' } }, 'Select an item to see details, place it, equip it, favorite it or gift it.');
    const search = h('input', { type: 'text', placeholder: '🔍 Search…', value: invState.q, oninput: (e) => { invState.q = e.target.value; clearTimeout(invState.t); invState.t = setTimeout(() => { rerender('inv'); const i = $('#panels input[placeholder^="🔍"]'); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); }, 150); } });
    const sort = h('select', { onchange: (e) => { invState.sort = e.target.value; rerender('inv'); } }, [['newest', 'Newest'], ['name', 'Name'], ['rarity', 'Rarity'], ['value', 'Value']].map(([v, n]) => h('option', { value: v, selected: invState.sort === v }, 'Sort: ' + n)));
    return [tabs, h('div', { class: 'row', style: { marginBottom: '8px' } }, search, sort, h('span', { class: 'muted' }, `${items.length} items`)),
      h('div', { class: 'tabs' }, cats.map(c => h('button', { class: 'tab' + (invState.cat === c ? ' on' : ''), onclick: () => { invState.cat = c; rerender('inv'); } }, c))),
      h('div', { class: 'row', style: { alignItems: 'flex-start' } }, h('div', { class: 'grid grow', style: { maxHeight: '48vh', overflow: 'auto', minWidth: '420px' } }, list.length ? list.map(g => itemCard(g.d, { qty: g.arr.length, sel: sel === g.d, fav: S.me.favorites.includes(g.d), onFav: () => cmd('fav.toggle', { def: g.d }), onClick: () => { invState.sel = g.d; rerender('inv'); sfx('click'); } })) : h('div', { class: 'muted' }, 'Nothing here yet — visit the shops on Market Street!')), h('div', { style: { width: '230px' } }, detail))];
  }, { w: 760, x: 40, y: 60 });
}
function invDetail(d, arr) {
  const def = DEFS[d]; const it = arr[0];
  return h('div', { class: 'card col', style: { padding: '12px' } }, h('div', { style: { fontSize: '54px', textAlign: 'center' } }, itemThumb(def.id, 110) || def.emoji), h('b', {}, def.name), h('div', {}, rarityChip(def.rarity), ' ', def.type), def.w ? h('div', { class: 'muted' }, `Size ${def.w}×${def.h} · ${def.layer}${def.interact ? ' · ' + def.interact : ''}`) : null,
    h('div', { class: 'muted' }, `Owned: ${arr.length}${def.price ? ' · value 🪙' + fmt(sellValue(def)) : ''}${it.ser ? ' · #' + it.ser : ''}`),
    def.type === 'furniture' ? h('button', { class: 'btn', onclick: () => { if (!S.home) return toast('Go into a home you can build in, then press B.', 'warn'); closePanel('inv'); bus.emit('placeItem', { d }); } }, '🔨 Place in home') : null,
    def.type === 'cosmetic' ? h('button', { class: 'btn alt', onclick: () => wear(d) }, '👕 Wear') : null,
    h('button', { class: 'btn sm ghost', onclick: () => bus.emit('giftItem', { id: it.id, d }) }, '🎁 Gift…'), sellValue(def) ? h('button', { class: 'btn sm ghost', onclick: async () => { const r = await cmd('shop.sell', { id: it.id, remote: false }); if (r.ok) { toast(`Sold for 🪙${r.got}`, 'good'); sfx('coin'); } else callErr(r); } }, `💰 Sell 🪙${sellValue(def)} (at shops)`) : null);
}
async function wear(d) {
  const def = DEFS[d]; const look = { ...S.me.look }; look[def.slot] = d; if (def.slot === 'full') { look.top = null; look.bottom = null; } if ((def.slot === 'top' || def.slot === 'bottom') && look.full) look.full = null;
  const r = await cmd('look.set', { look, mode: 'wardrobe' }); if (r.ok) { sfx('click'); toast('Looking good!', 'good'); } else callErr(r);
}
function wardrobe() {
  const eqIds = S.inv.filter(i => i.loc === 'eq'); const owned = S.inv.filter(i => i.loc === 'inv' || i.loc === 'eq');
  const look = S.me.look; const slots = ['hat', 'glasses', 'top', 'bottom', 'shoes', 'full', 'back', 'acc'];
  const cv = h('canvas', { width: 150, height: 200, class: 'avatar-prev' }); import('./art.js').then(({ drawChar }) => { const c = cv.getContext('2d'); c.translate(75, 175); c.scale(3.2, 3.2); drawChar(c, look, 0, 0, { dir: 0 }); });
  const swatch = (key) => h('div', { class: 'swatches' }, CLOTH_COLORS.map((col, i) => h('div', { class: 'sw' + (look[key] === i ? ' on' : ''), style: { background: col }, onclick: async () => { const r = await cmd('look.set', { look: { ...look, [key]: i }, mode: 'wardrobe' }); if (!r.ok) callErr(r); } })));
  return h('div', { class: 'row', style: { alignItems: 'flex-start', minWidth: '600px' } }, h('div', { class: 'col' }, cv, h('small', { class: 'muted' }, 'Shirt / pants / shoe colors'), swatch('topColor'), swatch('bottomColor'), swatch('shoeColor')),
    h('div', { class: 'col grow', style: { maxHeight: '55vh', overflow: 'auto' } }, slots.map(slot => {
      const mine = [...new Set(owned.filter(i => DEFS[i.d].slot === slot).map(i => i.d))]; const free = Object.values(DEFS).filter(d => d.free && d.slot === slot).map(d => d.id);
      return h('div', {}, h('b', {}, slot.toUpperCase()), h('div', { class: 'grid', style: { marginTop: '4px' } }, h('div', { class: 'item' + (!look[slot] ? ' sel' : ''), onclick: async () => { const l = { ...look, [slot]: null }; const r = await cmd('look.set', { look: l, mode: 'wardrobe' }); if (!r.ok) callErr(r); } }, h('div', { class: 'em' }, '∅'), h('div', { class: 'nm' }, 'None')),
        [...free, ...mine].map(d => itemCard(d, { sel: look[slot] === d, onClick: () => wear(d) }))));
    })));
}
function mailbox() {
  const mail = S.inv.filter(i => i.loc === 'mail');
  return h('div', { class: 'col', style: { minWidth: '420px' } }, mail.length ? [h('div', { class: 'grid' }, mail.map(i => itemCard(i.d))), h('button', { class: 'btn', onclick: async () => { const r = await cmd('mail.claim'); if (r.ok) toast(`Collected ${r.n} item(s)!`, 'good'); else callErr(r); } }, 'Collect all')] : h('div', { class: 'muted' }, 'No mail. Gifts and returned items land here.'));
}
function blueprints() {
  const bps = S.me.blueprints;
  return h('div', { class: 'col', style: { minWidth: '420px' } }, h('div', { class: 'muted' }, 'Save a rectangle of your home in Build mode (Blueprint tool). Apply it anywhere — missing items are listed with prices.'),
    bps.length ? bps.map(bp => h('div', { class: 'row card', style: { padding: '8px' } }, h('b', { class: 'grow' }, `📐 ${bp.name}`), h('span', { class: 'muted' }, `${bp.w}×${bp.h} · ${bp.items.length} items · ${bp.walls.length} walls`), h('button', { class: 'btn sm', onclick: () => { if (!S.home) return toast('Enter a home first.', 'warn'); closePanel('inv'); bus.emit('applyBlueprint', bp); } }, 'Apply'), h('button', { class: 'btn sm bad', onclick: () => cmd('bp.delete', { id: bp.id }) }, '🗑'))) : h('div', { class: 'muted' }, 'No blueprints saved yet.'));
}

// ---------------- Shops ----------------
let shopState = { cat: 'All', q: '', sort: 'default', rar: 'any', afford: false, notOwned: false, sel: null, qty: 1 };
export async function openShop(shopId, remote = false) {
  const r = await cmd('shop.view', { shop: shopId, remote }); if (!r.ok) return callErr(r); let data = r; shopState.sel = null; shopState.qty = 1; shopState.cat = 'All';
  const reload = async () => { const rr = await cmd('shop.view', { shop: shopId, remote }); if (rr.ok) { data = rr; rerender('shop'); } };
  const sub = bus.on('me', () => reload()); 
  openPanel('shop', `🛒 ${r.shop.name}${r.shop.remote ? ' (phone catalog +10%)' : ''}`, () => {
    const E = data.entries; const cat = (e) => { const d = DEFS[e.def]; return d.type === 'furniture' ? d.cat : d.type === 'cosmetic' ? d.slot : 'Other'; };
    const cats = ['All', ...new Set(E.map(cat))]; const q = shopState.q.toLowerCase();
    let list = E.filter(e => (shopState.cat === 'All' || cat(e) === shopState.cat) && (!q || DEFS[e.def].name.toLowerCase().includes(q)) && (shopState.rar === 'any' || DEFS[e.def].rarity === shopState.rar) && (!shopState.afford || e.price <= S.me.coins) && (!shopState.notOwned || !e.owned));
    if (shopState.sort === 'price') list.sort((a, b) => a.price - b.price); else if (shopState.sort === 'priceD') list.sort((a, b) => b.price - a.price); else if (shopState.sort === 'rarity') list.sort((a, b) => RARITIES.indexOf(DEFS[b.def].rarity) - RARITIES.indexOf(DEFS[a.def].rarity));
    const sel = list.find(e => e.def === shopState.sel); const def = sel && DEFS[sel.def];
    const preview = sel ? h('div', { class: 'card col', style: { width: '230px' } }, h('div', { style: { fontSize: '70px', textAlign: 'center', background: (def.color || '#eee') + '33', borderRadius: '12px' } }, itemThumb(def.id, 150) || def.emoji), h('b', { style: { fontSize: '1.1rem' } }, def.name), h('div', {}, rarityChip(def.rarity), ' ', def.cat || def.slot || def.type),
      def.w ? h('div', { class: 'muted' }, `Size ${def.w}×${def.h} tiles${def.interact ? ' · ' + def.interact : ''}`) : null, sel.owned ? h('div', { class: 'good' }, `✓ You own ${sel.owned}`) : null, sel.stock != null ? h('div', { class: sel.stock ? '' : 'bad' }, sel.stock ? `Only ${sel.stock} left!` : 'Sold out') : null, sel.perPlayer ? h('div', { class: 'muted' }, `Limit ${sel.perPlayer} per player`) : null, sel.minLevel ? h('div', { class: S.me.level >= sel.minLevel ? 'muted' : 'bad' }, `Requires level ${sel.minLevel}`) : null,
      h('div', { class: 'row' }, h('button', { class: 'btn sm ghost', onclick: () => { shopState.qty = Math.max(1, shopState.qty - 1); rerender('shop'); } }, '−'), h('b', {}, shopState.qty), h('button', { class: 'btn sm ghost', onclick: () => { shopState.qty = Math.min(20, shopState.qty + 1); rerender('shop'); } }, '+')),
      h('button', { class: 'btn', disabled: sel.stock === 0 || sel.price * shopState.qty > S.me.coins, onclick: () => buy(sel, shopId, remote, reload) }, `Buy 🪙 ${fmt(sel.price * shopState.qty)}`), sel.price * shopState.qty > S.me.coins ? h('small', { class: 'bad' }, 'Not enough Coins') : null,
      def.type === 'cosmetic' ? h('button', { class: 'btn sm alt', onclick: () => tryOn(sel.def) }, '👕 Try on (preview)') : null) : h('div', { class: 'muted', style: { width: '230px' } }, 'Select an item to preview it.');
    return [h('div', { class: 'row', style: { marginBottom: '8px' } }, h('input', { type: 'text', placeholder: '🔍 Search…', value: shopState.q, oninput: (e) => { shopState.q = e.target.value; clearTimeout(shopState.t); shopState.t = setTimeout(() => { rerender('shop'); const i = $('#panels input[placeholder^="🔍"]:last-of-type'); }, 200); } }),
      h('select', { onchange: (e) => { shopState.sort = e.target.value; rerender('shop'); } }, [['default', 'Default'], ['price', 'Price ↑'], ['priceD', 'Price ↓'], ['rarity', 'Rarity']].map(([v, n]) => h('option', { value: v, selected: shopState.sort === v }, n))),
      h('select', { onchange: (e) => { shopState.rar = e.target.value; rerender('shop'); } }, ['any', ...RARITIES].map(v => h('option', { value: v, selected: shopState.rar === v }, v === 'any' ? 'Any rarity' : v))),
      h('label', {}, h('input', { type: 'checkbox', checked: shopState.afford, onchange: (e) => { shopState.afford = e.target.checked; rerender('shop'); } }), ' affordable'), h('label', {}, h('input', { type: 'checkbox', checked: shopState.notOwned, onchange: (e) => { shopState.notOwned = e.target.checked; rerender('shop'); } }), ' not owned'), h('span', { class: 'grow' }), h('b', {}, '🪙 ' + fmt(S.me.coins))),
      h('div', { class: 'tabs' }, cats.map(c => h('button', { class: 'tab' + (shopState.cat === c ? ' on' : ''), onclick: () => { shopState.cat = c; rerender('shop'); } }, c))),
      h('div', { class: 'row', style: { alignItems: 'flex-start' } }, h('div', { class: 'grid grow', style: { maxHeight: '50vh', overflow: 'auto', minWidth: '460px' } }, list.map(e => itemCard(e.def, { price: e.price, own: e.owned || null, sel: shopState.sel === e.def, extra: e.stock != null ? h('small', { class: e.stock ? 'muted' : 'bad' }, e.stock ? `${e.stock} left` : 'SOLD OUT') : null, onClick: () => { shopState.sel = e.def; shopState.qty = 1; rerender('shop'); sfx('click'); } })), !list.length ? h('div', { class: 'muted' }, 'No items match.') : null), preview)];
  }, { w: 800, x: 30, y: 50, onClose: () => sub() });
}
function tryOn(d) { const def = DEFS[d]; const look = { ...S.me.look, [def.slot]: d }; openPanel('tryon', 'Try on: ' + def.name, () => { const cv = h('canvas', { width: 160, height: 210, class: 'avatar-prev' }); import('./art.js').then(({ drawChar }) => { const c = cv.getContext('2d'); c.translate(80, 185); c.scale(3.4, 3.4); drawChar(c, look, 0, 0, { dir: 0 }); }); return h('div', { class: 'col' }, cv, h('small', { class: 'muted' }, 'Preview only — buy it to wear it.')); }, { w: 190, x: 860, y: 90 }); }
function buy(sel, shopId, remote, reload) {
  const def = DEFS[sel.def]; const total = sel.price * shopState.qty; const go = async () => { const r = await cmd('shop.buy', { shop: shopId, def: sel.def, qty: shopState.qty, price: sel.price, remote }); if (r.ok) { sfx('coin'); toast(`Bought ${shopState.qty}× ${def.name} for 🪙${fmt(r.spent)}`, 'good'); reload(); } else { callErr(r); reload(); } };
  if (total >= 2000 || ['rare', 'epic', 'legendary', 'collectible'].includes(def.rarity)) confirmBox(`Buy ${shopState.qty}× ${def.name} for 🪙 ${fmt(total)}? Balance after: 🪙 ${fmt(S.me.coins - total)}`, go, 'Buy'); else go();
}

// ---------------- Salon ----------------
function openSalon() {
  const look = { ...S.me.look }; const fee = S.me.stats?.salonFreeUsed ? 200 : 0;
  openPanel('salon', '💇 Salon & Mirror', () => h('div', { class: 'col' }, h('div', { class: 'muted' }, fee ? `Changing body, skin or hair costs 🪙${fee}. Clothes are free in your Wardrobe.` : 'Your first style change is free!'), creatorWidget(look, { appearanceOnly: false }).root,
    h('button', { class: 'btn', onclick: async () => { const r = await cmd('look.set', { look: { ...S.me.look, body: look.body, skin: look.skin, hairStyle: look.hairStyle, hairColor: look.hairColor, height: look.height }, mode: 'salon' }); if (r.ok) { closePanel('salon'); toast(r.fee ? `New look! (−🪙${r.fee})` : 'New look!', 'good'); localStorage.setItem('casinete.look', JSON.stringify({ ...S.me.look, ...look })); } else callErr(r); } }, '✔ Apply')), { w: 760, y: 40 });
}

// ---------------- Town Hall / properties ----------------
let propState = { tab: 'browse', filter: 'all' };
export function openTownHall() {
  openPanel('props', '🏠 Property Office', () => {
    const tabs = h('div', { class: 'tabs' }, [['browse', 'Available lots'], ['mine', 'My properties']].map(([k, n]) => h('button', { class: 'tab' + (propState.tab === k ? ' on' : ''), onclick: () => { propState.tab = k; rerender('props'); } }, n)));
    if (propState.tab === 'mine') { const mine = S.props.filter(p => p.owner === S.me.id); return [tabs, mine.length ? mine.map(p => propRow(p, true)) : h('div', { class: 'muted' }, 'You do not own a property yet.')]; }
    const filt = h('select', { onchange: (e) => { propState.filter = e.target.value; rerender('props'); } }, [['all', 'All'], ['free', 'For sale'], ['owned', 'Occupied (visit)']].map(([v, n]) => h('option', { value: v, selected: propState.filter === v }, n)));
    const list = S.props.filter(p => propState.filter === 'all' || (propState.filter === 'free' ? !p.owner : !!p.owner));
    return [tabs, h('div', { class: 'row' }, filt, h('span', { class: 'muted' }, 'Your first Studio is free. Max 5 properties.')), h('div', { class: 'col', style: { maxHeight: '55vh', overflow: 'auto', marginTop: '8px' } }, list.map(p => propRow(p, false)))];
  }, { w: 640, y: 50 });
}
function propRow(p, mine) {
  const price = (!S.me.stats?.freeStudioUsed && p.tier === 'Studio') ? 0 : p.price;
  return h('div', { class: 'card row', style: { padding: '10px' } }, h('div', { style: { fontSize: '30px' } }, { Studio: '🏢', Cottage: '🏡', 'Family House': '🏠', Villa: '🏘️', Mansion: '🏰' }[p.tier]),
    h('div', { class: 'grow' }, h('b', {}, p.name), ' ', p.owner ? h('span', { class: 'chip ' + (p.owner === S.me.id ? 'tag-you' : 'tag-owner') }, p.owner === S.me.id ? 'yours' : p.ownerName) : h('span', { class: 'chip good' }, 'for sale'), p.dusty ? h('span', { class: 'chip bad' }, 'dusty') : null,
      h('div', { class: 'muted' }, `${p.tier} · ${p.w}×${p.h} · up to ${p.cap} objects · upkeep 🪙${p.upkeep}${p.minLevel ? ` · Lv ${p.minLevel}+` : ''}${p.style ? ` · style ${'★'.repeat(p.style.stars)}${'☆'.repeat(5 - p.style.stars)} · ❤ ${p.likes}` : ''}`)),
    !p.owner && !mine ? h('button', { class: 'btn', onclick: () => confirmBox(`Buy ${p.name} for ${price ? '🪙 ' + fmt(price) : 'FREE (first studio)'}?`, async () => { const r = await cmd('prop.buy', { id: p.id }); if (r.ok) { sfx('coin'); toast('Congratulations on your new home!', 'good'); closePanel('props'); } else callErr(r); }, 'Buy') }, price ? `Buy 🪙${fmt(price)}` : 'Claim FREE') : null,
    mine ? h('button', { class: 'btn alt', onclick: () => openManage(p.id) }, 'Manage') : null);
}
export async function openManage(id) {
  const r = await cmd('prop.info', { id }); if (!r.ok) return callErr(r); let info = r.info; let tab = 'overview';
  const reload = async () => { const rr = await cmd('prop.info', { id }); if (rr.ok) { info = rr.info; rerender('prop'); } };
  openPanel('prop', `🏠 ${info.name}`, () => {
    const tabs = h('div', { class: 'tabs' }, [['overview', 'Overview'], ['people', 'People & roles'], ['upgrades', 'Upgrades'], ['log', 'History']].map(([k, n]) => h('button', { class: 'tab' + (tab === k ? ' on' : ''), onclick: () => { tab = k; rerender('prop'); } }, n)));
    const mayManage = info.mayManage;
    if (tab === 'overview') return [tabs, h('div', { class: 'col', style: { minWidth: '460px' } },
      h('div', {}, `Objects ${info.count}/${info.cap} · size ${info.w}×${info.h} · style ${'★'.repeat(info.style.stars)}${'☆'.repeat(5 - info.style.stars)} (score ${info.style.score}, ${info.style.variety} types) · ❤ ${info.likes}`),
      h('div', { class: info.upkeep.arrears ? 'bad' : 'muted' }, `Upkeep 🪙${info.upkeepCost} per period · overdue ${info.upkeep.arrears}/4${info.upkeep.dusty ? ' — DUSTY (visitors locked out)' : ''}`),
      info.upkeep.arrears && S.loc === 'townhall' ? h('button', { class: 'btn', onclick: async () => { const r = await cmd('prop.pay', { id }); if (r.ok) { toast(`Paid 🪙${r.paid}`, 'good'); reload(); } else callErr(r); } }, 'Pay overdue upkeep') : info.upkeep.arrears ? h('small', { class: 'muted' }, 'Pay at the Town Hall.') : null,
      mayManage ? [h('label', {}, 'Name'), (() => { const i = h('input', { type: 'text', value: info.name, maxlength: 28 }); return h('div', { class: 'row' }, i, h('button', { class: 'btn sm', onclick: async () => { const r = await cmd('prop.rules', { id, name: i.value, rules: info.rules }); toast(r.ok ? 'Saved' : errText(r)); reload(); } }, 'Save')); })(),
        h('label', {}, 'Who can enter?'), h('select', { onchange: async (e) => { const r = await cmd('prop.access', { id, mode: e.target.value }); toast(r.ok ? 'Access updated' : errText(r)); reload(); } }, [['open', '🟢 Open — anyone'], ['friends', '👥 Friends & roles (others ring doorbell)'], ['invite', '🔔 Invite only (doorbell)'], ['locked', '🔒 Locked']].map(([v, n]) => h('option', { value: v, selected: info.access === v }, n))),
        h('label', {}, 'House rules (shown to visitors)'), (() => { const i = h('input', { type: 'text', value: info.rules, maxlength: 200 }); return h('div', { class: 'row' }, i, h('button', { class: 'btn sm', onclick: async () => { await cmd('prop.rules', { id, rules: i.value }); toast('Saved'); } }, 'Save')); })(),
        info.owner === S.me.id ? h('button', { class: 'btn bad', disabled: S.loc !== 'townhall', title: 'Sell at the Town Hall', onclick: () => confirmBox(`Sell ${info.name}? All items go back to their owners' inventories. You get ~70% of the price back.`, async () => { const r = await cmd('prop.sell', { id }); if (r.ok) { toast(`Sold for 🪙${fmt(r.refund)}`, 'good'); sfx('coin'); closePanel('prop'); } else callErr(r); }, 'Sell') }, S.loc === 'townhall' ? '💸 Sell property' : '💸 Sell (at Town Hall)') : null] : null)];
    if (tab === 'people') return [tabs, h('div', { class: 'col', style: { minWidth: '460px' } }, h('table', { class: 't' }, h('tr', {}, h('th', {}, 'Player'), h('th', {}, 'Role'), h('th', {})), info.roles.map(r => h('tr', {}, h('td', {}, r.name), h('td', {}, r.role), mayManage ? h('td', {}, h('button', { class: 'btn sm ghost', onclick: async () => { await cmd('prop.role', { id, name: r.name, role: null }); reload(); } }, 'Remove')) : null)), !info.roles.length ? h('tr', {}, h('td', { colspan: 3, class: 'muted' }, 'No roles assigned. Everyone else is a visitor (or a friend if the owner friended them).')) : null),
      mayManage ? (() => { const n = h('input', { type: 'text', placeholder: 'player name' }); const s = h('select', {}, ROLES.filter(r => r !== 'visitor').map(r => h('option', { value: r }, r))); return h('div', { class: 'row' }, n, s, h('button', { class: 'btn sm', onclick: async () => { const r = await cmd('prop.role', { id, name: n.value, role: s.value }); if (r.ok) { toast('Role set', 'good'); reload(); } else callErr(r); } }, 'Grant')); })() : null,
      h('small', { class: 'muted' }, 'Visitor: enter & use · Friend: + enter when locked · Decorator: + place/recolor own items · Builder: + move/remove anything, walls, floors, blueprints · Co-owner: + invite, kick, roles, upgrades'),
      h('b', {}, 'Banned'), info.ban.map(b => h('div', { class: 'row' }, b.name, h('button', { class: 'btn sm ghost', onclick: async () => { await cmd('prop.unban', { id, pid: b.pid }); reload(); } }, 'Unban'))), mayManage ? (() => { const n = h('input', { type: 'text', placeholder: 'ban player by name' }); return h('div', { class: 'row' }, n, h('button', { class: 'btn sm bad', onclick: async () => { const r = await cmd('prop.ban', { id, name: n.value }); if (r.ok) reload(); else callErr(r); } }, 'Ban')); })() : null)];
    if (tab === 'upgrades') return [tabs, h('div', { class: 'col', style: { minWidth: '460px' } }, Object.values(UPGRADES).map(u => { const tierIdx = ['Studio', 'Cottage', 'Family House', 'Villa', 'Mansion'].indexOf(PROPERTIES[id].tier); const price = u.price(tierIdx); return h('div', { class: 'card row' }, h('div', { class: 'grow' }, h('b', {}, u.name), h('div', { class: 'muted' }, u.id === 'cap100' ? `Raises the object cap (now ${info.cap}).` : `Adds 2 tiles of width (now ${info.w}×${info.h}).`)), h('button', { class: 'btn', onclick: async () => { const r = await cmd('prop.upgrade', { id, kind: u.id }); if (r.ok) { sfx('coin'); toast('Upgraded!', 'good'); reload(); } else callErr(r); } }, `🪙 ${fmt(price)}`)); }))];
    return [tabs, h('div', { style: { minWidth: '460px', maxHeight: '45vh', overflow: 'auto' } }, info.audit.length ? h('table', { class: 't' }, info.audit.map(a => h('tr', {}, h('td', { class: 'muted' }, new Date(a.t).toLocaleTimeString()), h('td', {}, a.name), h('td', {}, a.op), h('td', { class: 'muted' }, JSON.stringify(a.detail || {}).slice(0, 50))))) : h('div', { class: 'muted' }, 'No edits recorded yet (owners/co-owners only).'))];
  }, { w: 560, y: 60 });
}

// ---------------- Achievements / board ----------------
function openAch() {
  openPanel('ach', '🏆 Achievements', () => { const done = Object.values(S.me.ach).filter(a => a.done).length;
    return [h('div', { class: 'row' }, h('b', {}, `${done}/${ACHIEVEMENTS.length} unlocked`), h('span', { class: 'grow' }), h('span', { class: 'muted' }, 'Titles: '), h('select', { onchange: async (e) => { await cmd('title.set', { title: e.target.value || null }); } }, h('option', { value: '' }, '(none)'), S.me.titles.map(t => h('option', { value: t, selected: S.me.title === t }, t)))),
      h('div', { class: 'col', style: { maxHeight: '60vh', overflow: 'auto', minWidth: '440px', marginTop: '8px' } }, ACHIEVEMENTS.map(a => { const rec = S.me.ach[a.id] || { p: 0 }; return h('div', { class: 'card', style: { padding: '8px 10px', opacity: rec.done ? 0.65 : 1 } }, h('div', { class: 'row' }, h('b', { class: 'grow' }, (rec.done ? '✅ ' : '🔘 ') + a.name), h('span', { class: 'muted' }, `🪙${a.coins}${a.stars ? ' ★' + a.stars : ''}${a.title ? ' 🏷' + a.title : ''}`)), h('div', { class: 'muted' }, a.desc), h('div', { class: 'bar' }, h('i', { style: { width: Math.min(100, rec.p / a.target * 100) + '%' } }))); }))];
  }, { w: 520, y: 50 });
}
function openBoard() {
  openPanel('board', '📋 Town Board', () => { const d = S.me.daily; const claimable = d.day !== Math.floor((Date.now() + S.serverOffset) / 86400e3) + (0);
    return h('div', { class: 'col', style: { width: '420px' } }, h('h3', {}, 'Daily reward'), h('div', {}, `Streak: ${d.streak} day(s). Day-7 bonus: +1 ★. Missing a day only lowers the streak by 1.`),
      h('button', { class: 'btn', onclick: async () => { const r = await cmd('daily.claim'); if (r.ok) { sfx('coin'); toast(`Daily reward: 🪙${r.amount} (streak ${r.streak})`, 'good'); rerender('board'); } else toast(r.err === 'already_claimed' ? 'Already claimed today — come back tomorrow!' : errText(r), 'warn'); } }, '🎁 Claim daily reward'),
      h('h3', {}, 'Things to do'), h('ul', { style: { margin: 0, paddingLeft: '18px' } }, ['🎣 Fish at the pier or pond (E at a fishing spot, press Space when the fish bites)', '📦 Deliver parcels for Parcel Pete near the fountain', '📮 Find 10 postcards around town', '🏠 Decorate your home and invite friends', '🐎 Watch the races at Marigold Downs', '🎰 Visit the Grand Casino (fictional Coins only)'].map(t => h('li', {}, t))),
      h('div', { class: 'muted' }, `Postcards found: ${S.me.found.length}/10`));
  }, { w: 450, y: 70 });
}

// ---------------- Storage ----------------
function openStorage(r) {
  let contents = r.contents; const id = r.id;
  openPanel('storage', '🗄️ Storage', () => { const mine = S.inv.filter(i => i.loc === 'inv');
    return h('div', { class: 'row', style: { alignItems: 'flex-start', minWidth: '600px' } },
      h('div', { class: 'col grow' }, h('b', {}, `Inside (${contents.length}/${r.cap})`), h('div', { class: 'grid', style: { maxHeight: '40vh', overflow: 'auto' } }, contents.map(c => itemCard(c.d, { extra: h('small', { class: 'muted' }, 'by ' + (c.o === S.me.id ? 'you' : 'another')), onClick: async () => { const x = await cmd('h.storeOut', { container: id, item: c.id }); if (x.ok) { contents = x.contents; rerender('storage'); } else callErr(x); } })))),
      h('div', { class: 'col grow' }, h('b', {}, 'Your inventory (click to store)'), h('div', { class: 'grid', style: { maxHeight: '40vh', overflow: 'auto' } }, mine.map(i => itemCard(i.d, { onClick: async () => { const x = await cmd('h.storeIn', { container: id, item: i.id }); if (x.ok) { contents = x.contents; rerender('storage'); } else callErr(x); } })))));
  }, { w: 700, y: 60 });
}

// ---------------- NPC dialogue ----------------
function npcDialog(n, r) {
  const act = { shopkeeper: () => { const t = (S.world.interiors[S.loc]?.things || []).find(t => t.k === 'shop' && Math.hypot(t.x - n.x, t.y - n.y) < 2.5); return t ? ['🛒 Browse wares', () => openShop(t.shop)] : null; }, agent: () => ['🏠 Browse properties', openTownHall], cashier: () => ['💰 Cashier & limits', () => world.openers.cashier({})], courier: () => ['📦 Take a parcel', async () => { const x = await cmd('courier.take'); if (x.ok) { S.parcel = x; toast(x.again ? `Still delivering to ${x.name}.` : `Deliver the parcel to ${x.name}! (4 min) Stand at its door and press P.`, 'good', 7000); } else callErr(x); }], guide: () => ['❓ Tips', () => toast('Claim your free studio at the Town Hall → buy furniture at Home & Hearth → go home and press B to build!', 'info', 8000)] }[n.role];
  const a = act?.();
  openPanel('npc', n.name, () => h('div', { class: 'col', style: { width: '320px' } }, h('div', { style: { fontStyle: 'italic' } }, `“${r.line}”`), a ? h('button', { class: 'btn', onclick: () => { closePanel('npc'); a[1](); } }, a[0]) : null, h('button', { class: 'btn ghost', onclick: () => closePanel('npc') }, 'Bye')), { w: 350, y: 120 });
}
addEventListener('keydown', async (e) => { if (e.code === 'KeyP' && S.me && !/INPUT/.test(document.activeElement?.tagName) && S.parcel) { const r = await cmd('courier.deliver'); if (r.ok) { toast(`📦 Delivered! +🪙${r.amount}`, 'good'); S.parcel = null; sfx('coin'); } else toast(errText(r), 'warn'); } });

// ---------------- Emotes / phone / settings ----------------
function openEmotes() {
  if (panelOpen('emotes')) return closePanel('emotes');
  openPanel('emotes', 'Emotes (keys 1–9)', () => h('div', { class: 'grid', style: { width: '380px' } }, EMOTES.map((e, i) => h('div', { class: 'item', onclick: () => { cmd('emote', { id: e.id }); closePanel('emotes'); } }, h('div', { class: 'em' }, e.e), h('div', { class: 'nm' }, e.name), h('small', { class: 'muted' }, i < 9 ? i + 1 : '')))), { w: 410, y: 200 });
}
function openPhone() {
  if (panelOpen('phone')) return closePanel('phone');
  const apps = [['🗺️', 'Map', () => openMap()], ['👥', 'Friends', () => bus.emit('openFriends')], ['🎉', 'Party', () => bus.emit('openParty')], ['🎒', 'Inventory', () => openInventory()], ['🏠', 'Home', () => openHomeApp()], ['🛍️', 'Catalog', () => openCatalog()], ['🏆', 'Achievements', () => openAch()], ['📋', 'Daily', () => openBoard()], ['👤', 'My profile', () => bus.emit('openProfile', S.me.id)], ['🏘️', 'Directory', () => openDirectory()], ['🟢', 'Who’s online', () => bus.emit('openOnline')], ['⚙', 'Settings', () => openSettings()]];
  openPanel('phone', '📱 Pocket Phone', () => h('div', { class: 'grid', style: { width: '400px', gridTemplateColumns: 'repeat(4,1fr)' } }, apps.map(([i, n, f]) => h('div', { class: 'item', onclick: () => { closePanel('phone'); f(); } }, h('div', { class: 'em' }, i), h('div', { class: 'nm' }, n)))), { w: 430, x: innerWidth - 470, y: 120 });
}
function openMap() {
  openPanel('map', '🗺️ Marigold Bay', () => { const cv = h('canvas', { width: 640, height: 440, style: { borderRadius: '10px', cursor: 'default' } }); import('./art.js').then(({ outdoorCanvas }) => { const c = cv.getContext('2d'); c.drawImage(outdoorCanvas(), 0, 0, 640, 440); import('/shared/map.js').then(({ DISTRICTS }) => { c.font = '800 12px Nunito'; c.textAlign = 'center'; for (const d of DISTRICTS) { c.fillStyle = '#000a'; c.fillRect((d.x + d.w / 2) * 10 - 52, (d.y + d.h / 2) * 10 - 10, 104, 18); c.fillStyle = '#fff'; c.fillText(d.name, (d.x + d.w / 2) * 10, (d.y + d.h / 2) * 10 + 3); } if (S.loc === 'world') for (const p of S.players.values()) { c.fillStyle = p.id === S.me.id ? '#f26b5b' : '#ffd24a'; c.beginPath(); c.arc(p.x * 10, p.y * 10, 6, 0, 7); c.fill(); c.strokeStyle = '#fff'; c.stroke(); } }); }); return h('div', { class: 'col' }, cv, h('small', { class: 'muted' }, 'You: red dot · others: yellow. 🏠 Sunny Row (SW) · 🛒 Market Street (NW) · ⛲ Fountain Square · 🎰 Lucky Mile (E) · 🏰 Gilded Crest (NE) · 🌊 Beach (S)')); }, { w: 680, y: 40 });
}
function openHomeApp() {
  const mine = S.props.filter(p => p.owner === S.me.id);
  openPanel('homeapp', '🏠 My homes', () => h('div', { class: 'col', style: { width: '440px' } }, mine.length ? mine.map(p => h('div', { class: 'card row' }, h('b', { class: 'grow' }, p.name), h('button', { class: 'btn sm', onclick: async () => { const r = await cmd('prop.goto', { id: p.id }); if (!r.ok) callErr(r); else closePanel('homeapp'); } }, 'Teleport'), h('button', { class: 'btn sm alt', onclick: () => openManage(p.id) }, 'Manage'))) : h('div', { class: 'muted' }, 'You have no homes yet. Visit the Town Hall!'), h('small', { class: 'muted' }, 'Homes where you hold a role are shown in the Directory.')), { w: 470 });
}
function openCatalog() { openPanel('catalog', '🛍️ Catalog (delivery +10%)', () => h('div', { class: 'col', style: { width: '320px' } }, h('div', { class: 'muted' }, 'Order from anywhere — items are delivered to your inventory. Visiting the shops is cheaper!'), ['furn', 'curio', 'cloth'].map(s => h('button', { class: 'btn', onclick: () => { closePanel('catalog'); openShop(s, true); } }, SHOPS[s].name))), { w: 350 }); }
async function openDirectory() {
  const r = await cmd('prop.list'); const list = r.props.filter(p => p.owner && (p.access === 'open' || p.owner === S.me.id)).sort((a, b) => (b.style?.score || 0) - (a.style?.score || 0));
  openPanel('dir', '🏘️ House directory', () => h('div', { class: 'col', style: { width: '520px', maxHeight: '55vh', overflow: 'auto' } }, list.length ? list.map(p => h('div', { class: 'card row' }, h('div', { class: 'grow' }, h('b', {}, p.name), h('div', { class: 'muted' }, `by ${p.ownerName} · ${'★'.repeat(p.style.stars)}${'☆'.repeat(5 - p.style.stars)} · ❤ ${p.likes} · ${p.tier}`)), h('button', { class: 'btn sm', onclick: async () => { const x = await cmd('prop.goto', { id: p.id }); if (x.ok) closePanel('dir'); else callErr(x); } }, 'Visit'))) : h('div', { class: 'muted' }, 'No open homes yet.')), { w: 550 });
}
function openSettings() {
  if (panelOpen('settings')) return closePanel('settings');
  openPanel('settings', '⚙ Settings', () => h('div', { class: 'col', style: { width: '380px' } }, h('h3', {}, 'Audio'),
    BUSES.map(b => h('div', { class: 'row' }, h('span', { style: { width: '90px', textTransform: 'capitalize' } }, b), h('input', { type: 'range', class: 'grow', min: 0, max: 1, step: 0.01, value: getVol(b), oninput: (e) => setVol(b, +e.target.value) }))),
    h('label', {}, h('input', { type: 'checkbox', checked: !!S.settings.mute, onchange: (e) => { S.settings.mute = e.target.checked; saveSettings(); import('./audio.js').then(a => a.applyVolumes()); } }), ' Mute all'),
    h('h3', {}, 'Display'), h('div', { class: 'row' }, 'Zoom', h('input', { type: 'range', class: 'grow', min: 0.5, max: 2.4, step: 0.05, value: world.cam.zoom, oninput: (e) => { world.cam.zoom = +e.target.value; } })),
    h('h3', {}, 'Controls'), h('div', { class: 'muted', style: { fontSize: '.85rem' } }, 'WASD/Arrows move · E interact · I inventory · Tab phone · B build · G emotes · 1–9 quick emotes · Enter chat · mouse wheel zoom · Esc close · gamepad: left stick + A'),
    h('h3', {}, 'Game'), h('div', { class: 'row' }, h('button', { class: 'btn alt', onclick: () => { closePanel('settings'); bus.emit('openHelp'); } }, '❓ Help'), h('button', { class: 'btn bad', onclick: () => { disconnect(); } }, '🚪 Leave game'))), { w: 410, y: 60 });
}

// ---------------- Host panel ----------------
async function openHost() {
  if (!S.isHost) return toast('Only the Host can open this.', 'warn');
  if (panelOpen('host')) return closePanel('host'); let info = (await cmd('admin.info')); if (!info.ok) return callErr(info);
  const reload = async () => { const r = await cmd('admin.info'); if (r.ok) { info = r; rerender('host'); } };
  const num = (ph) => h('input', { type: 'number', placeholder: ph, style: { width: '90px' } });
  openPanel('host', '🛠 Host panel', () => {
    const a = info.audit; const coinsIn = num('coins'), lvl = num('level'), days = num('days'); const defIn = h('select', {}, Object.values(DEFS).filter(d => d.type !== 'cosmetic' || true).map(d => h('option', { value: d.id }, `${d.emoji} ${d.name}`)));
    return h('div', { class: 'col', style: { width: '640px', maxHeight: '75vh', overflow: 'auto' } },
      h('div', { class: 'card' }, h('b', {}, `🌍 ${info.world}`), h('div', { class: 'muted' }, 'Friends join with: ', (info.ip || []).map(ip => h('code', {}, `http://${ip}:${location.port || 3000}  `)), (info.ip || []).length ? '' : '(no LAN address found)')),
      h('div', { class: 'row wrap' }, ['casino', 'filter', 'cheats'].map(k => h('label', { class: 'chip' }, h('input', { type: 'checkbox', checked: info.settings[k] !== false && !!info.settings[k], onchange: async (e) => { await cmd('admin.settings', { [k]: e.target.checked }); reload(); } }), ' ' + ({ casino: 'Casino enabled', filter: 'Chat filter', cheats: 'Dev tools' })[k])), h('label', {}, 'Upkeep period (s) ', (() => { const i = num(String(info.settings.upkeepSec)); i.value = info.settings.upkeepSec; i.onchange = async () => { await cmd('admin.settings', { upkeepSec: +i.value }); }; return i; })())),
      h('div', { class: 'card' }, h('b', {}, 'Integrity'), h('div', { class: a.ok ? 'good' : 'bad' }, a.ok ? '✔ Coin & item conservation OK (nothing duplicated, nothing lost)' : '✘ ' + a.errors.join('; ')), h('div', { class: info.journal.ok ? 'good' : 'bad' }, info.journal.ok ? `✔ Journal hash chain OK (${info.journal.lines} entries)` : '✘ Journal chain broken at ' + info.journal.at), h('div', { class: 'muted' }, `House bank: ${fmt(info.accts.house)} · Jackpot pool: ${fmt(info.accts.jackpot)} · Sinks: ${fmt(info.accts.void)} · Minted: ${fmt(-info.accts.mint)}`)),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: async () => { await cmd('admin.save'); toast('Saved', 'good'); reload(); } }, '💾 Save now'), h('button', { class: 'btn alt', onclick: async () => { await cmd('admin.backup'); toast('Manual backup created', 'good'); reload(); } }, '🗄 Backup'), h('button', { class: 'btn ghost', onclick: reload }, '↻ Refresh')),
      h('div', { class: 'muted' }, 'Backups: ' + (info.backups.map(b => `${b.kind}/${b.name.slice(5, 19)}`).join(' · ') || 'none yet')),
      info.settings.cheats ? h('div', { class: 'card col' }, h('b', {}, '🧪 Dev tools (testing)'),
        h('div', { class: 'row wrap' }, coinsIn, h('button', { class: 'btn sm', onclick: async () => { await cmd('dev.coins', { n: +coinsIn.value || 100000 }); } }, '+ Coins'), lvl, h('button', { class: 'btn sm', onclick: async () => { await cmd('dev.level', { n: +lvl.value || 25 }); } }, 'Set level'), h('button', { class: 'btn sm', onclick: () => cmd('dev.stars', { n: 5 }) }, '+5 ★')),
        h('div', { class: 'row wrap' }, days, h('button', { class: 'btn sm', onclick: async () => { const r = await cmd('dev.day', { n: +days.value || 1 }); toast('Day advanced → daily reward available again'); } }, 'Advance day'), h('button', { class: 'btn sm', onclick: () => cmd('dev.upkeep') }, 'Force upkeep period'), h('button', { class: 'btn sm', onclick: () => cmd('dev.race') }, 'Skip to next horse phase')),
        h('div', { class: 'row wrap' }, defIn, h('button', { class: 'btn sm', onclick: async () => { await cmd('dev.item', { def: defIn.value, qty: 5 }); toast('Added 5'); } }, 'Give ×5')),
        h('div', { class: 'row wrap' }, 'Teleport:', [['Plaza', 'world', 30.5, 18.5], ['Town Hall', 'townhall'], ['Furniture shop', 'shop_furn'], ['Clothes', 'shop_cloth'], ['Casino', 'casino'], ['Track', 'track'], ['Beach pier', 'world', 46.5, 38.5]].map(([n, l, x, y]) => h('button', { class: 'btn sm ghost', onclick: () => cmd('dev.tp', { loc: l, x, y }) }, n)))) : null,
      h('div', { class: 'card col' }, h('b', {}, '👥 Players'), h('table', { class: 't' }, info.players.map(p => h('tr', {}, h('td', {}, (p.online ? '🟢 ' : '⚪ ') + p.name), h('td', {}, 'Lv' + p.level), h('td', {}, '🪙' + fmt(p.coins)), h('td', {}, p.id !== S.me.id && p.online ? [h('button', { class: 'btn sm ghost', onclick: async () => { await cmd('admin.kick', { id: p.id }); reload(); } }, 'Kick'), ' ', h('button', { class: 'btn sm ghost', onclick: async () => { await cmd('admin.mute', { id: p.id, minutes: 10 }); toast('Muted 10 min'); } }, 'Mute')] : null, p.id !== S.me.id ? h('button', { class: 'btn sm bad', onclick: () => confirmBox(`Ban ${p.name}?`, async () => { await cmd('admin.ban', { id: p.id }); reload(); }) }, 'Ban') : null)))),
        (() => { const i = h('input', { type: 'text', placeholder: 'Announcement…', class: 'grow' }); return h('div', { class: 'row' }, i, h('button', { class: 'btn sm', onclick: async () => { await cmd('admin.announce', { text: i.value }); i.value = ''; } }, '📢 Send')); })()));
  }, { w: 670, y: 30 });
}
bus.on('openHelp', () => openPanel('help', '❓ How to play', () => h('div', { class: 'col', style: { width: '460px', lineHeight: 1.45 } }, h('div', {}, '🏠 ', h('b', {}, 'Homes: '), 'claim your free studio at the Town Hall, buy furniture at Home & Hearth (Market Street), walk into your home and press ', h('kbd', {}, 'B'), ' to build.'), h('div', {}, '🔨 ', h('b', {}, 'Build mode: '), 'pick furniture from the left drawer, click to place, ', h('kbd', {}, 'R'), ' rotate, ', h('kbd', {}, 'Del'), ' remove, ', h('kbd', {}, 'Ctrl+Z/Y'), ' undo/redo, drag to move, shift-drag to multi-select, ', h('kbd', {}, 'Ctrl+C/V'), ' copy/paste.'), h('div', {}, '👥 Invite friends (Phone → Friends), give them roles (Property → People) and build together.'), h('div', {}, '🎰 Casino: Lucky Mile, east side. Fictional Coins only. Cashier has limits & cool-off.'), h('div', {}, '🛠 Host (the computer running the server) gets the Host panel on F2 with dev tools to test everything quickly.')), { w: 490 }));
