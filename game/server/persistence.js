// Persistence: per-section JSON files (atomic tmp+rename), hash manifest, hash-chained journal,
// rotating backups, granular corruption recovery and ordered schema migrations.
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { newAccounts, indexItems } from './ledger.js';

export const CURRENT_SCHEMA = 3;
const SECTIONS = { meta: ['meta', 'accts', 'escrow', 'counters', 'casino'], players: ['players'], items: ['items'], props: ['props'] };
const sha = (s) => createHash('sha256').update(s).digest('hex');

export const MIGRATIONS = {
  // 1 -> 2: introduce per-player favorites and settings
  1: (s) => { for (const p of Object.values(s.players)) { p.favorites ??= []; p.settings ??= {}; } },
  // 2 -> 3: introduce blueprints + stats object
  2: (s) => { for (const p of Object.values(s.players)) { p.blueprints ??= []; p.stats ??= {}; } },
};

export function newState(name, opts = {}) {
  const s = {
    meta: { schema: CURRENT_SCHEMA, worldId: randomUUID(), name, created: Date.now(), nextId: 1, nextTx: 1, journalHash: '0', settings: { casino: true, cheats: true, upkeepSec: 600, filter: true, economy: 'standard', ...opts.settings } },
    accts: newAccounts(), escrow: {}, counters: { minted: {}, destroyed: {} }, casino: { jackpotSeed: 50000, horses: {}, raceNo: 0 },
    players: {}, items: {}, props: {},
  };
  s.accts.jackpot = 50000; s.accts.mint = -50000;   // jackpot seed money comes from the mint
  return attachRuntime(s);
}
export function attachRuntime(s) {
  s.dirty = { meta: true, players: true, items: true, props: true };
  s.seen = new Map(); s.journalQueue = []; s.recovery = s.recovery || [];
  indexItems(s);
  return s;
}

function writeAtomic(file, data) { const tmp = file + '.tmp'; fs.writeFileSync(tmp, data); fs.renameSync(tmp, file); }
function sectionPayload(state, sec) { const o = {}; for (const k of SECTIONS[sec]) o[k] = state[k]; return JSON.stringify(o); }

export class Store {
  constructor(dir) { this.dir = dir; this.backupsDir = path.join(dir, 'backups'); fs.mkdirSync(this.backupsDir, { recursive: true }); this.manifest = null; this.lastBackup = { auto: 0, hourly: 0, daily: 0 }; }
  file(n) { return path.join(this.dir, n); }
  exists() { return fs.existsSync(this.file('manifest.json')); }

  save(state, { force = false } = {}) {
    const m = this.manifest || { schema: CURRENT_SCHEMA, hashes: {} };
    let wrote = [];
    for (const sec of Object.keys(SECTIONS)) {
      if (!force && !state.dirty[sec]) continue;
      const payload = sectionPayload(state, sec);
      writeAtomic(this.file(sec + '.json'), payload);
      m.hashes[sec] = sha(payload); state.dirty[sec] = false; wrote.push(sec);
    }
    // journal (append-only, hash chained)
    if (state.journalQueue.length) {
      let prev = state.meta.journalHash; let out = '';
      for (const e of state.journalQueue) { e.prev = prev; prev = sha(prev + JSON.stringify(e)).slice(0, 16); e.h = prev; out += JSON.stringify(e) + '\n'; }
      fs.appendFileSync(this.file('journal.log'), out); state.meta.journalHash = prev; state.journalQueue.length = 0; state.dirty.meta = true;
      if (!wrote.includes('meta')) { const payload = sectionPayload(state, 'meta'); writeAtomic(this.file('meta.json'), payload); m.hashes.meta = sha(payload); state.dirty.meta = false; wrote.push('meta'); }
    }
    m.schema = state.meta.schema; m.worldId = state.meta.worldId; m.name = state.meta.name; m.lastSaved = Date.now(); m.playtimeNote = 'prototype';
    m.players = Object.keys(state.players).length; m.properties = Object.values(state.props).filter(p => p.owner).length;
    writeAtomic(this.file('manifest.json'), JSON.stringify(m, null, 1)); this.manifest = m;
    return wrote;
  }

  // Load a world. Returns { state, recovery[] }.
  load() {
    const recovery = [];
    let m = this.readJson('manifest.json');
    if (!m) { const b = this.bestBackup(); if (!b) throw new Error('manifest missing and no backup'); recovery.push('manifest restored from backup ' + b.name); this.restoreFile(b, 'manifest.json'); m = this.readJson('manifest.json'); }
    const raw = {};
    for (const sec of Object.keys(SECTIONS)) {
      let txt = this.readText(sec + '.json');
      const ok = (t) => { try { if (!t) return false; if (m.hashes[sec] && sha(t) !== m.hashes[sec]) return false; JSON.parse(t); return true; } catch { return false; } };
      if (!ok(txt)) {
        const b = this.bestBackup(sec);
        if (!b) throw new Error(`section ${sec} corrupt and no valid backup`);
        recovery.push(`section ${sec} failed integrity check; restored from backup ${b.name}`);
        fs.copyFileSync(path.join(b.path, sec + '.json'), this.file(sec + '.json')); txt = this.readText(sec + '.json');
        m.hashes[sec] = sha(txt);
      }
      Object.assign(raw, JSON.parse(txt));
    }
    const state = { ...raw };
    // forward-compat: refuse to open saves from the future
    if ((state.meta.schema || 1) > CURRENT_SCHEMA) throw new Error(`save schema ${state.meta.schema} is newer than this game (${CURRENT_SCHEMA})`);
    if ((state.meta.schema || 1) < CURRENT_SCHEMA) {
      this.backup('premigration', state);
      for (let v = state.meta.schema || 1; v < CURRENT_SCHEMA; v++) MIGRATIONS[v](state);
      recovery.push(`migrated save schema ${state.meta.schema} -> ${CURRENT_SCHEMA}`); state.meta.schema = CURRENT_SCHEMA;
    }
    state.recovery = recovery; this.manifest = m;
    attachRuntime(state);
    if (recovery.length) { state.dirty = { meta: true, players: true, items: true, props: true }; }
    return { state, recovery };
  }
  readText(n) { try { return fs.readFileSync(this.file(n), 'utf8'); } catch { return null; } }
  readJson(n) { try { return JSON.parse(this.readText(n)); } catch { return null; } }

  // ---- backups ----
  backup(kind, state) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(this.backupsDir, kind, stamp); fs.mkdirSync(dest, { recursive: true });
    for (const f of ['manifest.json', 'meta.json', 'players.json', 'items.json', 'props.json']) if (fs.existsSync(this.file(f))) fs.copyFileSync(this.file(f), path.join(dest, f));
    const keep = { auto: 6, hourly: 6, daily: 7, premigration: 3, manual: 50 }[kind] || 10;
    const list = fs.readdirSync(path.join(this.backupsDir, kind)).sort();
    while (list.length > keep) fs.rmSync(path.join(this.backupsDir, kind, list.shift()), { recursive: true, force: true });
    return stamp;
  }
  listBackups() {
    const out = [];
    for (const kind of fs.existsSync(this.backupsDir) ? fs.readdirSync(this.backupsDir) : []) for (const n of fs.readdirSync(path.join(this.backupsDir, kind))) out.push({ kind, name: n, path: path.join(this.backupsDir, kind, n) });
    return out.sort((a, b) => b.name.localeCompare(a.name));
  }
  bestBackup(sec) {
    for (const b of this.listBackups()) {
      try {
        const mf = JSON.parse(fs.readFileSync(path.join(b.path, 'manifest.json'), 'utf8'));
        if (!sec) return b;
        const txt = fs.readFileSync(path.join(b.path, sec + '.json'), 'utf8');
        if (sha(txt) === mf.hashes[sec]) { JSON.parse(txt); return b; }
      } catch { /* try next */ }
    }
    return null;
  }
  restoreFile(b, f) { fs.copyFileSync(path.join(b.path, f), this.file(f)); }
  // timed backups: call from the server loop
  maybeBackup(state, now = Date.now(), intervals = { auto: 600e3, hourly: 3600e3, daily: 86400e3 }) {
    const made = [];
    for (const kind of ['auto', 'hourly', 'daily']) if (now - this.lastBackup[kind] >= intervals[kind]) { this.backup(kind, state); this.lastBackup[kind] = now; made.push(kind); }
    return made;
  }
  verifyJournal() {
    const txt = this.readText('journal.log'); if (!txt) return { ok: true, lines: 0 };
    let prev = '0'; let n = 0;
    for (const line of txt.split('\n').filter(Boolean)) {
      const e = JSON.parse(line); const { h, ...rest } = e; if (rest.prev !== prev) return { ok: false, at: n };
      const hh = sha(prev + JSON.stringify(rest)).slice(0, 16); if (hh !== h) return { ok: false, at: n };
      prev = h; n++;
    }
    return { ok: true, lines: n };
  }
}
