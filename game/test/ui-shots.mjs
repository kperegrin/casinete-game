// Screenshots of the front-end screens (menu, character creator, HUD, panels) for visual review.
import { chromium } from 'playwright-core';
import { startHost } from './helpers.js';
import fs from 'node:fs';
const out = process.argv[2] || '/tmp/ui'; fs.mkdirSync(out, { recursive: true });
const { port } = await startHost();
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const p = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(`http://localhost:${port}/`); await p.waitForTimeout(700); await p.screenshot({ path: `${out}/01-menu.png` });
await p.fill('#menu input[type=text] >> nth=0', 'Alice'); await p.click('text=▶ Play'); await p.waitForSelector('#creator:not(.hidden)'); await p.waitForTimeout(500); await p.screenshot({ path: `${out}/02-creator.png` });
await p.click('text=✔ Start playing'); await p.waitForSelector('#hud:not(.hidden)'); await p.waitForTimeout(1500); await p.screenshot({ path: `${out}/03-hud.png` });
await p.keyboard.press('KeyI'); await p.waitForTimeout(500); await p.screenshot({ path: `${out}/04-inventory.png` }); await p.keyboard.press('Escape');
await p.keyboard.press('Tab'); await p.waitForTimeout(400); await p.screenshot({ path: `${out}/05-phone.png` });
console.log('errors', errs); await browser.close(); process.exit(0);
