// Teleports a headless client around Marigold Bay and screenshots each district (visual check of the isometric scenery).
import { chromium } from 'playwright-core';
import { startHost } from './helpers.js';
const { host, port, game } = await startHost(); game.opts.rateBurst = 100000; game.opts.rateRefill = 100000;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto(`http://localhost:${port}/`); await p.fill('#menu input[type=text] >> nth=0', 'Alice'); await p.click('text=▶ Play'); await p.waitForSelector('#creator:not(.hidden)'); await p.click('text=✔ Start playing'); await p.waitForSelector('#hud:not(.hidden)'); await p.waitForTimeout(600);
const out = process.argv[2] || '/tmp/outdoor'; const fs = await import('node:fs'); fs.mkdirSync(out, { recursive: true });
const cmd = (k, a = {}) => p.evaluate(([k, a]) => window.__casinete.cmd(k, a), [k, a]);
for (const [name, x, y] of [['plaza', 30.5, 18.5], ['shops', 14, 13], ['houses', 8, 28], ['casino', 46, 30], ['park', 12, 36], ['pier', 46, 38], ['villas', 52, 10]]) { await cmd('dev.tp', { x, y }); await p.waitForTimeout(900); await p.screenshot({ path: `${out}/${name}.png` }); }
console.log('errors', errs); await browser.close(); process.exit(0);
