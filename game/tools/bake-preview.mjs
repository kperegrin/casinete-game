// Renders a contact sheet of baked 3D sprites (dev tool): node tools/bake-preview.mjs out.png "f:sofa_2:0,f:bed_single:1,..."
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { serve } from '../art/bake/serve.mjs';
const [out = '/tmp/bake-preview.png', keys = ''] = process.argv.slice(2);
const srv = await serve(); const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await browser.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto(`http://127.0.0.1:${srv.port}/art/bake/bake.html`); await p.waitForFunction(() => document.title === 'ready', null, { timeout: 60000 });
await p.evaluate((o) => Object.assign(window, o), { CW: process.env.CW || 260, CH: process.env.CH || 260, COLS: process.env.COLS || 5 });
const png = await p.evaluate(async (keys) => {
  const { iso, sceneLib } = window; const list = keys.split(',').filter(Boolean); const cells = [];
  for (const k of list) { const obj = await sceneLib.build(k); if (!obj) { cells.push({ k, s: null }); continue; } cells.push({ k, s: iso.renderSprite(obj, sceneLib.spriteOptions(k)) }); }
  const cw = +(window.CW || 260), ch = +(window.CH || 260), cols = +(window.COLS || 5); const cv = document.createElement('canvas'); cv.width = cw * cols; cv.height = ch * Math.ceil(cells.length / cols); const c = cv.getContext('2d'); c.fillStyle = '#c8b89a'; c.fillRect(0, 0, cv.width, cv.height);
  cells.forEach((cell, i) => { const X = (i % cols) * cw, Y = Math.floor(i / cols) * ch; c.fillStyle = (i % 2) ? '#d6c7a8' : '#cdbd9d'; c.fillRect(X, Y, cw, ch); const ox = X + cw / 2, oy = Y + ch * 0.62; // origin marker: draw the tile grid diamond 2x2 around origin
    c.strokeStyle = 'rgba(0,0,0,.18)'; for (let a = 0; a <= 3; a++) { c.beginPath(); c.moveTo(ox + a * 32, oy + a * 16); c.lineTo(ox + a * 32 - 96, oy + a * 16 + 48); c.stroke(); c.beginPath(); c.moveTo(ox - a * 32, oy + a * 16); c.lineTo(ox - a * 32 + 96, oy + a * 16 + 48); c.stroke(); }
    if (cell.s) c.drawImage(cell.s.canvas, ox + cell.s.ox, oy + cell.s.oy, cell.s.canvas.width / cell.s.s, cell.s.canvas.height / cell.s.s); c.fillStyle = '#222'; c.font = '12px sans-serif'; c.fillText(cell.k, X + 6, Y + 14); });
  return cv.toDataURL('image/png');
}, keys);
fs.writeFileSync(out, Buffer.from(png.split(',')[1], 'base64')); console.log('errors:', errs.length ? errs : 'none'); await browser.close(); srv.close(); process.exit(0);
