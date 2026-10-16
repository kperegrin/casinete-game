// Bakes the isometric tileset: renders every static sprite (furniture × rotations × on/off, casino tables, shop counters,
// buildings, trees, street props) from 3D models with three.js in headless Chromium, then packs them into atlas pages
// public/assets/tileset-<n>.png + public/assets/tileset.json.  Models: art/models (CC0 KayKit + Kenney, see art/CREDITS.md)
// and the procedural parts in art/bake/scene.js.   Usage: node tools/make-tileset.mjs [--scale 2] [--split]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { serve } from '../art/bake/serve.mjs';
import { DEFS } from '../shared/content.js';
import { BUILDINGS, OUTDOOR_THINGS, INTERIORS } from '../shared/map.js';
import { PROP_NAMES, TREE_VARIANTS } from '../public/js/decor.js';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const scale = +arg('scale', 2) || 2, split = !!arg('split', false);

// ---- every sprite key the client can ask for (must match public/js/sprites.js)
const keys = [];
for (const d of Object.values(DEFS)) if (d.type === 'furniture') { const wl = d.layer === 'wall'; const tog = d.interact === 'toggle' || d.interact === 'music'; for (let r = 0; r < (wl ? 1 : 4); r++) for (const on of tog ? [0, 1] : [0]) keys.push(`f:${d.id}:${r}:${on}`); }
const seen = new Set(); for (const t of [...OUTDOOR_THINGS, ...Object.values(INTERIORS).flatMap(i => i.things)]) { if (['postcard', 'fish'].includes(t.k)) continue; const k = `t:${t.k}:${t.shop || t.machine || ''}:${t.w || 1}x${t.h || 1}`; if (!seen.has(k)) { seen.add(k); keys.push(k); } }
for (const b of BUILDINGS) keys.push(`b:${b.id}`);
for (const v of TREE_VARIANTS) keys.push(`tree:${v}`);
for (const p of PROP_NAMES) keys.push(`p:${p}`);
const todo = keys;

const srv = await serve();
const browser = await chromium.launch({ executablePath: process.env.CHROME || [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers'].filter(Boolean).map(d => fs.existsSync(d) ? fs.readdirSync(d).filter(n => n.startsWith('chromium-')).map(n => path.join(d, n, 'chrome-linux', 'chrome')).find(fs.existsSync) : null).find(Boolean) || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://127.0.0.1:${srv.port}/art/bake/bake.html`); await page.waitForFunction(() => document.title === 'ready', null, { timeout: 60000 });
  // render one by one (keeps memory flat), collect PNG data + anchors
  const sprites = []; let n = 0;
  for (const key of todo) {
    const r = await page.evaluate(async ({ key, scale }) => { const obj = await window.sceneLib.build(key); if (!obj) return null; const s = window.iso.renderSprite(obj, { scale, ...window.sceneLib.spriteOptions(key) }); return { w: s.canvas.width, h: s.canvas.height, ox: +s.ox.toFixed(2), oy: +s.oy.toFixed(2), png: s.canvas.toDataURL('image/png') }; }, { key, scale });
    if (!r || !r.png.startsWith('data:image/png;base64,') || r.w < 1) { console.warn('  (no sprite for', key + ')'); continue; } sprites.push({ key, ...r }); if (++n % 40 === 0) console.log(`  rendered ${n}/${todo.length}`);
  }
  if (errs.length) throw new Error('bake page errors: ' + errs.join('; '));
  // shelf-pack into pages (node side, using the browser only to compose the PNGs)
  const PW = 4096, PH = 8192, gap = 2; sprites.sort((a, b) => b.h - a.h); const pages = [[]]; let x = 0, y = 0, rowH = 0;
  for (const s of sprites) { if (x + s.w + gap > PW) { x = 0; y += rowH + gap; rowH = 0; } if (y + s.h + gap > PH) { pages.push([]); x = 0; y = 0; rowH = 0; } s.page = pages.length - 1; s.x = x; s.y = y; x += s.w + gap; rowH = Math.max(rowH, s.h); pages[s.page].push(s); }
  const dir = path.join(root, 'public', 'assets'); fs.mkdirSync(dir, { recursive: true }); for (const f of fs.readdirSync(dir)) if (/^tileset/.test(f)) fs.rmSync(path.join(dir, f));
  const meta = { name: 'Casinete isometric tileset (rendered from CC0 KayKit/Kenney models + procedural parts)', format: 2, scale, pages: [], sprites: {} };
  for (let p = 0; p < pages.length; p++) {
    const H = Math.max(...pages[p].map(s => s.y + s.h)) + gap;
    const sheet = new PNG({ width: PW, height: H }); for (const s of pages[p]) { const src = PNG.sync.read(Buffer.from(s.png.split(',')[1], 'base64')); PNG.bitblt(src, sheet, 0, 0, src.width, src.height, s.x, s.y); }
    const png = PNG.sync.write(sheet, { colorType: 6 }); const file = `tileset-${p}.png`; fs.writeFileSync(path.join(dir, file), png); meta.pages.push({ file, w: PW, h: H, v: crypto.createHash('sha1').update(png).digest('hex').slice(0, 8) });
    console.log(`  page ${p}: ${pages[p].length} sprites, ${PW}x${H}, ${(png.length / 1048576).toFixed(1)} MB`);
  }
  for (const s of sprites) meta.sprites[s.key] = { p: s.page, x: s.x, y: s.y, w: s.w, h: s.h, ox: s.ox, oy: s.oy };
  fs.writeFileSync(path.join(dir, 'tileset.json'), JSON.stringify(meta));
  if (split) { const sd = path.join(dir, 'sprites'); fs.mkdirSync(sd, { recursive: true }); for (const s of sprites) fs.writeFileSync(path.join(sd, s.key.replace(/[^a-z0-9_.-]+/gi, '_') + '.png'), Buffer.from(s.png.split(',')[1], 'base64')); }
  console.log(`tileset: ${sprites.length} sprites @${scale}x -> public/assets/tileset.json + ${pages.length} page(s)`);
} finally { await browser.close(); srv.close(); setTimeout(() => process.exit(0), 50); }
