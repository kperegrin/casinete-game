// Second browser pass: wardrobe, salon, storage, trade UI, profile, friends, phone apps, blueprint/copy-paste/marquee, settings, fishing.
import { chromium } from 'playwright-core';
import { startHost } from './helpers.js';
import fs from 'node:fs'; import assert from 'node:assert/strict';
const shots = process.argv[2] || '/tmp/casinete-shots2'; fs.mkdirSync(shots, { recursive: true });
const { host, port, game } = await startHost({ settings: { upkeepSec: 60 } }); game.opts.rateBurst = 1e6; game.opts.rateRefill = 1e6;
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const errors = [];
async function newPage(name) { const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage(); p.on('pageerror', e => errors.push(`${name}: ${e.message}`)); p.on('console', m => { if (m.type() === 'error') errors.push(`${name} console: ${m.text()}`); }); await p.goto(`http://localhost:${port}/`); return p; }
const join = async (p, name) => { await p.fill('#menu input[type=text] >> nth=0', name); await p.click('text=▶ Play'); await p.waitForSelector('#creator:not(.hidden)'); await p.click('text=✔ Start playing'); await p.waitForSelector('#hud:not(.hidden)'); await p.waitForTimeout(400); };
const cmd = (p, k, a = {}) => p.evaluate(([k, a]) => window.__casinete.cmd(k, a), [k, a]);
const S = (p, e) => p.evaluate((e) => { const { S } = window.__casinete; return eval(e); }, e);
const shot = (p, n) => p.screenshot({ path: `${shots}/${n}.png` }); const sleep = (ms) => new Promise(r => setTimeout(r, ms)); const step = (m) => console.log('•', m);
const a = await newPage('Alice'); await join(a, 'Alice'); const b = await newPage('Bob'); await join(b, 'Bob');
await cmd(a, 'dev.coins', { n: 500000 });
// wardrobe: buy a hat + dress, wear via the UI
await cmd(a, 'dev.tp', { loc: 'shop_cloth' }); await sleep(100); await cmd(a, 'dev.tp', { x: 7.5, y: 5 }); await a.evaluate(() => window.__casinete.world.openers.shop({ shop: 'cloth' })); await sleep(400);
await a.click('#panels .item:has-text("Top Hat")'); await sleep(150); await a.click('text=Try on (preview)'); await sleep(200); await shot(a, '30-shop-clothes-tryon'); await a.click('#panels .panel:has(> header:has-text("Try on:")) .x');
await a.click('#panels .panel:has-text("Threadworks") >> text=/Buy 🪙/'); await sleep(200); await a.click('#panels .panel:has-text("Please confirm") button:has-text("Buy")'); await sleep(400);
await cmd(a, 'shop.buy', { shop: 'cloth', def: 'top_dress', qty: 1 }); await cmd(a, 'shop.buy', { shop: 'cloth', def: 'gl_star', qty: 1 }); await a.keyboard.press('Escape'); await sleep(100);
await a.keyboard.press('KeyI'); await sleep(250); await a.click('#panels >> text=👕 Wardrobe'); await sleep(250); await a.click('#panels .item:has-text("Top Hat")'); await sleep(300); await a.click('#panels .item:has-text("Summer Dress")'); await sleep(300);
assert.equal(await S(a, 'S.me.look.hat'), 'hat_top'); assert.equal(await S(a, 'S.me.look.full'), 'top_dress'); assert.equal(await S(a, 'S.me.look.top'), null); await shot(a, '31-wardrobe'); step('wardrobe: wear hat + dress (conflict rule clears shirt)');
await a.keyboard.press('Escape'); await sleep(100);
// salon
await cmd(a, 'dev.tp', { x: 2.5, y: 4.8 }); await a.evaluate(() => window.__casinete.cmd('interact', { id: 'salon' }).then(r => window.__casinete.world.openers[r.open](r))); await sleep(300); await a.click('#panels .tab:has-text("Curls")'); await a.click('#panels button:has-text("Apply")'); await sleep(400);
assert.equal(await S(a, 'S.me.look.hairStyle'), 4); step('salon: new hairstyle'); await a.keyboard.press('Escape');
// homes: claim, furniture, storage, blueprint, copy-paste, marquee
await cmd(a, 'dev.tp', { loc: 'townhall' }); await cmd(a, 'dev.tp', { x: 7.5, y: 5 }); await cmd(a, 'prop.buy', { id: 'h1' }); await cmd(a, 'dev.tp', { loc: 'shop_furn' }); await cmd(a, 'dev.tp', { x: 6.5, y: 5 });
for (const d of ['wardrobe', 'sofa_2', 'sofa_2', 'lamp_floor', 'lamp_floor', 'plant_small', 'plant_small', 'armchair', 'tv', 'jukebox']) await cmd(a, 'shop.buy', { shop: d === 'jukebox' ? 'furn' : 'furn', def: d, qty: 1 });
await cmd(a, 'dev.tp', { loc: 'world', x: 4.5, y: 22.2 }); await sleep(100); await cmd(a, 'enter', { id: 'h1' }); await sleep(300);
const inv = await S(a, 'S.inv.filter(i=>i.loc==="inv").map(i=>[i.id,i.d])'); const idOf = (d, n = 0) => inv.filter(x => x[1] === d)[n][0];
await cmd(a, 'h.place', { item: idOf('wardrobe'), x: 1, y: 1, rot: 0 }); await cmd(a, 'h.place', { item: idOf('sofa_2', 0), x: 3, y: 2, rot: 0 }); await cmd(a, 'h.place', { item: idOf('lamp_floor', 0), x: 5, y: 1, rot: 0 }); await cmd(a, 'h.place', { item: idOf('tv'), x: 3, y: 4, rot: 0 }); await sleep(200);
const wid = await S(a, 'S.home.objects.find(o=>o.d==="wardrobe").id'); await cmd(a, 'dev.tp', { x: 2.5, y: 2.2 }).catch(() => {}); await a.evaluate(() => { const { S } = window.__casinete; S.x = 2.5; S.y = 2.4; });
await sleep(150); await a.keyboard.press('KeyE'); await sleep(400); await shot(a, '32-storage-or-prompt');
const st = await a.evaluate(async (id) => window.__casinete.cmd('use', { id }), wid); assert.equal(st.open, 'storage'); await a.evaluate((r) => window.__casinete.world.openers.storage(r), st); await sleep(300);
await a.click('#panels .panel:has-text("Storage") .item:has-text("Potted Plant") >> nth=0'); await sleep(300); assert.ok((await S(a, 'S.inv.filter(i=>i.loc==="inv"&&i.d==="plant_small").length')) === 1); await shot(a, '33-storage'); step('storage: moved an item into the wardrobe'); await a.keyboard.press('Escape');
// lamp toggle & sit
const lid = await S(a, 'S.home.objects.find(o=>o.d==="lamp_floor").id'); await cmd(a, 'dev.tp', { x: 5.5, y: 2.4 }); await sleep(120);
let r = await cmd(a, 'use', { id: lid }); assert.ok(r.ok); await sleep(150); assert.equal(await S(a, `S.home.objects.find(o=>o.id===${lid}).state`), 1); step('lamp switched on (synced state)');
const sid = await S(a, 'S.home.objects.find(o=>o.d==="sofa_2").id'); await cmd(a, 'dev.tp', { x: 3.5, y: 3.4 }); await sleep(150); r = await cmd(a, 'use', { id: sid }); assert.ok(r.ok); await sleep(200); assert.equal(await S(a, 'S.sit'), true); await shot(a, '34-sitting'); step('sat on the sofa');
// build mode: marquee, copy, paste, blueprint
await a.keyboard.press('KeyB'); await sleep(300); const tilePx = (tx, ty) => a.evaluate(([tx, ty]) => { const { world } = window.__casinete; const z = world.cam.zoom * 32; return [world.cam.ox + (tx + 0.5) * z, world.cam.oy + (ty + 0.5) * z]; }, [tx, ty]);
let [x0, y0] = await tilePx(2, 1); let [x1, y1] = await tilePx(6, 3); await a.click('#buildbar >> text=Select/Move'); await a.mouse.move(x0 - 14, y0 - 14); await a.mouse.down(); await a.mouse.move(x1, y1); await a.mouse.up(); await sleep(200);
const nsel = await S(a, 'S.selected.size'); assert.ok(nsel >= 2, 'marquee selected ' + nsel); await a.keyboard.press('Control+KeyC'); await a.keyboard.press('Control+KeyV'); [x0, y0] = await tilePx(6, 4); await a.mouse.move(x0, y0); await sleep(100); await shot(a, '35-paste-ghost'); await a.mouse.click(x0, y0); await sleep(500);
step(`marquee-selected ${nsel}, copy/paste placed from owned items (partial paste when not enough stock)`); [x0, y0] = await tilePx(1, 1); [x1, y1] = await tilePx(6, 5); await a.click('#buildbar >> text=Blueprint'); await a.mouse.move(x0, y0); await a.mouse.down(); await a.mouse.move(x1, y1); await a.mouse.up(); await sleep(200);
await a.fill('#panels .panel:has-text("Save blueprint") input', 'Cozy nook'); await a.click('#panels .panel:has-text("Save blueprint") button:has-text("OK")'); await sleep(400); assert.equal(await S(a, 'S.me.blueprints.length'), 1); step('blueprint saved from the build tool');
await a.keyboard.press('KeyB'); await sleep(200);
// friends, profile, trade UI between Alice & Bob
await b.evaluate(() => window.__casinete.cmd('prop.goto', { id: 'h1' })); await sleep(300);
const bobId = await S(b, 'S.me.id'); await a.evaluate((id) => window.__casinete.bus.emit('openProfile', id), bobId); await sleep(400); await shot(a, '36-profile'); await a.click('#panels .panel:has-text("Bob") button:has-text("Friend")'); await sleep(400);
await b.click('#panels .panel:has-text("Friend request") button:has-text("Accept")'); await sleep(400); assert.equal(await S(a, 'S.me.friends.length'), 1); step('friend request popup accepted');
await a.click('#panels .panel:has-text("Bob") button:has-text("Trade")'); await sleep(300); await b.click('#panels .panel:has-text("Trade request") button:has-text("Accept")'); await sleep(500);
await a.click('#panels .panel:has-text("Trade with") .item:has-text("Armchair")'); await sleep(300); await a.click('#panels .panel:has-text("Trade with") button:has-text("Lock offer")'); await b.click('#panels .panel:has-text("Trade with") button:has-text("Lock offer")'); await sleep(3400); await shot(a, '37-trade');
await a.click('#panels .panel:has-text("Trade with") button:has-text("Confirm trade")'); await b.click('#panels .panel:has-text("Trade with") button:has-text("Confirm trade")'); await sleep(600);
assert.equal(await S(b, 'S.inv.filter(i=>i.d==="armchair").length'), 1); step('trade completed through both UIs'); 
// phone apps, achievements, map, host panel, settings, emotes, fishing
await a.keyboard.press('Tab'); await sleep(200); for (const app of ['Map', 'Achievements', 'Directory']) { await a.click(`#panels .panel:has-text("Pocket Phone") .item:has-text("${app}")`).catch(async () => { await a.keyboard.press('Tab'); await sleep(150); await a.click(`#panels .panel:has-text("Pocket Phone") .item:has-text("${app}")`); }); await sleep(450); if (app === 'Achievements') await shot(a, '38-achievements'); if (app === 'Map') await shot(a, '39-map'); await a.keyboard.press('Escape'); await a.keyboard.press('Tab'); await sleep(150); }
await a.keyboard.press('Escape'); await a.keyboard.press('Escape'); await a.keyboard.press('KeyG'); await sleep(200); await a.click('#panels .item:has-text("Dance")'); await sleep(200);
await a.keyboard.press('Escape'); await a.keyboard.press('Escape'); await sleep(100); await a.keyboard.press('Escape'); await sleep(200); await shot(a, '40-settings');
await a.keyboard.press('Escape'); await cmd(a, 'dev.tp', { loc: 'world', x: 46.5, y: 40.6 }); await a.evaluate(() => window.__casinete.cmd('interact', { id: 'fish1' }).then(r => window.__casinete.world.openers.fish(r))); await sleep(200); await a.click('#panels button:has-text("Cast")'); await sleep(300); await shot(a, '41-fishing');
const info = await cmd(a, 'admin.info'); assert.ok(info.audit.ok, info.audit.errors.join()); step('economy audit OK after UI session');
console.log('page errors:', errors.length ? errors : 'none'); await browser.close(); await host.close(); if (errors.length) process.exit(1);
