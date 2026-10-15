// Casino UIs: roulette, blackjack, poker, slots, horse racing, cashier. Everything shown here is decided by the Host.
import { S, bus, fmt } from './state.js';
import { cmd, errText } from './net.js';
import { h, $, toast, openPanel, closePanel, rerender, panelOpen, confirmBox, promptBox } from './ui.js';
import { world } from './world.js';
import { sfx } from './audio.js';
import { DEFS } from '/shared/content.js';
import { WHEEL, REDS } from '/shared/roulette.js';

const now = () => Date.now() + S.serverOffset;
const countdown = (endsAt) => h('span', { class: 'cd', 'data-ends': endsAt || 0 }, '');
setInterval(() => { document.querySelectorAll('.cd').forEach(el => { const e = +el.dataset.ends; el.textContent = e ? Math.max(0, Math.ceil((e - now()) / 1000)) + 's' : ''; }); }, 250);
const err = (r) => { toast(errText(r), 'warn'); sfx('error'); };
const SUIT = ['♣', '♦', '♥', '♠'], RANK = '23456789TJQKA';
const card = (c) => c < 0 ? h('span', { class: 'cardc back' }, '?') : h('span', { class: 'cardc' + ((c / 13 | 0) === 1 || (c / 13 | 0) === 2 ? ' red' : '') }, h('span', {}, RANK[c % 13] === 'T' ? '10' : RANK[c % 13]), h('span', {}, SUIT[(c / 13) | 0]));
const chipColors = { 10: '#2b6cb0', 25: '#2f855a', 50: '#c05621', 100: '#2d3748', 250: '#805ad5', 500: '#b83280', 1000: '#975a16', 5000: '#c53030' };

export function installCasino() {
  Object.assign(world.openers, { roulette: (r) => openRoulette(r.table, r.snap), blackjack: (r) => openBJ(r.table, r.snap), poker: (r) => openPoker(r.table, r.snap), slots: (r) => openSlots(r), horses: (r) => openHorses(r.snap) });
  bus.on('openCashier', (r) => openCashier()); bus.on('tev', onTev); bus.on('jackpot', () => { document.querySelectorAll('.jp').forEach(e => e.textContent = fmt(S.jackpot)); });
  bus.on('loc', (m) => { if (m.loc === 'track') raceSnap = m.tables.horses; });
}
let tables = {}; const T = (id) => tables[id];
function onTev({ table, ev }) {
  if (table === 'horses') return onHorse(ev);
  const t = tables[table]; if (!t) return;
  if (table.startsWith('roulette')) rouletteEv(t, ev); else if (table.startsWith('bj')) bjEv(t, ev); else if (table.startsWith('poker')) pokerEv(t, ev);
}

// ================= ROULETTE =================
let SPOTS = null; const rl = { chip: 10, anim: null, last: null };
async function openRoulette(id, snap) {
  if (!SPOTS) SPOTS = (await cmd('spots')).spots; tables[id] = snap; rl.chip = Math.max(snap.min, rl.chip);
  openPanel('roulette', `🎡 ${snap.name}`, () => rlBody(id), { w: 760, y: 20, x: Math.max(8, innerWidth / 2 - 380), onClose: () => { rl.anim = null; } }); drawWheel(id);
}
const spotBy = (type, label) => SPOTS.find(s => s.type === type && s.label === label);
function rlBody(id) {
  const t = tables[id]; const mine = t.bets[S.me.id] || []; const total = mine.reduce((a, b) => a + b.stake, 0); const stakeOn = (spotId) => { const per = {}; for (const [pid, bs] of Object.entries(t.bets)) for (const b of bs) if (b.spot === spotId) per[pid] = (per[pid] || 0) + b.stake; return per; };
  const chips = [10, 50, 100, 500, 1000, 5000].filter(c => c >= t.min);
  const cell = (spot, cls, label, extra = {}) => { const per = stakeOn(spot.id); const my = per[S.me.id] || 0; const others = Object.entries(per).filter(([p]) => p !== S.me.id).reduce((a, [, v]) => a + v, 0);
    return h('div', { class: 'rl-n ' + cls, style: extra.style, title: `${spot.label} — pays ${36 / spot.nums.length - 1}:1`, onclick: (e) => betSpot(id, spot, e), oncontextmenu: (e) => { e.preventDefault(); const opts = SPOTS.filter(s => s.nums.includes(spot.nums[0]) && s.nums.length > 1 && s.nums.length <= 6 && ['split', 'street', 'corner', 'trio', 'firstfour', 'sixline'].includes(s.type)); pickSpot(id, spot, opts); } }, label, my ? h('span', { class: 'rl-chip' }, my >= 1000 ? Math.round(my / 100) / 10 + 'k' : my) : null, others ? h('span', { class: 'rl-chip', style: { background: '#ccc', right: 'auto', left: -2 } }, others >= 1000 ? Math.round(others / 100) / 10 + 'k' : others) : null); };
  const grid = h('div', { class: 'rl-grid' });
  grid.append(h('div', { style: { gridRow: '1 / span 3', gridColumn: 1 } }, cell(SPOTS[0], 'rl-green', '0', { style: { height: '112px' } })));
  for (let r = 0; r < 3; r++) { for (let c = 0; c < 12; c++) { const n = c * 3 + (3 - r); const sp = SPOTS[n]; const el = cell(sp, REDS.has(n) ? 'rl-red' : 'rl-black', String(n)); el.style.gridRow = r + 1; el.style.gridColumn = c + 2; grid.append(el); } const col = cell(spotBy('column', `Column ${3 - r}`), 'rl-out', '2:1'); col.style.gridRow = r + 1; col.style.gridColumn = 14; grid.append(col); }
  const dz = h('div', { class: 'rl-grid', style: { marginTop: '2px' } }, h('div'), ...[['1-12', 1], ['13-24', 5], ['25-36', 9]].map(([l, i]) => { const e = cell(spotBy('dozen', l), 'rl-out', l); e.style.gridColumn = `${i + 1} / span 4`; return e; }), h('div'));
  const ev = h('div', { class: 'rl-grid', style: { marginTop: '2px' } }, h('div'), ...[['1-18', 'even'], ['Even', 'even'], ['Red', 'even'], ['Black', 'even'], ['Odd', 'even'], ['19-36', 'even']].map(([l], i) => { const e = cell(spotBy('even', l), l === 'Red' ? 'rl-red' : l === 'Black' ? 'rl-black' : 'rl-out', l); e.style.gridColumn = `${i * 2 + 2} / span 2`; return e; }), h('div'));
  const hist = h('div', { class: 'row wrap' }, t.history.slice(0, 14).map(n => h('span', { class: 'chip', style: { background: n === 0 ? '#0f7b3f' : REDS.has(n) ? '#c1272d' : '#222', color: '#fff' } }, n)));
  const phaseTxt = { idle: 'Place a bet to start a round', betting: 'Place your bets!', nobets: 'No more bets', spin: 'Spinning…', settle: 'Result' }[t.phase];
  return h('div', { class: 'felt' }, h('div', { class: 'row' }, h('canvas', { id: 'rlwheel', width: 190, height: 190 }), h('div', { class: 'col grow' }, h('div', { style: { fontSize: '1.3rem', fontWeight: 900 } }, phaseTxt, ' ', countdown(t.phase === 'betting' || t.phase === 'nobets' ? t.endsAt : 0)), h('div', { id: 'rlres', style: { fontSize: '1.1rem', fontWeight: 800, minHeight: '1.5em' } }, rl.last || ''), h('div', {}, 'Recent: ', hist), h('div', { class: 'muted', style: { color: '#cfe' } }, `Min ${fmt(t.min)} · straight max ${fmt(t.maxStraight)} · outside max ${fmt(t.maxOutside)} · European (single zero) · right-click a number for splits/corners`), t.seedHash ? h('small', { style: { color: '#cfe', fontFamily: 'monospace' } }, 'Fair-play receipt: ' + t.seedHash.slice(0, 16) + '…') : null)),
    h('div', { class: 'row', style: { margin: '8px 0' } }, chips.map(c => h('button', { class: 'chipb' + (rl.chip === c ? ' on' : ''), style: { background: chipColors[c] }, onclick: () => { rl.chip = c; sfx('chip'); rerender('roulette'); drawWheel(id); } }, c >= 1000 ? c / 1000 + 'k' : c)), h('span', { class: 'grow' }), h('b', {}, `Your bets: 🪙${fmt(total)}  ·  Balance 🪙${fmt(S.me.coins)}`)),
    h('div', { style: { overflowX: 'auto' } }, grid, dz, ev),
    h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'btn', onclick: async () => { const r = await cmd('rl.rebet', { table: id }); if (!r.ok) err(r); else sfx('chip'); } }, '↻ Rebet'), h('button', { class: 'btn alt', onclick: async () => { const r = await cmd('rl.double', { table: id }); if (!r.ok) err(r); else sfx('chip'); } }, '×2 Double'), h('button', { class: 'btn bad', onclick: async () => { const r = await cmd('rl.clear', { table: id }); if (!r.ok) err(r); } }, 'Clear my bets')));
}
async function betSpot(id, spot, e) { const t = tables[id]; if (e.altKey) { const opts = SPOTS.filter(s => s.nums.includes(spot.nums[0]) && s.nums.length > 1 && s.nums.length <= 6); return pickSpot(id, spot, opts); } const r = await cmd('rl.bet', { table: id, spot: spot.id, amount: rl.chip }); if (!r.ok) err(r); else sfx('chip'); }
function pickSpot(id, spot, opts) {
  openPanel('rlpick', `Bets including ${spot.label}`, () => h('div', { class: 'grid', style: { width: '380px' } }, opts.map(s => h('div', { class: 'item', onclick: async () => { closePanel('rlpick'); const r = await cmd('rl.bet', { table: id, spot: s.id, amount: rl.chip }); if (!r.ok) err(r); else sfx('chip'); } }, h('div', { class: 'nm' }, s.label), h('small', { class: 'muted' }, `${s.type} · pays ${36 / s.nums.length - 1}:1`)))), { w: 410, y: 140 });
}
function rouletteEv(t, ev) {
  if (ev.k === 'bet') { (t.bets[ev.pid] ||= []); const ex = t.bets[ev.pid].find(b => b.spot === ev.spot); if (ex) ex.stake += ev.amount; else t.bets[ev.pid].push({ spot: ev.spot, stake: ev.amount }); if (t.phase === 'idle') t.phase = 'betting'; if (ev.pid !== S.me.id) sfx('chip'); }
  else if (ev.k === 'cleared') delete t.bets[ev.pid];
  else if (ev.k === 'phase') { Object.assign(t, ev); if (ev.phase === 'betting') { rl.last = ''; t.seedHash = ev.seedHash; } }
  else if (ev.k === 'spin') { t.phase = 'spin'; t.result = ev.result; t.anim = ev.anim; t.endsAt = ev.endsAt; rl.anim = { t0: performance.now() - (ev.endsAt - ev.anim.ms - now()) * -1 * 0, ...ev.anim, result: ev.result, start: performance.now() }; sfx('spin'); setTimeout(() => sfx('ball'), ev.anim.ms * 0.5); animWheel(t.id); }
  else if (ev.k === 'settle') { t.phase = 'settle'; t.history = ev.history; const d = ev.deltas[S.me.id]; const n = ev.result; const col = n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black'; rl.last = `Result: ${n} ${col}` + (d === undefined ? '' : d >= 0 ? `  ·  you won 🪙${fmt(d)}` : `  ·  you lost 🪙${fmt(-d)}`); t.bets = {}; if (d !== undefined) sfx(d > 0 ? 'win' : 'lose', d > 3000); t.seedHash = null; }
  rerender('roulette'); drawWheel(t.id);
}
function drawWheel(id) {
  const cv = $('#rlwheel'); if (!cv) return; const c = cv.getContext('2d'); const t = tables[id]; const a = rl.anim; const R = 92; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 190, 190); c.translate(95, 95);
  let rot = 0, ballA = null, ballR = R - 8;
  if (a && t.phase === 'spin') { const u = Math.min(1, (performance.now() - a.start) / a.ms); const e = 1 - Math.pow(1 - u, 3); rot = (a.wheelStart + 720 * e) * Math.PI / 180; const idx = WHEEL.indexOf(a.result); const pocket = idx * (2 * Math.PI / 37); const finalAbs = rot + pocket; const ballTurns = (1 - e) * 7 * 2 * Math.PI; ballA = finalAbs + ballTurns; ballR = u < 0.8 ? R - 6 : R - 6 - (u - 0.8) / 0.2 * 22 + (u > 0.9 ? Math.sin((u - 0.9) * 80) * 2 * (1 - u) * 10 : 0); }
  else if (t.result != null && (t.phase === 'settle')) { const idx = WHEEL.indexOf(t.result); rot = ((a?.wheelStart ?? 0) + 720) * Math.PI / 180; ballA = rot + idx * (2 * Math.PI / 37); ballR = R - 28; }
  c.fillStyle = '#5a3a1c'; c.beginPath(); c.arc(0, 0, R + 2, 0, 7); c.fill();
  for (let i = 0; i < 37; i++) { const n = WHEEL[i]; const a0 = rot + i * 2 * Math.PI / 37 - Math.PI / 37 - Math.PI / 2, a1 = a0 + 2 * Math.PI / 37; c.fillStyle = n === 0 ? '#0f7b3f' : REDS.has(n) ? '#c1272d' : '#1a1a1a'; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, R - 2, a0, a1); c.closePath(); c.fill(); c.save(); c.rotate((a0 + a1) / 2); c.fillStyle = '#fff'; c.font = '700 8px Nunito'; c.textAlign = 'center'; c.fillText(n, R - 14, 3); c.restore(); }
  c.fillStyle = '#d4a017'; c.beginPath(); c.arc(0, 0, 26, 0, 7); c.fill(); c.fillStyle = '#7a5b00'; c.beginPath(); c.arc(0, 0, 8, 0, 7); c.fill();
  if (ballA != null) { c.fillStyle = '#fff'; c.beginPath(); c.arc(Math.cos(ballA - Math.PI / 2) * ballR, Math.sin(ballA - Math.PI / 2) * ballR, 4.5, 0, 7); c.fill(); c.strokeStyle = '#0006'; c.stroke(); }
}
function animWheel(id) { const step = () => { if (!panelOpen('roulette') || tables[id].phase !== 'spin') return; drawWheel(id); requestAnimationFrame(step); }; step(); }

// ================= BLACKJACK =================
const bj = { amount: 50 };
function openBJ(id, snap) { tables[id] = snap; bj.amount = Math.max(snap.min, bj.amount); openPanel('blackjack', `🃏 ${snap.name}`, () => bjBody(id), { w: 760, y: 40, x: Math.max(8, innerWidth / 2 - 380) }); }
function bjBody(id) {
  const t = tables[id]; const me = t.seats.findIndex(s => s && s.pid === S.me.id); const my = me >= 0 ? t.seats[me] : null; const turnMine = t.phase === 'turns' && t.active && t.active.seat === me;
  const seat = (s, i) => h('div', { class: 'seat' + (i === me ? ' me' : '') + (t.active && t.active.seat === i && t.phase === 'turns' ? ' turn' : '') }, s ? [h('b', {}, s.pid === S.me.id ? 'You' : (S.players.get(s.pid)?.name || 'Player')), s.bet ? h('div', {}, '🪙' + fmt(s.bet)) : null, ...s.hands.map((hd, j) => h('div', { style: t.active && t.active.seat === i && t.active.hand === j && t.phase === 'turns' ? { outline: '2px solid #fff', borderRadius: '8px' } : {} }, hd.cards.map(card), h('div', { style: { fontWeight: 900 } }, hd.value ? `${hd.value.soft && hd.value.total < 21 ? 'soft ' : ''}${hd.value.total}${hd.bust ? ' BUST' : hd.bj ? ' BLACKJACK' : ''}${hd.doubled ? ' (x2)' : ''}` : ''))), s.lastResult ? h('div', { style: { color: s.lastResult.delta >= 0 ? '#9fe3c8' : '#ffb3b3', fontWeight: 900 } }, s.lastResult.res.join('/') + ` ${s.lastResult.delta >= 0 ? '+' : ''}${fmt(s.lastResult.delta)}`) : null] : [h('div', { class: 'muted', style: { color: '#cfe' } }, 'Empty'), h('button', { class: 'btn sm', disabled: me >= 0, onclick: async () => { const r = await cmd('bj.sit', { table: id, seat: i }); if (!r.ok) err(r); } }, 'Sit')]);
  const legal = turnMine ? ['hit', 'stand', ...(my.hands[t.active.hand].cards.length === 2 ? ['double'] : []), ...(my.hands[t.active.hand].cards.length === 2 && my.hands[t.active.hand].cards[0] % 13 === my.hands[t.active.hand].cards[1] % 13 || (my.hands[t.active.hand].cards.length === 2 && Math.min(my.hands[t.active.hand].cards[0] % 13, 8) === Math.min(my.hands[t.active.hand].cards[1] % 13, 8) && my.hands[t.active.hand].cards[0] % 13 !== 12 && my.hands[t.active.hand].cards[1] % 13 !== 12) ? ['split'] : [])] : [];
  const act = (a) => async () => { const r = await cmd('bj.act', { table: id, act: a }); if (!r.ok) err(r); else sfx('card'); };
  return h('div', { class: 'felt' },
    h('div', { style: { textAlign: 'center' } }, h('div', { class: 'row', style: { justifyContent: 'center' } }, h('b', {}, '🧑‍⚖️ Dealer'), t.dealerValue ? h('span', { class: 'chip' }, t.dealerValue) : null), h('div', {}, t.dealer.map(card)), h('div', { style: { fontSize: '1.2rem', fontWeight: 900, margin: '6px' } }, { idle: 'Sit and place a bet to start', betting: 'Place your bets', dealing: 'Dealing…', insurance: 'Insurance? (dealer shows an Ace)', turns: turnMine ? 'Your turn!' : 'Players are acting', dealer: 'Dealer plays', settle: 'Round over' }[t.phase], ' ', countdown(['betting', 'insurance', 'turns'].includes(t.phase) ? t.endsAt : 0))),
    h('div', { class: 'row', style: { justifyContent: 'center', alignItems: 'flex-start', gap: '8px' } }, t.seats.map(seat)),
    my ? h('div', { class: 'col', style: { marginTop: '8px', alignItems: 'center' } },
      ['idle', 'betting'].includes(t.phase) ? h('div', { class: 'row' }, [t.min, t.min * 5, t.min * 10, t.min * 50].filter(v => v <= t.max).map(c => h('button', { class: 'chipb' + (bj.amount === c ? ' on' : ''), style: { background: chipColors[c] || '#444' }, onclick: () => { bj.amount = c; rerender('blackjack'); } }, c)), h('button', { class: 'btn', onclick: async () => { const r = await cmd('bj.bet', { table: id, amount: bj.amount }); if (!r.ok) err(r); else sfx('chip'); } }, `Bet 🪙${fmt(bj.amount)}`), h('button', { class: 'btn ghost', style: { color: '#fff' }, onclick: async () => { await cmd('bj.leave', { table: id }); } }, 'Leave seat')) : null,
      t.phase === 'insurance' && my.hands.length && !my.insurance ? h('div', { class: 'row' }, h('button', { class: 'btn', onclick: async () => { const r = await cmd('bj.ins', { table: id, take: true }); if (!r.ok) err(r); } }, `Take insurance (🪙${fmt(Math.floor(my.bet / 2))})`), h('button', { class: 'btn ghost', style: { color: '#fff' }, onclick: () => cmd('bj.ins', { table: id, take: false }) }, 'No thanks')) : null,
      turnMine ? h('div', { class: 'row' }, ['hit', 'stand', 'double', 'split'].map(a => h('button', { class: 'btn' + (a === 'stand' ? ' alt' : ''), disabled: !legal.includes(a), onclick: act(a) }, a[0].toUpperCase() + a.slice(1) + ` (${a[0].toUpperCase()})`))) : null,
      h('div', { style: { color: '#cfe', fontSize: '.8rem' } }, `6 decks · dealer stands on 17 · blackjack pays 3:2 · double any two · split to 4 · ${t.shoeLeft} cards left · min ${t.min}/max ${fmt(t.max)}`)) : h('div', { style: { color: '#cfe', textAlign: 'center', marginTop: '8px' } }, 'Pick an empty seat to play. Hole card stays hidden until the dealer reveals it.'));
}
function bjEv(t, ev) {
  if (['deal', 'split', 'settle'].includes(ev.k)) { const { k, ...snap } = ev; if (snap.seats) Object.assign(t, snap); if (ev.k === 'deal') sfx('card'); if (ev.k === 'settle') { const r = ev.results[S.me.id]; if (r) { sfx(r.ret > r.staked ? 'win' : r.ret === r.staked ? 'click' : 'lose'); } t.dealer = ev.dealer; t.dealerValue = ev.dealerValue; } }
  else if (ev.k === 'phase') { t.phase = ev.phase; t.endsAt = ev.endsAt; if (ev.phase === 'idle') { t.dealer = []; t.dealerValue = 0; for (const s of t.seats) if (s) { s.hands = []; s.bet = 0; } } }
  else if (ev.k === 'seat') { t.seats[ev.seat] = ev.pid ? { pid: ev.pid, bet: 0, hands: [], insurance: 0 } : null; }
  else if (ev.k === 'bet') { if (t.seats[ev.seat]) t.seats[ev.seat].bet = ev.amount; sfx('chip'); }
  else if (ev.k === 'turn') { t.active = { seat: ev.seat, hand: ev.hand }; t.phase = 'turns'; t.endsAt = ev.endsAt; }
  else if (ev.k === 'hit' || ev.k === 'double') { const hd = t.seats[ev.seat]?.hands[ev.hand]; if (hd) { hd.cards.push(ev.card); } sfx('card'); }
  else if (ev.k === 'dealer') { t.dealer = ev.dealer; t.phase = 'dealer'; sfx('card'); }
  else if (ev.k === 'kicked') { toast('You walked away from the table.'); closePanel('blackjack'); return; }
  rerender('blackjack');
}

// ================= POKER =================
const pk = { hole: {}, raise: 0 };
function openPoker(id, snap) { tables[id] = snap; pk.hole[id] = pk.hole[id] || []; openPanel('poker', `♠️ ${snap.name}`, () => pkBody(id), { w: 800, y: 20, x: Math.max(8, innerWidth / 2 - 400) }); }
function pkBody(id) {
  const t = tables[id]; const me = t.seats.findIndex(s => s && s.pid === S.me.id); const hole = pk.hole[id] || []; const legal = me >= 0 && t.toAct === me ? t.legal : null;
  const pos = [[50, 74], [9, 52], [9, 12], [50, 0], [91, 12], [91, 52]];
  const seatEl = (i) => { const s = t.seats[i]; const [px, py] = pos[i]; const base = { position: 'absolute', left: px + '%', top: py + '%', transform: 'translate(-50%,0)' };
    if (!s) return h('div', { class: 'seat', style: base }, h('button', { class: 'btn sm', disabled: me >= 0, onclick: () => buyIn(id, i) }, 'Sit'), t.bots ? h('button', { class: 'btn sm ghost', style: { color: '#fff' }, onclick: async () => { const r = await cmd('pk.bot', { table: id, seat: i, on: true }); if (!r.ok) err(r); } }, '+🤖') : null);
    const mine = i === me; const reveal = t.last?.reveal?.find(r => r.seat === i);
    return h('div', { class: 'seat' + (mine ? ' me' : '') + (t.toAct === i ? ' turn' : ''), style: base }, h('b', {}, (t.button === i ? '🅳 ' : '') + (mine ? 'You' : s.name)), h('div', {}, (t.fun ? '🎟' : '🪙') + fmt(s.stack)), s.bet ? h('div', { style: { color: '#ffe08a' } }, 'bet ' + fmt(s.bet)) : null, s.folded ? h('small', {}, 'folded') : s.allIn ? h('b', { style: { color: '#ffb3b3' } }, 'ALL-IN') : null,
      h('div', {}, mine ? hole.map(card) : (reveal ? reveal.hole.map(card) : (s.hasCards ? [card(-1), card(-1)] : null)), reveal ? h('div', { style: { fontSize: '.75rem' } }, reveal.hand) : null),
      t.toAct === i ? h('small', {}, '⏳ ', countdown(t.endsAt)) : null, s.bot && t.bots ? h('button', { class: 'btn sm ghost', style: { color: '#fff', padding: '0 6px' }, onclick: () => cmd('pk.bot', { table: id, seat: i, on: false }) }, '✕') : null); };
  const potTxt = `Pot ${t.fun ? '🎟' : '🪙'}${fmt(t.pot)}`;
  const win = t.last && t.phase === 'showdown' ? t.last.results.map(r => `${r.winners.map(w => t.seats[w]?.name || '?').join(' & ')} win ${fmt(r.amount)}${r.hand ? ' with ' + r.hand : ''}`).join(' · ') + (t.last.rake ? ` (rake ${t.last.rake})` : '') : '';
  const maxTo = legal?.maxRaiseTo || 0, minTo = legal?.minRaiseTo || 0; if (legal) pk.raise = Math.min(maxTo, Math.max(minTo, pk.raise || minTo));
  return h('div', { class: 'felt' }, h('div', { style: { position: 'relative', height: '400px' } },
    h('div', { style: { position: 'absolute', left: '50%', top: '30%', transform: 'translate(-50%,-50%)', textAlign: 'center' } }, h('div', {}, (t.board || []).map(card), Array.from({ length: 5 - (t.board || []).length }, () => h('span', { class: 'cardc', style: { opacity: 0.15 } }, ''))), h('div', { style: { fontWeight: 900, fontSize: '1.15rem' } }, potTxt), h('div', { style: { fontSize: '.85rem', minHeight: '1.4em', color: '#ffe08a', fontWeight: 800 } }, win || ({ waiting: me >= 0 ? (t.bots ? 'Add bots with +🤖 to start' : 'Waiting for another player…') : 'Take a seat', between: 'Next hand…' }[t.phase] || (t.phase.toUpperCase()))), h('small', { style: { color: '#cfe' } }, `${t.sb}/${t.bb}${t.rakePct ? ` · rake ${t.rakePct}% (cap 3BB, only if flop)` : ' · no rake'} · hand #${t.hand}`)),
    [0, 1, 2, 3, 4, 5].map(seatEl)),
    me >= 0 ? h('div', { class: 'row wrap', style: { justifyContent: 'center', marginTop: '6px' } },
      legal ? [h('button', { class: 'btn bad', onclick: () => pkAct(id, 'fold') }, 'Fold'), legal.actions.includes('check') ? h('button', { class: 'btn alt', onclick: () => pkAct(id, 'check') }, 'Check') : h('button', { class: 'btn alt', onclick: () => pkAct(id, 'call') }, `Call ${fmt(legal.toCall)}`),
        legal.actions.some(a => a === 'bet' || a === 'raise') ? [h('input', { type: 'range', min: minTo, max: maxTo, step: Math.max(1, t.bb / 2), value: pk.raise, style: { width: '160px' }, oninput: (e) => { pk.raise = +e.target.value; $('#pkamt').textContent = fmt(pk.raise); } }), h('b', { id: 'pkamt', style: { minWidth: '60px' } }, fmt(pk.raise)), h('button', { class: 'btn', onclick: () => pkAct(id, legal.actions.includes('bet') ? 'bet' : 'raise', pk.raise) }, legal.actions.includes('bet') ? 'Bet' : 'Raise to'), ...[['½ pot', 0.5], ['pot', 1]].map(([n, f]) => h('button', { class: 'btn sm ghost', style: { color: '#fff' }, onclick: () => { pk.raise = Math.max(minTo, Math.min(maxTo, Math.round(t.currentBet + (legal.pot + legal.toCall) * f))); rerender('poker'); } }, n)), h('button', { class: 'btn sm', onclick: () => pkAct(id, 'allin') }, 'All-in')] : h('button', { class: 'btn sm', onclick: () => pkAct(id, 'allin') }, 'All-in')] : h('span', { style: { color: '#cfe' } }, t.toAct >= 0 && t.toAct !== me ? `Waiting for ${t.seats[t.toAct]?.name || 'player'}…` : ''),
      h('button', { class: 'btn sm ghost', style: { color: '#fff' }, onclick: async () => { const r = await cmd('pk.rebuy', { table: id, amount: t.maxBuy - (t.seats[me].stack) }); if (!r.ok) err(r); } }, 'Top up'), t.seats[me].out === false ? null : null, h('button', { class: 'btn sm ghost', style: { color: '#fff' }, onclick: () => cmd('pk.sitin', { table: id }) }, 'Sit in'), h('button', { class: 'btn sm ghost', style: { color: '#fff' }, onclick: async () => { await cmd('pk.leave', { table: id }); toast('Leaving table — your stack returns after the hand.'); } }, 'Leave table')) : null,
    h('div', { style: { color: '#cfe', fontSize: '.8rem', marginTop: '4px' } }, `${t.fun ? 'Practice table: bots + Fun Chips (no Coins at stake).' : 'Real-Coins table: your buy-in is held by the table and returned when you leave.'} Hole cards are sent only to their owner. Timer ${t.fun ? '' : '25s + 30s bank'} · side pots supported.`));
}
function buyIn(id, seat) { const t = tables[id]; promptBox(`Buy in (${fmt(t.minBuy)}–${fmt(t.maxBuy)} ${t.fun ? 'Fun Chips' : 'Coins'})`, 'Amount', String(t.minBuy), async (v) => { const r = await cmd('pk.sit', { table: id, seat, buyin: +v }); if (!r.ok) err(r); }); }
async function pkAct(id, type, amount) { const r = await cmd('pk.act', { table: id, type, amount }); if (!r.ok) err(r); else sfx(type === 'fold' ? 'card' : 'chip'); }
function pokerEv(t, ev) {
  if (ev.k === 'state') { const { k, ...snap } = ev; Object.assign(t, snap, { legal: t.legal }); if (snap.phase === 'waiting' || snap.phase === 'between') { pk.hole[t.id] = []; } }
  else if (ev.k === 'seat') { if (ev.pid === null || ev.pid === undefined) t.seats[ev.seat] = null; else t.seats[ev.seat] = { ...ev, hasCards: false }; if (ev.pid === S.me.id || ev.pid === null) pk.hole[t.id] = []; }
  else if (ev.k === 'hand') { t.button = ev.button; t.hand = ev.hand; t.last = null; t.board = []; pk.hole[t.id] = []; sfx('card'); }
  else if (ev.k === 'hole') { pk.hole[t.id] = ev.cards; sfx('card'); }
  else if (ev.k === 'turn') { t.toAct = ev.seat; t.endsAt = ev.endsAt; t.legal = ev.legal && t.seats[ev.seat]?.pid === S.me.id ? ev.legal : null; if (t.legal) { pk.raise = 0; sfx('notify'); } }
  else if (ev.k === 'timebank') { t.endsAt = ev.endsAt; }
  else if (ev.k === 'action') { const s = t.seats[ev.seat]; if (s) { s.bet = ev.bet; s.stack = ev.stack; s.allIn = ev.allIn; if (ev.type === 'fold') { s.folded = true; s.hasCards = false; } } t.pot = ev.pot; sfx(ev.type === 'fold' ? 'card' : 'chip'); }
  else if (ev.k === 'street') { t.board = ev.board; t.phase = ev.phase; for (const s of t.seats) if (s) s.bet = 0; t.toAct = -1; sfx('card'); }
  else if (ev.k === 'showdown') { t.last = ev; t.phase = 'showdown'; t.toAct = -1; ev.stacks.forEach((v, i) => { if (t.seats[i]) t.seats[i].stack = v; }); const mine = ev.results.some(r => r.winners.includes(t.seats.findIndex(s => s && s.pid === S.me.id))); sfx(mine ? 'win' : 'click'); }
  else if (ev.k === 'stack') { if (t.seats[ev.seat]) t.seats[ev.seat].stack = ev.stack; }
  else if (ev.k === 'kicked') { toast('You walked away from the table.'); closePanel('poker'); return; }
  rerender('poker');
}

// ================= SLOTS =================
const sl = { bet: 0, spinning: false, auto: false, machine: null, thing: null };
function openSlots(r) {
  sl.machine = r.machine; sl.thing = r.thing; sl.pending = r.pending; sl.jackpot = r.jackpot; sl.bet = 0; sl.grid = null; sl.last = null; S.jackpot = r.jackpot;
  const m = sl.machine; const init = () => m.kind === 'classic' ? [[0, 1, 2]] : [[2, 3, 4, 5, 6], [3, 4, 5, 6, 7], [4, 5, 6, 7, 2]]; sl.grid = init();
  openPanel('slots', `🎰 ${m.name}`, () => slBody(), { w: m.kind === 'classic' ? 440 : 560, y: 40, onClose: () => { sl.auto = false; } });
}
function slBody() {
  const m = sl.machine; const sym = (i) => m.symbols[i].e; const winCells = sl.winCells || new Set();
  const reels = h('div', { class: 'reels' + (m.reels === 5 ? ' reels5' : ''), style: { textAlign: 'center', background: 'linear-gradient(#222,#444)', padding: '10px', borderRadius: '14px' } }, Array.from({ length: m.rows }, (_, r) => h('div', {}, Array.from({ length: m.reels }, (_, c) => h('span', { class: 'reel' + (winCells.has(r + ',' + c) ? ' win' : ''), id: `reel-${r}-${c}` }, sym(sl.grid[r][c]))))));
  const betTxt = m.kind === 'video' ? (b, i) => `🪙${b} (${m.lineBets[i]}×${m.lines})` : (b) => `🪙${b}`;
  const free = sl.pending && sl.pending.machine === m.id && sl.pending.left > 0;
  return h('div', { class: 'col' }, h('div', { class: 'felt', style: { background: 'linear-gradient(#3a1d5c,#1f0f33)', textAlign: 'center' } }, h('div', { style: { fontSize: '.85rem', color: '#ffe08a' } }, 'TOWN JACKPOT ', h('b', { class: 'jp', style: { fontSize: '1.3rem' } }, fmt(S.jackpot)), m.kind === 'classic' ? ` — ☘☘☘ at max bet (🪙${m.jackpotBet}) wins it!` : ''), reels,
    h('div', { style: { minHeight: '1.8em', fontSize: '1.2rem', fontWeight: 900, color: '#ffe08a' } }, free ? `🎁 FREE SPINS LEFT: ${sl.pending.left} (×${m.fsMult})` : '', ' ', sl.last || '')),
    h('div', { class: 'row wrap' }, free ? h('span', { class: 'chip' }, 'Free spin — no bet') : m.bets.map((b, i) => h('button', { class: 'tab' + (sl.bet === i ? ' on' : ''), onclick: () => { sl.bet = i; rerender('slots'); } }, betTxt(b, i))), h('span', { class: 'grow' }), h('b', {}, '🪙 ' + fmt(S.me.coins))),
    h('div', { class: 'row' }, h('button', { class: 'btn grow', style: { fontSize: '1.3rem' }, disabled: sl.spinning, onclick: () => slSpin() }, sl.spinning ? '…' : (free ? '🎁 FREE SPIN' : '🎰 SPIN (Space)')), h('label', {}, h('input', { type: 'checkbox', checked: sl.auto, onchange: (e) => { sl.auto = e.target.checked; if (sl.auto) slSpin(); } }), ' Autoplay')),
    h('details', {}, h('summary', { style: { cursor: 'pointer', fontWeight: 800 } }, '📜 Pay table'), m.kind === 'classic' ? h('table', { class: 't' }, [['☘☘☘', m.pay3[0] + '× (+JACKPOT at max bet)'], ['⭐⭐⭐', m.pay3[1]], ['🔔🔔🔔', m.pay3[2]], ['🧲🧲🧲', m.pay3[3]], ['🍋🍋🍋', m.pay3[4]], ['🍒🍒🍒', m.pay3[5]], ['Any 3 of 🧲🍋🍒', m.mixed], ['🍒🍒 (reels 1-2)', m.cherry2], ['🍒 (reel 1)', m.cherry1]].map(([a, b]) => h('tr', {}, h('td', {}, a), h('td', {}, b + '×')))) : h('div', { class: 'muted', style: { fontSize: '.85rem' } }, h('div', {}, '20 fixed lines, left to right. 🌴 wild substitutes everything but 🐚. Pays (×line bet, 3/4/5 of a kind): ', Object.entries(m.pay).map(([s, p]) => `${m.symbols[s].e} ${p.join('/')}`).join(' · '), ` · 🌴 ${m.wildPay.join('/')}`), h('div', {}, `🐚 anywhere: 3/4/5 pay ${m.scatterPay[3]}/${m.scatterPay[4]}/${m.scatterPay[5]}× total bet and award ${m.freeSpins[3]}/${m.freeSpins[4]}/${m.freeSpins[5]} free spins with ×${m.fsMult} line wins.`))), h('small', { class: 'muted' }, 'Fictional Coins only. Every spin is decided by the Host’s RNG (certified ~94–95% return). 1% of each wager feeds the Town Jackpot.'));
}
async function slSpin() {
  if (sl.spinning) return; const m = sl.machine; sl.spinning = true; sl.winCells = null; sl.last = ''; rerender('slots'); sfx('spin');
  const r = await cmd('sl.spin', { thing: sl.thing, bet: sl.bet });
  if (!r.ok) { sl.spinning = false; sl.auto = false; rerender('slots'); return err(r); }
  const res = r.result; sl.pending = r.pending; S.jackpot = r.jackpot;
  // animate reels stopping one after another on the pre-decided result
  const rows = m.rows; const spinTimers = []; const randSym = () => Math.floor(Math.random() * m.symbols.length);
  const start = performance.now(); const stopAt = (c) => 450 + c * 260;
  await new Promise((resolve) => { const tick = () => { const t = performance.now() - start; let done = true;
    for (let c = 0; c < m.reels; c++) for (let rr = 0; rr < rows; rr++) { const el = $(`#reel-${rr}-${c}`); if (!el) continue; if (t >= stopAt(c)) { if (!el.dataset.stopped) { el.dataset.stopped = 1; el.textContent = m.symbols[res.grid[rr][c]].e; if (rr === 0) sfx('reelStop'); } } else { done = false; el.textContent = m.symbols[randSym()].e; } }
    if (done) return resolve(); setTimeout(tick, 70); }; tick(); });
  sl.grid = res.grid; sl.spinning = false;
  const wc = new Set(); if (res.win > 0) { if (m.kind === 'classic') wc.add('0,0').add('0,1').add('0,2'); else for (const w of res.wins) for (let c = 0; c < w.count; c++) wc.add(`${m.paylines[w.line][c]},${c}`); } sl.winCells = wc;
  const big = res.win >= (res.bet || 1) * 10;
  sl.last = res.jackpot ? `🎉 JACKPOT! +${fmt(res.jackpotAmount)}` : res.win > 0 ? `WIN +${fmt(res.win)}` : ''; if (res.free) sl.last += `  🎁 ${res.free} FREE SPINS!`; if (res.win > 0) sfx('win', big); else if (!res.wasFree) sfx('reel');
  rerender('slots');
  if (sl.auto && S.me.coins >= (m.bets[sl.bet] || 0) && !res.jackpot && !(res.win >= (res.bet || 1) * 25)) setTimeout(() => panelOpen('slots') && sl.auto && slSpin(), 700); else sl.auto = false;
}
addEventListener('keydown', (e) => { if (e.code === 'Space' && panelOpen('slots') && !/INPUT|SELECT/.test(document.activeElement?.tagName)) { e.preventDefault(); slSpin(); } });

// ================= HORSES =================
let raceSnap = null; const hr = { kind: 'win', h1: 0, h2: 1, stake: 100 }; let hrTimer = null;
function openHorses(snap) { raceSnap = snap; openPanel('horses', '🐎 Marigold Downs', () => hrBody(), { w: 820, y: 20, x: Math.max(8, innerWidth / 2 - 410), onClose: () => clearInterval(hrTimer) }); clearInterval(hrTimer); hrTimer = setInterval(() => { if (!panelOpen('horses')) return clearInterval(hrTimer); if (raceSnap.phase === 'race') drawTrack(); }, 60); }
const TCOND = ['Fast', 'Soft'];
function hrBody() {
  const s = raceSnap; const race = s.race; const mine = s.myBets || [];
  const odds = (e) => `${e.odds.win}× / ${e.odds.place}× / ${e.odds.show}×`;
  const exo = hr.kind === 'exacta' ? (race.entries[hr.h1] && race.entries[hr.h2] ? exactaOdds(race, hr.h1, hr.h2) : '-') : null;
  const o = hr.kind === 'exacta' ? exo : race.entries[hr.h1]?.odds[hr.kind];
  return h('div', { class: 'col' }, h('div', { class: 'row' }, h('b', { style: { fontSize: '1.2rem' } }, `Race #${race.no} · ${race.dist} m · ${TCOND[race.cond]} track`), h('span', { class: 'chip' }, ({ betting: '🟢 Betting open', parade: '🐴 Parade', race: '🏁 Racing!', result: '🏆 Results' })[s.phase]), countdown(['betting', 'parade'].includes(s.phase) ? s.endsAt : 0), h('span', { class: 'grow' }), h('small', { class: 'muted', style: { fontFamily: 'monospace' } }, 'receipt ' + race.seedHash.slice(0, 12) + '…')),
    h('div', { class: 'track', id: 'hrtrack', style: { display: ['race', 'result'].includes(s.phase) ? '' : 'none' } }, h('div', { class: 'finish' }), race.entries.map((e, i) => h('div', { class: 'lane', style: { top: i * 32 + 2 + 'px' } }, h('span', { style: { position: 'absolute', left: '2px', color: '#fff', fontSize: '10px' } }, i + 1), h('div', { class: 'horse', id: 'h' + i, style: { left: '20px', top: '0' } }, h('span', { style: { display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: e.silks, marginRight: '3px' } }), '🐎')))),
    s.phase === 'result' && s.order ? h('div', { class: 'card' }, h('b', {}, '🏆 Result: '), s.order.slice(0, 3).map((slot, k) => `${['🥇', '🥈', '🥉'][k]} #${slot + 1} ${race.entries[slot].name}`).join('   '), s.pays && s.pays[S.me.id] ? h('div', { class: s.pays[S.me.id].ret >= s.pays[S.me.id].staked ? 'good' : 'bad' }, `You staked 🪙${fmt(s.pays[S.me.id].staked)} and got back 🪙${fmt(s.pays[S.me.id].ret)}`) : null) : null,
    h('table', { class: 't' }, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Horse'), h('th', {}, 'Spd'), h('th', {}, 'Sta'), h('th', {}, 'Form'), h('th', {}, 'Win prob'), h('th', {}, 'Odds win / place / show')), race.entries.map((e, i) => h('tr', { style: { cursor: 'pointer', background: hr.h1 === i ? '#f2a93b33' : '' }, onclick: () => { hr.h1 = i; if (hr.h2 === i) hr.h2 = (i + 1) % 8; rerender('horses'); } }, h('td', {}, h('span', { style: { display: 'inline-block', width: '12px', height: '12px', borderRadius: '50%', background: e.silks } }), ' ' + (i + 1)), h('td', {}, e.name, ' ', h('small', { class: 'muted' }, `(${e.record.join('-')})`)), h('td', {}, bar(e.speed)), h('td', {}, bar(e.stamina)), h('td', {}, bar(e.form)), h('td', {}, Math.round(e.pWin * 100) + '%'), h('td', {}, odds(e))))),
    s.phase === 'betting' ? h('div', { class: 'card row wrap' }, h('select', { onchange: (e) => { hr.kind = e.target.value; rerender('horses'); } }, [['win', 'Win (1st)'], ['place', 'Place (top 2)'], ['show', 'Show (top 3)'], ['exacta', 'Exacta (1st+2nd in order)']].map(([v, n]) => h('option', { value: v, selected: hr.kind === v }, n))),
      h('select', { onchange: (e) => { hr.h1 = +e.target.value; rerender('horses'); } }, race.entries.map((e, i) => h('option', { value: i, selected: hr.h1 === i }, `#${i + 1} ${e.name}`))), hr.kind === 'exacta' ? [' then ', h('select', { onchange: (e) => { hr.h2 = +e.target.value; rerender('horses'); } }, race.entries.map((e, i) => h('option', { value: i, selected: hr.h2 === i }, `#${i + 1} ${e.name}`)))] : null,
      h('input', { type: 'number', min: 10, max: 5000, value: hr.stake, style: { width: '90px' }, onchange: (e) => { hr.stake = Math.max(10, Math.min(5000, +e.target.value | 0)); rerender('horses'); } }), h('span', {}, o ? `odds ${o}× → returns 🪙${fmt(Math.floor(hr.stake * o))}` : ''), h('button', { class: 'btn', onclick: async () => { const hs = hr.kind === 'exacta' ? [hr.h1, hr.h2] : [hr.h1]; const r = await cmd('hr.bet', { kind: hr.kind, horses: hs, stake: hr.stake }); if (r.ok) { sfx('chip'); toast('Bet placed — odds locked.', 'good'); raceSnap.myBets.push(r.bet); rerender('horses'); } else err(r); } }, 'Place bet')) : null,
    mine.length ? h('div', {}, h('b', {}, 'Your bets: '), mine.map(b => h('span', { class: 'chip', style: { marginRight: '4px' } }, `${b.kind} ${b.horses.map(x => '#' + (x + 1)).join('→')} 🪙${b.stake} @${b.odds}×`))) : null,
    h('small', { class: 'muted' }, 'Fictional Coins only. Odds are fixed at bet time (15% takeout; exacta 20%). The finishing order is decided by the Host before the animation; displayed probabilities are exact.'),
    raceSnap.history?.length ? h('small', { class: 'muted' }, 'Recent winners: ' + raceSnap.history.slice(0, 5).map(x => `#${x.no} ${x.winner}`).join(' · ')) : null);
}
const bar = (v) => h('div', { class: 'bar', style: { width: '60px' } }, h('i', { style: { width: Math.min(100, v) + '%' } }));
function exactaOdds(race, a, b) { // approximate preview from win probabilities using the same Plackett-Luce form; Host computes the authoritative value on bet
  const S_ = race.entries.map(e => e.pWin); const tot = S_.reduce((x, y) => x + y, 0); const p = (S_[a] / tot) * (S_[b] / (tot - S_[a])); return Math.max(1.1, Math.floor(((1 - 0.2) / p) * 10) / 10);
}
function onHorse(ev) {
  if (!raceSnap) return; const s = raceSnap;
  if (ev.k === 'race') { raceSnap = { ...s, race: ev.race, phase: 'betting', endsAt: ev.endsAt, myBets: [], order: null, chor: null, pays: null }; hr.h1 = 0; hr.h2 = 1; }
  else if (ev.k === 'phase') { s.phase = ev.phase; s.endsAt = ev.endsAt; if (ev.phase === 'parade') sfx('bell'); }
  else if (ev.k === 'start') { s.phase = 'race'; s.startedAt = ev.startedAt; s.chor = ev.chor; s.animSeed = ev.animSeed; s.endsAt = ev.endsAt; sfx('bell'); sfx('hooves'); }
  else if (ev.k === 'result') { s.phase = 'result'; s.order = ev.order; s.times = ev.times; s.pays = ev.pays; s.history = ev.history; const p = ev.pays[S.me.id]; if (p) sfx(p.ret > p.staked ? 'win' : 'lose', p.ret > p.staked * 5); if (p) toast(p.ret ? `🐎 Your bets returned 🪙${fmt(p.ret)}` : 'No winning bets this race.', p.ret ? 'good' : 'info'); }
  if (panelOpen('horses')) { rerender('horses'); if (s.phase === 'race' || s.phase === 'result') drawTrack(true); }
}
function drawTrack(final) {
  const s = raceSnap; const track = $('#hrtrack'); if (!track || !s.chor) return; const t = s.phase === 'result' ? 1e9 : (now() - s.startedAt) / 1000; const W = track.clientWidth - 90;
  s.chor.times.forEach((T_, i) => { const u = Math.min(1, Math.max(0, t / T_)); const w = s.chor.wobble[i]; const p = u + (w.a / (2 * Math.PI * w.k)) * Math.sin(2 * Math.PI * w.k * u) * 0.9; const el = $('#h' + i); if (el) el.style.left = (20 + Math.min(1, Math.max(0, p)) * W) + 'px'; });
}

// ================= CASHIER =================
async function openCashier() {
  const r = await cmd('cas.limits'); if (!r.ok) return err(r); let info = r;
  openPanel('cashier', '💰 Cashier & responsible play', () => {
    const cool = info.coolOff > Date.now() + S.serverOffset; const lim = h('input', { type: 'number', min: 0, value: info.dailyLimit, style: { width: '110px' } });
    return h('div', { class: 'col', style: { width: '420px' } }, h('div', { class: 'card' }, h('div', {}, 'Today’s net result: ', h('b', { class: info.net >= 0 ? 'good' : 'bad' }, `${info.net >= 0 ? '+' : ''}${fmt(info.net)} 🪙`)), h('div', {}, `Session time: ${info.sessionMin} min`), h('div', {}, '🎰 Town Jackpot pool: 🪙 ', h('b', { class: 'jp' }, fmt(info.jackpot)))),
      h('div', { class: 'muted' }, 'All games here use fictional Coins only — there is no real money, no cash-out and Stars can never be wagered. The house always has an edge, so treat Coins as entertainment.'),
      h('div', { class: 'row' }, h('label', {}, 'Daily loss limit (0 = off): '), lim, h('button', { class: 'btn sm', onclick: async () => { const x = await cmd('cas.dailyLimit', { value: +lim.value }); toast(x.ok ? 'Limit saved' : errText(x), x.ok ? 'good' : 'warn'); } }, 'Save')),
      cool ? h('div', { class: 'bad' }, `❄ Cool-off active until ${new Date(info.coolOff).toLocaleString()}`) : h('div', { class: 'row' }, h('button', { class: 'btn alt', onclick: () => confirmBox('Lock yourself out of the casino for 24 hours? The Host cannot undo this.', async () => { await cmd('cas.cooloff', { hours: 24 }); toast('Casino locked for 24h'); closePanel('cashier'); }) }, '❄ Cool-off 24 h'), h('button', { class: 'btn alt', onclick: () => confirmBox('Lock yourself out of the casino for 7 days?', async () => { await cmd('cas.cooloff', { hours: 168 }); toast('Casino locked for 7 days'); closePanel('cashier'); }) }, '❄ 7 days')));
  }, { w: 450, y: 80 });
}
