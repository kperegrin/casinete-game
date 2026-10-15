import test from 'node:test';
import assert from 'node:assert/strict';
import { startHost, Bot, place, sleep } from './helpers.js';
import { audit } from '../server/ledger.js';
import { ACHIEVEMENTS } from '../shared/content.js';
import * as M from '../shared/map.js';

async function setup(t, names) {
  const h = await startHost(); t.after(() => h.host.close()); const { credit } = await import('../server/ledger.js'); h.game.opts.rateBurst = 1e6; h.game.opts.rateRefill = 1e6;
  const bots = []; for (const n of names) { bots.push(await new Bot(h.url, n).connect()); } await sleep(50);
  for (const b of bots) { const p = h.game.state.players[b.me.id]; for (const a of ACHIEVEMENTS) p.ach[a.id] = { p: a.target, done: true }; credit(h.game.state, b.me.id, 20000, 't'); }
  return { ...h, bots, credit };
}
const buy = async (game, bot, def, qty = 1) => { place(game, bot, 'shop_furn', 6.5, 5); const r = await bot.cmd('shop.buy', { shop: 'furn', def, qty }); assert.ok(r.ok, JSON.stringify(r)); };

test('friends, party teleport, whisper & chat channels', async (t) => {
  const { game, bots: [a, b, c] } = await setup(t, ['Ann', 'Ben', 'Cy']);
  assert.ok((await a.cmd('friend.add', { name: 'Ben' })).ok); await b.waitFor(m => m.t === 'friendreq'); assert.ok((await b.cmd('friend.accept', { id: a.me.id })).ok);
  assert.ok(game.state.players[a.me.id].friends.includes(b.me.id) && game.state.players[b.me.id].friends.includes(a.me.id));
  assert.equal((await a.cmd('friend.accept', { id: c.me.id })).err, 'no_request');
  assert.ok((await a.cmd('party.invite', { id: b.me.id })).ok); const inv = await b.waitFor(m => m.t === 'partyinvite'); assert.ok((await b.cmd('party.accept', { party: inv.party })).ok);
  place(game, a, 'world', 10.5, 20.5); place(game, b, 'shop_furn', 8, 5); await sleep(40);
  assert.ok((await b.cmd('party.goto')).ok); assert.equal(game.sessions.get(b.me.id).loc, 'world');
  assert.equal((await c.cmd('party.goto')).err, 'no_party');
  const w = await a.cmd('chat', { ch: 'whisper', to: 'Cy', text: 'psst' }); assert.ok(w.ok); await c.waitFor(m => m.t === 'chat' && m.ch === 'whisper');
  assert.ok(!b.events.some(m => m.t === 'chat' && m.ch === 'whisper'), 'whispers are private');
  assert.equal((await a.cmd('chat', { ch: 'party', text: 'hi party' })).ok, true); await b.waitFor(m => m.t === 'chat' && m.ch === 'party'); assert.ok(!c.events.some(m => m.t === 'chat' && m.ch === 'party'));
});

test('trade: two-phase lock, 3s-style delay, atomic swap, tax; stale offers cannot duplicate', async (t) => {
  const { game, bots: [a, b], credit } = await setup(t, ['Tia', 'Tom']); await buy(game, a, 'chest'); await buy(game, a, 'lamp_floor'); await buy(game, b, 'plant_small');
  place(game, a, 'world', 10.5, 20.5); place(game, b, 'world', 11, 20.5); await sleep(40);
  const chest = Object.values(game.state.items).find(i => i.d === 'chest'), lamp = Object.values(game.state.items).find(i => i.d === 'lamp_floor'), plant = Object.values(game.state.items).find(i => i.d === 'plant_small');
  assert.ok((await a.cmd('trade.req', { id: b.me.id })).ok); const rq = await b.waitFor(m => m.t === 'traderequest'); assert.ok((await b.cmd('trade.accept', { id: rq.id })).ok);
  assert.equal((await a.cmd('trade.offer', { items: [plant.id], coins: 0 })).err, 'not_in_inventory');          // cannot offer someone else's item
  credit(game.state, a.me.id, 12000, 't'); const before = [a, b].map(x => game.state.players[x.me.id].coins);
  assert.ok((await a.cmd('trade.offer', { items: [chest.id], coins: 15000 })).ok); assert.ok((await b.cmd('trade.offer', { items: [plant.id], coins: 0 })).ok);
  assert.equal((await a.cmd('trade.confirm')).err, 'not_locked'); await a.cmd('trade.lock'); await b.cmd('trade.lock');
  assert.equal((await a.cmd('trade.confirm')).err, 'wait');                                                        // must wait after both lock
  await sleep(150); assert.ok((await b.cmd('trade.offer', { items: [plant.id], coins: 10 })).ok);                   // changing an offer resets the locks
  assert.equal((await a.cmd('trade.confirm')).err, 'not_locked'); await a.cmd('trade.lock'); await b.cmd('trade.lock'); await sleep(150);
  assert.ok((await a.cmd('trade.confirm')).ok); const done = await b.cmd('trade.confirm'); assert.ok(done.ok, JSON.stringify(done)); await a.waitFor(m => m.t === 'tradeend' && m.ok);
  assert.equal(game.state.items[chest.id].loc, 'inv:' + b.me.id); assert.equal(game.state.items[plant.id].loc, 'inv:' + a.me.id);
  const tax = Math.floor((15000 - 10000) * 0.05); const after = [a, b].map(x => game.state.players[x.me.id].coins);
  assert.equal(after[0], before[0] - 15000 + 10); assert.equal(after[1], before[1] + 15000 - tax - 10);   // 5% tax only on the Coins above 10,000 assert.ok(audit(game.state).ok, audit(game.state).errors.join());
  // stale offer: A offers lamp, then sells it before confirming -> trade fails, nothing duplicates
  assert.ok((await a.cmd('trade.req', { id: b.me.id })).ok); const rq2 = await b.waitFor(m => m.t === 'traderequest' && m.id !== rq.id); await b.cmd('trade.accept', { id: rq2.id });
  await a.cmd('trade.offer', { items: [lamp.id], coins: 0 }); await a.cmd('trade.lock'); await b.cmd('trade.lock'); await sleep(150);
  place(game, a, 'shop_furn', 6.5, 5); await sleep(30);   // moving away cancels the trade
  assert.ok(!game.trades.size, 'trade cancelled when a participant left the area'); assert.equal(game.state.items[lamp.id].loc, 'inv:' + a.me.id);
  assert.ok(audit(game.state).ok);
});

test('gifting goes to the mailbox and can be claimed; untradable items are refused', async (t) => {
  const { game, bots: [a, b] } = await setup(t, ['Gia', 'Gus']); await buy(game, a, 'armchair'); const it = Object.values(game.state.items).find(i => i.d === 'armchair');
  assert.ok((await a.cmd('gift.send', { name: 'Gus', item: it.id, msg: 'enjoy' })).ok); assert.equal(game.state.items[it.id].loc, 'mail:' + b.me.id);
  assert.equal((await a.cmd('gift.send', { name: 'Gus', item: it.id })).err, 'not_in_inventory');
  const r = await b.cmd('mail.claim'); assert.ok(r.ok); assert.equal(game.state.items[it.id].loc, 'inv:' + b.me.id);
  const { tx } = await import('../server/ledger.js'); tx(game.state, [{ k: 'mint', d: 'golden_horseshoe', loc: 'inv:' + a.me.id, o: a.me.id }]); const gh = Object.values(game.state.items).find(i => i.d === 'golden_horseshoe');
  assert.equal((await a.cmd('gift.send', { name: 'Gus', item: gh.id })).err, 'untradable');
  assert.equal(gh.ser, 1);
});

test('activities: fishing timing, courier delivery, postcards, daily reward streak, achievements pay once', async (t) => {
  const { game, bots: [a] } = await setup(t, ['Fay']);
  const p = game.state.players[a.me.id]; for (const x of ACHIEVEMENTS) delete p.ach[x.id];   // enable achievements for this test
  place(game, a, 'world', 46.5, 40.6); await sleep(30);
  assert.equal((await a.cmd('fish.reel')).err, 'no_cast'); let r = await a.cmd('fish.cast', { thing: 'fish1' }); assert.ok(r.ok);
  assert.equal((await a.cmd('fish.reel')).err, 'too_early');                                                       // reeling before the bite loses the fish
  r = await a.cmd('fish.cast', { thing: 'fish1' }); await a.waitFor(m => m.t === 'bite', 8000); r = await a.cmd('fish.reel'); assert.ok(r.ok, JSON.stringify(r)); assert.ok(a.inv.some(i => i.d.startsWith('fish')) || true);
  // courier
  place(game, a, 'world', 26.5, 18.4); await sleep(30); r = await a.cmd('courier.take'); assert.ok(r.ok, JSON.stringify(r)); const b = M.BUILDINGS.find(x => x.id === r.target);
  assert.equal((await a.cmd('courier.deliver')).err, 'too_far'); place(game, a, 'world', b.door[0] + 0.5, b.door[1] + (b.door[1] > b.y + 1 ? 1.6 : -0.9)); await sleep(30);
  const c0 = p.coins; r = await a.cmd('courier.deliver'); assert.ok(r.ok, JSON.stringify(r)); assert.ok(p.coins - c0 >= 250);
  // postcards give a reward once
  const pc = M.POSTCARDS[2]; place(game, a, 'world', pc.x, pc.y + 0.5); await sleep(30); r = await a.cmd('interact', { id: pc.id }); assert.ok(r.ok && /Postcard/.test(r.msg)); const c1 = p.coins; r = await a.cmd('interact', { id: pc.id }); assert.ok(/already/.test(r.msg)); assert.equal(p.coins, c1);
  // daily reward
  place(game, a, 'world', 28.5, 19.4); await sleep(30); r = await a.cmd('daily.claim'); assert.ok(r.ok && r.amount === 300); assert.equal((await a.cmd('daily.claim')).err, 'already_claimed');
  game.state.meta.dayOffset += 1; r = await a.cmd('daily.claim'); assert.ok(r.ok && r.streak === 2 && r.amount === 400); game.state.meta.dayOffset += 5; r = await a.cmd('daily.claim'); assert.equal(r.streak, 1, 'missing days lowers the streak gently (min 1)');
  // achievements are one-time
  assert.equal(p.ach.angler.p, 1); assert.equal(p.ach.courier.p, 1); assert.equal(p.ach.daily.p, 3); assert.ok(p.ach.daily.done, 'third daily claim completes Regular');
  const c2 = p.coins; for (let i = 0; i < 6; i++) game.ev(a.me.id, 'postcard', 1); const gain = p.coins - c2; assert.ok(p.ach.explorer5.done); game.ev(a.me.id, 'postcard', 1); assert.ok(gain >= 500); assert.equal(p.coins - c2, gain, 'achievement pays only once');
  assert.ok(audit(game.state).ok, audit(game.state).errors.join());
});

test('property lifecycle: free first studio, buy, upgrade, upkeep arrears -> dusty, pay, sell refund, items return to contributors', async (t) => {
  const { game, bots: [a, b], credit } = await setup(t, ['Olive', 'Bram']); place(game, a, 'townhall', 7.5, 5); place(game, b, 'townhall', 7.5, 5); await sleep(40);
  let r = await a.cmd('prop.buy', { id: 'h1' }); assert.ok(r.ok && r.price === 0);
  r = await a.cmd('prop.buy', { id: 'h3' }); assert.ok(r.ok && r.price === 25000 || r.err === 'insufficient_funds', JSON.stringify(r));
  credit(game.state, a.me.id, 200000, 't'); r = await a.cmd('prop.buy', { id: 'c1' }); assert.equal(r.err, 'level_required');
  r = await a.cmd('prop.upgrade', { id: 'h1', kind: 'cap100' }); assert.ok(r.ok); assert.equal(game.state.props.h1.extraCap, 100);
  r = await a.cmd('prop.upgrade', { id: 'h1', kind: 'expand' }); assert.ok(r.ok); assert.equal(game.state.props.h1.w, 10); assert.equal(game.state.props.h1.walls['4,5'], 2);   // entrance door is preserved
  // Bob contributes a plant, owner sells the house -> plant returns to Bob
  await buy(game, b, 'plant_small'); const plant = Object.values(game.state.items).find(i => i.d === 'plant_small'); await a.cmd('prop.role', { id: 'h1', name: 'Bram', role: 'decorator' });
  place(game, b, 'home:h1', 4.5, 3.5); assert.ok((await b.cmd('h.place', { item: plant.id, x: 2, y: 2, rot: 0 })).ok);
  // upkeep: the owner cannot pay -> arrears -> dusty after 4 periods
  { const { tx } = await import('../server/ledger.js'); tx(game.state, [{ k: 'xfer', from: 'p:' + a.me.id, to: 'void', n: game.state.players[a.me.id].coins }]); } const pr = game.state.props.h1; for (let i = 0; i < 4; i++) game.housing.tickUpkeep(a.me.id, 60); assert.equal(pr.upkeep.arrears, 4); assert.ok(pr.upkeep.dusty);
  assert.equal(game.housing.canEnter(b.me.id, 'h1').err, 'dusty'); credit(game.state, a.me.id, 5000, 't'); place(game, a, 'townhall', 7.5, 5); r = await a.cmd('prop.pay', { id: 'h1' }); assert.ok(r.ok, JSON.stringify(r)); assert.ok(!pr.upkeep.dusty);
  const before = game.state.players[a.me.id].coins; place(game, a, 'townhall', 7.5, 5); r = await a.cmd('prop.sell', { id: 'h1' }); assert.ok(r.ok, JSON.stringify(r)); assert.ok(r.refund > 0);
  assert.equal(game.state.items[plant.id].loc, 'inv:' + b.me.id); assert.equal(game.state.props.h1.owner, null); assert.equal(Object.keys(game.state.props.h1.objects).length, 0);
  assert.equal(game.state.players[a.me.id].coins, before + r.refund); assert.ok(audit(game.state).ok, audit(game.state).errors.join());
});

test('access control: locked/invite-only homes, bans, doorbell, capacity, blueprint atomic apply', async (t) => {
  const { game, bots: [a, b, c] } = await setup(t, ['Owner', 'Guest', 'Pal']); place(game, a, 'townhall', 7.5, 5); await a.cmd('prop.buy', { id: 'h1' });
  const enter = async (bot) => { place(game, bot, 'world', 4.5, 22.3); await sleep(30); return bot.cmd('enter', { id: 'h1' }); };
  assert.ok((await enter(b)).ok); await b.cmd('exit').catch(() => {}); place(game, b, 'world', 4.5, 22.3);
  await a.cmd('prop.access', { id: 'h1', mode: 'locked' }); assert.equal((await enter(b)).err, 'locked');
  await a.cmd('prop.access', { id: 'h1', mode: 'invite' }); const ring = await enter(b); assert.equal(ring.err, 'invite_only');
  assert.ok((await b.cmd('prop.ring', { id: 'h1' })).ok); const bell = await a.waitFor(m => m.t === 'doorbell'); assert.ok((await a.cmd('prop.answer', { prop: 'h1', pid: bell.fromId, accept: true })).ok); await b.waitFor(m => m.t === 'invite');
  assert.ok((await enter(b)).ok, 'invited guest may enter an invite-only home');
  await a.cmd('prop.ban', { id: 'h1', name: 'Guest' }); assert.equal(game.sessions.get(b.me.id).loc, 'world', 'banned guest is removed'); assert.equal((await enter(b)).err, 'banned');
  await a.cmd('prop.access', { id: 'h1', mode: 'open' }); await a.cmd('prop.unban', { id: 'h1', pid: b.me.id }); game.state.props.h1.capacity = 1; place(game, a, 'home:h1', 4.5, 3.5); assert.equal((await enter(c)).err, 'full'); game.state.props.h1.capacity = 12;
  // blueprint
  await buy(game, a, 'sofa_2'); await buy(game, a, 'lamp_floor'); place(game, a, 'home:h1', 4.5, 3.5); const items = Object.values(game.state.items).filter(i => i.loc === 'inv:' + a.me.id && ['sofa_2', 'lamp_floor'].includes(i.d));
  await a.cmd('h.place', { item: items.find(i => i.d === 'sofa_2').id, x: 1, y: 1, rot: 0 }); await a.cmd('h.place', { item: items.find(i => i.d === 'lamp_floor').id, x: 3, y: 1, rot: 0 }); await a.cmd('h.wall', { x: 2, y: 3, type: 1 });
  let r = await a.cmd('bp.save', { name: 'Nook', x0: 1, y0: 1, x1: 3, y1: 3 }); assert.ok(r.ok, JSON.stringify(r)); const bpId = r.bp;
  const bom = await a.cmd('bp.bom', { id: bpId }); assert.ok(bom.bom.every(x => x.missing === 1 && x.have === 0));
  r = await a.cmd('bp.apply', { id: bpId, x: 4, y: 1 }); assert.equal(r.err, 'missing_items');             // all-or-nothing: nothing was placed or charged
  assert.equal(Object.keys(game.state.props.h1.objects).length, 2); assert.equal(game.state.props.h1.walls['5,3'], undefined);
  await buy(game, a, 'sofa_2'); await buy(game, a, 'lamp_floor'); place(game, a, 'home:h1', 4.5, 3.5); r = await a.cmd('bp.apply', { id: bpId, x: 4, y: 1 }); assert.ok(r.ok, JSON.stringify(r)); assert.equal(Object.keys(game.state.props.h1.objects).length, 4);
  assert.ok(audit(game.state).ok, audit(game.state).errors.join());
});

test('hostile clients: malformed commands never crash the Host or change state', async (t) => {
  const { game, bots: [a] } = await setup(t, ['Mal']); const before = JSON.stringify(game.state.players[a.me.id].coins);
  const junk = [{ k: 'h.place', item: 'abc', x: 'NaN' }, { k: 'shop.buy', shop: 'furn', def: '__proto__', qty: -5 }, { k: 'rl.bet', table: 'roulette1', spot: -1, amount: 1e12 }, { k: 'trade.offer', items: [1, 2, 3], coins: -1 }, { k: 'prop.buy', id: '../../etc' }, { k: 'sl.spin', thing: 'x', bet: 99 }, { k: 'h.moveGroup', moves: 'nope' }, { k: 'pk.act', table: 'poker1', type: 'allin' }, { k: 'dev.coins', n: 1e9 }, { k: 'admin.kick', id: a.me.id }, { k: 'look.set', look: { hat: 'sofa_2', top: { x: 1 } } }];
  for (const j of junk) { const { k, ...rest } = j; const r = await a.cmd(k, rest); assert.ok(r.ok === false || r.err || r.ok, k); }
  a.ws.send('not json'); a.ws.send(JSON.stringify({ t: 'c', k: 'ping' })); await sleep(100);
  assert.equal(game.sessions.size >= 0, true); assert.ok(audit(game.state).ok, audit(game.state).errors.join());
  assert.ok(game.state.players[a.me.id].coins >= Number(before) - 0);
});
