// Casino wiring: tables, slots, horse track, cashier / responsible-play tools. All outcomes are Host-side.
import { RoundRng } from './rng.js';
import { tx, pAcct, ACCT, credit } from './ledger.js';
import { RouletteTable, SPOTS } from './casino/roulette.js';
import { BlackjackTable } from './casino/blackjack.js';
import { PokerTable } from './casino/poker.js';
import { HorseTrack } from './casino/horses.js';
import { MACHINES, spin } from './casino/slots.js';

const TABLE_LOC = (id) => id === 'horses' ? 'track' : 'casino';

export function install(g) {
  const st = g.state; const E = (e, x = {}) => ({ err: e, ...x });
  const T = g.opts.casinoTimers || {};
  const enabled = () => st.meta.settings.casino !== false;
  const cas = (p) => { const d = g.today(); if (p.casino.day !== d) { p.casino.day = d; p.casino.net = 0; p.casino.warned = false; } return p.casino; };

  const ctx = {
    state: st, now: () => g.now(), newRng: () => new RoundRng(), online: (pid) => g.online(pid) || String(pid).startsWith('bot'), nameOf: (pid) => String(pid).startsWith('bot') ? 'Bot' : g.nameOf(pid),
    bet(pid, amount, reason) {
      if (!enabled()) return { ok: false, err: 'casino_disabled' };
      const p = st.players[pid]; if (!p) return { ok: false, err: 'no_player' };
      if (cas(p).coolOff > g.now()) return { ok: false, err: 'cooling_off' };
      if (p.casino.dailyLimit && p.casino.net <= -p.casino.dailyLimit) return { ok: false, err: 'daily_limit' };
      const r = tx(st, [{ k: 'xfer', from: pAcct(pid), to: ACCT.HOUSE, n: amount }], { pid, reason }); return r.ok ? { ok: true } : { ok: false, err: r.err };
    },
    pay(pid, amount, reason) { if (amount > 0) tx(st, [{ k: 'xfer', from: ACCT.HOUSE, to: pAcct(pid), n: amount }], { pid, reason }); g.pushMe(pid); },
    emit(tableId, ev, only) {
      const loc = TABLE_LOC(tableId);
      if (tableId === 'horses' && ev.k === 'result') for (const pid of g.members('track')) g.ev(pid, 'raceWatch', 1);
      for (const s of g.sessions.values()) if (s.loc === loc && (!only || s.pid === only)) g.send(s, { t: 'tev', table: tableId, ev });
      if (ev.k === 'settle' || ev.k === 'result' || ev.k === 'showdown') for (const s of g.sessions.values()) if (s.loc === loc) g.pushMe(s.pid);
    },
    emitTo(pid, tableId, ev) { g.toPid(pid, { t: 'tev', table: tableId, ev }); },
    toEscrow(pid, key, amt) { const r = tx(st, [{ k: 'xfer', from: pAcct(pid), to: key, n: amt }], { pid, reason: 'poker-buyin' }); if (r.ok) g.pushMe(pid); return r; },
    fromEscrow(pid, key, amt) { const r = tx(st, [{ k: 'xfer', from: key, to: pAcct(pid), n: amt }], { pid, reason: 'poker-cashout' }); g.pushMe(pid); return r; },
    rake(key, amt) { tx(st, [{ k: 'xfer', from: key, to: ACCT.HOUSE, n: amt }], { reason: 'rake' }); },
    settled(pid, game, staked, ret, extra = {}) {
      const p = st.players[pid]; if (!p) return; const c = cas(p);
      c.net += ret - staked; p.stats[game + 'Rounds'] = (p.stats[game + 'Rounds'] || 0) + 1; st.dirty.players = true;
      if (game !== 'poker') g.addXp(pid, 'player', 2);
      if (game === 'roulette' && ret > staked) g.ev(pid, 'rouletteWin', 1);
      if (game === 'blackjack' && extra.won) g.ev(pid, 'bjWin', 1);
      if (game === 'poker' && extra.won) { g.ev(pid, 'pokerWin', 1); g.addXp(pid, 'player', 8); }
      if (game === 'horses' && extra.won) g.ev(pid, 'raceWin', 1);
      if (ret - staked >= 50000) { g.save(); g.toAll({ t: 'chat', ch: 'system', text: `🎉 ${p.name} won ${(ret - staked).toLocaleString()} Coins at ${game}!` }); }
      if (c.net <= -20000 && !c.warned) { c.warned = true; g.note(pid, 'Casino reminder: you are down 20,000+ Coins today. Take a break? The Cashier offers limits and cool-off.', 'warn'); }
      g.pushMe(pid);
    },
  };
  g.casinoCtx = ctx;
  const R = { roulette1: { name: 'European Roulette', min: 10, maxStraight: 2500, maxOutside: 20000, maxTotal: 50000 }, roulette2: { name: 'Roulette (High)', min: 100, maxStraight: 10000, maxOutside: 80000, maxTotal: 200000 } };
  for (const [id, cfg] of Object.entries(R)) g.tables[id] = new RouletteTable(id, { ...cfg, timers: T.roulette }, ctx);
  g.tables.bj1 = new BlackjackTable('bj1', { name: 'Blackjack', min: 10, max: 5000, timers: T.blackjack }, ctx);
  g.tables.bj2 = new BlackjackTable('bj2', { name: 'Blackjack (High)', min: 100, max: 25000, timers: T.blackjack }, ctx);
  g.tables.poker1 = new PokerTable('poker1', { name: "Hold'em 10/20", sb: 10, bb: 20, minBuy: 400, maxBuy: 2000, timers: T.poker }, ctx);
  g.tables.poker2 = new PokerTable('poker2', { name: "Practice (bots, Fun Chips)", sb: 10, bb: 20, minBuy: 400, maxBuy: 2000, fun: true, bots: true, timers: T.poker }, ctx);
  g.horses = new HorseTrack(ctx, { timers: T.horses });

  g.tickHooks = g.tickHooks || [];
  g.tickHooks.push(() => { if (!enabled()) return; for (const t of Object.values(g.tables)) t.tick(); g.horses.tick(); });
  let lastJp = -1; let distT = 0;
  g.tickHooks.push((now) => {
    if (st.accts.jackpot !== lastJp) { lastJp = st.accts.jackpot; for (const s of g.sessions.values()) if (s.loc === 'casino') g.send(s, { t: 'jackpot', v: lastJp }); }
    if (now - distT > 1000) { distT = now; for (const s of g.sessions.values()) { if (s.loc !== 'casino') continue; for (const t of Object.values(g.tables)) { const i = t.kind === 'blackjack' ? t.seatOf(s.pid) : t.kind === 'poker' ? t.seatOf(s.pid) : -1; if (i >= 0) { const th = g.things('casino').find(x => x.table === t.id); if (th && !g.near(s, th.x, th.y, 8.5)) { t.leave(s.pid); g.toPid(s.pid, { t: 'tev', table: t.id, ev: { k: 'kicked' } }); } } } } }
  });
  g.locHooks = g.locHooks || [];
  g.locHooks.push((pid, oldLoc) => { if (oldLoc === 'casino') for (const t of Object.values(g.tables)) if (t.kind !== 'roulette') t.leave?.(pid); });
  g.leaveHooks = g.leaveHooks || [];
  g.leaveHooks.push((pid) => { for (const t of Object.values(g.tables)) if (t.kind !== 'roulette') t.leave?.(pid); });
  g.tablesIn = (loc, pid) => {
    if (loc === 'casino') { const o = {}; for (const [id, t] of Object.entries(g.tables)) o[id] = t.snapshot(pid); return o; }
    if (loc === 'track') return { horses: g.horses.snapshot(pid) };
    return {};
  };
  g.cmds['spots'] = () => ({ ok: true, spots: SPOTS.map(s => ({ id: s.id, type: s.type, label: s.label, nums: s.nums })) });

  const table = (s, m, kind) => {
    if (!enabled()) return [E('casino_disabled')]; const t = g.tables[m.table]; if (!t || (kind && t.kind !== kind)) return [E('no_table')];
    if (s.loc !== 'casino') return [E('not_here')];
    const th = g.things('casino').find(x => x.table === t.id); if (!th || !g.near(s, th.x, th.y, 7.5)) return [E('too_far')];
    return [null, t];
  };
  g.cmds['cas.join'] = (s, m) => { const [e, t] = table(s, m); if (e) return e; return { ok: true, snap: t.snapshot(s.pid) }; };

  // ----- roulette -----
  const rl = (fn) => (s, m) => { const [e, t] = table(s, m, 'roulette'); if (e) return e; const r = fn(t, s, m); if (!r.err) g.pushMe(s.pid); return r; };
  g.cmds['rl.bet'] = rl((t, s, m) => t.placeBet(s.pid, m.spot | 0, m.amount | 0));
  g.cmds['rl.clear'] = rl((t, s) => t.clearBets(s.pid));
  g.cmds['rl.rebet'] = rl((t, s) => t.rebet(s.pid));
  g.cmds['rl.double'] = rl((t, s) => t.double(s.pid));

  // ----- blackjack -----
  const bj = (fn) => (s, m) => { const [e, t] = table(s, m, 'blackjack'); if (e) return e; const r = fn(t, s, m); if (!r.err) g.pushMe(s.pid); return r; };
  g.cmds['bj.sit'] = bj((t, s, m) => t.sit(s.pid, m.seat | 0));
  g.cmds['bj.leave'] = bj((t, s) => t.leave(s.pid));
  g.cmds['bj.bet'] = bj((t, s, m) => t.bet(s.pid, m.amount | 0));
  g.cmds['bj.act'] = bj((t, s, m) => { const r = t.action(s.pid, String(m.act)); return r; });
  g.cmds['bj.ins'] = bj((t, s, m) => t.insurance(s.pid, !!m.take));
  g.cmds['bj.legal'] = bj((t, s) => ({ ok: true, legal: t.legal(s.pid) }));

  // ----- poker -----
  const pk = (fn) => (s, m) => { const [e, t] = table(s, m, 'poker'); if (e) return e; const r = fn(t, s, m); if (!r.err) g.pushMe(s.pid); return r; };
  g.cmds['pk.sit'] = pk((t, s, m) => t.sit(s.pid, m.seat | 0, m.buyin | 0));
  g.cmds['pk.leave'] = pk((t, s) => t.leave(s.pid));
  g.cmds['pk.act'] = pk((t, s, m) => t.act(s.pid, String(m.type), m.amount == null ? undefined : m.amount | 0));
  g.cmds['pk.rebuy'] = pk((t, s, m) => t.rebuy(s.pid, m.amount | 0));
  g.cmds['pk.sitin'] = pk((t, s) => t.sitIn(s.pid));
  g.cmds['pk.bot'] = pk((t, s, m) => m.on ? t.addBot(m.seat | 0) : t.removeBot(m.seat | 0));

  // ----- slots -----
  g.cmds['sl.spin'] = (s, m) => {
    if (!enabled()) return E('casino_disabled'); if (s.loc !== 'casino') return E('not_here');
    const th = g.thingNear(s, m.thing, 3.2); if (!th || th.k !== 'slots') return E('too_far');
    const mc = MACHINES[th.machine]; const p = st.players[s.pid]; const now = g.now();
    if (s.lastSpin && now - s.lastSpin < (g.opts.spinCooldownMs ?? 350)) return E('too_fast'); s.lastSpin = now;
    const rng = new RoundRng(); let r, bet = 0, paid = false;
    if (p.pending && p.pending.machine === mc.id && p.pending.left > 0) {
      r = spin(mc, rng, 0, { free: true, lineBet: p.pending.lineBet }); p.pending.left--; bet = 0;
      if (p.pending.left <= 0) p.pending = null; st.dirty.players = true;
    } else {
      const idx = m.bet | 0; bet = mc.bets[idx]; if (!bet) return E('bad_bet');
      const d = ctx.bet(s.pid, bet, 'slots:' + mc.id); if (!d.ok) return E(d.err);
      st.casino.jpFrac = (st.casino.jpFrac || 0) + bet * 0.01; const contrib = Math.floor(st.casino.jpFrac); st.casino.jpFrac -= contrib; st.dirty.meta = true; if (contrib) tx(st, [{ k: 'xfer', from: ACCT.HOUSE, to: ACCT.JACKPOT, n: contrib }], { pid: s.pid, reason: 'jackpot-feed' });
      r = spin(mc, rng, idx); paid = true;
      if (r.free) { p.pending = { machine: mc.id, left: r.free, lineBet: r.lineBet }; st.dirty.players = true; }
    }
    let jackpotAmount = 0;
    if (r.jackpot) { jackpotAmount = st.accts.jackpot; tx(st, [{ k: 'xfer', from: ACCT.JACKPOT, to: pAcct(s.pid), n: jackpotAmount }, { k: 'xfer', from: ACCT.MINT, to: ACCT.JACKPOT, n: st.casino.jackpotSeed }], { pid: s.pid, reason: 'jackpot' }); }
    if (r.win > 0) ctx.pay(s.pid, r.win, 'slots-win');
    ctx.settled(s.pid, 'slots', bet, r.win + jackpotAmount, {});
    g.ev(s.pid, 'slotSpin', 1);
    if (jackpotAmount) g.toAll({ t: 'chat', ch: 'system', text: `🎰 JACKPOT! ${g.nameOf(s.pid)} won the Town Jackpot: ${jackpotAmount.toLocaleString()} Coins!` });
    else if (r.win >= 5000 && r.win >= bet * 20) g.toLoc('casino', { t: 'chat', ch: 'system', text: `🎰 ${g.nameOf(s.pid)} won ${r.win.toLocaleString()} Coins on ${mc.name}!` });
    g.pushMe(s.pid);
    return { ok: true, machine: mc.id, result: { stops: r.stops, grid: r.grid, win: r.win, wins: r.wins, scatters: r.scatters, free: r.free, jackpot: r.jackpot, jackpotAmount, bet: r.bet, lineBet: r.lineBet, wasFree: !paid }, pending: p.pending, jackpot: st.accts.jackpot };
  };
  g.interactors.slots = (s, t) => { const mc = MACHINES[t.machine]; return { ok: true, open: 'slots', machine: { id: mc.id, name: mc.name, kind: mc.kind, bets: mc.bets, reels: mc.reels, rows: mc.rows || 1, symbols: mc.symbols, strips: mc.strips, paylines: mc.paylines, pay3: mc.pay3, pay: mc.pay, wildPay: mc.wildPay, scatterPay: mc.scatterPay, freeSpins: mc.freeSpins, fsMult: mc.fsMult, mixed: mc.mixedFruit, cherry2: mc.cherry2, cherry1: mc.cherry1, jackpotBet: mc.jackpotBet, lineBets: mc.lineBets }, thing: t.id, pending: st.players[s.pid].pending, jackpot: st.accts.jackpot }; };
  for (const k of ['roulette', 'blackjack', 'poker']) g.interactors[k] = (s, t) => { const tb = g.tables[t.table]; return { ok: true, open: k, table: t.table, snap: tb.snapshot(s.pid) }; };

  // ----- horses -----
  g.cmds['hr.bet'] = (s, m) => {
    if (!enabled()) return E('casino_disabled'); if (s.loc !== 'track') return E('not_here'); if (!g.thingNear(s, 'horses', 7)) return E('too_far');
    const r = g.horses.bet(s.pid, String(m.kind), m.horses, m.stake | 0); if (!r.err) g.pushMe(s.pid); return r;
  };
  g.interactors.horses = (s) => ({ ok: true, open: 'horses', snap: g.horses.snapshot(s.pid) });

  // ----- cashier / responsible play -----
  g.interactors.cashier = (s) => ({ ok: true, open: 'cashier', ...cashierInfo(s.pid) });
  const cashierInfo = (pid) => { const p = st.players[pid]; const c = cas(p); return { net: c.net, coolOff: c.coolOff, dailyLimit: c.dailyLimit || 0, sessionMin: Math.floor((g.now() - (c.sessionStart || g.now())) / 60000), jackpot: st.accts.jackpot }; };
  g.cmds['cas.limits'] = (s) => ({ ok: true, ...cashierInfo(s.pid) });
  g.cmds['cas.cooloff'] = (s, m) => { const h = m.hours === 168 ? 168 : 24; const p = st.players[s.pid]; cas(p).coolOff = g.now() + h * 3600e3; st.dirty.players = true; return { ok: true, until: p.casino.coolOff }; };
  g.cmds['cas.dailyLimit'] = (s, m) => { const p = st.players[s.pid]; const v = Math.max(0, Math.min(10_000_000, m.value | 0)); cas(p).dailyLimit = v; st.dirty.players = true; return { ok: true, dailyLimit: v }; };
}
