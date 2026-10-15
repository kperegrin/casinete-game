// Social UI: friends, party, profiles, trading, gifting, invitations, doorbell, fishing.
import { S, bus, fmt } from './state.js';
import { cmd, errText } from './net.js';
import { h, $, toast, openPanel, closePanel, rerender, panelOpen, confirmBox, promptBox, itemCard, rarityChip } from './ui.js';
import { world } from './world.js';
import { sfx } from './audio.js';
import { drawChar } from './art.js';
import { DEFS, ACHIEVEMENTS } from '/shared/content.js';

const err = (r) => { toast(errText(r), 'warn'); sfx('error'); };
const popup = (id, title, text, buttons) => { sfx('notify'); openPanel(id, title, () => h('div', { class: 'col', style: { width: '320px' } }, h('div', {}, text), h('div', { class: 'row' }, buttons.map(([label, fn, cls]) => h('button', { class: 'btn ' + (cls || ''), onclick: () => { closePanel(id); fn?.(); } }, label)))), { w: 350, x: innerWidth - 380, y: 90 }); };

export function installSocial() {
  bus.on('openFriends', openFriends); bus.on('openParty', openParty); bus.on('openProfile', openProfile); bus.on('openOnline', openOnline); bus.on('giftItem', giftItem);
  world.openers.player = openProfile; world.openers.fish = (r) => openFish(r.thing);
  bus.on('presence', () => { rerender('friends'); rerender('online'); }); bus.on('me', () => rerender('friends'));
  bus.on('push', onPush);
  addEventListener('keydown', (e) => { if (e.code === 'Space' && fish.phase === 'bite') { e.preventDefault(); reel(); } });
}
function onPush(m) {
  switch (m.t) {
    case 'invite': popup('invite', '🏠 Invitation', `${m.from} invited you to ${m.name}.`, [['Go there', async () => { const r = await cmd('prop.goto', { id: m.prop }); if (!r.ok) err(r); }, 'alt'], ['Later']]); break;
    case 'doorbell': popup('bell' + m.fromId, '🔔 Doorbell', `${m.from} is at the door of ${S.props.find(p => p.id === m.prop)?.name || 'your home'}.`, [['Let in', () => cmd('prop.answer', { prop: m.prop, pid: m.fromId, accept: true }), 'alt'], ['Ignore', () => cmd('prop.answer', { prop: m.prop, pid: m.fromId, accept: false })]]); break;
    case 'friendreq': popup('fr' + m.fromId, '👥 Friend request', `${m.from} wants to be your friend.`, [['Accept', async () => { const r = await cmd('friend.accept', { id: m.fromId }); if (!r.ok) err(r); }, 'alt'], ['Decline']]); break;
    case 'partyinvite': popup('pi' + m.party, '🎉 Party invite', `${m.from} invited you to a party.`, [['Join', async () => { const r = await cmd('party.accept', { party: m.party }); if (!r.ok) err(r); }, 'alt'], ['Decline']]); break;
    case 'party': S.party = m.party; rerender('party'); if (m.party) toast(`🎉 Party: ${m.party.members.map(x => x.name).join(', ')}`); break;
    case 'traderequest': popup('tr' + m.id, '🤝 Trade request', `${m.from} wants to trade.`, [['Accept', async () => { const r = await cmd('trade.accept', { id: m.id }); if (!r.ok) err(r); }, 'alt'], ['Decline', () => cmd('trade.decline')]]); break;
    case 'trade': S.tradeState = m; openTrade(); break;
    case 'tradeend': S.tradeState = null; closePanel('trade'); toast(m.why, m.ok ? 'good' : 'warn'); if (m.ok) sfx('coin'); break;
    case 'bite': if (fish.phase === 'wait') { fish.phase = 'bite'; sfx('bell'); rerender('fish'); setTimeout(() => { if (fish.phase === 'bite') { fish.phase = 'idle'; toast('Too slow — it got away.', 'warn'); rerender('fish'); } }, m.ms + 300); } break;
  }
}

// ---------------- friends / party / online ----------------
function openFriends() {
  if (panelOpen('friends')) return closePanel('friends');
  openPanel('friends', '👥 Friends', () => { const n = h('input', { type: 'text', placeholder: 'add friend by name', class: 'grow' });
    return h('div', { class: 'col', style: { width: '420px' } }, h('div', { class: 'row' }, n, h('button', { class: 'btn sm', onclick: async () => { const r = await cmd('friend.add', { name: n.value }); toast(r.ok ? (r.sent ? 'Request sent' : 'You are friends!') : errText(r), r.ok ? 'good' : 'warn'); n.value = ''; } }, 'Add')),
      S.me.friends.length ? S.me.friends.map(f => h('div', { class: 'card row', style: { padding: '8px' } }, h('span', {}, f.online ? '🟢' : '⚪'), h('b', { class: 'grow' }, f.name), h('button', { class: 'btn sm ghost', title: 'Profile', onclick: () => openProfile(f.id) }, '👤'), f.online ? h('button', { class: 'btn sm ghost', title: 'Invite to party', onclick: async () => { const r = await cmd('party.invite', { id: f.id }); toast(r.ok ? 'Invited' : errText(r)); } }, '🎉') : null, f.online && S.home ? h('button', { class: 'btn sm ghost', title: 'Invite to this home', onclick: async () => { const r = await cmd('prop.invite', { pid: f.id }); toast(r.ok ? 'Invitation sent' : errText(r), r.ok ? 'good' : 'warn'); } }, '🏠') : null, h('button', { class: 'btn sm ghost', onclick: () => confirmBox(`Remove ${f.name}?`, () => cmd('friend.remove', { id: f.id })) }, '✕'))) : h('div', { class: 'muted' }, 'No friends yet. Click a player in the world → Add friend.'));
  }, { w: 450, y: 80 });
}
function openParty() {
  openPanel('party', '🎉 Party', () => { const p = S.party; const n = h('input', { type: 'text', placeholder: 'invite by name', class: 'grow' });
    return h('div', { class: 'col', style: { width: '380px' } }, p ? [h('div', {}, p.members.map(m => h('div', { class: 'row' }, (m.id === p.leader ? '👑 ' : '') + m.name))), h('div', { class: 'row' }, S.me.id !== p.leader ? h('button', { class: 'btn alt', onclick: async () => { const r = await cmd('party.goto'); if (!r.ok) err(r); } }, '➡ Go to leader') : null, h('button', { class: 'btn ghost', onclick: () => cmd('party.leave') }, 'Leave party'))] : h('div', { class: 'muted' }, 'You are not in a party. Parties (up to 6) can teleport to the leader and share the party chat channel.'),
      h('div', { class: 'row' }, n, h('button', { class: 'btn sm', onclick: async () => { const t = [...S.players.values()].find(x => x.name.toLowerCase() === n.value.toLowerCase()); const r = await cmd('party.invite', t ? { id: t.id } : { name: n.value }); toast(r.ok ? 'Invited' : errText(r), r.ok ? 'good' : 'warn'); } }, 'Invite')));
  }, { w: 410, y: 90 });
}
async function openOnline() { const r = await cmd('players.online'); openPanel('online', '🟢 Online now', () => h('div', { class: 'col', style: { width: '380px' } }, r.players.map(p => h('div', { class: 'row card', style: { padding: '6px 10px' } }, h('b', { class: 'grow' }, p.name), h('span', { class: 'muted' }, `Lv${p.level} · ${p.loc}`), h('button', { class: 'btn sm ghost', onclick: () => openProfile(p.id) }, '👤')))), { w: 410, y: 90 }); }

// ---------------- profile / inspect ----------------
async function openProfile(id) {
  const r = await cmd('profile.get', { id }); if (!r.ok) return err(r); const p = r.profile; const mine = id === S.me.id;
  openPanel('profile' + (mine ? '' : ''), `👤 ${p.name}`, () => {
    const cv = h('canvas', { width: 150, height: 210, class: 'avatar-prev' }); const c = cv.getContext('2d'); c.translate(75, 185); c.scale(3.4, 3.4); drawChar(c, p.look, 0, 0, { dir: 0 });
    const worn = ['hat', 'glasses', 'top', 'full', 'bottom', 'shoes', 'back', 'acc'].map(s => p.look[s]).filter(d => d && DEFS[d] && !DEFS[d].free);
    const bio = h('input', { type: 'text', value: p.bio, maxlength: 140, placeholder: 'Write a short bio…' });
    return h('div', { class: 'row', style: { alignItems: 'flex-start', width: '520px' } }, h('div', { class: 'col' }, cv),
      h('div', { class: 'col grow' }, h('div', {}, h('b', { style: { fontSize: '1.2rem' } }, p.name), p.title ? h('span', { class: 'chip tag-owner', style: { marginLeft: '6px' } }, p.title) : null, ' ', p.online ? '🟢' : '⚪'), h('div', { class: 'muted' }, `Level ${p.level} · Builder ${p.bxp} · Social ${p.sxp} · Explorer ${p.exp} XP · 🏆 ${p.ach}/${ACHIEVEMENTS.length}`),
        mine ? h('div', { class: 'row' }, bio, h('button', { class: 'btn sm', onclick: async () => { await cmd('bio.set', { text: bio.value }); toast('Saved'); } }, 'Save')) : h('div', { style: { fontStyle: 'italic' } }, p.bio || 'No bio yet.'),
        worn.length ? h('div', {}, h('b', {}, 'Wearing: '), worn.map(d => h('span', { class: 'chip', style: { marginRight: '3px' }, title: `${DEFS[d].rarity} — ${DEFS[d].price ? 'Threadworks 🪙' + DEFS[d].price : 'special'}` }, DEFS[d].emoji + ' ' + DEFS[d].name))) : null,
        p.homes.length ? h('div', {}, h('b', {}, 'Open homes: '), p.homes.map(hm => h('button', { class: 'btn sm ghost', onclick: async () => { const x = await cmd('prop.goto', { id: hm.id }); if (x.ok) closePanel('profile'); else err(x); } }, `${hm.name} ${'★'.repeat(hm.stars)}`))) : null,
        !mine ? h('div', { class: 'row wrap' }, h('button', { class: 'btn sm', disabled: p.friend, onclick: async () => { const x = await cmd('friend.add', { id }); toast(x.ok ? (x.sent ? 'Friend request sent' : 'Friends!') : errText(x), x.ok ? 'good' : 'warn'); } }, p.friend ? '✓ Friends' : '➕ Friend'), h('button', { class: 'btn sm alt', onclick: async () => { const x = await cmd('trade.req', { id }); toast(x.ok ? 'Trade request sent' : errText(x), x.ok ? 'good' : 'warn'); } }, '🤝 Trade'), h('button', { class: 'btn sm', onclick: () => giftToPlayer(id, p.name) }, '🎁 Gift'), h('button', { class: 'btn sm ghost', onclick: async () => { const x = await cmd('party.invite', { id }); toast(x.ok ? 'Invited' : errText(x), x.ok ? 'good' : 'warn'); } }, '🎉 Party'),
          S.home ? h('button', { class: 'btn sm ghost', onclick: async () => { const x = await cmd('prop.invite', { pid: id }); toast(x.ok ? 'Invitation sent' : errText(x), x.ok ? 'good' : 'warn'); } }, '🏠 Invite here') : null,
          h('button', { class: 'btn sm ghost', onclick: () => { const i = $('#chin'); i.focus(); i.value = `/w ${p.name} `; } }, '💬 Whisper'),
          S.home && S.role !== 'visitor' ? h('button', { class: 'btn sm bad', onclick: async () => { const x = await cmd('prop.kick', { pid: id }); toast(x.ok ? 'Asked to leave' : errText(x)); } }, 'Kick from home') : null)
          : h('div', { class: 'row wrap' }, h('button', { class: 'btn sm alt', onclick: () => { closePanel('profile'); bus.emit('openInventory', 'wardrobe'); } }, '👕 Wardrobe'), h('button', { class: 'btn sm', onclick: () => bus.emit('openInventory') }, '🎒 Inventory'))));
  }, { w: 560, y: 70 });
}

// ---------------- gifting ----------------
function giftItem({ id, d }) { promptBox(`Gift ${DEFS[d].name}`, 'Send to player (name)', '', async (name) => { const msg = prompt('Add a short message (optional)') || ''; const r = await cmd('gift.send', { name, item: id, msg }); toast(r.ok ? '🎁 Gift sent!' : errText(r), r.ok ? 'good' : 'warn'); }); }
function giftToPlayer(pid, name) { const mine = S.inv.filter(i => i.loc === 'inv' && DEFS[i.d].tradable); openPanel('giftpick', `🎁 Gift to ${name}`, () => h('div', { class: 'grid', style: { width: '460px', maxHeight: '50vh', overflow: 'auto' } }, mine.map(i => itemCard(i.d, { onClick: async () => { const r = await cmd('gift.send', { id: pid, item: i.id, msg: '' }); if (r.ok) { toast('🎁 Gift sent!', 'good'); closePanel('giftpick'); } else err(r); } }))), { w: 490, y: 90 }); }

// ---------------- trading ----------------
function openTrade() {
  const t = S.tradeState; if (!t) return;
  openPanel('trade', `🤝 Trade with ${t.with}`, () => {
    const t = S.tradeState; if (!t) return h('div'); const mineInv = S.inv.filter(i => i.loc === 'inv' && DEFS[i.d].tradable); const offered = new Set(t.mine.items.map(i => i.id));
    const coins = h('input', { type: 'number', min: 0, value: t.mine.coins, style: { width: '110px' } });
    const send = async (ids, c) => { const r = await cmd('trade.offer', { items: ids, coins: c }); if (!r.ok) err(r); };
    const ready = t.lock.me && t.lock.them; const wait = ready ? Math.max(0, 3 - Math.floor((Date.now() + S.serverOffset - t.lockedAt) / 1000)) : 0;
    return h('div', { class: 'col', style: { width: '660px' } }, h('div', { class: 'row', style: { alignItems: 'flex-start' } },
      h('div', { class: 'col grow card' }, h('b', {}, 'Your offer'), h('div', { class: 'grid', style: { minHeight: '60px' } }, t.mine.items.map(i => itemCard(i.d, { onClick: () => send([...offered].filter(x => x !== i.id), +coins.value) }))), h('div', { class: 'row' }, '🪙', coins, h('button', { class: 'btn sm', onclick: () => send([...offered], +coins.value) }, 'Set')), h('small', { class: 'muted' }, '5% tax on Coins above 10,000'), h('b', {}, 'Click an inventory item to add it:'), h('div', { class: 'grid', style: { maxHeight: '170px', overflow: 'auto' } }, mineInv.filter(i => !offered.has(i.id)).map(i => itemCard(i.d, { onClick: () => send([...offered, i.id], +coins.value) })))),
      h('div', { class: 'col grow card' }, h('b', {}, `${t.with}'s offer`), h('div', { class: 'grid', style: { minHeight: '60px' } }, t.theirs.items.map(i => itemCard(i.d))), h('div', {}, '🪙 ' + fmt(t.theirs.coins)), h('div', { class: t.lock.them ? 'good' : 'muted' }, t.lock.them ? '🔒 locked in' : 'still deciding…'))),
      h('div', { class: 'row' }, h('button', { class: 'btn', disabled: t.lock.me, onclick: () => cmd('trade.lock') }, t.lock.me ? '🔒 Locked' : '🔒 Lock offer'), h('button', { class: 'btn alt', disabled: !ready || wait > 0 || t.confirm.me, onclick: async () => { const r = await cmd('trade.confirm'); if (!r.ok) err(r); } }, !ready ? 'Both must lock first' : wait > 0 ? `Confirm in ${wait}s` : t.confirm.me ? 'Waiting for them…' : '✔ Confirm trade'), h('button', { class: 'btn bad', onclick: () => cmd('trade.cancel') }, 'Cancel'), t.confirm.them ? h('span', { class: 'good' }, 'They confirmed') : null));
  }, { w: 690, y: 40, onClose: () => { if (S.tradeState) cmd('trade.cancel'); } });
}
setInterval(() => { if (S.tradeState && panelOpen('trade')) rerender('trade'); }, 1000);

// ---------------- fishing ----------------
const fish = { phase: 'idle', thing: null, last: '' };
function openFish(thing) { fish.thing = thing; fish.phase = 'idle'; openPanel('fish', '🎣 Fishing', () => h('div', { class: 'col', style: { width: '320px', textAlign: 'center' } }, h('div', { style: { fontSize: '64px' } }, fish.phase === 'bite' ? '❗🐟' : fish.phase === 'wait' ? '🎣…' : '🌊'),
  h('div', { style: { fontWeight: 900, minHeight: '1.5em' } }, fish.phase === 'bite' ? 'REEL IT IN! (Space)' : fish.phase === 'wait' ? 'Waiting for a bite…' : (fish.last || 'Cast your line!')),
  fish.phase === 'idle' ? h('button', { class: 'btn', onclick: cast }, '🎣 Cast') : null, fish.phase === 'bite' ? h('button', { class: 'btn alt', onclick: reel }, 'Reel!') : null, h('small', { class: 'muted' }, 'Catch fish, sell them at shops. Rewards shrink after 8 catches a day (max 20).')), { w: 350, y: 120, onClose: () => { fish.phase = 'idle'; } }); }
async function cast() { const r = await cmd('fish.cast', { thing: fish.thing }); if (!r.ok) return err(r); fish.phase = 'wait'; sfx('click'); rerender('fish'); }
async function reel() { const r = await cmd('fish.reel'); fish.phase = 'idle'; if (r.ok) { fish.last = `Caught a ${r.emoji} ${r.name}! (${r.left} casts left today)`; sfx('coin'); } else { fish.last = errText(r); sfx('error'); } rerender('fish'); }
