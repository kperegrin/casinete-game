// Slot certification tool: node tools/slotsim.js [spins]   (CI gate: total RTP must be inside 93-96%)
import { MACHINES, spin } from '../server/casino/slots.js';
import { RoundRng } from '../server/rng.js';
const n = +process.argv[2] || 20_000_000; const rng = new RoundRng();
for (const m of Object.values(MACHINES)) {
  let staked = 0, ret = 0, left = 0, lb = 0, paid = 0, trig = 0, hits = 0, max = 0;
  for (let i = 0; i < n; i++) {
    if (left > 0) { const r = spin(m, rng, 0, { free: true, lineBet: lb }); ret += r.win; max = Math.max(max, r.win / (lb * 20)); left--; continue; }
    const r = spin(m, rng, 0); paid++; staked += r.bet; ret += r.win; hits += r.win > 0; if (r.free) { left = r.free; lb = r.lineBet; trig++; }
  }
  console.log(`${m.name}: spins=${n} RTP=${(ret / staked * 100).toFixed(2)}% hit=${(hits / paid * 100).toFixed(1)}% bonus=1 in ${trig ? (paid / trig).toFixed(1) : '-'} (jackpot contribution adds ~1%)`);
}
