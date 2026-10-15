// Bakes the procedural isometric models (furniture, buildings, trees, props) into public/assets/tileset.png + tileset.json.
// The game uses that PNG atlas when it exists and falls back to rendering the same models live, so you can swap in any
// artist-made tileset by replacing the two files (keep the keys / `ox,oy` anchors from tileset.json) or run with --split
// to also get one PNG per sprite in public/assets/sprites/.  Usage: node tools/make-tileset.mjs [--scale 2] [--split]
import { chromium } from 'playwright-core';
import { createHost } from '../server/index.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const scale = +arg('scale', 2) || 2, split = !!arg('split', false);
const host = createHost({ world: 'bake', dir: fs.mkdtempSync(path.join(os.tmpdir(), 'casinete-bake-')) }); const port = await host.listen(0, '127.0.0.1');
const exe = process.env.CHROME || [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers'].filter(Boolean).map(d => fs.existsSync(d) ? fs.readdirSync(d).filter(n => n.startsWith('chromium-')).map(n => path.join(d, n, 'chrome-linux', 'chrome')).find(fs.existsSync) : null).find(Boolean) || undefined;
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage(); page.on('pageerror', e => { throw e; }); await page.goto(`http://127.0.0.1:${port}/bake.html`); await page.waitForFunction(() => document.title === 'ready');
  if (split) await page.evaluate(() => { window.__split = true; });
  const out = await page.evaluate((s) => window.bake(s), scale);
  const dir = path.join(root, 'public', 'assets'); fs.mkdirSync(dir, { recursive: true });
  const png = Buffer.from(out.png.split(',')[1], 'base64'); out.meta.version = crypto.createHash('sha1').update(png).digest('hex').slice(0, 8);
  fs.writeFileSync(path.join(dir, 'tileset.png'), png); fs.writeFileSync(path.join(dir, 'tileset.json'), JSON.stringify(out.meta));
  if (split) { const sd = path.join(dir, 'sprites'); fs.mkdirSync(sd, { recursive: true }); for (const [k, v] of Object.entries(out.singles)) fs.writeFileSync(path.join(sd, k.replace(/[^a-z0-9_.-]+/gi, '_') + '.png'), Buffer.from(v.split(',')[1], 'base64')); }
  console.log(`tileset: ${Object.keys(out.meta.sprites).length} sprites, ${out.meta.width}x${out.meta.height}px @${scale}x, ${(png.length / 1024) | 0} KB -> public/assets/tileset.png (+ .json)`);
} finally { await browser.close(); host.close?.(); setTimeout(() => process.exit(0), 50); }
