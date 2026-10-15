// European roulette (single zero). Pure game logic; wallet movement happens through ctx.
import { WHEEL, REDS } from '../../shared/roulette.js';
export { WHEEL, REDS };
export const colorOf = (n) => n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black';

// Build every legal bet ("spot") once. Clients send only spot ids -- never number lists.
export function buildSpots() {
  const spots = []; const add = (type, label, nums) => spots.push({ id: spots.length, type, label, nums: [...nums].sort((a, b) => a - b), count: nums.length, even: type === 'even' });
  for (let n = 0; n <= 36; n++) add('straight', String(n), [n]);
  const pos = (n) => ({ r: Math.floor((n - 1) / 3), c: (n - 1) % 3 });
  for (let n = 1; n <= 36; n++) { const { r, c } = pos(n); if (c < 2) add('split', `${n}/${n + 1}`, [n, n + 1]); if (n + 3 <= 36) add('split', `${n}/${n + 3}`, [n, n + 3]); }
  add('split', '0/1', [0, 1]); add('split', '0/2', [0, 2]); add('split', '0/3', [0, 3]);
  for (let r = 0; r < 12; r++) add('street', `Street ${r * 3 + 1}-${r * 3 + 3}`, [r * 3 + 1, r * 3 + 2, r * 3 + 3]);
  add('trio', '0-1-2', [0, 1, 2]); add('trio', '0-2-3', [0, 2, 3]);
  for (let r = 0; r < 11; r++) for (let c = 0; c < 2; c++) { const n = r * 3 + c + 1; add('corner', `Corner ${n}`, [n, n + 1, n + 3, n + 4]); }
  add('firstfour', '0-1-2-3', [0, 1, 2, 3]);
  for (let r = 0; r < 11; r++) add('sixline', `Six ${r * 3 + 1}-${r * 3 + 6}`, Array.from({ length: 6 }, (_, i) => r * 3 + 1 + i));
  for (let c = 0; c < 3; c++) add('column', `Column ${c + 1}`, Array.from({ length: 12 }, (_, i) => i * 3 + c + 1));
  for (let d = 0; d < 3; d++) add('dozen', `${d * 12 + 1}-${d * 12 + 12}`, Array.from({ length: 12 }, (_, i) => d * 12 + 1 + i));
  const all = Array.from({ length: 36 }, (_, i) => i + 1);
  add('even', 'Red', all.filter(n => REDS.has(n))); add('even', 'Black', all.filter(n => !REDS.has(n)));
  add('even', 'Odd', all.filter(n => n % 2 === 1)); add('even', 'Even', all.filter(n => n % 2 === 0));
  add('even', '1-18', all.filter(n => n <= 18)); add('even', '19-36', all.filter(n => n >= 19));
  return spots;
}
export const SPOTS = buildSpots();
// total return (including stake) for a winning bet covering `count` pockets: stake * 36 / count
export const payoutReturn = (stake, count) => Math.floor(stake * 36 / count);

const PH = { IDLE: 'idle', BET: 'betting', LOCK: 'nobets', SPIN: 'spin', SETTLE: 'settle' };
export class RouletteTable {
  constructor(id, cfg, ctx) {
    this.id = id; this.ctx = ctx; this.kind = 'roulette'; this.name = cfg.name;
    this.min = cfg.min; this.maxStraight = cfg.maxStraight; this.maxOutside = cfg.maxOutside; this.maxTotal = cfg.maxTotal;
    this.laPartage = !!cfg.laPartage; this.phase = PH.IDLE; this.endsAt = 0; this.bets = new Map(); this.lastBets = new Map(); this.history = []; this.result = null; this.round = 0; this.rng = null; this.anim = null;
    this.t = { bet: 25000, lock: 2000, spin: 8000, settle: 6000, ...(cfg.timers || {}) };
  }
  limitFor(spot) { return spot.count <= 6 ? this.maxStraight : this.maxOutside; }
  placeBet(pid, spotId, amount) {
    const spot = SPOTS[spotId]; if (!spot) return { err: 'bad_spot' };
    if (!Number.isInteger(amount) || amount < this.min) return { err: 'min_bet', min: this.min };
    if (this.phase !== PH.IDLE && this.phase !== PH.BET) return { err: 'betting_closed' };
    const mine = this.bets.get(pid) || [];
    const onSpot = mine.filter(b => b.spot === spotId).reduce((a, b) => a + b.stake, 0);
    if (onSpot + amount > this.limitFor(spot)) return { err: 'table_limit', max: this.limitFor(spot) };
    if (mine.reduce((a, b) => a + b.stake, 0) + amount > this.maxTotal) return { err: 'table_limit_total', max: this.maxTotal };
    const r = this.ctx.bet(pid, amount, `roulette:${this.id}`); if (!r.ok) return { err: r.err };
    const ex = mine.find(b => b.spot === spotId); if (ex) ex.stake += amount; else mine.push({ spot: spotId, stake: amount });
    this.bets.set(pid, mine);
    if (this.phase === PH.IDLE) this._startBetting();
    this.ctx.emit(this.id, { k: 'bet', pid, spot: spotId, amount });
    return { ok: true };
  }
  clearBets(pid) {
    if (this.phase !== PH.BET && this.phase !== PH.IDLE) return { err: 'betting_closed' };
    const mine = this.bets.get(pid) || []; const total = mine.reduce((a, b) => a + b.stake, 0);
    if (total) this.ctx.pay(pid, total, `roulette-refund:${this.id}`);
    this.bets.delete(pid); this.ctx.emit(this.id, { k: 'cleared', pid }); return { ok: true, refunded: total };
  }
  rebet(pid) { const last = this.lastBets.get(pid); if (!last?.length) return { err: 'nothing_to_rebet' }; for (const b of last) { const r = this.placeBet(pid, b.spot, b.stake); if (r.err) return r; } return { ok: true }; }
  double(pid) { const mine = (this.bets.get(pid) || []).map(b => ({ ...b })); if (!mine.length) return { err: 'no_bets' }; for (const b of mine) { const r = this.placeBet(pid, b.spot, b.stake); if (r.err) return r; } return { ok: true }; }
  _startBetting() { this.phase = PH.BET; this.round++; this.rng = this.ctx.newRng(); this.endsAt = this.ctx.now() + this.t.bet; this.result = null; this.ctx.emit(this.id, { k: 'phase', phase: this.phase, endsAt: this.endsAt, round: this.round, seedHash: this.rng.seedHash() }); }
  tick() {
    const now = this.ctx.now();
    if (this.phase === PH.BET && now >= this.endsAt) { this.phase = PH.LOCK; this.endsAt = now + this.t.lock; this.ctx.emit(this.id, { k: 'phase', phase: this.phase, endsAt: this.endsAt }); }
    else if (this.phase === PH.LOCK && now >= this.endsAt) {
      this.result = this.rng.int(37);               // decided BEFORE the animation
      this.anim = { wheelStart: this.rng.float() * 360, ballStart: this.rng.float() * 360, ms: this.t.spin, seed: this.rng.int(1e9) };
      this.phase = PH.SPIN; this.endsAt = now + this.t.spin;
      this.ctx.emit(this.id, { k: 'spin', result: this.result, anim: this.anim, endsAt: this.endsAt });
    } else if (this.phase === PH.SPIN && now >= this.endsAt) this._settle(now);
    else if (this.phase === PH.SETTLE && now >= this.endsAt) { this.phase = PH.IDLE; this.ctx.emit(this.id, { k: 'phase', phase: this.phase }); }
  }
  _settle(now) {
    const deltas = {}; const n = this.result;
    for (const [pid, bets] of this.bets) {
      let staked = 0, ret = 0;
      for (const b of bets) {
        const spot = SPOTS[b.spot]; staked += b.stake;
        if (spot.nums.includes(n)) ret += payoutReturn(b.stake, spot.count);
        else if (n === 0 && this.laPartage && spot.even) ret += Math.floor(b.stake / 2);
      }
      if (ret > 0) this.ctx.pay(pid, ret, `roulette-win:${this.id}`);
      deltas[pid] = ret - staked; this.ctx.settled?.(pid, 'roulette', staked, ret);
      this.lastBets.set(pid, bets.map(b => ({ ...b })));
    }
    this.history.unshift(n); this.history.length = Math.min(this.history.length, 20);
    this.phase = PH.SETTLE; this.endsAt = now + this.t.settle;
    this.ctx.emit(this.id, { k: 'settle', result: n, deltas, seed: this.rng.seedHex(), history: this.history });
    this.bets = new Map();
  }
  snapshot() {
    const bets = {}; for (const [pid, bs] of this.bets) bets[pid] = bs;
    return { id: this.id, kind: 'roulette', name: this.name, phase: this.phase, endsAt: this.endsAt, round: this.round, bets, history: this.history, result: this.result, anim: this.phase === PH.SPIN ? this.anim : null, min: this.min, maxStraight: this.maxStraight, maxOutside: this.maxOutside, maxTotal: this.maxTotal, seedHash: this.rng && this.phase !== PH.IDLE ? this.rng.seedHash() : null, laPartage: this.laPartage };
  }
}
