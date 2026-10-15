import WebSocket from 'ws';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { createHost } from '../server/index.js';

export async function startHost(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'casinete-test-'));
  const host = createHost({ world: 'Test World', dir, settings: { upkeepSec: 60, ...(opts.settings || {}) }, casinoTimers: opts.casinoTimers || { roulette: { bet: 400, lock: 100, spin: 300, settle: 300 }, horses: { bet: 600, parade: 100, race: 800, result: 300 }, blackjack: { bet: 400, insure: 300, turn: 600, settle: 200 }, poker: { action: 600, between: 200, botMin: 30, botMax: 80 } }, spinCooldownMs: 0, tradeDelayMs: 100, saveEveryMs: 400, ...opts });
  const port = await host.listen(0, '127.0.0.1');
  return { host, port, dir, game: host.game, url: `ws://127.0.0.1:${port}` };
}
export class Bot {
  constructor(url, name) { this.url = url; this.name = name; this.token = (name + '-token-'.repeat(3) + 'x'.repeat(8)).slice(0, 32).padEnd(32, 'x'); this.i = 1; this.pending = new Map(); this.events = []; this.me = null; this.inv = []; this.loc = 'world'; this.waiters = []; }
  connect(look, extra = {}) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.on('open', () => this.ws.send(JSON.stringify({ t: 'hello', proto: 1, name: this.name, token: this.token, look, ...extra })));
      this.ws.on('message', (raw) => {
        const m = JSON.parse(raw.toString());
        if (m.t === 'r') { const p = this.pending.get(m.i); if (p) { this.pending.delete(m.i); p(m); } return; }
        if (m.t === 'welcome') { this.me = m.you; this.inv = m.inv; this.welcome = m; resolve(this); }
        if (m.t === 'me') this.me = m.me; if (m.t === 'inv') this.inv = m.inv;
        if (m.t === 'loc') { this.loc = m.loc; this.x = m.x; this.y = m.y; this.snap = m.snap; this.tables = m.tables; }
        if (m.t === 'snap') { this.x = m.x; this.y = m.y; }
        if (m.t === 'reject') reject(new Error('rejected ' + m.reason));
        this.events.push(m); for (const w of [...this.waiters]) if (w.f(m)) { this.waiters.splice(this.waiters.indexOf(w), 1); w.r(m); }
      });
      this.ws.on('error', reject);
    });
  }
  cmd(k, args = {}) { return new Promise((res) => { const i = this.i++; this.pending.set(i, res); this.ws.send(JSON.stringify({ t: 'c', i, k, ...args })); }); }
  mv(x, y) { this.x = x; this.y = y; this.ws.send(JSON.stringify({ t: 'mv', x, y, d: 0, seq: 0 })); }
  waitFor(f, ms = 3000) { const hit = this.events.find(f); if (hit) return Promise.resolve(hit); return new Promise((r, rej) => { const w = { f, r }; this.waiters.push(w); setTimeout(() => { const i = this.waiters.indexOf(w); if (i >= 0) { this.waiters.splice(i, 1); rej(new Error('timeout waiting for event')); } }, ms); }); }
  nextEvent(f, ms = 3000) { return new Promise((r, rej) => { const w = { f, r }; this.waiters.push(w); setTimeout(() => { const i = this.waiters.indexOf(w); if (i >= 0) { this.waiters.splice(i, 1); rej(new Error('timeout waiting for next event')); } }, ms); }); }
  close() { this.ws.close(); }
  sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// teleport via dev tools (host bot only) or direct server state for non-host bots
export function place(game, bot, loc, x, y) { const s = game.sessions.get(bot.me.id); if (loc !== s.loc) { if (loc === 'world') game.enterLoc(s, 'world', x, y); else if (loc.startsWith('home:')) game.enterLoc(s, loc, x, y); else game.enterLoc(s, loc, x, y); } else { s.x = x; s.y = y; } }
