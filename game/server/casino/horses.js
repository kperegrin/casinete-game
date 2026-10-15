// Marigold Downs. Outcome-first: finishing order is sampled from a Plackett-Luce model whose exact probabilities
// also produce the displayed fixed odds (takeout 15%/20%). The animation is choreographed AFTER the order is decided.
const NAMES = ['Clover Dash', 'Sunny Side', 'Pearl Runner', 'Marigold Dream', 'Harbor Light', 'Velvet Thunder', 'Lucky Penny', 'Copper Comet', 'Moonlit Mile', 'Gilded Gale', 'Saffron', 'Wobbly Wanda', 'Biscuit', 'Neon Nellie', 'Captain Crumpet', 'Tidal Wave', 'Maple Rush', 'Lantern', 'Jellybean', 'Sir Trots-a-lot', 'Pixel Pony', 'Ginger Snap', 'Midnight Oats', 'Rocket Raccoon'];
const COLORS = ['#e8795e', '#5ea3e8', '#6fcf7f', '#f2c744', '#b06cff', '#ff8fb8', '#3a4a6b', '#2bb3a3', '#f2a93b', '#c9c9c9'];
export const BET_KINDS = ['win', 'place', 'show', 'exacta'];
const TAKEOUT = { win: 0.15, place: 0.15, show: 0.15, exacta: 0.20 };

export function makeHorsePool(rng) {
  return NAMES.map((name, i) => ({ id: i, name, color: COLORS[i % COLORS.length], silks: COLORS[(i * 3 + 2) % COLORS.length], speed: 55 + rng.int(40), stamina: 55 + rng.int(40), accel: 50 + rng.int(45), consistency: 40 + rng.int(55), form: 40 + rng.int(40), pref: rng.int(3), wet: rng.int(2), record: [0, 0, 0, 0] }));
}
export function strengths(horses, dist /*0..2*/, cond /*0 fast,1 soft*/) {
  return horses.map(h => {
    const distFit = 1 - Math.abs(h.pref - dist) * 0.06; const track = (cond === 1 && h.wet) ? 4 : (cond === 1 ? -3 : 0);
    const r = 0.35 * h.speed + 0.25 * h.stamina * (dist >= 1 ? 1 : 0.9) + 0.15 * h.accel + 0.15 * h.form + 0.10 * (50 + track * 5) - (100 - h.consistency) * 0.05;
    return Math.exp(0.065 * (r * distFit - 60));
  });
}
export function probabilities(s) {
  const S = s.reduce((a, b) => a + b, 0); const n = s.length;
  const win = s.map(x => x / S); const place = new Array(n).fill(0); const show = new Array(n).fill(0); const exacta = {};
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
    if (a === b) continue; const pab = (s[a] / S) * (s[b] / (S - s[a])); exacta[a + '-' + b] = pab; place[a] += pab; place[b] += pab;
    for (let c = 0; c < n; c++) { if (c === a || c === b) continue; const p = pab * (s[c] / (S - s[a] - s[b])); show[a] += p; show[b] += p; show[c] += p; }
  }
  return { win, place, show, exacta };
}
export const oddsFor = (p, kind) => Math.max(1.1, Math.floor(((1 - TAKEOUT[kind]) / p) * 10) / 10);
export function sampleOrder(s, rng) {
  const rem = s.map((_, i) => i); const order = [];
  while (rem.length) { const tot = rem.reduce((a, i) => a + s[i], 0); let x = rng.float() * tot; let pick = rem.length - 1; for (let k = 0; k < rem.length; k++) { x -= s[rem[k]]; if (x < 0) { pick = k; break; } } order.push(rem[pick]); rem.splice(pick, 1); }
  return order;
}
// choreography: finishing times consistent with the decided order + seeded wobble so leaders change
export function choreograph(order, rng, baseT, scale = 1) {
  const times = new Array(order.length); let t = baseT;
  order.forEach((h, k) => { if (k > 0) t += [0.05, 0.1, 0.2, 0.35, 0.6, 0.9][rng.int(6)] * (0.5 + rng.float()) * scale; times[h] = t; });
  const wob = order.map(() => ({ a: 0.35 + rng.float() * 0.5, k: 1 + rng.int(3), ph: 0 }));
  const idx = new Array(order.length); order.forEach((h, k) => { idx[h] = k; });
  return { times: times.map(x => +x.toFixed(2)), wobble: wob.map((w, h) => w), };
}

export class HorseTrack {
  constructor(ctx, cfg = {}) {
    this.ctx = ctx; this.kind = 'horses'; this.t = { bet: 60000, parade: 8000, race: 36000, result: 14000, ...cfg.timers }; this.pool = null; this.race = null; this.phase = 'init'; this.endsAt = 0; this.raceNo = ctx.state.casino.raceNo || 0; this.history = [];
    this.pool = ctx.state.casino.horses?.length ? ctx.state.casino.horses : makeHorsePool(ctx.newRng()); ctx.state.casino.horses = this.pool;
    this._newRace();
  }
  _newRace() {
    const rng = this.ctx.newRng(); this.raceNo++; this.ctx.state.casino.raceNo = this.raceNo; this.ctx.state.dirty.meta = true;
    const ids = this.pool.map((_, i) => i); rng.shuffle(ids); const entries = ids.slice(0, 8).map(i => this.pool[i]);
    const dist = [800, 1200, 1600][rng.int(3)]; const cond = rng.int(2);
    const s = strengths(entries, dist === 800 ? 0 : dist === 1200 ? 1 : 2, cond); const P = probabilities(s);
    const order = sampleOrder(s, rng); const chor = choreograph(order, rng, this.t.race / 1000 * 0.8, Math.max(0.05, this.t.race / 36000));
    this.race = { no: this.raceNo, dist, cond, entries: entries.map((h, k) => ({ slot: k, id: h.id, name: h.name, color: h.color, silks: h.silks, speed: h.speed, stamina: h.stamina, accel: h.accel, form: h.form, record: h.record, pWin: +P.win[k].toFixed(4), odds: { win: oddsFor(P.win[k], 'win'), place: oddsFor(P.place[k], 'place'), show: oddsFor(P.show[k], 'show') } })), P, order, chor, seedHash: rng.seedHash(), seed: rng.seedHex(), bets: [], animSeed: rng.int(1e9) };
    this.phase = 'betting'; this.endsAt = this.ctx.now() + this.t.bet;
    this.ctx.emit('horses', { k: 'race', race: this.pub(), phase: this.phase, endsAt: this.endsAt });
  }
  exactaOdds(a, b) { return oddsFor(this.race.P.exacta[a + '-' + b], 'exacta'); }
  pub() { const r = this.race; return { no: r.no, dist: r.dist, cond: r.cond, entries: r.entries, seedHash: r.seedHash }; }
  bet(pid, kind, horses, stake) {
    if (this.phase !== 'betting') return { err: 'betting_closed' };
    if (!BET_KINDS.includes(kind)) return { err: 'bad_kind' };
    if (!Number.isInteger(stake) || stake < 10 || stake > 5000) return { err: 'stake_limits', min: 10, max: 5000 };
    const n = kind === 'exacta' ? 2 : 1; if (!Array.isArray(horses) || horses.length !== n || horses.some(h => !Number.isInteger(h) || h < 0 || h > 7) || new Set(horses).size !== n) return { err: 'bad_horses' };
    if (this.race.bets.filter(b => b.pid === pid).length >= 6) return { err: 'too_many_bets' };
    const odds = kind === 'exacta' ? this.exactaOdds(horses[0], horses[1]) : this.race.entries[horses[0]].odds[kind];
    const r = this.ctx.bet(pid, stake, 'horses'); if (!r.ok) return { err: r.err };
    const b = { pid, kind, horses, stake, odds }; this.race.bets.push(b); this.ctx.emit('horses', { k: 'bet', pid, kind, horses, stake, odds }, pid); return { ok: true, bet: b };
  }
  tick() {
    const now = this.ctx.now();
    if (this.phase === 'betting' && now >= this.endsAt) { this.phase = 'parade'; this.endsAt = now + this.t.parade; this.ctx.emit('horses', { k: 'phase', phase: 'parade', endsAt: this.endsAt }); }
    else if (this.phase === 'parade' && now >= this.endsAt) {
      this.phase = 'race'; this.startedAt = now; const T = Math.max(...this.race.chor.times); this.endsAt = now + (T + 4 * Math.max(0.05, this.t.race / 36000)) * 1000;
      this.ctx.emit('horses', { k: 'start', startedAt: this.startedAt, endsAt: this.endsAt, chor: this.race.chor, animSeed: this.race.animSeed, dist: this.race.dist });
    } else if (this.phase === 'race' && now >= this.endsAt) this._settle(now);
    else if (this.phase === 'result' && now >= this.endsAt) this._newRace();
  }
  _settle(now) {
    const r = this.race; const [w, p, s3] = r.order; const top2 = r.order.slice(0, 2), top3 = r.order.slice(0, 3); const pays = {};
    for (const b of r.bets) {
      let win = false;
      if (b.kind === 'win') win = b.horses[0] === w; else if (b.kind === 'place') win = top2.includes(b.horses[0]); else if (b.kind === 'show') win = top3.includes(b.horses[0]);
      else win = b.horses[0] === w && b.horses[1] === p;
      const ret = win ? Math.min(1_000_000, Math.floor(b.stake * b.odds)) : 0;
      if (ret) this.ctx.pay(b.pid, ret, 'horses-win');
      pays[b.pid] = pays[b.pid] || { staked: 0, ret: 0 }; pays[b.pid].staked += b.stake; pays[b.pid].ret += ret;
    }
    for (const [pid, v] of Object.entries(pays)) this.ctx.settled?.(pid, 'horses', v.staked, v.ret, { won: v.ret > 0 });
    // form updates: winners improve a little, regress to mean
    r.order.forEach((slot, rank) => { const h = this.pool[r.entries[slot].id]; h.form = Math.round(h.form * 0.85 + (rank < 3 ? 78 - rank * 8 : 40 - rank * 2) * 0.15); h.record[Math.min(rank, 3)]++; });
    this.history.unshift({ no: r.no, winner: r.entries[w].name, order: r.order.map(i => r.entries[i].name) }); this.history.length = Math.min(this.history.length, 10);
    this.phase = 'result'; this.endsAt = now + this.t.result; this.ctx.state.dirty.meta = true;
    this.ctx.emit('horses', { k: 'result', order: r.order, times: r.chor.times, pays, seed: r.seed, history: this.history });
  }
  snapshot(viewer) {
    const r = this.race;
    return { kind: 'horses', phase: this.phase, endsAt: this.endsAt, race: this.pub(), startedAt: this.startedAt, chor: this.phase === 'race' || this.phase === 'result' ? r.chor : null, animSeed: r.animSeed, order: this.phase === 'result' ? r.order : null, history: this.history, myBets: r.bets.filter(b => b.pid === viewer), serverNow: this.ctx.now() };
  }
}
