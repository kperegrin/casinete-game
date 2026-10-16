// Decorative street furniture for the outdoor map (client-side only, no collision): placed procedurally from the tile map.
import { TILE as TT, W, H, BUILDINGS, OUTDOOR_THINGS, POSTCARDS, OUTDOOR_NPCS, buildOutdoor } from '../../shared/map.js';
export const PROP_NAMES = ['streetlight', 'hydrant', 'trash', 'bush', 'lantern', 'planter', 'parasol', 'boat', 'car_taxi', 'car_sedan', 'car_hatchback', 'rock'];
export const TREE_VARIANTS = [0, 1, 2, 3, 4];
export const PROP_FOOT = { boat: [2, 1], car_taxi: [2, 1], car_sedan: [2, 1], car_hatchback: [2, 1] };
let cached = null;
export function decorations() {
  if (cached) return cached; const OUT = buildOutdoor(); const t = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? -1 : OUT[y * W + x];
  const used = new Set(); const out = []; const busy = (x, y) => used.has(x + ',' + y) || [...OUTDOOR_THINGS, ...POSTCARDS, ...OUTDOOR_NPCS].some(o => Math.abs(o.x - 0.5 - x) < 1.2 && Math.abs(o.y - 0.5 - y) < 1.2) || BUILDINGS.some(b => Math.abs(b.door[0] - x) <= 1 && b.door[1] + 1 === y);
  const put = (name, x, y, ok = (v) => v === TT.PAVE || v === TT.GRASS) => { const [fw, fh] = PROP_FOOT[name] || [1, 1]; for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) if (!ok(t(x + i, y + j)) || busy(x + i, y + j)) return false; for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) used.add((x + i) + ',' + (y + j)); out.push({ name, x, y, w: fw, h: fh }); return true; };
  // street lights along both sides of every road, every 6 tiles
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (t(x, y) !== TT.ROAD) continue;
    if (t(x, y - 1) !== TT.ROAD && x % 6 === 3) put('streetlight', x, y - 1);
    if (t(x, y + 1) !== TT.ROAD && x % 6 === 0) put('streetlight', x, y + 1);
    if (t(x - 1, y) !== TT.ROAD && y % 6 === 2) put('streetlight', x - 1, y);
    if (t(x + 1, y) !== TT.ROAD && y % 6 === 5) put('streetlight', x + 1, y);
  }
  // shop fronts: bush + bin either side of public doors, bushes for houses
  for (const b of BUILDINGS) { const [dx, dy] = b.door; const home = /^[hc]\d$/.test(b.id); put('bush', dx - 2, dy + 1); put(home ? 'bush' : 'trash', dx + 2, dy + 1); if (!home) put('hydrant', b.x + b.w, dy + 1); }
  // plaza planters, park lanterns, beach parasols + rocks, a boat by the pier, a few parked cars
  for (const [x, y] of [[25, 12], [36, 12], [25, 20], [36, 20]]) put('planter', x, y, () => true);
  for (const [x, y] of [[3, 37], [12, 35], [17, 37], [24, 38], [5, 39]]) put('lantern', x, y);
  for (let x = 31; x < 62; x += 5) put('parasol', x, 38, (v) => v === TT.SAND);
  for (const [x, y] of [[29, 39], [44, 39], [59, 38]]) put('rock', x, y, (v) => v === TT.SAND);
  put('boat', 49, 41, (v) => v === TT.WATER); put('boat', 40, 42, (v) => v === TT.WATER);
  for (const [n, x, y] of [['car_taxi', 6, 21], ['car_sedan', 17, 20], ['car_hatchback', 39, 20], ['car_sedan', 52, 21]]) put(n, x, y, (v) => v === TT.ROAD);
  return cached = out;
}
