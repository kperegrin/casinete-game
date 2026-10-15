// Multiplayer blackjack. 6 decks, dealer stands on all 17, BJ pays 3:2, DAS, split to 4 hands (aces: one card, no resplit),
// insurance 2:1, dealer peeks, no surrender. Dealer hole card is never sent until it is revealed.
import { bjValue } from './cards.js';
const rankVal = (c) => { const r = c % 13; return r === 12 ? 11 : r >= 8 ? 10 : r + 2; };

export class BlackjackTable {
  constructor(id, cfg, ctx) {
    this.id = id; this.ctx = ctx; this.kind = 'blackjack'; this.name = cfg.name; this.min = cfg.min; this.max = cfg.max; this.seatsN = 5;
    this.t = { bet: 15000, insure: 8000, turn: 15000, settle: 5000, ...(cfg.timers || {}) };
    this.seats = Array.from({ length: 5 }, () => null);
    this.phase = 'idle'; this.endsAt = 0; this.dealer = []; this.shoe = []; this.cut = 0; this.idx = 0; this.active = null; this.round = 0; this.rng = null; this.revealed = false;
    this._reshuffle();
  }
  _reshuffle() { this.rng = this.ctx.newRng(); this.shoe = []; for (let d = 0; d < 6; d++) for (let c = 0; c < 52; c++) this.shoe.push(c); this.rng.shuffle(this.shoe); this.idx = 0; this.cut = 234 + this.rng.int(25) - 12; this.shuffleSeedHash = this.rng.seedHash(); }
  seatOf(pid) { return this.seats.findIndex(s => s && s.pid === pid); }
  sit(pid, i) {
    if (this.seatOf(pid) >= 0) return { err: 'already_seated' };
    if (!(i >= 0 && i < 5) || this.seats[i]) return { err: 'seat_taken' };
    this.seats[i] = { pid, bet: 0, hands: [], insurance: 0, insured: false, lastResult: null }; this.ctx.emit(this.id, { k: 'seat', seat: i, pid }); return { ok: true, seat: i };
  }
  leave(pid) {
    const i = this.seatOf(pid); if (i < 0) return { ok: true };
    const s = this.seats[i];
    if (this.phase === 'betting' && s.bet) { this.ctx.pay(pid, s.bet, 'bj-refund'); s.bet = 0; }
    if (['idle', 'betting', 'settle'].includes(this.phase) || !s.bet) { this.seats[i] = null; this.ctx.emit(this.id, { k: 'seat', seat: i, pid: null }); }
    else { s.leaving = true; if (this.active && this.active.seat === i) this._stand(); }   // stays in the round; auto-stands
    return { ok: true };
  }
  bet(pid, amount) {
    const i = this.seatOf(pid); if (i < 0) return { err: 'not_seated' };
    if (!['idle', 'betting'].includes(this.phase)) return { err: 'betting_closed' };
    if (!Number.isInteger(amount) || amount < this.min || amount > this.max) return { err: 'bet_limits', min: this.min, max: this.max };
    const s = this.seats[i]; if (amount !== s.bet) {
      const diff = amount - s.bet;
      if (diff > 0) { const r = this.ctx.bet(pid, diff, 'bj'); if (!r.ok) return { err: r.err }; } else this.ctx.pay(pid, -diff, 'bj-refund');
      s.bet = amount;
    }
    if (this.phase === 'idle') { this.phase = 'betting'; this.endsAt = this.ctx.now() + this.t.bet; this.ctx.emit(this.id, { k: 'phase', phase: 'betting', endsAt: this.endsAt }); }
    this.ctx.emit(this.id, { k: 'bet', seat: i, pid, amount }); return { ok: true };
  }
  _mkHand(cards, bet, fromSplit = false) { return { cards, bet, doubled: false, fromSplit, done: false, bust: false, bj: false, stood: false }; }
  _draw() { if (this.idx >= this.shoe.length) this._reshuffle(); return this.shoe[this.idx++]; }
  _start() {
    const played = this.seats.map((s, i) => [s, i]).filter(([s]) => s && s.bet > 0);
    if (!played.length) { this.phase = 'idle'; this.ctx.emit(this.id, { k: 'phase', phase: 'idle' }); return; }
    this.round++; this.revealed = false; this.dealer = [];
    if (this.idx >= this.cut) { this._reshuffle(); this.ctx.emit(this.id, { k: 'shuffle', seedHash: this.shuffleSeedHash }); }
    for (const s of this.seats) if (s) { s.hands = []; s.insurance = 0; s.insured = false; s.lastResult = null; }
    for (const [s] of played) s.hands = [this._mkHand([this._draw()], s.bet)];
    this.dealer.push(this._draw());
    for (const [s] of played) s.hands[0].cards.push(this._draw());
    this.dealer.push(this._draw());       // hole card (hidden)
    for (const [s] of played) { const h = s.hands[0]; if (bjValue(h.cards).total === 21) { h.bj = true; h.done = true; } }
    this.phase = 'dealing'; this.ctx.emit(this.id, { k: 'deal', ...this.snapshot() });
    if (rankVal(this.dealer[0]) === 11) { this.phase = 'insurance'; this.endsAt = this.ctx.now() + this.t.insure; this.ctx.emit(this.id, { k: 'phase', phase: 'insurance', endsAt: this.endsAt }); }
    else this._peek();
  }
  insurance(pid, take) {
    if (this.phase !== 'insurance') return { err: 'not_insurance' };
    const i = this.seatOf(pid); const s = this.seats[i]; if (!s || !s.hands.length || s.insured) return { err: 'cannot' };
    s.insured = true;
    if (take) { const amt = Math.floor(s.bet / 2); const r = this.ctx.bet(pid, amt, 'bj-ins'); if (!r.ok) { s.insured = false; return { err: r.err }; } s.insurance = amt; }
    if (this.seats.filter(x => x && x.hands.length).every(x => x.insured)) this._peek();
    return { ok: true };
  }
  _peek() {
    const up = rankVal(this.dealer[0]);
    if (up === 11 || up === 10) {
      const hole = rankVal(this.dealer[1]);
      if ((up === 11 && hole === 10) || (up === 10 && hole === 11)) { this.revealed = true; this._settle(true); return; }
    }
    this._nextTurn();
  }
  _nextTurn(fromSeat = -1, fromHand = -1) {
    for (let i = fromSeat < 0 ? 0 : fromSeat; i < 5; i++) {
      const s = this.seats[i]; if (!s || !s.hands.length) continue;
      for (let j = (i === fromSeat ? fromHand : 0); j < s.hands.length; j++) { const h = s.hands[j]; if (!h.done && h.cards.length >= 2 && bjValue(h.cards).total === 21) h.done = true;
        if (!h.done) { this.active = { seat: i, hand: j }; this.phase = 'turns'; this.endsAt = this.ctx.now() + this.t.turn; this.ctx.emit(this.id, { k: 'turn', seat: i, hand: j, endsAt: this.endsAt }); if (s.leaving) this._stand(); return; } }
    }
    this.active = null; this._dealer();
  }
  _cur() { if (!this.active) return null; const s = this.seats[this.active.seat]; return { s, h: s.hands[this.active.hand] }; }
  action(pid, act) {
    if (this.phase !== 'turns' || !this.active) return { err: 'not_your_turn' };
    const c = this._cur(); if (c.s.pid !== pid) return { err: 'not_your_turn' };
    const { s, h } = c;
    if (act === 'hit') { h.cards.push(this._draw()); this.ctx.emit(this.id, { k: 'hit', seat: this.active.seat, hand: this.active.hand, card: h.cards.at(-1) }); this._after(h); }
    else if (act === 'stand') this._stand();
    else if (act === 'double') {
      if (h.cards.length !== 2 || h.doubled) return { err: 'cannot_double' };
      const r = this.ctx.bet(pid, h.bet, 'bj-double'); if (!r.ok) return { err: r.err };
      h.bet *= 2; h.doubled = true; h.cards.push(this._draw()); this.ctx.emit(this.id, { k: 'double', seat: this.active.seat, hand: this.active.hand, card: h.cards.at(-1) });
      h.done = true; this._after(h, true);
    } else if (act === 'split') {
      const [a, b] = h.cards;
      if (h.cards.length !== 2 || rankVal(a) !== rankVal(b) || s.hands.length >= 4) return { err: 'cannot_split' };
      if (h.splitAces) return { err: 'cannot_split' };
      const r = this.ctx.bet(pid, h.bet, 'bj-split'); if (!r.ok) return { err: r.err };
      const aces = a % 13 === 12; const nh = this._mkHand([b], h.bet, true); h.cards = [a]; h.fromSplit = true;
      h.cards.push(this._draw()); nh.cards.push(this._draw()); s.hands.splice(this.active.hand + 1, 0, nh);
      if (aces) { h.splitAces = nh.splitAces = true; h.done = nh.done = true; }
      this.ctx.emit(this.id, { k: 'split', seat: this.active.seat, hand: this.active.hand, ...this.snapshot() });
      if (aces) this._nextTurn(this.active.seat, this.active.hand); else this._after(h);
    } else return { err: 'bad_action' };
    return { ok: true };
  }
  _after(h, forced = false) {
    const v = bjValue(h.cards).total;
    if (v > 21) { h.bust = true; h.done = true; } else if (v === 21) h.done = true;
    if (h.done) this._nextTurn(this.active.seat, this.active.hand); else { this.endsAt = this.ctx.now() + this.t.turn; this.ctx.emit(this.id, { k: 'turn', seat: this.active.seat, hand: this.active.hand, endsAt: this.endsAt }); }
  }
  _stand() { const c = this._cur(); if (!c) return; c.h.stood = true; c.h.done = true; this._nextTurn(this.active.seat, this.active.hand); }
  _dealer() {
    this.phase = 'dealer'; this.revealed = true;
    const live = this.seats.some(s => s && s.hands.some(h => !h.bust && !h.bj));
    if (live) while (bjValue(this.dealer).total < 17) this.dealer.push(this._draw());
    this.ctx.emit(this.id, { k: 'dealer', dealer: this.dealer });
    this._settle(false);
  }
  _settle(dealerBJ) {
    const dv = bjValue(this.dealer).total; const dBust = dv > 21; const results = {};
    this.revealed = true;
    for (let i = 0; i < 5; i++) {
      const s = this.seats[i]; if (!s || !s.hands.length) continue;
      let staked = s.insurance, ret = 0; const res = [];
      if (s.insurance && dealerBJ) ret += s.insurance * 3;
      for (const h of s.hands) {
        staked += h.bet; let r = 'lose';
        const natural = h.bj && !h.fromSplit;
        if (dealerBJ) { if (natural) { ret += h.bet; r = 'push'; } }
        else if (h.bust) r = 'lose';
        else if (natural) { ret += Math.floor(h.bet * 5 / 2); r = 'blackjack'; }
        else { const pv = bjValue(h.cards).total; if (dBust || pv > dv) { ret += h.bet * 2; r = 'win'; } else if (pv === dv) { ret += h.bet; r = 'push'; } }
        res.push(r);
      }
      if (ret > 0) this.ctx.pay(s.pid, ret, 'bj-settle');
      this.ctx.settled?.(s.pid, 'blackjack', staked, ret, { won: res.some(x => x === 'win' || x === 'blackjack') });
      results[s.pid] = { staked, ret, res }; s.lastResult = { res, delta: ret - staked };
    }
    this.phase = 'settle'; this.endsAt = this.ctx.now() + this.t.settle; this.active = null;
    this.ctx.emit(this.id, { k: 'settle', dealer: this.dealer, results, ...this.snapshot() });
  }
  tick() {
    const now = this.ctx.now();
    if (this.phase === 'betting' && now >= this.endsAt) this._start();
    else if (this.phase === 'betting' && this.seats.every(s => !s || s.bet > 0) && this.seats.some(s => s) && now >= this.endsAt - this.t.bet + 3000) this._start();
    else if (this.phase === 'insurance' && now >= this.endsAt) { for (const s of this.seats) if (s && s.hands.length) s.insured = true; this._peek(); }
    else if (this.phase === 'turns' && now >= this.endsAt) this._stand();
    else if (this.phase === 'settle' && now >= this.endsAt) {
      for (let i = 0; i < 5; i++) { const s = this.seats[i]; if (!s) continue; if (s.leaving || !this.ctx.online(s.pid)) { this.seats[i] = null; this.ctx.emit(this.id, { k: 'seat', seat: i, pid: null }); } else { s.bet = 0; s.hands = []; } }
      this.dealer = []; this.phase = 'idle'; this.ctx.emit(this.id, { k: 'phase', phase: 'idle' });
    }
  }
  snapshot() {
    return {
      id: this.id, kind: 'blackjack', name: this.name, phase: this.phase, endsAt: this.endsAt, min: this.min, max: this.max, round: this.round, active: this.active, shuffleSeedHash: this.shuffleSeedHash,
      dealer: this.revealed ? this.dealer : (this.dealer.length ? [this.dealer[0], -1] : []), dealerValue: this.revealed ? bjValue(this.dealer).total : (this.dealer.length ? rankVal(this.dealer[0]) : 0),
      shoeLeft: this.shoe.length - this.idx,
      seats: this.seats.map(s => s && { pid: s.pid, bet: s.bet, insurance: s.insurance, lastResult: s.lastResult, hands: s.hands.map(h => ({ cards: h.cards, bet: h.bet, bust: h.bust, bj: h.bj, done: h.done, doubled: h.doubled, value: bjValue(h.cards) })) }),
    };
  }
  legal(pid) {
    if (this.phase !== 'turns' || !this.active) return [];
    const c = this._cur(); if (c.s.pid !== pid) return [];
    const out = ['hit', 'stand']; const h = c.h;
    if (h.cards.length === 2) { out.push('double'); if (rankVal(h.cards[0]) === rankVal(h.cards[1]) && c.s.hands.length < 4 && !h.splitAces) out.push('split'); }
    return out;
  }
}
