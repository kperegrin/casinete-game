// Browser end-to-end test: real host + two Chromium clients driving the real UI. Saves screenshots for review.
import { chromium } from 'playwright-core';
import { startHost } from './helpers.js';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const shots = process.argv[2] || '/tmp/casinete-shots'; fs.mkdirSync(shots, { recursive: true });
const { host, port, game } = await startHost({ settings: { upkeepSec: 60 } });
game.opts.rateBurst = 100000; game.opts.rateRefill = 100000;
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const errors = [];
async function newPage(name, w = 1280, h = 800) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } }); const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(`${name}: ${e.message}`)); p.on('console', m => { if (m.type() === 'error') errors.push(`${name} console: ${m.text()}`); });
  await p.goto(`http://localhost:${port}/`); return p;
}
const join = async (p, name) => { await p.fill('#menu input[type=text] >> nth=0', name); await p.click('text=▶ Play'); await p.waitForSelector('#creator:not(.hidden)'); await p.click('text=✔ Start playing'); await p.waitForSelector('#hud:not(.hidden)'); await p.waitForTimeout(400); };
const cmd = (p, k, a = {}) => p.evaluate(([k, a]) => window.__casinete.cmd(k, a), [k, a]);
const S = (p, expr) => p.evaluate((e) => { const { S } = window.__casinete; return eval(e); }, expr);
const shot = (p, n) => p.screenshot({ path: `${shots}/${n}.png` });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const step = (m) => console.log('•', m);

const a = await newPage('Alice'); await join(a, 'Alice');
const b = await newPage('Bob'); await join(b, 'Bob');
assert.equal(await S(a, 'S.isHost'), true);   // (Bob also connects from localhost here, so he is a Host too)
step('two players joined; Bob visible to Alice'); await sleep(300); assert.equal(await S(a, 'S.players.size'), 2);
await cmd(a, 'dev.coins', { n: 2_000_000 }); await cmd(a, 'dev.level', { n: 30 });

// ---- Town hall + property purchase
await cmd(a, 'dev.tp', { loc: 'townhall' }); await sleep(150); await cmd(a, 'dev.tp', { x: 7.5, y: 5.2 }); await sleep(150);
await a.evaluate(() => window.__casinete.cmd('interact', { id: 'props' }).then(r => window.__casinete.world.openers.props(r))); await sleep(200); await shot(a, '10-townhall');
await a.click('text=Claim FREE >> nth=0'); await a.click('#panels .panel:has-text("Please confirm") button:has-text("Buy")'); await sleep(400);
assert.equal(await S(a, 'S.props.find(p=>p.id==="h1").owner === S.me.id'), true); step('claimed free studio via the UI');
// ---- shopping
await cmd(a, 'dev.tp', { loc: 'shop_furn' }); await sleep(150); await cmd(a, 'dev.tp', { x: 6.5, y: 5.2 }); await sleep(100);
await a.evaluate(() => window.__casinete.world.openers.shop({ shop: 'furn' })); await sleep(400); await a.click('text=Loveseat'); await sleep(100); await shot(a, '11-shop');
await a.click('text=/Buy 🪙/'); await sleep(300); assert.equal(await S(a, 'S.inv.filter(i=>i.d==="sofa_2").length'), 1); step('bought a Loveseat through the shop UI');
for (const d of ['bed_single', 'lamp_floor', 'rug_round', 'plant_big', 'painting', 'tv', 'table_coffee', 'wardrobe', 'armchair']) await cmd(a, 'shop.buy', { shop: 'furn', def: d, qty: 1 });
await a.keyboard.press('Escape'); await sleep(100);
// ---- home + build mode with real mouse clicks
await cmd(a, 'dev.tp', { loc: 'world', x: 4.5, y: 22.2 }); await sleep(200); await cmd(a, 'enter', { id: 'h1' }); await sleep(400);
assert.equal(await S(a, 'S.loc'), 'home:h1'); await shot(a, '12-home-empty');
await a.keyboard.press('KeyB'); await sleep(300); if (!(await S(a, 'S.buildMode'))) console.log('DEBUG', await a.evaluate(() => JSON.stringify({ role: window.__casinete.S.role, loc: window.__casinete.S.loc, ae: document.activeElement?.tagName + '#' + document.activeElement?.id, toasts: [...document.querySelectorAll('.toast')].map(t => t.textContent) })));
assert.equal(await S(a, 'S.buildMode'), true);
const tilePx = (tx, ty) => a.evaluate(([tx, ty]) => { const { world } = window.__casinete; const z = world.cam.zoom * 32; return [world.cam.ox + (tx + 0.5) * z, world.cam.oy + (ty + 0.5) * z]; }, [tx, ty]);
await a.click('#panels .item:has-text("Loveseat")'); let [px, py] = await tilePx(2, 2); await a.mouse.move(px, py); await a.mouse.move(px + 1, py + 1); await shot(a, '13-build-ghost'); await a.mouse.click(px + 1, py + 1); await sleep(300);
assert.equal(await S(a, 'S.home.objects.length'), 1); step('placed furniture with the mouse');
for (const [name, tx, ty] of [['Floor Lamp', 5, 1], ['Round Rug', 3, 3], ['Single Bed', 6, 3], ['Indoor Tree', 1, 1]]) { await a.click(`#panels .item:has-text("${name}")`); [px, py] = await tilePx(tx, ty); await a.mouse.move(px, py); await a.mouse.move(px + 1, py + 1); await a.mouse.click(px + 1, py + 1); await sleep(200); }
assert.ok((await S(a, 'S.home.objects.length')) >= 4, 'several objects placed');
// rotate selected with R then undo/redo
await a.click('#buildbar >> text=Select/Move'); [px, py] = await tilePx(2, 2); await a.mouse.click(px, py); await a.keyboard.press('KeyR'); await sleep(250);
const rot = await S(a, 'S.home.objects.find(o=>o.d==="sofa_2").rot'); assert.equal(rot, 1); await a.keyboard.press('Control+KeyZ'); await sleep(250); assert.equal(await S(a, 'S.home.objects.find(o=>o.d==="sofa_2").rot'), 0); step('rotate + undo OK');
// drag-move the sofa
[px, py] = await tilePx(2, 2); let [qx, qy] = await tilePx(2, 4); await a.mouse.move(px, py); await a.mouse.down(); await a.mouse.move((px + qx) / 2, (py + qy) / 2); await a.mouse.move(qx, qy); await shot(a, '14-dragging'); await a.mouse.up(); await sleep(400);
assert.equal(await S(a, 'S.home.objects.find(o=>o.d==="sofa_2").y'), 4); step('drag-moved furniture');
// walls via the wall tool (draw a line)
await a.click('#buildbar >> text=/Wall \\(/'); [px, py] = await tilePx(4, 2); [qx, qy] = await tilePx(4, 4); await a.mouse.move(px, py); await a.mouse.down(); await a.mouse.move(qx, qy); await a.mouse.up(); await sleep(300);
assert.ok((await S(a, 'S.home.walls["4,3"]')) === 1, 'wall placed'); step('built a wall');
await a.click('#buildbar .sw >> nth=9'); await a.click('#buildbar >> text=Floor'); [px, py] = await tilePx(1, 3); [qx, qy] = await tilePx(3, 5); await a.mouse.move(px, py); await a.mouse.down(); await a.mouse.move(qx, qy); await a.mouse.up(); await sleep(300);
await shot(a, '15-build-complete');
// ---- Bob joins the home as a decorator and sees everything; collaborative lease
await cmd(a, 'prop.role', { id: 'h1', name: 'Bob', role: 'builder' });
await b.evaluate(() => window.__casinete.cmd('prop.goto', { id: 'h1' })); await sleep(400);
assert.equal(await S(b, 'S.home && S.home.objects.length'), await S(a, 'S.home.objects.length')); step('Bob sees the same layout when entering');
await b.keyboard.press('KeyB'); await sleep(300); assert.equal(await S(b, 'S.buildMode'), true);
await cmd(a, 'h.lease', { ids: [await S(a, 'S.home.objects[0].id')] }); await sleep(250);
assert.equal(await S(b, 'S.leases.size'), 1); const lr = await cmd(b, 'h.move', { id: await S(a, 'S.home.objects[0].id'), x: 5, y: 5, rot: 0 }); assert.equal(lr.err, 'locked'); step('Bob blocked by Alice\'s edit lease');
await shot(b, '16-bob-view'); await cmd(a, 'h.release', { ids: [await S(a, 'S.home.objects[0].id')] });
await b.keyboard.press('Escape'); await b.keyboard.press('Escape');
// ---- phone, inventory, host panel
await a.keyboard.press('KeyB'); await sleep(200); await a.keyboard.press('KeyI'); await sleep(300); await shot(a, '17-inventory'); await a.keyboard.press('Escape');
await a.keyboard.press('Tab'); await sleep(200); await shot(a, '18-phone'); await a.keyboard.press('Escape');
await a.keyboard.press('F2'); await sleep(500); await shot(a, '19-host'); await a.keyboard.press('Escape');
// ---- casino
await cmd(a, 'dev.tp', { loc: 'world', x: 45.5, y: 29.5 }); await sleep(200); await cmd(a, 'enter', { id: 'casino' }); await sleep(400); await shot(a, '20-casino');
await cmd(a, 'dev.tp', { x: 7, y: 9.5 }); await sleep(100); await a.evaluate(() => window.__casinete.cmd('interact', { id: 'roulette1' }).then(r => window.__casinete.world.openers.roulette(r))); await sleep(500);
await a.evaluate(async () => { const { cmd } = window.__casinete; await cmd('rl.bet', { table: 'roulette1', spot: 17, amount: 100 }); await cmd('rl.bet', { table: 'roulette1', spot: 156, amount: 500 }); }); await sleep(400); await shot(a, '21-roulette');
await a.waitForFunction(() => document.querySelector('#rlres')?.textContent.includes('Result'), null, { timeout: 8000 }); await shot(a, '22-roulette-result'); step('roulette round played in the UI'); await a.keyboard.press('Escape');
await cmd(a, 'dev.tp', { x: 5.5, y: 14.8 }); await a.evaluate(() => window.__casinete.cmd('interact', { id: 'slot2' }).then(r => window.__casinete.world.openers.slots(r))); await sleep(400); await a.keyboard.press('Space'); await sleep(2300); await shot(a, '23-slots'); await a.keyboard.press('Escape');
await cmd(a, 'dev.tp', { x: 17.5, y: 8 }); await a.evaluate(() => window.__casinete.cmd('interact', { id: 'bj1' }).then(r => window.__casinete.world.openers.blackjack(r))); await sleep(400);
await a.click('#panels >> text=Sit >> nth=2'); await sleep(200); await a.click('#panels >> text=/^Bet 🪙/'); await sleep(7500); await shot(a, '24-blackjack');
await a.keyboard.press('Escape'); await cmd(a, 'dev.tp', { x: 25, y: 9.5 }); await a.evaluate(() => window.__casinete.cmd('interact', { id: 'poker2' }).then(r => window.__casinete.world.openers.poker(r))); await sleep(400);
await a.click('#panels >> text=Sit >> nth=0'); await a.fill('#panels input[type=text] >> nth=-1', '1000').catch(() => {}); await a.click('#panels button:has-text("OK")'); await sleep(300);
for (const s of [2, 3]) await cmd(a, 'pk.bot', { table: 'poker2', seat: s, on: true }); await sleep(3500); await shot(a, '25-poker');
await a.keyboard.press('Escape'); await a.keyboard.press('Escape'); await cmd(a, 'dev.tp', { loc: 'world', x: 58.5, y: 28.5 }); await cmd(a, 'enter', { id: 'track' }); await sleep(300);
await cmd(a, 'dev.tp', { x: 13.5, y: 9 }); await a.evaluate(() => window.__casinete.cmd('interact', { id: 'horses' }).then(r => window.__casinete.world.openers.horses(r))); await sleep(500); await shot(a, '26-horses');
const inv = await cmd(a, 'admin.info'); step('audit: ' + (inv.audit.ok ? 'coins & items conserved ✔' : inv.audit.errors.join())); assert.ok(inv.audit.ok); assert.ok(inv.journal.ok);
console.log('page errors:', errors.length ? errors : 'none');
await browser.close(); await host.close();
if (errors.length) process.exit(1);
