// Shared world definition (used by the Host for collision/validation and by clients for rendering).
export const TILE = { GRASS: 0, ROAD: 1, PAVE: 2, SAND: 3, WATER: 4, BUILDING: 5, TREE: 6, DOOR: 8, PATH: 9, FLOWER: 11, POND: 12, FOUNTAIN: 13, PIER: 14 };
export const W = 64, H = 44;
export const SPAWN = { x: 30.5, y: 18.5 };

export const DISTRICTS = [
  { id: 'market', name: 'Market Street', x: 0, y: 0, w: 27, h: 19, color: '#f2a93b' },
  { id: 'plaza', name: 'Fountain Square', x: 25, y: 12, w: 12, h: 9, color: '#ffd98e' },
  { id: 'crest', name: 'Gilded Crest', x: 38, y: 0, w: 26, h: 13, color: '#b88aff' },
  { id: 'row', name: 'Sunny Row', x: 0, y: 22, w: 28, h: 13, color: '#9fe3c8' },
  { id: 'mile', name: 'Lucky Mile', x: 36, y: 14, w: 28, h: 18, color: '#ff7a8a' },
  { id: 'park', name: 'Greenway Park', x: 0, y: 35, w: 28, h: 5, color: '#7bd17b' },
  { id: 'beach', name: 'Pearl Beach', x: 28, y: 35, w: 36, h: 9, color: '#2bb3a3' },
];
export function districtAt(x, y) {
  let best = null;
  for (const d of DISTRICTS) if (x >= d.x && y >= d.y && x < d.x + d.w && y < d.y + d.h) best = d;
  return best;
}

// Buildings on the outdoor map. `to` is the interior instance id ('home:<propId>' for houses).
export const BUILDINGS = [
  { id: 'furn', name: 'Home & Hearth', x: 2, y: 6, w: 8, h: 6, door: [5, 11], to: 'shop_furn', color: '#e8a75b', roof: '#a8542f' },
  { id: 'cloth', name: 'Threadworks', x: 11, y: 6, w: 7, h: 6, door: [14, 11], to: 'shop_cloth', color: '#7fc4e8', roof: '#2e6f9a' },
  { id: 'hall', name: 'Town Hall', x: 19, y: 6, w: 7, h: 6, door: [22, 11], to: 'townhall', color: '#e9e2d0', roof: '#7a6a4d' },
  { id: 'casino', name: 'Grand Marigold Casino', x: 40, y: 22, w: 12, h: 7, door: [45, 28], to: 'casino', color: '#2a2f55', roof: '#c9a227' },
  { id: 'track', name: 'Marigold Downs', x: 55, y: 22, w: 7, h: 6, door: [58, 27], to: 'track', color: '#4c8a4c', roof: '#7d4f2a' },
  // houses (door tile is part of building rect)
  { id: 'h1', name: 'Sunny Row #1', x: 2, y: 23, w: 6, h: 4, door: [4, 23], to: 'home:h1', color: '#ffd1a8', roof: '#d9714f' },
  { id: 'h2', name: 'Sunny Row #2', x: 9, y: 23, w: 6, h: 4, door: [11, 23], to: 'home:h2', color: '#c8e6c9', roof: '#4f9d6b' },
  { id: 'h3', name: 'Sunny Row #3', x: 16, y: 23, w: 6, h: 4, door: [18, 23], to: 'home:h3', color: '#bbdefb', roof: '#3f6fb5' },
  { id: 'h4', name: 'Sunny Row #4', x: 23, y: 23, w: 5, h: 4, door: [25, 23], to: 'home:h4', color: '#f8bbd0', roof: '#b04a73' },
  { id: 'h5', name: 'Maple House', x: 2, y: 30, w: 7, h: 4, door: [5, 30], to: 'home:h5', color: '#ffe0b2', roof: '#a1572b' },
  { id: 'h6', name: 'Maple House II', x: 11, y: 30, w: 7, h: 4, door: [14, 30], to: 'home:h6', color: '#d7ccc8', roof: '#6d4c41' },
  { id: 'c1', name: 'Crest Villa', x: 42, y: 3, w: 10, h: 6, door: [46, 8], to: 'home:c1', color: '#fff3e0', roof: '#8d6e63' },
  { id: 'c2', name: 'Crest Mansion', x: 53, y: 2, w: 9, h: 7, door: [57, 8], to: 'home:c2', color: '#f3e5f5', roof: '#6a1b9a' },
];

// Interactables on the outdoor map
export const OUTDOOR_THINGS = [
  { id: 'fountain', k: 'fountain', x: 30.5, y: 16.5, label: 'Fountain' },
  { id: 'bench1', k: 'sit', x: 27.5, y: 14.5, label: 'Bench' },
  { id: 'bench2', k: 'sit', x: 34.5, y: 14.5, label: 'Bench' },
  { id: 'bench3', k: 'sit', x: 6.5, y: 36.5, label: 'Park bench' },
  { id: 'bench4', k: 'sit', x: 20.5, y: 36.5, label: 'Park bench' },
  { id: 'fish1', k: 'fish', x: 46.5, y: 41.5, label: 'Fishing spot (pier)' },
  { id: 'fish2', k: 'fish', x: 8.5, y: 38.5, label: 'Fishing spot (pond)' },
  { id: 'board', k: 'board', x: 28.5, y: 18.5, label: 'Town Board' },
];
export const POSTCARDS = [
  [1.5, 1.5], [20.5, 1.5], [26.5, 10.5], [38.5, 1.5], [62.5, 10.5], [40.5, 33.5], [62.5, 33.5], [3.5, 38.5], [60.5, 38.5], [31.5, 41.5],
].map(([x, y], i) => ({ id: 'pc' + i, k: 'postcard', x, y, label: 'Postcard' }));

export const OUTDOOR_NPCS = [
  { id: 'pip', name: 'Pip', role: 'guide', x: 29.5, y: 19.5, look: { skin: 2, hairStyle: 3, hairColor: 5, topColor: 4, bottomColor: 1, hat: 'hat_cap' }, line: "Hi! I'm Pip. Press E near doors, shops and tables. Your studio is on Sunny Row — claim it at the Town Hall!" },
  { id: 'pete', name: 'Parcel Pete', role: 'courier', x: 26.5, y: 17.5, look: { skin: 5, hairStyle: 1, hairColor: 1, topColor: 7, bottomColor: 2 }, line: 'Got parcels to deliver? I pay per delivery!' },
  { id: 'dj', name: 'Gull', role: 'ambient', x: 33.5, y: 17.5, look: { skin: 1, hairStyle: 5, hairColor: 8, topColor: 2, bottomColor: 0 }, line: 'Nice day for a stroll, isn\'t it?' },
];

export function buildOutdoor() {
  const t = new Uint8Array(W * H);
  const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < W && y < H) t[y * W + x] = v; };
  const rect = (x, y, w, h, v) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, v); };
  // water & sand
  rect(0, 40, W, 4, TILE.WATER); rect(28, 37, 36, 3, TILE.SAND); rect(0, 35, 28, 5, TILE.GRASS);
  // roads
  rect(0, 20, W, 2, TILE.ROAD); rect(30, 0, 2, 20, TILE.ROAD); rect(30, 22, 2, 15, TILE.ROAD); rect(0, 27, 28, 2, TILE.ROAD);
  rect(32, 11, 30, 1, TILE.PAVE);
  // sidewalks
  rect(0, 12, 27, 5, TILE.PAVE); rect(0, 22, 28, 1, TILE.PAVE); rect(0, 29, 28, 1, TILE.PAVE); rect(36, 14, 28, 16, TILE.PAVE); rect(32, 22, 4, 1, TILE.PAVE);
  rect(36, 30, 28, 1, TILE.PAVE); rect(36, 31, 28, 6, TILE.GRASS);
  // plaza
  rect(25, 12, 12, 9, TILE.PAVE); rect(30, 15, 2, 2, TILE.FOUNTAIN);
  // park
  rect(9, 36, 6, 3, TILE.POND); rect(0, 34, 28, 1, TILE.PAVE);
  for (let x = 1; x < 27; x += 3) { if (x < 8 || x > 15) { set(x, 35, TILE.TREE); } }
  for (let x = 2; x < 27; x += 4) set(x, 39, TILE.TREE);
  // pier
  rect(46, 37, 2, 6, TILE.PIER);
  // building footprints
  for (const b of BUILDINGS) { rect(b.x, b.y, b.w, b.h, TILE.BUILDING); set(b.door[0], b.door[1], TILE.DOOR); }
  // decorative trees / flowerbeds
  for (const [x, y] of [[28, 1], [29, 1], [33, 1], [34, 1], [36, 6], [36, 8], [26, 4], [27, 4], [60, 33], [58, 35], [38, 33], [40, 35], [24, 31], [25, 32], [20, 31], [21, 32]]) set(x, y, TILE.TREE);
  for (const [x, y] of [[26, 14], [35, 14], [26, 19], [35, 19], [27, 12], [34, 12]]) set(x, y, TILE.FLOWER);
  return t;
}
export const SOLID_TILES = new Set([TILE.BUILDING, TILE.TREE, TILE.WATER, TILE.FLOWER, TILE.POND, TILE.FOUNTAIN]);

// Interior instances (public). Houses are dynamic (see server/housing.js).
const wallsAround = (w, h) => { const s = []; for (let x = 0; x < w; x++) { s.push([x, 0], [x, h - 1]); } for (let y = 1; y < h - 1; y++) { s.push([0, y], [w - 1, y]); } return s; };
export const INTERIORS = {
  shop_furn: {
    name: 'Home & Hearth', w: 16, h: 10, floor: '#d9b98a', exit: { x: 8, y: 9, toX: 5.5, toY: 12.5 }, music: 'shop',
    things: [{ id: 'shop_furn', k: 'shop', shop: 'furn', x: 6.5, y: 3.5, label: 'Furniture catalog' }, { id: 'shop_curio', k: 'shop', shop: 'curio', x: 12.5, y: 3.5, label: 'Curio Cabinet (rare)' }, { id: 'shop_hard', k: 'shop', shop: 'hardware', x: 3.5, y: 3.5, label: 'Hardware (build parts)' }],
    npcs: [{ id: 'n_furn', name: 'Hazel', role: 'shopkeeper', x: 6.5, y: 2.5, look: { skin: 3, hairStyle: 2, hairColor: 3, topColor: 5, bottomColor: 2 }, line: 'Welcome to Home & Hearth! Everything for a cozy home.' }, { id: 'n_curio', name: 'Mr. Quill', role: 'shopkeeper', x: 12.5, y: 2.5, look: { skin: 6, hairStyle: 4, hairColor: 8, topColor: 6, bottomColor: 3, glasses: 'gl_round' }, line: 'Rare finds, limited stock...' }, { id: 'n_hard', name: 'Plank', role: 'shopkeeper', x: 3.5, y: 2.5, look: { skin: 4, hairStyle: 1, hairColor: 2, topColor: 1, bottomColor: 4, hat: 'hat_cap' }, line: 'Walls, doors and windows are 5 Coins each. Floors are free!' }],
  },
  shop_cloth: {
    name: 'Threadworks', w: 14, h: 10, floor: '#e7c6e0', exit: { x: 7, y: 9, toX: 14.5, toY: 12.5 }, music: 'shop',
    things: [{ id: 'shop_cloth', k: 'shop', shop: 'cloth', x: 7.5, y: 3.5, label: 'Clothing' }, { id: 'salon', k: 'salon', x: 2.5, y: 3.5, label: 'Salon & mirror (change look)' }],
    npcs: [{ id: 'n_cloth', name: 'Mina', role: 'shopkeeper', x: 7.5, y: 2.5, look: { skin: 2, hairStyle: 6, hairColor: 6, topColor: 3, bottomColor: 5, hat: 'hat_beret' }, line: 'Try something new! The mirror is over there.' }],
  },
  townhall: {
    name: 'Town Hall', w: 14, h: 10, floor: '#cfd8dc', exit: { x: 7, y: 9, toX: 22.5, toY: 12.5 }, music: 'hall',
    things: [{ id: 'props', k: 'props', x: 7.5, y: 3.5, label: 'Property Office' }, { id: 'achv', k: 'achievements', x: 3.5, y: 3.5, label: 'Achievements board' }],
    npcs: [{ id: 'n_agent', name: 'Agent Ivy', role: 'agent', x: 7.5, y: 2.5, look: { skin: 5, hairStyle: 7, hairColor: 4, topColor: 8, bottomColor: 8, glasses: 'gl_round' }, line: 'Looking for a home? Browse our lots!' }],
  },
  casino: {
    name: 'Grand Marigold Casino', w: 30, h: 18, floor: '#3a2c4f', exit: { x: 15, y: 17, toX: 45.5, toY: 29.5 }, music: 'casino',
    things: [
      { id: 'roulette1', k: 'roulette', table: 'roulette1', x: 6.5, y: 6, w: 4, h: 3, label: 'European Roulette' },
      { id: 'roulette2', k: 'roulette', table: 'roulette2', x: 6.5, y: 11, w: 4, h: 3, label: 'European Roulette (High)' },
      { id: 'bj1', k: 'blackjack', table: 'bj1', x: 15.5, y: 5.5, w: 4, h: 2, label: 'Blackjack' },
      { id: 'bj2', k: 'blackjack', table: 'bj2', x: 21.5, y: 5.5, w: 4, h: 2, label: 'Blackjack (High)' },
      { id: 'poker1', k: 'poker', table: 'poker1', x: 17.5, y: 11, w: 4, h: 3, label: 'Hold\'em (Coins, players only)' },
      { id: 'poker2', k: 'poker', table: 'poker2', x: 24.5, y: 11, w: 4, h: 3, label: 'Hold\'em Practice (bots, Fun Chips)' },
      { id: 'slot1', k: 'slots', machine: 'clover', x: 3.5, y: 16, label: 'Lucky Clover Classic' }, { id: 'slot2', k: 'slots', machine: 'boardwalk', x: 5.5, y: 16, label: 'Boardwalk Bonanza' },
      { id: 'slot3', k: 'slots', machine: 'clover', x: 7.5, y: 16, label: 'Lucky Clover Classic' }, { id: 'slot4', k: 'slots', machine: 'boardwalk', x: 9.5, y: 16, label: 'Boardwalk Bonanza' },
      { id: 'cashier', k: 'cashier', x: 25.5, y: 16, label: 'Cashier & responsible play' },
    ],
    npcs: [
      { id: 'd_r1', name: 'Dealer Rae', role: 'dealer', x: 8.5, y: 5, look: { skin: 3, hairStyle: 2, hairColor: 1, topColor: 0, bottomColor: 0 }, line: 'Place your bets!' },
      { id: 'd_r2', name: 'Dealer Remy', role: 'dealer', x: 8.5, y: 10, look: { skin: 5, hairStyle: 1, hairColor: 0, topColor: 0, bottomColor: 0 }, line: 'No more bets!' },
      { id: 'd_b1', name: 'Dealer Bo', role: 'dealer', x: 17.5, y: 4.5, look: { skin: 1, hairStyle: 4, hairColor: 7, topColor: 0, bottomColor: 0 }, line: 'Blackjack pays 3 to 2.' },
      { id: 'd_b2', name: 'Dealer Bea', role: 'dealer', x: 23.5, y: 4.5, look: { skin: 6, hairStyle: 6, hairColor: 2, topColor: 0, bottomColor: 0 }, line: 'Dealer stands on all 17s.' },
      { id: 'd_p1', name: 'Dealer Pax', role: 'dealer', x: 19.5, y: 10, look: { skin: 2, hairStyle: 3, hairColor: 5, topColor: 0, bottomColor: 0 }, line: 'Cards in the air.' },
      { id: 'd_p2', name: 'Dealer Pia', role: 'dealer', x: 26.5, y: 10, look: { skin: 4, hairStyle: 5, hairColor: 9, topColor: 0, bottomColor: 0 }, line: 'Practice table: bots + Fun Chips.' },
      { id: 'n_cash', name: 'Cashier Cleo', role: 'cashier', x: 25.5, y: 15, look: { skin: 3, hairStyle: 2, hairColor: 4, topColor: 8, bottomColor: 0 }, line: 'Play for fun. Set limits any time.' },
    ],
  },
  track: {
    name: 'Marigold Downs Grandstand', w: 26, h: 14, floor: '#caa97a', exit: { x: 13, y: 13, toX: 58.5, toY: 28.5 }, music: 'track',
    things: [{ id: 'horses', k: 'horses', x: 13.5, y: 10.5, label: 'Betting window' }, { id: 'sit_t1', k: 'sit', x: 5.5, y: 6.5, label: 'Grandstand seat' }, { id: 'sit_t2', k: 'sit', x: 8.5, y: 6.5, label: 'Grandstand seat' }, { id: 'sit_t3', k: 'sit', x: 17.5, y: 6.5, label: 'Grandstand seat' }, { id: 'sit_t4', k: 'sit', x: 20.5, y: 6.5, label: 'Grandstand seat' }],
    npcs: [{ id: 'n_horse', name: 'Announcer Ace', role: 'announcer', x: 13.5, y: 9.5, look: { skin: 4, hairStyle: 1, hairColor: 6, topColor: 6, bottomColor: 3, hat: 'hat_top' }, line: 'And they\'re off!' }],
  },
};
for (const k of Object.keys(INTERIORS)) { INTERIORS[k].walls = wallsAround(INTERIORS[k].w, INTERIORS[k].h); }
export const HOME_CATEGORY = 'home';
