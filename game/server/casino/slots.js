// Slot engine. Reel strips / pay tables are data (see tools/slot-sim for certification).
export const MACHINES = {
  clover: {
    id: 'clover', name: 'Lucky Clover Classic', kind: 'classic', reels: 3, rows: 1, bets: [10, 25, 50, 100, 250], jackpotBet: 250,
    symbols: [{ id: 'C7', e: '☘️' }, { id: 'ST', e: '⭐' }, { id: 'BL', e: '🔔' }, { id: 'HS', e: '🧲' }, { id: 'LM', e: '🍋' }, { id: 'CH', e: '🍒' }, { id: 'BK', e: '⬜' }],
    counts: [[1, 2, 3, 5, 5, 8, 8], [1, 2, 3, 5, 5, 7, 9], [1, 2, 3, 5, 5, 6, 10]],
    pay3: [250, 100, 40, 20, 10, 7], mixedFruit: 3, cherry2: 5, cherry1: 1,
  },
  boardwalk: {
    id: 'boardwalk', name: 'Boardwalk Bonanza', kind: 'video', reels: 5, rows: 3, bets: [20, 40, 100, 200, 500], lineBets: [1, 2, 5, 10, 25], lines: 20,
    symbols: [{ id: 'WILD', e: '🌴' }, { id: 'SCAT', e: '🐚' }, { id: 'LH', e: '🗼' }, { id: 'SB', e: '⛵' }, { id: 'PEL', e: '🦩' }, { id: 'ICE', e: '🍦' }, { id: 'STAR', e: '⭐' }, { id: 'PEB', e: '🪨' }],
    weights: [[3, 3, 4, 5, 6, 8, 11, 10], [4, 3, 4, 5, 6, 8, 10, 10], [4, 3, 4, 5, 6, 8, 10, 10], [4, 3, 4, 5, 6, 8, 10, 10], [3, 3, 4, 5, 6, 8, 11, 10]],
    pay: { 2: [12, 48, 240], 3: [7, 24, 120], 4: [5, 14, 72], 5: [4, 10, 48], 6: [2, 7, 36], 7: [1, 5, 24] }, wildPay: [12, 60, 300],
    scatterPay: { 3: 2, 4: 5, 5: 20 }, freeSpins: { 3: 8, 4: 12, 5: 20 }, fsMult: 2,
    paylines: [[1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],[0,1,2,1,0],[2,1,0,1,2],[0,0,1,2,2],[2,2,1,0,0],[1,0,0,0,1],[1,2,2,2,1],[0,1,1,1,0],[2,1,1,1,2],[1,0,1,2,1],[1,2,1,0,1],[0,1,0,1,0],[2,1,2,1,2],[1,1,0,1,1],[1,1,2,1,1],[0,0,2,0,0],[2,2,0,2,2],[0,2,2,2,0]],
  },
};
// Deterministic strip layout: symbols are spread evenly around each reel (rarest first) so that the
// certified feature frequency matches what players see. NOTE: strip ORDER matters for scatter statistics.
export function makeStrips(m) {
  const counts = m.counts || m.weights;
  return counts.map((row, ri) => {
    const L = row.reduce((a, b) => a + b, 0); const strip = new Array(L).fill(-1);
    const order = row.map((c, i) => [c, i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    order.forEach(([c, sym], oi) => {
      const shift = (ri * 7 + oi * 3) % L;
      for (let k = 0; k < c; k++) { let pos = (Math.floor(k * L / c) + shift) % L; while (strip[pos] !== -1) pos = (pos + 1) % L; strip[pos] = sym; }
    });
    return strip;
  });
}
for (const m of Object.values(MACHINES)) m.strips = makeStrips(m);

// One paid or free spin. Returns grid (rows x reels of symbol idx), wins, totalWin, freeSpinsAwarded, jackpot.
export function spin(machine, rng, betIdx, { free = false, lineBet } = {}) {
  const m = machine; const stops = m.strips.map(s => rng.int(s.length));
  if (m.kind === 'classic') {
    const bet = m.bets[betIdx]; const [a, b, c] = m.strips.map((s, i) => s[stops[i]]);
    let mult = 0;
    if (a === b && b === c && a < 6) mult = m.pay3[a];
    else if ([a, b, c].every(x => x >= 3 && x <= 5)) mult = m.mixedFruit;
    else if (a === 5 && b === 5) mult = m.cherry2;
    else if (a === 5) mult = m.cherry1;
    const jackpot = a === 0 && b === 0 && c === 0 && bet === m.jackpotBet;
    return { stops, grid: [[a, b, c]], bet, win: mult * bet, mult, jackpot, free: 0, wins: mult ? [{ line: 0, mult }] : [] };
  }
  const grid = [[], [], []];
  for (let r = 0; r < 5; r++) for (let row = 0; row < 3; row++) grid[row][r] = m.strips[r][(stops[r] + row) % m.strips[r].length];
  const lb = lineBet ?? m.lineBets[betIdx]; const total = lb * m.lines; const wins = []; let lineTotal = 0;
  m.paylines.forEach((pl, li) => {
    let base = -1, run = 0;
    for (let r = 0; r < 5; r++) {
      const s = grid[pl[r]][r]; if (s === 1) break;
      if (base === -1 && s !== 0) base = s;
      if (s === 0 || s === base) run++; else break;
    }
    let pay = 0;
    if (run >= 3) pay = base === -1 ? m.wildPay[run - 3] : m.pay[base][run - 3];
    if (pay) { wins.push({ line: li, count: run, sym: base === -1 ? 0 : base, mult: pay }); lineTotal += pay; }
  });
  let win = lineTotal * lb * (free ? m.fsMult : 1);
  let scat = 0; for (let r = 0; r < 5; r++) for (let row = 0; row < 3; row++) if (grid[row][r] === 1) scat++;
  const sc = Math.min(scat, 5);
  if (sc >= 3 && !free) win += m.scatterPay[sc] * total;
  return { stops, grid, bet: total, lineBet: lb, win, wins, scatters: scat, free: free ? 0 : (sc >= 3 ? m.freeSpins[sc] : 0), jackpot: false };
}
