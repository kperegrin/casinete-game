// No-limit Texas Hold'em cash table (2-6 seats). Real tables hold Coins in a table escrow; practice tables use Fun Chips and bots.
import { rank7, handName } from './cards.js';

export function buildPots(contribs /* [{seat, amt, folded}] */) {
  const c = contribs.map(x => ({ ...x })).filter(x => x.amt > 0);
  const refunds = [];
  // return the uncalled part of the largest contribution
  const sorted = [...c].sort((a, b) => b.amt - a.amt);
  if (sorted.length >= 1) { const second = sorted[1]?.amt ?? 0; if (sorted[0].amt > second) { const ex = sorted[0].amt - second; refunds.push({ seat: sorted[0].seat, amt: ex }); sorted[0].amt = second; } }
  const levels = [...new Set(c.filter(x => !x.folded && x.amt > 0).map(x => x.amt))].sort((a, b) => a - b);
  const pots = []; let prev = 0;
  for (const L of levels) {
    const amount = c.reduce((a, x) => a + Math.min(x.amt, L) - Math.min(x.amt, prev), 0);
    const eligible = c.filter(x => !x.folded && x.amt >= L).map(x => x.seat);
    if (amount > 0) pots.push({ amount, eligible });
    prev = L;
  }
  // dead money above the top live level (folded players only) goes to the last pot
  const topLive = levels.at(-1) ?? 0; const dead = c.reduce((a, x) => a + Math.max(0, x.amt - Math.max(topLive, 0)), 0);
  if (dead > 0 && pots.length) pots.at(-1).amount += dead;
  return { pots, refunds };
}

export class PokerTable {
  constructor(id, cfg, ctx) {
    this.id = id; this.ctx = ctx; this.kind = 'poker'; this.name = cfg.name; this.sb = cfg.sb; this.bb = cfg.bb; this.minBuy = cfg.minBuy; this.maxBuy = cfg.maxBuy; this.fun = !!cfg.fun; this.bots = !!cfg.bots; this.rakePct = cfg.fun ? 0 : (cfg.rakePct ?? 3);
    this.t = { action: 25000, bank: 30000, between: 4000, botMin: 900, botMax: 2200, ...(cfg.timers || {}) };
    this.seats = Array.from({ length: 6 }, () => null); this.inHand = new Set(); this.button = -1; this.phase = 'waiting'; this.board = []; this.pots = []; this.handNo = 0; this.toAct = -1; this.currentBet = 0; this.minRaise = 0; this.lastRaise = 0; this.endsAt = 0; this.deck = []; this.dIdx = 0; this.rakeTaken = 0; this.last = null; this.history = [];
    this.escrowKey = 'escrow:' + id;
  }
  seatOf(pid) { return this.seats.findIndex(s => s && s.pid === pid); }
  _mkSeat(o) { return { pid: null, bot: false, name: '', stack: 0, hole: [], bet: 0, total: 0, folded: false, allIn: false, out: false, acted: false, canRaise: true, timeouts: 0, bank: this.t.bank, leaving: false, ...o }; }
  sit(pid, i, buyIn) {
    if (this.seatOf(pid) >= 0) return { err: 'already_seated' };
    if (!(i >= 0 && i < 6) || this.seats[i]) return { err: 'seat_taken' };
    if (!Number.isInteger(buyIn) || buyIn < this.minBuy || buyIn > this.maxBuy) return { err: 'buyin_limits', min: this.minBuy, max: this.maxBuy };
    if (!this.fun) { const r = this.ctx.toEscrow(pid, this.escrowKey, buyIn); if (!r.ok) return { err: r.err }; }
    this.seats[i] = this._mkSeat({ pid, name: this.ctx.nameOf(pid), stack: buyIn, out: true });
    this.ctx.emit(this.id, { k: 'seat', seat: i, ...this.pubSeat(i) }); this._maybeStart(); return { ok: true, seat: i };
  }
  addBot(i) {
    if (!this.bots) return { err: 'no_bots' }; if (!(i >= 0 && i < 6) || this.seats[i]) return { err: 'seat_taken' };
    const names = ['Botley', 'Chip', 'Ada', 'Rook', 'Nova', 'Pico']; const id = 'bot' + i + '_' + Math.floor(this.ctx.now() % 1e6);
    this.seats[i] = this._mkSeat({ pid: id, bot: true, name: names[i] + ' 🤖', stack: this.maxBuy / 2 }); this.ctx.emit(this.id, { k: 'seat', seat: i, ...this.pubSeat(i) }); this._maybeStart(); return { ok: true };
  }
  removeBot(i) { const s = this.seats[i]; if (!s?.bot) return { err: 'not_bot' }; return this._removeSeat(i); }
  rebuy(pid, amt) {
    const i = this.seatOf(pid); if (i < 0) return { err: 'not_seated' }; const s = this.seats[i];
    if (this.inHand.has(i) && ['preflop', 'flop', 'turn', 'river'].includes(this.phase) && !s.folded) return { err: 'in_hand' };
    if (s.stack + amt > this.maxBuy || amt < 1) return { err: 'buyin_limits', max: this.maxBuy };
    if (!this.fun) { const r = this.ctx.toEscrow(pid, this.escrowKey, amt); if (!r.ok) return { err: r.err }; }
    s.stack += amt; this.ctx.emit(this.id, { k: 'stack', seat: i, stack: s.stack }); this._maybeStart(); return { ok: true };
  }
  leave(pid) {
    const i = this.seatOf(pid); if (i < 0) return { ok: true }; const s = this.seats[i];
    const inHand = ['preflop', 'flop', 'turn', 'river'].includes(this.phase) && this.inHand.has(i) && !s.folded;
    if (inHand) { s.leaving = true; this._fold(i, true); return { ok: true, deferred: true }; }
    return this._removeSeat(i);
  }
  _removeSeat(i) {
    const s = this.seats[i]; if (!s) return { ok: true };
    if (!s.bot && !this.fun && s.stack > 0) this.ctx.fromEscrow(s.pid, this.escrowKey, s.stack);
    this.seats[i] = null; this.ctx.emit(this.id, { k: 'seat', seat: i, pid: null }); return { ok: true };
  }
  _active() { return this.seats.map((s, i) => [s, i]).filter(([s]) => s && s.stack > 0 && !s.sitOut && !s.leaving).map(([, i]) => i); }
  sitIn(pid) { const i = this.seatOf(pid); if (i < 0) return { err: 'not_seated' }; this.seats[i].sitOut = false; this.seats[i].timeouts = 0; this._maybeStart(); return { ok: true }; }
  _maybeStart() { if (['waiting'].includes(this.phase) && this._active().length >= 2) { this.phase = 'between'; this.endsAt = this.ctx.now() + 2000; } }
  _next(i, pred) { for (let k = 1; k <= 6; k++) { const j = (i + k) % 6; const s = this.seats[j]; if (s && pred(s, j)) return j; } return -1; }

  startHand() {
    for (let i = 0; i < 6; i++) { const s = this.seats[i]; if (!s) continue; if (s.leaving || (!s.bot && !this.ctx.online(s.pid) && s.timeouts >= 2)) { this._removeSeat(i); continue; } if (s.bot && s.stack < this.bb * 10 && this.fun) s.stack = this.maxBuy / 2; }
    const act = this._active(); if (act.length < 2) { this.phase = 'waiting'; this.ctx.emit(this.id, { k: 'phase', phase: 'waiting' }); return; }
    this.handNo++; this.rng = this.ctx.newRng(); this.deck = this.rng.shuffle(Array.from({ length: 52 }, (_, i) => i)); this.dIdx = 0; this.board = []; this.pots = []; this.rakeTaken = 0; this.last = null;
    this.inHand = new Set(act);
    for (const s of this.seats) if (s) { s.out = true; s.hole = []; s.bet = 0; s.total = 0; s.folded = false; s.allIn = false; s.acted = false; s.canRaise = true; s.usedBank = false; }
    for (const i of act) this.seats[i].out = false;
    const inH = (s, j) => this.inHand.has(j);
    this.button = this.button < 0 ? act[this.rng.int(act.length)] : this._next(this.button, inH);
    const heads = act.length === 2;
    const sbSeat = heads ? this.button : this._next(this.button, inH);
    const bbSeat = this._next(sbSeat, inH);
    this._post(sbSeat, this.sb); this._post(bbSeat, this.bb);
    for (let r = 0; r < 2; r++) for (const i of this._order(this.button)) this.seats[i].hole.push(this.deck[this.dIdx++]);
    this.currentBet = this.bb; this.lastRaise = this.bb; this.minRaise = this.bb * 2; this.phase = 'preflop';
    this.sbSeat = sbSeat; this.bbSeat = bbSeat;
    this.toAct = heads ? sbSeat : this._next(bbSeat, (s, j) => this.inHand.has(j) && !s.allIn);
    if (this.seats[this.toAct]?.allIn) this.toAct = this._next(this.toAct, (s, j) => this.inHand.has(j) && !s.allIn);
    this.ctx.emit(this.id, { k: 'hand', hand: this.handNo, button: this.button, sb: sbSeat, bb: bbSeat, seedHash: this.rng.seedHash() });
    for (const i of this._order(this.button)) { const s = this.seats[i]; if (!s.bot) this.ctx.emitTo(s.pid, this.id, { k: 'hole', seat: i, cards: s.hole }); }
    if (this.toAct < 0 || this._live().filter(i => !this.seats[i].allIn).length < 2 && this.seats.every((s, j) => !s || !this.inHand.has(j) || s.allIn || s.bet >= this.currentBet)) { this.ctx.emit(this.id, { k: 'state', ...this.snapshot() }); this._nextStreet(true); return; }
    this._armTimer();
    this.ctx.emit(this.id, { k: 'state', ...this.snapshot() });
  }
  _order(btn) { const o = []; for (let k = 1; k <= 6; k++) { const j = (btn + k) % 6; if (this.inHand.has(j)) o.push(j); } return o; }
  _post(i, amt) { const s = this.seats[i]; const a = Math.min(amt, s.stack); s.stack -= a; s.bet += a; s.total += a; if (s.stack === 0) s.allIn = true; }
  _armTimer() {
    const s = this.seats[this.toAct]; if (!s) return;
    const base = s.bot ? this.t.botMin + this.rng.int(this.t.botMax - this.t.botMin) : this.t.action;
    this.actionDeadline = this.ctx.now() + base; this.endsAt = this.actionDeadline; s.turnStart = this.ctx.now();
    this.ctx.emit(this.id, { k: 'turn', seat: this.toAct, endsAt: this.endsAt, bank: s.bank, legal: this.legalFor(this.toAct) });
  }
  legalFor(i) {
    const s = this.seats[i]; if (!s || i !== this.toAct) return null;
    const toCall = this.currentBet - s.bet; const can = ['fold'];
    if (toCall <= 0) can.push('check'); else can.push('call');
    const maxTo = s.stack + s.bet;
    if (maxTo > this.currentBet && s.canRaise) can.push(this.currentBet === 0 ? 'bet' : 'raise');
    can.push('allin');
    return { actions: can, toCall: Math.min(toCall, s.stack), minRaiseTo: Math.min(this.minRaise, maxTo), maxRaiseTo: maxTo, pot: this.potTotal() };
  }
  potTotal() { return this.seats.reduce((a, s) => a + (s ? s.total : 0), 0); }
  act(pid, type, amount) {
    const i = this.seatOf(pid); if (i < 0) return { err: 'not_seated' }; if (i !== this.toAct) return { err: 'not_your_turn' };
    return this._apply(i, type, amount);
  }
  _apply(i, type, amount) {
    const s = this.seats[i]; const toCall = this.currentBet - s.bet;
    const legal = this.legalFor(i); if (!legal) return { err: 'not_your_turn' };
    if (type === 'allin') { type = s.stack + s.bet > this.currentBet ? (this.currentBet === 0 ? 'bet' : 'raise') : 'call'; amount = s.stack + s.bet; if (type !== 'call' && !s.canRaise) type = 'call'; }
    if (!legal.actions.includes(type) && type !== 'call') return { err: 'illegal_action' };
    if (type === 'fold') return this._fold(i, false);
    if (type === 'check') { if (toCall > 0) return { err: 'illegal_action' }; s.acted = true; }
    else if (type === 'call') { const a = Math.min(toCall, s.stack); s.stack -= a; s.bet += a; s.total += a; if (s.stack === 0) s.allIn = true; s.acted = true; }
    else if (type === 'bet' || type === 'raise') {
      if (!Number.isInteger(amount)) return { err: 'bad_amount' };
      const maxTo = s.stack + s.bet; const isAllIn = amount >= maxTo; if (amount > maxTo) return { err: 'bad_amount' };
      if (!isAllIn && amount < this.minRaise) return { err: 'raise_too_small', min: this.minRaise };
      if (amount <= this.currentBet) return { err: 'bad_amount' };
      const put = amount - s.bet; s.stack -= put; s.bet = amount; s.total += put; if (s.stack === 0) s.allIn = true;
      const inc = amount - this.currentBet;
      if (inc >= this.lastRaise) {                         // full raise: everyone else gets to act again
        this.lastRaise = inc; this.minRaise = amount + inc;
        for (const [o, j] of this.seats.map((o, j) => [o, j])) if (o && j !== i && !o.out && !o.folded && !o.allIn) { o.acted = false; o.canRaise = true; }
      } else {                                             // short all-in: does NOT reopen the betting for those who already acted
        for (const [o, j] of this.seats.map((o, j) => [o, j])) if (o && j !== i && !o.out && !o.folded && !o.allIn) { if (o.acted) o.canRaise = false; o.acted = false; }
      }
      this.currentBet = amount; s.acted = true;
    } else return { err: 'illegal_action' };
    s.timeouts = 0;
    this.ctx.emit(this.id, { k: 'action', seat: i, type, bet: s.bet, stack: s.stack, pot: this.potTotal(), allIn: s.allIn });
    this._advance(); return { ok: true };
  }
  _fold(i, silent) {
    const s = this.seats[i]; s.folded = true; s.acted = true; this.ctx.emit(this.id, { k: 'action', seat: i, type: 'fold', bet: s.bet, stack: s.stack, pot: this.potTotal() });
    if (i === this.toAct) this._advance(); else this._checkEnd();
    return { ok: true };
  }
  _live() { return [...this.inHand].filter(i => this.seats[i] && !this.seats[i].folded); }
  _checkEnd() { if (this._live().length <= 1 && ['preflop', 'flop', 'turn', 'river'].includes(this.phase)) { this._showdown(); return true; } return false; }
  _advance() {
    if (this._checkEnd()) return;
    const live = this._live(); const canAct = live.filter(i => !this.seats[i].allIn);
    const settled = canAct.every(i => this.seats[i].acted && this.seats[i].bet === this.currentBet);
    if (settled || canAct.length === 0 || (canAct.length === 1 && this.seats[canAct[0]].bet >= this.currentBet && live.every(i => this.seats[i].bet <= this.seats[canAct[0]].bet))) { this._nextStreet(canAct.length <= 1); return; }
    this.toAct = this._next(this.toAct, (s, j) => this.inHand.has(j) && !s.folded && !s.allIn && !(s.acted && s.bet === this.currentBet));
    this._armTimer(); this.ctx.emit(this.id, { k: 'state', ...this.snapshot() });
  }
  _nextStreet(runout) {
    for (const s of this.seats) if (s) { s.bet = 0; s.acted = false; s.canRaise = true; }
    this.currentBet = 0; this.lastRaise = this.bb; this.minRaise = this.bb;
    const order = ['preflop', 'flop', 'turn', 'river'];
    let ph = order[order.indexOf(this.phase) + 1];
    if (!ph) return this._showdown();
    this.dIdx++;                                          // burn
    const n = ph === 'flop' ? 3 : 1; for (let k = 0; k < n; k++) this.board.push(this.deck[this.dIdx++]);
    this.phase = ph; this.ctx.emit(this.id, { k: 'street', phase: ph, board: this.board });
    const canAct = this._live().filter(i => !this.seats[i].allIn);
    if (canAct.length <= 1) { this._nextStreet(true); return; }   // run out the board
    this.toAct = this._next(this.button, (s, j) => this.inHand.has(j) && !s.folded && !s.allIn);
    this._armTimer(); this.ctx.emit(this.id, { k: 'state', ...this.snapshot() });
  }
  _showdown() {
    const contribs = [...this.inHand].map(i => { const s = this.seats[i]; return s && s.total > 0 ? { seat: i, amt: s.total, folded: s.folded } : null; }).filter(Boolean);
    const { pots, refunds } = buildPots(contribs);
    for (const r of refunds) this.seats[r.seat].stack += r.amt;
    const live = this._live().filter(i => this.seats[i].hole.length === 2); const flop = this.board.length >= 3; const potSum = pots.reduce((a, p) => a + p.amount, 0);
    let rake = 0; if (!this.fun && flop && this.rakePct) rake = Math.min(Math.floor(potSum * this.rakePct / 100), this.bb * 3);
    if (rake && pots.length) { let rem = rake; for (const p of pots) { const t = Math.min(rem, p.amount); p.amount -= t; rem -= t; if (!rem) break; } }
    const results = []; const scores = {};
    for (const i of live) scores[i] = rank7([...this.seats[i].hole, ...this.board]);
    const winners = {};
    pots.forEach((p, pi) => {
      const elig = p.eligible.filter(i => live.includes(i)); if (!elig.length) { const f = live[0]; if (f !== undefined) this.seats[f].stack += p.amount; return; }
      const best = Math.max(...elig.map(i => scores[i])); const w = elig.filter(i => scores[i] === best);
      const share = Math.floor(p.amount / w.length); let odd = p.amount - share * w.length;
      const ordered = [...w].sort((a, b) => ((a - this.button + 6) % 6) - ((b - this.button + 6) % 6));
      for (const i of ordered) { const amt = share + (odd > 0 ? 1 : 0); if (odd > 0) odd--; this.seats[i].stack += amt; winners[i] = (winners[i] || 0) + amt; }
      results.push({ pot: pi, amount: p.amount, winners: w, hand: live.length > 1 ? handName(best) : null });
    });
    this.rakeTaken = rake;
    if (rake) this.ctx.rake(this.escrowKey, rake);
    const reveal = live.length > 1 ? live.map(i => ({ seat: i, hole: this.seats[i].hole, hand: handName(scores[i]) })) : [];
    for (const [i, amt] of Object.entries(winners)) { const s = this.seats[i]; if (!s.bot) this.ctx.settled?.(s.pid, 'poker', 0, 0, { won: true, net: amt - s.total }); }
    this.last = { hand: this.handNo, results, reveal, rake, board: this.board };
    this.phase = 'showdown'; this.toAct = -1; this.inHandShown = new Set(this.inHand); this.endsAt = this.ctx.now() + this.t.between + (reveal.length ? 2500 : 0);
    this.ctx.emit(this.id, { k: 'showdown', ...this.last, stacks: this.seats.map(s => s && s.stack) });
    this.history.unshift({ hand: this.handNo, winners: Object.keys(winners).map(i => this.seats[i].name), rake }); this.history.length = Math.min(20, this.history.length);
  }
  tick() {
    const now = this.ctx.now();
    if (this.phase === 'between' && now >= this.endsAt) this.startHand();
    else if (this.phase === 'showdown' && now >= this.endsAt) {
      for (let i = 0; i < 6; i++) { const s = this.seats[i]; if (!s) continue; s.hole = []; s.bet = 0; s.total = 0; s.folded = false; s.allIn = false; s.out = false; if (s.leaving) this._removeSeat(i); }
      this.inHand = new Set(); this.board = []; this.phase = 'waiting'; this.ctx.emit(this.id, { k: 'state', ...this.snapshot() });
      if (this._active().length >= 2) { this.phase = 'between'; this.endsAt = now + 800; }
    } else if (['preflop', 'flop', 'turn', 'river'].includes(this.phase) && this.toAct >= 0) {
      const s = this.seats[this.toAct];
      if (s.bot && now >= this.actionDeadline) { this._botAct(this.toAct); return; }
      if (!s.bot && now >= this.actionDeadline) {
        if (s.bank > 0 && !s.usedBank) { s.usedBank = true; this.actionDeadline = now + s.bank; this.endsAt = this.actionDeadline; this.ctx.emit(this.id, { k: 'timebank', seat: this.toAct, endsAt: this.endsAt }); return; }
        s.usedBank = false; s.timeouts++; const free = this.currentBet - s.bet <= 0;
        if (s.timeouts >= 2) { s.sitOut = true; }
        this._apply(this.toAct, free ? 'check' : 'fold');
      }
    }
  }
  _botAct(i) {
    const s = this.seats[i]; const legal = this.legalFor(i); if (!legal) return;
    const toCall = legal.toCall; const pot = legal.pot;
    let strength;
    if (this.board.length === 0) { const [a, b] = s.hole.map(c => c % 13); const hi = Math.max(a, b), lo = Math.min(a, b); const suited = ((s.hole[0] / 13) | 0) === ((s.hole[1] / 13) | 0); strength = (a === b ? 0.55 + hi / 30 : 0.2 + hi / 30 + lo / 60 + (suited ? 0.06 : 0) + (hi - lo <= 2 ? 0.04 : 0)); }
    else { const sc = rank7([...s.hole, ...this.board]) >> 20; strength = [0.18, 0.42, 0.62, 0.72, 0.8, 0.85, 0.92, 0.97, 1][sc]; }
    strength += (this.rng.float() - 0.5) * 0.18;
    const odds = toCall / (pot + toCall + 1);
    if (toCall === 0) {
      if (strength > 0.7 && legal.actions.includes('bet')) { this._apply(i, 'bet', Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, Math.floor(pot * (0.4 + this.rng.float() * 0.4))))); return; }
      if (strength > 0.78 && legal.actions.includes('raise')) { this._apply(i, 'raise', legal.minRaiseTo); return; }
      this._apply(i, 'check'); return;
    }
    if (strength > 0.82 && legal.actions.includes('raise') && this.rng.float() < 0.6) { this._apply(i, 'raise', Math.min(legal.maxRaiseTo, legal.minRaiseTo + Math.floor(pot * 0.3))); return; }
    if (strength > odds + 0.12 || (strength > 0.35 && odds < 0.18)) { this._apply(i, 'call'); return; }
    this._apply(i, 'fold');
  }
  pubSeat(i) { const s = this.seats[i]; return s ? { pid: s.pid, name: s.name, bot: s.bot, stack: s.stack, bet: s.bet, folded: s.folded, allIn: s.allIn, out: s.out, hasCards: s.hole.length === 2 && !s.folded } : null; }
  snapshot(viewer) {
    return {
      id: this.id, kind: 'poker', name: this.name, phase: this.phase, hand: this.handNo, button: this.button, sbSeat: this.sbSeat, bbSeat: this.bbSeat, toAct: this.toAct, endsAt: this.endsAt, board: this.board, pot: this.potTotal(), currentBet: this.currentBet,
      sb: this.sb, bb: this.bb, minBuy: this.minBuy, maxBuy: this.maxBuy, fun: this.fun, bots: this.bots, rakePct: this.rakePct, last: this.last,
      seats: this.seats.map((s, i) => s && { ...this.pubSeat(i), hole: viewer && s.pid === viewer ? s.hole : undefined }),
      legal: viewer && this.seatOf(viewer) === this.toAct ? this.legalFor(this.toAct) : null,
    };
  }
}
