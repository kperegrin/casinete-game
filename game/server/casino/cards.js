// Card helpers + 7-card poker evaluator. card = 0..51; rank = card % 13 (0='2' .. 12='A'); suit = card / 13 | 0.
export const RANKS = '23456789TJQKA';
export const SUITS = ['♣', '♦', '♥', '♠'];
export const cardName = (c) => RANKS[c % 13] + SUITS[(c / 13) | 0];
export const HAND_NAMES = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];

function straightTop(mask) {
  for (let hi = 12; hi >= 4; hi--) if (((mask >> (hi - 4)) & 0x1f) === 0x1f) return hi;
  if ((mask & 0x100f) === 0x100f) return 3; // wheel
  return -1;
}
const pack = (arr) => { let v = 0; for (let i = 0; i < 5; i++) v = (v << 4) | (arr[i] ?? 0); return v; };

export function rank7(cards) {
  const rc = new Array(13).fill(0), sc = [0, 0, 0, 0], sr = [0, 0, 0, 0]; let all = 0;
  for (const c of cards) { const r = c % 13, s = (c / 13) | 0; rc[r]++; sc[s]++; sr[s] |= 1 << r; all |= 1 << r; }
  let fs = -1; for (let s = 0; s < 4; s++) if (sc[s] >= 5) fs = s;
  if (fs >= 0) { const sf = straightTop(sr[fs]); if (sf >= 0) return (8 << 20) | (sf << 16); }
  const quads = [], trips = [], pairs = [], singles = [];
  for (let r = 12; r >= 0; r--) { if (rc[r] === 4) quads.push(r); else if (rc[r] === 3) trips.push(r); else if (rc[r] === 2) pairs.push(r); else if (rc[r] === 1) singles.push(r); }
  if (quads.length) { const q = quads[0]; let k = -1; for (let r = 12; r >= 0; r--) if (r !== q && rc[r] > 0) { k = r; break; } return (7 << 20) | (q << 16) | (k << 12); }
  if (trips.length && (pairs.length || trips.length > 1)) { const t = trips[0]; const p = Math.max(pairs[0] ?? -1, trips[1] ?? -1); return (6 << 20) | (t << 16) | (p << 12); }
  if (fs >= 0) { const rs = []; for (let r = 12; r >= 0; r--) if (sr[fs] & (1 << r)) rs.push(r); return (5 << 20) | pack(rs.slice(0, 5)); }
  const st = straightTop(all); if (st >= 0) return (4 << 20) | (st << 16);
  const rest = []; for (let r = 12; r >= 0; r--) if (rc[r] > 0) rest.push(r);
  if (trips.length) { const t = trips[0]; const k = rest.filter(r => r !== t).slice(0, 2); return (3 << 20) | (t << 16) | (k[0] << 12) | (k[1] << 8); }
  if (pairs.length >= 2) { const [p1, p2] = pairs; const k = rest.filter(r => r !== p1 && r !== p2)[0]; return (2 << 20) | (p1 << 16) | (p2 << 12) | (k << 8); }
  if (pairs.length === 1) { const p = pairs[0]; const k = rest.filter(r => r !== p).slice(0, 3); return (1 << 20) | (p << 16) | (k[0] << 12) | (k[1] << 8) | (k[2] << 4); }
  return pack(rest.slice(0, 5));
}
export const handCategory = (score) => score >> 20;
export const handName = (score) => HAND_NAMES[score >> 20];
export const bjValue = (cards) => {
  let total = 0, aces = 0;
  for (const c of cards) { const r = c % 13; if (r === 12) { aces++; total += 11; } else total += r >= 8 ? 10 : r + 2; }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
};
