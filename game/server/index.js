// Casinete Host entry point:  node server/index.js [--port 3000] [--world "My World"] [--dir saves/my-world] [--fast]
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Game } from './game.js';
import { install as core } from './cmds-core.js';
import { install as house } from './cmds-house.js';
import { install as casino } from './cmds-casino.js';
import { install as social } from './cmds-social.js';

let ROOT = process.cwd(); try { ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); } catch { /* bundled single-file build: assets come from opts.assets */ }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

export function joinCode(ip, port) { const hex = ip.split('.').map(n => (+n).toString(16).padStart(2, '0')).join('') + port.toString(16).padStart(4, '0'); return hex.toUpperCase().match(/.{4}/g).join('-'); }
export function lanAddresses() { const out = []; for (const list of Object.values(os.networkInterfaces())) for (const n of list || []) if (n.family === 'IPv4' && !n.internal) out.push(n.address); return out; }

export function createHost(opts = {}) {
  const game = new Game({ ...opts, modules: [core, house, casino, social] });
  const server = http.createServer((req, res) => {
    let url = decodeURIComponent((req.url || '/').split('?')[0]);
    if (url === '/api/info') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ name: game.state.meta.name, players: game.sessions.size, max: game.state.meta.settings.maxPlayers || 16, password: !!game.state.meta.settings.password, proto: 1 })); return; }
    if (url === '/') url = '/index.html';
    if (opts.assets) {                                   // single-file executable: files are embedded
      const key = url.startsWith('/shared/') ? url.slice(1) : 'public' + url; const data = opts.assets(key);
      if (!data) { res.statusCode = 404; return res.end('not found'); }
      res.setHeader('content-type', MIME[path.extname(url)] || 'application/octet-stream'); res.setHeader('cache-control', 'no-store'); return res.end(Buffer.from(data));
    }
    const base = url.startsWith('/shared/') ? ROOT : path.join(ROOT, 'public');
    const file = path.normalize(path.join(base, url)); if (!file.startsWith(base)) { res.statusCode = 403; return res.end('forbidden'); }
    fs.readFile(file, (err, data) => { if (err) { res.statusCode = 404; return res.end('not found'); } res.setHeader('content-type', MIME[path.extname(file)] || 'application/octet-stream'); res.setHeader('cache-control', 'no-store'); res.end(data); });
  });
  const wss = new WebSocketServer({ server, maxPayload: 32 * 1024 });
  wss.on('connection', (ws, req) => game.onConnect(ws, req));
  let last = Date.now(); const loop = setInterval(() => { const now = Date.now(); game.tick(now - last); last = now; }, 50);
  return {
    game, server, wss,
    listen(port = 3000, host = '0.0.0.0') { return new Promise((res) => server.listen(port, host, () => res(server.address().port))); },
    async close() { clearInterval(loop); game.save(true); for (const s of game.sessions.values()) s.ws.close(); await new Promise(r => wss.close(r)); await new Promise(r => server.close(r)); },
  };
}

export function runCli({ assets, defaultDir, openBrowser = false, pauseOnExit = false } = {}) {
  const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
  const fast = process.argv.includes('--fast');
  const port = +arg('port', 3000); const world = arg('world', 'Marigold Bay'); const dir = arg('dir', path.join(defaultDir || path.join(ROOT, 'saves'), world.toLowerCase().replace(/[^a-z0-9]+/g, '-')));
  const settings = { maxPlayers: +arg('max', 16) }; if (arg('password')) settings.password = arg('password'); if (process.argv.includes('--no-casino')) settings.casino = false;
  if (fast) settings.upkeepSec = 60;
  const casinoTimers = fast ? { roulette: { bet: 12000, lock: 1500, spin: 5000, settle: 4000 }, horses: { bet: 30000, parade: 4000, race: 20000, result: 8000 }, blackjack: { bet: 10000 } } : {};
  const host = createHost({ world, dir, settings, casinoTimers, assets, log: (m) => console.log(new Date().toISOString().slice(11, 19), m), lan: lanAddresses() });
  host.listen(port).then((p) => {
    console.log(`\n  ♣ CASINETE host "${world}" is running  (save folder: ${dir})\n`);
    console.log(`  Play on this computer:   http://localhost:${p}`);
    for (const ip of lanAddresses()) console.log(`  Friends on your network: http://${ip}:${p}      (join code ${joinCode(ip, p)})`);
    console.log(`\n  You (on localhost) are the Host: you get the Host panel, dev tools and admin commands. Close this window or press Ctrl+C to save & quit.\n`);
    if (openBrowser) openUrl(`http://localhost:${p}`);
  }).catch((e) => { console.error('Could not start the Host:', e.message, e.code === 'EADDRINUSE' ? '(port already in use — is Casinete already running? try --port 3001)' : ''); if (pauseOnExit) setTimeout(() => process.exit(1), 60000); else process.exit(1); });
  const quit = async () => { console.log('\nSaving world…'); await host.close(); process.exit(0); };
  process.on('SIGINT', quit); process.on('SIGTERM', quit);
  return host;
}
function openUrl(url) { import('node:child_process').then(({ exec }) => { const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`; exec(cmd, () => {}); }); }

let isMain = false; try { isMain = !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url); } catch { /* bundled build */ }
if (isMain) runCli();
