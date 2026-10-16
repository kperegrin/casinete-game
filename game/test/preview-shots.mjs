// Renders public/preview.html sheets (furniture/things/buildings/trees/chars) to PNGs for eyeballing the procedural tileset.
import { chromium } from 'playwright-core';
import { startHost } from './helpers.js';
import fs from 'node:fs';
const out = process.argv[2] || '/tmp/casinete-prev'; fs.mkdirSync(out, { recursive: true });
const { host, port } = await startHost();
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const errors = [];
for (const what of (process.argv[3] || 'furniture,things,buildings,trees,chars').split(',')) {
  const p = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  p.on('pageerror', e => errors.push(what + ': ' + e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(what + ' console: ' + m.text()); });
  await p.goto(`http://localhost:${port}/preview.html?what=${what}`); await p.waitForFunction(() => document.title === 'ready', null, { timeout: 30000 }).catch(() => {});
  await p.screenshot({ path: `${out}/${what}.png`, fullPage: true }); await p.close();
}
console.log('errors:', errors.length ? errors : 'none'); await browser.close(); await host.close?.(); process.exit(0);
