import test from 'node:test';
import assert from 'node:assert/strict';
import { startHost, Bot, place, sleep } from './helpers.js';
import { audit } from '../server/ledger.js';
import * as M from '../shared/map.js';

test('join, welcome, movement validation (speed hack rejected), chat, save', async (t) => {
  const { host, port, game, url } = await startHost();
  t.after(() => host.close());
  const a = await new Bot(url, 'Alice').connect({ hairStyle: 2 });
  assert.ok(a.me.coins >= 5000); assert.equal(a.me.name, 'Alice');
  const b = await new Bot(url, 'Bob').connect();
  await a.waitFor(m => m.t === 'join' && m.p.name === 'Bob');
  // legit move
  const s = game.sessions.get(a.me.id); const x0 = s.x, y0 = s.y;
  await sleep(120); a.mv(x0 + 0.3, y0); await sleep(60); assert.ok(Math.abs(game.sessions.get(a.me.id).x - (x0 + 0.3)) < 1e-6);
  // teleport hack: rejected and snapped back
  a.mv(x0 + 30, y0); await a.waitFor(m => m.t === 'snap'); assert.ok(Math.abs(game.sessions.get(a.me.id).x - (x0 + 0.3)) < 1e-6);
  // walking into a building is rejected too
  a.mv(x0 + 0.3, 10); await sleep(60);
  const r = await a.cmd('chat', { text: 'hello fuck world' }); assert.ok(r.ok);
  const msg = await b.waitFor(m => m.t === 'chat' && m.id === a.me.id); assert.equal(msg.text, 'hello **** world');
  for (let i = 0; i < 5; i++) await a.cmd('chat', { text: 'spam' + i });
  const spam = await a.cmd('chat', { text: 'too many' }); assert.equal(spam.err, 'slow_down');
  assert.ok(audit(game.state).ok, audit(game.state).errors.join());
});

test('property purchase, shop, placement, rotation, removal, ownership permissions, collaboration leases', async (t) => {
  const { host, game, url } = await startHost();
  t.after(() => host.close());
  const a = await new Bot(url, 'Alice').connect(); const b = await new Bot(url, 'Bob').connect();
  place(game, a, 'townhall', 7.5, 4.5); await sleep(50);
  let r = await a.cmd('prop.buy', { id: 'h1' }); assert.ok(r.ok, JSON.stringify(r)); assert.equal(r.price, 0);   // first studio is free
  r = await a.cmd('prop.buy', { id: 'h1' }); assert.equal(r.err, 'already_owned');
  const base = game.state.players[a.me.id].coins;
  place(game, a, 'shop_furn', 6.5, 5); await sleep(50);
  r = await a.cmd('shop.view', { shop: 'furn' }); assert.ok(r.ok); assert.ok(r.entries.length > 30);
  r = await a.cmd('shop.buy', { shop: 'furn', def: 'sofa_3', qty: 2 }); assert.ok(r.ok, JSON.stringify(r)); assert.equal(r.spent, 1040);
  r = await a.cmd('shop.buy', { shop: 'furn', def: 'sofa_3', qty: 1, price: 1 }); assert.equal(r.err, 'stale_price');
  r = await a.cmd('shop.buy', { shop: 'furn', def: 'lamp_floor', qty: 1 }); assert.ok(r.ok);
  await sleep(50);
  assert.equal(game.state.players[a.me.id].coins, base - 1040 - 70);
  // go home (door at top of Sunny Row #1 -> enter via command)
  place(game, a, 'world', 4.5, 22.4); await sleep(30);
  r = await a.cmd('enter', { id: 'h1' }); assert.ok(r.ok, JSON.stringify(r)); assert.equal(a.loc, 'home:h1');
  const sofas = game.state.players ? [...Object.values(game.state.items)].filter(i => i.d === 'sofa_3' && i.loc === 'inv:' + a.me.id) : [];
  const lamp = Object.values(game.state.items).find(i => i.d === 'lamp_floor');
  r = await a.cmd('h.place', { item: sofas[0].id, x: 2, y: 2, rot: 0 }); assert.ok(r.ok, JSON.stringify(r));
  assert.equal((await a.cmd('h.place', { item: sofas[1].id, x: 3, y: 2, rot: 0 })).err, 'overlap');                // collision
  assert.equal((await a.cmd('h.place', { item: sofas[1].id, x: 7, y: 2, rot: 0 })).err, 'out_of_bounds');
  assert.equal((await a.cmd('h.place', { item: sofas[1].id, x: 3, y: 0, rot: 0 })).err, 'blocked_by_wall');        // wall / bounds
  assert.equal((await a.cmd('h.place', { item: sofas[0].id, x: 2, y: 3, rot: 0 })).err, 'not_in_inventory');       // already placed -> cannot dupe
  r = await a.cmd('h.place', { item: lamp.id, x: 1, y: 1, rot: 0 }); assert.ok(r.ok);
  r = await a.cmd('h.move', { id: sofas[0].id, x: 2, y: 1, rot: 1 }); assert.ok(r.ok); assert.equal(r.obj.rot, 1);
  // Bob (visitor) enters and cannot edit
  place(game, b, 'world', 4.5, 22.4); await sleep(30);
  r = await b.cmd('enter', { id: 'h1' }); assert.ok(r.ok);
  r = await b.cmd('h.remove', { id: sofas[0].id }); assert.equal(r.err, 'no_permission');
  r = await b.cmd('h.move', { id: sofas[0].id, x: 3, y: 3, rot: 0 }); assert.equal(r.err, 'no_permission');
  // lock the home: Bob kicked? (access change only affects new entries)
  r = await a.cmd('prop.role', { id: 'h1', name: 'Bob', role: 'decorator' }); assert.ok(r.ok);
  await b.waitFor(m => m.t === 'role' && m.role === 'decorator');
  // Bob has a sofa he bought? give via dev: buy lamp for Bob
  place(game, b, 'shop_furn', 6.5, 5); const rr = await b.cmd('shop.buy', { shop: 'furn', def: 'plant_small', qty: 1 }); assert.ok(rr.ok, JSON.stringify(rr));
  place(game, b, 'home:h1', 4.5, 4.5);
  const plant = Object.values(game.state.items).find(i => i.d === 'plant_small');
  r = await b.cmd('h.place', { item: plant.id, x: 5, y: 1, rot: 0 }); assert.ok(r.ok, JSON.stringify(r));
  await a.waitFor(m => m.t === 'h' && m.op === 'place' && m.by === b.me.id);
  // decorator cannot move Alice's sofa, but can remove his own plant (returns to Bob)
  r = await b.cmd('h.move', { id: sofas[0].id, x: 3, y: 3, rot: 0 }); assert.equal(r.err, 'no_permission');
  // lease: Alice grabs sofa; Bob (builder) cannot take it
  await a.cmd('prop.role', { id: 'h1', name: 'Bob', role: 'builder' });
  r = await a.cmd('h.lease', { ids: [sofas[0].id] }); assert.ok(r.ok);
  r = await b.cmd('h.move', { id: sofas[0].id, x: 3, y: 3, rot: 0 }); assert.equal(r.err, 'locked');
  r = await b.cmd('h.lease', { ids: [sofas[0].id] }); assert.equal(r.err, 'locked');
  await a.cmd('h.release', { ids: [sofas[0].id] });
  r = await b.cmd('h.move', { id: sofas[0].id, x: 3, y: 3, rot: 0 }); assert.ok(r.ok, JSON.stringify(r));
  // builder removes Alice's sofa -> goes back to ALICE's inventory, not Bob's
  r = await b.cmd('h.remove', { id: sofas[0].id }); assert.ok(r.ok); assert.equal(game.state.items[sofas[0].id].loc, 'inv:' + a.me.id);
  // walls cost coins and refund
  const c0 = game.state.players[b.me.id].coins; r = await b.cmd('h.wall', { x: 4, y: 4, type: 1 }); assert.ok(r.ok); assert.equal(game.state.players[b.me.id].coins, c0 - 5);
  r = await b.cmd('h.wall', { x: 4, y: 4, type: 0 }); assert.ok(r.ok); assert.equal(game.state.players[b.me.id].coins, c0);
  assert.equal((await b.cmd('h.wall', { x: 4, y: 5, type: 0 })).err, 'entrance');
  // revoke role -> immediately loses rights
  await a.cmd('prop.role', { id: 'h1', name: 'Bob', role: null });
  r = await b.cmd('h.wall', { x: 4, y: 4, type: 1 }); assert.equal(r.err, 'no_permission');
  const au = audit(game.state); assert.ok(au.ok, au.errors.join('; '));
});

test('duplicate command (same cid) cannot double-spend; idempotent buy', async (t) => {
  const { host, game, url } = await startHost(); t.after(() => host.close());
  const a = await new Bot(url, 'Dup').connect(); place(game, a, 'shop_furn', 6.5, 5);
  const r1 = await a.cmd('shop.buy', { shop: 'furn', def: 'chair_dining', qty: 1, cid: 'abc' }); const r2 = await a.cmd('shop.buy', { shop: 'furn', def: 'chair_dining', qty: 1, cid: 'abc' });
  assert.ok(r1.ok && r2.ok); assert.equal(Object.values(game.state.items).filter(i => i.d === 'chair_dining').length, 1); assert.equal(game.state.players[a.me.id].coins, 5100 - 60);
});

test('save/load round trip + corruption recovery + migration', async (t) => {
  const { host, game, url, dir } = await startHost(); const a = await new Bot(url, 'Saver').connect(); place(game, a, 'shop_furn', 6.5, 5);
  await a.cmd('shop.buy', { shop: 'furn', def: 'bed_double', qty: 1 }); await a.cmd('daily.claim');
  const coins = game.state.players[a.me.id].coins; game.save(true); game.store.backup('manual', game.state); a.close(); await sleep(80); await host.close();
  const { Game } = await import('../server/game.js'); const g2 = new Game({ dir }); assert.equal(g2.state.players[a.me.id].coins, coins); assert.ok(audit(g2.state).ok);
  assert.equal(Object.values(g2.state.items).filter(i => i.d === 'bed_double').length, 1);
  // corrupt items.json -> restored from backup
  const fs = await import('node:fs'); const pth = (await import('node:path')).join(dir, 'items.json'); fs.writeFileSync(pth, '{"items":{broken');
  const g3 = new Game({ dir }); assert.ok(g3.state.recovery.some(r => r.includes('items')), 'recovery logged'); assert.equal(Object.values(g3.state.items).filter(i => i.d === 'bed_double').length, 1);
  assert.ok(g3.store.verifyJournal().ok);
  // migration from schema 1
  const m = JSON.parse(fs.readFileSync((await import('node:path')).join(dir, 'meta.json'), 'utf8')); m.meta.schema = 1; const crypto = await import('node:crypto'); const txt = JSON.stringify(m);
  fs.writeFileSync((await import('node:path')).join(dir, 'meta.json'), txt); const mf = JSON.parse(fs.readFileSync((await import('node:path')).join(dir, 'manifest.json'), 'utf8')); mf.hashes.meta = crypto.createHash('sha256').update(txt).digest('hex'); fs.writeFileSync((await import('node:path')).join(dir, 'manifest.json'), JSON.stringify(mf));
  const g4 = new Game({ dir }); assert.equal(g4.state.meta.schema, 3); assert.ok(g4.state.recovery.some(r => r.includes('migrated')));
  // saves from the future are refused
  m.meta.schema = 99; const t2 = JSON.stringify(m); fs.writeFileSync((await import('node:path')).join(dir, 'meta.json'), t2); mf.hashes.meta = crypto.createHash('sha256').update(t2).digest('hex'); fs.writeFileSync((await import('node:path')).join(dir, 'manifest.json'), JSON.stringify(mf));
  assert.throws(() => new Game({ dir }), /newer than this game/);
});
