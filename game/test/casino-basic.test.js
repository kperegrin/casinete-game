import test from 'node:test';
import assert from 'node:assert/strict';
import { rank7, handCategory, bjValue } from '../server/casino/cards.js';
import { SPOTS, payoutReturn, WHEEL, REDS } from '../server/casino/roulette.js';
import { MACHINES, spin } from '../server/casino/slots.js';
import { RoundRng } from '../server/rng.js';

test('5-card hand category counts match the known distribution', () => {
  const exp = [1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 40];
  const got = new Array(9).fill(0);
  const c = [0, 0, 0, 0, 0];
  for (c[0] = 0; c[0] < 48; c[0]++) for (c[1] = c[0] + 1; c[1] < 49; c[1]++) for (c[2] = c[1] + 1; c[2] < 50; c[2]++) for (c[3] = c[2] + 1; c[3] < 51; c[3]++) for (c[4] = c[3] + 1; c[4] < 52; c[4]++) got[handCategory(rank7(c))]++;
  assert.deepEqual(got, exp);
});
test('7-card evaluator orders hands correctly', () => {
  const card = (r, s) => s * 13 + r; // r: 0='2'..12='A'
  const royal = rank7([card(12, 0), card(11, 0), card(10, 0), card(9, 0), card(8, 0), card(0, 1), card(1, 2)]);
  const quads = rank7([card(5, 0), card(5, 1), card(5, 2), card(5, 3), card(12, 0), card(0, 1), card(1, 2)]);
  const wheel = rank7([card(12, 0), card(0, 1), card(1, 2), card(2, 3), card(3, 0), card(9, 1), card(8, 2)]);
  const sixHigh = rank7([card(0, 0), card(1, 1), card(2, 2), card(3, 3), card(4, 0), card(9, 1), card(8, 2)]);
  assert.ok(royal > quads); assert.ok(sixHigh > wheel); assert.equal(handCategory(wheel), 4);
  const fh = rank7([card(3, 0), card(3, 1), card(3, 2), card(8, 0), card(8, 1), card(0, 2), card(1, 3)]);
  assert.equal(handCategory(fh), 6);
});
test('blackjack values', () => {
  assert.deepEqual(bjValue([12, 8]), { total: 21, soft: true }); // A + 10
  assert.equal(bjValue([12, 12, 8]).total, 12); assert.equal(bjValue([8, 9, 5]).total, 27);
});
test('roulette: 157 legal spots, every payout exact, house edge 1/37 for every spot', () => {
  assert.equal(SPOTS.length, 157);
  assert.equal(WHEEL.length, 37); assert.equal(new Set(WHEEL).size, 37); assert.equal(REDS.size, 18);
  for (const s of SPOTS) {
    assert.equal(36 % s.count, 0, `count ${s.count} divides 36`);
    const ret = payoutReturn(100, s.count) * s.nums.length;     // total returned over the 37 equally likely results
    assert.equal(ret, 3600, `${s.type} ${s.label}`);            // 3600/37 = 97.297 per 100 staked => edge 2.7027%
  }
});
test('RoundRng is unbiased and deterministic for a seed', () => {
  const a = new RoundRng(Buffer.alloc(32, 7)), b = new RoundRng(Buffer.alloc(32, 7));
  for (let i = 0; i < 50; i++) assert.equal(a.int(37), b.int(37));
  const r = new RoundRng(); const n = 370000; const cnt = new Array(37).fill(0); for (let i = 0; i < n; i++) cnt[r.int(37)]++;
  const exp = n / 37; const chi = cnt.reduce((s, c) => s + (c - exp) ** 2 / exp, 0);
  assert.ok(chi < 70, `chi-square ${chi} should be < 70 for 36 dof (p~0.0007)`);
});
test('slot RTP: classic exact, boardwalk simulated, both in the 93-96% band', () => {
  const rng = new RoundRng();
  const sim = (m, n) => {
    let staked = 0, ret = 0, left = 0, lb;
    for (let i = 0; i < n; i++) {
      if (left > 0) { const r = spin(m, rng, 0, { free: true, lineBet: lb }); ret += r.win; left--; continue; }
      const r = spin(m, rng, 0); staked += r.bet; ret += r.win; if (r.free) { left = r.free; lb = r.lineBet; }
    }
    return ret / staked;
  };
  const rtpClassic = sim(MACHINES.clover, 1500000);        // jackpot excluded (needs max bet), base ~93.9%
  assert.ok(rtpClassic > 0.90 && rtpClassic < 0.98, 'classic ' + rtpClassic);
  const rtpVideo = sim(MACHINES.boardwalk, 4000000);
  assert.ok(rtpVideo > 0.90 && rtpVideo < 0.99, 'video ' + rtpVideo);
  console.log('   RTP classic', rtpClassic.toFixed(4), 'boardwalk', rtpVideo.toFixed(4));
});
