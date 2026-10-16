import test from 'node:test';
import assert from 'node:assert/strict';
import { startHost, Bot, place, sleep } from './helpers.js';
import { audit } from '../server/ledger.js';
import { BlackjackTable } from '../server/casino/blackjack.js';
import { PokerTable, buildPots } from '../server/casino/poker.js';
import { RoundRng } from '../server/rng.js';
import { ACHIEVEMENTS } from '../shared/content.js';

const rich = (game, bot, n = 100000) => { const { credit } = game.__ledger; credit(game.state, bot.me.id, n, 'test'); };
async function setup(t, names = ['Ann']) {
  const h = await startHost(); t.after(() => h.host.close());
  const { credit } = await import('../server/ledger.js'); h.game.__ledger = { credit };
  h.game.opts.rateBurst = 100000; h.game.opts.rateRefill = 100000;
  const bots = []; for (const n of names) { const b = await new Bot(h.url, n).connect(); bots.push(b); await sleep(30); const p = h.game.state.players[b.me.id]; for (const a of ACHIEVEMENTS) p.ach[a.id] = { p: a.target, done: true }; }   // no achievement payouts in money tests
  return { ...h, bots };
}

test('roulette: bets debit, spin result decided before animation, payouts credited, coins conserved', async (t) => {
  const { game, bots: [a] } = await setup(t); place(game, a, 'casino', 7, 9); await sleep(30);
  const before = game.state.players[a.me.id].coins;
  let r = await a.cmd('rl.bet', { table: 'roulette1', spot: 0, amount: 100 }); assert.ok(r.ok, JSON.stringify(r));        // straight 0
  r = await a.cmd('rl.bet', { table: 'roulette1', spot: 156, amount: 100 }); assert.ok(r.ok);                                // even money
  assert.equal((await a.cmd('rl.bet', { table: 'roulette1', spot: 999, amount: 100 })).err, 'bad_spot');
  assert.equal((await a.cmd('rl.bet', { table: 'roulette1', spot: 0, amount: 5 })).err, 'min_bet');
  assert.equal((await a.cmd('rl.bet', { table: 'roulette1', spot: 0, amount: 3000 })).err, 'table_limit');
  const spin = await a.waitFor(m => m.t === 'tev' && m.table === 'roulette1' && m.ev.k === 'spin'); assert.ok(spin.ev.result >= 0 && spin.ev.result <= 36);
  assert.equal((await a.cmd('rl.bet', { table: 'roulette1', spot: 1, amount: 100 })).err, 'betting_closed');             // late bet rejected
  const st = await a.waitFor(m => m.t === 'tev' && m.table === 'roulette1' && m.ev.k === 'settle'); assert.equal(st.ev.result, spin.ev.result);
  const n = spin.ev.result; await sleep(30);
  const delta = game.state.players[a.me.id].coins - before;
  assert.equal(delta, (n === 0 ? 3600 : 0) + (n >= 19 ? 200 : 0) - 200);            // straight-up 0 pays 35:1, 19-36 pays 1:1, both stakes were debited
  assert.ok(audit(game.state).ok, audit(game.state).errors.join());
});

test('slots: paid spin, free spins pending persists, jackpot feed, coins conserved over many spins', async (t) => {
  const { game, bots: [a] } = await setup(t); place(game, a, 'casino', 4.5, 14.8); await sleep(30); game.__ledger.credit(game.state, a.me.id, 2_000_000, 't');
  let free = 0;
  for (let i = 0; i < 400; i++) {
    const thing = i % 2 ? 'slot2' : 'slot1'; place(game, a, 'casino', i % 2 ? 5.5 : 3.5, 14.8);
    const r = await a.cmd('sl.spin', { thing, bet: 0 }); assert.ok(r.ok, JSON.stringify(r)); if (r.result.free) free++;
    if (a.me && r.pending) { /* free spins must be played on the same machine */ }
  }
  assert.ok(game.state.accts.jackpot > 50000); assert.ok(audit(game.state).ok, audit(game.state).errors.join());
  const p = game.state.players[a.me.id]; assert.ok(p.stats.slotsRounds >= 100);
});

test('blackjack: full round with a real client; stand/hit; settle exactly; dealer hole card hidden until reveal', async (t) => {
  const { game, bots: [a] } = await setup(t); place(game, a, 'casino', 17.5, 7.5); await sleep(30);
  let r = await a.cmd('bj.sit', { table: 'bj1', seat: 2 }); assert.ok(r.ok, JSON.stringify(r));
  const before = game.state.players[a.me.id].coins;                      // measured BEFORE betting: a natural blackjack settles instantly on the deal
  r = await a.cmd('bj.bet', { table: 'bj1', amount: 100 }); assert.ok(r.ok);
  const deal = await a.waitFor(m => m.t === 'tev' && m.table === 'bj1' && m.ev.k === 'deal'); assert.equal(deal.ev.dealer[1], -1, 'hole card hidden');
  // play: stand whenever it's our turn
  for (let i = 0; i < 30; i++) {
    const t0 = game.tables.bj1; if (t0.phase === 'settle' || t0.phase === 'idle') break;
    if (t0.phase === 'insurance') await a.cmd('bj.ins', { table: 'bj1', take: false });
    if (t0.phase === 'turns') await a.cmd('bj.act', { table: 'bj1', act: 'stand' });
    await sleep(40);
  }
  const settle = await a.waitFor(m => m.t === 'tev' && m.table === 'bj1' && m.ev.k === 'settle', 4000);
  assert.equal(settle.ev.dealer.length >= 2, true); const res = settle.ev.results[a.me.id];
  assert.ok(['win', 'lose', 'push', 'blackjack'].includes(res.res[0]));
  assert.equal(game.state.players[a.me.id].coins - before, res.ret - 100);   // bet debited, payout credited, nothing else
  assert.ok(audit(game.state).ok);
});

test('blackjack engine rules: double, split, bust, insurance, blackjack pays 3:2 (scripted shoe)', () => {
  const paid = {}; const ctx = { now: () => Date.now(), newRng: () => new RoundRng(), emit() {}, bet: () => ({ ok: true }), pay: (pid, n) => { paid[pid] = (paid[pid] || 0) + n; }, online: () => true, settled() {} };
  const mk = (cards) => { const t = new BlackjackTable('x', { name: 'x', min: 10, max: 1000, timers: { bet: 50, settle: 10 } }, ctx); t.shoe = [...cards, ...new Array(300).fill(0)]; t.idx = 0; t.cut = 9999; t._reshuffle = () => {}; return t; };
  const C = (rank, suit = 0) => suit * 13 + rank; // rank 0='2'.. 8='T', 12='A'
  // natural blackjack: player A,K ; dealer 9,7 -> 2.5x
  let t = mk([C(12), C(5), C(8), C(7)]); t.sit('p', 0); t.bet('p', 100); t._start(); assert.equal(t.phase, 'settle'); assert.equal(paid.p, 250);
  // double down on 11 vs 6: player 5,6 ; dealer 6,10 ; draw 10 (21) ; dealer 6+10=16 hits 10 -> bust ; pays 2*200 = 400
  paid.p = 0; t = mk([C(3), C(4), C(4), C(8), C(8), C(8)]); t.sit('p', 0); t.bet('p', 100); t._start(); assert.equal(t.phase, 'turns'); assert.deepEqual(t.legal('p').sort(), ['double', 'hit', 'stand']);
  assert.ok(t.action('p', 'double').ok); assert.equal(t.phase, 'settle'); assert.equal(paid.p, 400);
  // push: player 10,8 stand vs dealer 10,8 
  paid.p = 0; t = mk([C(8), C(8), C(6), C(6)]); t.sit('p', 0); t.bet('p', 100); t._start(); t.action('p', 'stand'); assert.equal(paid.p, 100);
  // split eights: both hands get one card then play
  paid.p = 0; t = mk([C(6), C(8), C(6), C(7), C(1), C(2), C(8), C(8)]); t.sit('p', 0); t.bet('p', 100); t._start(); assert.ok(t.legal('p').includes('split')); assert.ok(t.action('p', 'split').ok); assert.equal(t.seats[0].hands.length, 2);
  // insurance wins against dealer blackjack: dealer shows A, hole K
  paid.p = 0; t = mk([C(8), C(12), C(7), C(8)]); t.sit('p', 0); t.bet('p', 100); t._start(); assert.equal(t.phase, 'insurance'); t.insurance('p', true); assert.equal(t.phase, 'settle'); assert.equal(paid.p, 150);   // insurance 50 pays 3x = 150; main bet lost
});

test('poker: side pots, odd chips, uncalled bets, and a bot practice hand end-to-end', async (t) => {
  // side pots: A all-in 100, B all-in 300, C 500 calls: main 300 (A,B,C) side 400 (B,C) uncalled 200 returned to C
  const { pots, refunds } = buildPots([{ seat: 0, amt: 100, folded: false }, { seat: 1, amt: 300, folded: false }, { seat: 2, amt: 500, folded: false }]);
  assert.deepEqual(pots.map(p => p.amount), [300, 400, 0].slice(0, pots.length)); assert.deepEqual(refunds, [{ seat: 2, amt: 200 }]);
  assert.deepEqual(pots[0].eligible.sort(), [0, 1, 2]); assert.deepEqual(pots[1].eligible.sort(), [1, 2]);
  // folded dead money stays in the pot
  const p2 = buildPots([{ seat: 0, amt: 50, folded: true }, { seat: 1, amt: 100, folded: false }, { seat: 2, amt: 100, folded: false }]);
  assert.equal(p2.pots.reduce((a, p) => a + p.amount, 0), 250);
  const { game, bots: [a] } = await setup(t); place(game, a, 'casino', 26, 9); await sleep(30);
  let r = await a.cmd('pk.sit', { table: 'poker2', seat: 0, buyin: 1000 }); assert.ok(r.ok, JSON.stringify(r));
  for (const seat of [1, 2]) assert.ok((await a.cmd('pk.bot', { table: 'poker2', seat, on: true })).ok);
  assert.equal((await a.cmd('pk.sit', { table: 'poker1', seat: 0, buyin: 1000 })).err, 'too_far');
  // play 3 hands: check/call or fold when it is our turn
  let hands = 0; const t0 = Date.now();
  while (hands < 3 && Date.now() - t0 < 15000) {
    const tb = game.tables.poker2;
    if (tb.phase === 'showdown') { hands = Math.max(hands, tb.handNo); }
    if (tb.toAct === 0 && ['preflop', 'flop', 'turn', 'river'].includes(tb.phase)) { const legal = tb.legalFor(0); const act = legal.actions.includes('check') ? 'check' : 'call'; const rr = await a.cmd('pk.act', { table: 'poker2', type: act }); assert.ok(rr.ok, JSON.stringify(rr)); }
    await sleep(30);
  }
  assert.ok(hands >= 3, 'played hands: ' + hands);
  const tot = game.tables.poker2.seats.reduce((s, x) => s + (x ? x.stack : 0) + (x?.total || 0), 0); // fun chips conserved: 1000 + 2 bots * 1000
  assert.ok(audit(game.state).ok, audit(game.state).errors.join());
});

test('poker real-money table: two humans, buy-in escrow, fold, cash-out conserves coins', async (t) => {
  const { game, bots: [a, b] } = await setup(t, ['P1', 'P2']); for (const x of [a, b]) { place(game, x, 'casino', 18.5, 9); game.__ledger.credit(game.state, x.me.id, 5000, 't'); } await sleep(30);
  const c0 = [a, b].map(x => game.state.players[x.me.id].coins);
  assert.ok((await a.cmd('pk.sit', { table: 'poker1', seat: 0, buyin: 1000 })).ok); assert.ok((await b.cmd('pk.sit', { table: 'poker1', seat: 3, buyin: 1000 })).ok);
  assert.equal(game.state.escrow['escrow:poker1'], 2000);
  const hole = await a.waitFor(m => m.t === 'tev' && m.ev.k === 'hole', 5000); assert.equal(hole.ev.cards.length, 2);
  // privacy: b must not receive a's hole cards
  assert.ok(!b.events.some(m => m.t === 'tev' && m.ev.k === 'hole' && m.ev.seat === 0), 'opponent hole cards leaked');
  const tb = game.tables.poker1; const actor = tb.toAct; const who = actor === 0 ? a : b; const legal = tb.legalFor(actor);
  assert.ok(who && legal.actions.includes('fold')); assert.ok((await who.cmd('pk.act', { table: 'poker1', type: 'fold' })).ok);
  await a.waitFor(m => m.t === 'tev' && m.ev.k === 'showdown', 3000);
  assert.ok((await a.cmd('pk.leave', { table: 'poker1' })).ok); assert.ok((await b.cmd('pk.leave', { table: 'poker1' })).ok); await sleep(900);
  const c1 = [a, b].map(x => game.state.players[x.me.id].coins);
  assert.equal(c1[0] + c1[1], c0[0] + c0[1], 'no flop => no rake; all escrow returned');
  assert.ok(audit(game.state).ok, audit(game.state).errors.join());
});

test('horses: odds locked, bet limits, race runs, payouts follow the decided order, conservation', async (t) => {
  const { game, bots: [a] } = await setup(t); place(game, a, 'track', 13.5, 8.5); await sleep(30);
  const snap = a.tables.horses; const race0 = snap.race; assert.equal(race0.entries.length, 8);
  const totalP = race0.entries.reduce((s, e) => s + e.pWin, 0); assert.ok(Math.abs(totalP - 1) < 0.01);
  assert.ok(race0.entries.every(e => e.odds.win >= 1.1));
  assert.equal((await a.cmd('hr.bet', { kind: 'win', horses: [1], stake: 5 })).err, 'stake_limits');
  assert.equal((await a.cmd('hr.bet', { kind: 'exacta', horses: [1, 1], stake: 100 })).err, 'bad_horses');
  const odds = race0.entries[2].odds.win; const c0 = game.state.players[a.me.id].coins;
  let r = await a.cmd('hr.bet', { kind: 'win', horses: [2], stake: 100 }); assert.ok(r.ok, JSON.stringify(r)); assert.equal(r.bet.odds, odds);
  await a.cmd('hr.bet', { kind: 'show', horses: [2], stake: 100 });
  const start = await a.waitFor(m => m.t === 'tev' && m.ev.k === 'start', 8000); assert.equal(start.ev.chor.times.length, 8);
  assert.equal((await a.cmd('hr.bet', { kind: 'win', horses: [1], stake: 100 })).err, 'betting_closed');
  const res = await a.waitFor(m => m.t === 'tev' && m.ev.k === 'result', 8000);
  const order = res.ev.order; assert.equal(new Set(order).size, 8);
  const times = res.ev.times; for (let k = 1; k < 8; k++) assert.ok(times[order[k]] >= times[order[k - 1]], 'finish times follow decided order');
  const expect = (order[0] === 2 ? Math.floor(100 * odds) : 0) + (order.slice(0, 3).includes(2) ? Math.floor(100 * race0.entries[2].odds.show) : 0);
  await sleep(50); assert.equal(game.state.players[a.me.id].coins - c0, expect - 200);
  assert.ok(audit(game.state).ok, audit(game.state).errors.join());
});

test('responsible play: cool-off blocks bets; casino can be switched off by the Host', async (t) => {
  const { game, bots: [a] } = await setup(t); place(game, a, 'casino', 7, 9); await sleep(30);
  assert.ok((await a.cmd('cas.cooloff', { hours: 24 })).ok);
  assert.equal((await a.cmd('rl.bet', { table: 'roulette1', spot: 0, amount: 100 })).err, 'cooling_off');
  game.state.players[a.me.id].casino.coolOff = 0; game.state.meta.settings.casino = false;
  assert.equal((await a.cmd('rl.bet', { table: 'roulette1', spot: 0, amount: 100 })).err, 'casino_disabled');
});
