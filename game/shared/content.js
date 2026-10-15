// Data-driven content definitions (shared by Host and clients). Add an entry here => new item in game.
export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'collectible'];
export const RARITY_COLOR = { common: '#c9ccd3', uncommon: '#5fcf80', rare: '#4aa3ff', epic: '#b06cff', legendary: '#ffbf2f', collectible: '#ff6ad5' };

// ---- Furniture. layer: 'floor' (blocks), 'rug' (walk-over, overlaps), 'wall' (must sit on wall tile / top wall row) ----
// interact: sit | lie | toggle | storage | play | music | use
const F = (id, name, emoji, w, h, price, rarity, cat, extra = {}) => ({ id, name, emoji, w, h, price, rarity, cat, type: 'furniture', layer: 'floor', tradable: true, ...extra });
export const FURNITURE = [
  F('bed_single', 'Single Bed', '🛏️', 1, 2, 220, 'common', 'Beds', { interact: 'lie', color: '#9ec5ff' }),
  F('bed_double', 'Double Bed', '🛏️', 2, 2, 600, 'uncommon', 'Beds', { interact: 'lie', color: '#ffb3c7', slots: 2 }),
  F('bed_canopy', 'Canopy Bed', '🛏️', 2, 2, 4200, 'rare', 'Beds', { interact: 'lie', color: '#d9b3ff', slots: 2 }),
  F('sofa_2', 'Loveseat', '🛋️', 2, 1, 340, 'common', 'Sofas', { interact: 'sit', color: '#e8795e', slots: 2 }),
  F('sofa_3', 'Sofa', '🛋️', 3, 1, 520, 'common', 'Sofas', { interact: 'sit', color: '#5ea3e8', slots: 3 }),
  F('sofa_velvet', 'Velvet Sofa', '🛋️', 3, 1, 2600, 'rare', 'Sofas', { interact: 'sit', color: '#8e3fa8', slots: 3 }),
  F('armchair', 'Armchair', '💺', 1, 1, 150, 'common', 'Chairs', { interact: 'sit', color: '#c98b5a' }),
  F('chair_dining', 'Dining Chair', '🪑', 1, 1, 60, 'common', 'Chairs', { interact: 'sit', color: '#b58863' }),
  F('stool', 'Bar Stool', '🪑', 1, 1, 45, 'common', 'Chairs', { interact: 'sit', color: '#a0a0a0' }),
  F('beanbag', 'Beanbag', '🟠', 1, 1, 90, 'uncommon', 'Chairs', { interact: 'sit', color: '#ff9a3c' }),
  F('table_dining', 'Dining Table', '🍽️', 2, 2, 280, 'common', 'Tables', { color: '#caa27a' }),
  F('table_coffee', 'Coffee Table', '☕', 2, 1, 120, 'common', 'Tables', { color: '#b98a5e' }),
  F('desk', 'Desk', '🗄️', 2, 1, 200, 'common', 'Tables', { color: '#9b7653' }),
  F('wardrobe', 'Wardrobe', '🚪', 1, 1, 380, 'uncommon', 'Storage', { interact: 'storage', cap: 24, color: '#8d6a4a' }),
  F('dresser', 'Dresser', '🗃️', 2, 1, 260, 'common', 'Storage', { interact: 'storage', cap: 16, color: '#a47c58' }),
  F('chest', 'Treasure Chest', '🧰', 1, 1, 900, 'rare', 'Storage', { interact: 'storage', cap: 40, color: '#c9a227' }),
  F('bookshelf', 'Bookshelf', '📚', 1, 1, 210, 'common', 'Shelves', { color: '#8a6a4b' }),
  F('shelf_wall', 'Wall Shelf', '📖', 2, 1, 110, 'common', 'Shelves', { layer: 'wall', color: '#b99a73' }),
  F('tv', 'Television', '📺', 2, 1, 480, 'uncommon', 'Electronics', { interact: 'toggle', color: '#2b2f3a' }),
  F('pc_desk', 'Computer Desk', '🖥️', 2, 1, 620, 'uncommon', 'Electronics', { interact: 'use', color: '#4a4f63' }),
  F('jukebox', 'Jukebox', '📻', 1, 1, 1500, 'rare', 'Electronics', { interact: 'music', color: '#d6453d' }),
  F('lamp_floor', 'Floor Lamp', '💡', 1, 1, 70, 'common', 'Lighting', { interact: 'toggle', color: '#ffe08a', light: 3 }),
  F('lamp_table', 'Table Lamp', '🕯️', 1, 1, 40, 'common', 'Lighting', { interact: 'toggle', color: '#ffd166', light: 2 }),
  F('chandelier', 'Chandelier', '🔆', 2, 2, 3600, 'epic', 'Lighting', { interact: 'toggle', color: '#fff2b0', light: 5, layer: 'rug' }),
  F('neon_sign', 'Neon Sign', '🌟', 2, 1, 1100, 'rare', 'Lighting', { layer: 'wall', interact: 'toggle', color: '#ff4ad8', light: 3 }),
  F('rug_round', 'Round Rug', '⭕', 2, 2, 90, 'common', 'Rugs', { layer: 'rug', color: '#e07a5f' }),
  F('rug_long', 'Long Rug', '🟥', 3, 2, 140, 'common', 'Rugs', { layer: 'rug', color: '#3d85c6' }),
  F('rug_royal', 'Royal Rug', '🟪', 4, 3, 1800, 'rare', 'Rugs', { layer: 'rug', color: '#7b2d8e' }),
  F('painting', 'Painting', '🖼️', 1, 1, 80, 'common', 'Decor', { layer: 'wall', color: '#6fa8dc' }),
  F('painting_big', 'Large Painting', '🖼️', 2, 1, 260, 'uncommon', 'Decor', { layer: 'wall', color: '#f6b26b' }),
  F('plant_small', 'Potted Plant', '🪴', 1, 1, 35, 'common', 'Plants', { color: '#6aa84f' }),
  F('plant_big', 'Indoor Tree', '🌳', 1, 1, 130, 'uncommon', 'Plants', { color: '#38761d' }),
  F('aquarium', 'Aquarium', '🐠', 2, 1, 1900, 'rare', 'Plants', { interact: 'toggle', color: '#3fb8c9' }),
  F('fridge', 'Fridge', '🧊', 1, 1, 420, 'common', 'Kitchen', { interact: 'storage', cap: 12, color: '#dfe6ea' }),
  F('stove', 'Stove', '🍳', 1, 1, 360, 'common', 'Kitchen', { interact: 'toggle', color: '#8c9399' }),
  F('counter', 'Kitchen Counter', '🍴', 2, 1, 240, 'common', 'Kitchen', { color: '#d8cdb9' }),
  F('bathtub', 'Bathtub', '🛁', 2, 1, 480, 'uncommon', 'Bathroom', { interact: 'lie', color: '#f1f7fb' }),
  F('toilet', 'Toilet', '🚽', 1, 1, 120, 'common', 'Bathroom', { interact: 'sit', color: '#f1f7fb' }),
  F('sink', 'Sink', '🚰', 1, 1, 110, 'common', 'Bathroom', { color: '#cfe3ee' }),
  F('arcade', 'Arcade Cabinet', '🕹️', 1, 1, 1400, 'rare', 'Gaming', { interact: 'play', color: '#3a3fd9' }),
  F('pinball', 'Pinball Machine', '🎰', 1, 2, 2400, 'rare', 'Gaming', { interact: 'play', color: '#ff4f9a' }),
  F('piano', 'Grand Piano', '🎹', 2, 2, 5200, 'epic', 'Luxury', { interact: 'music', color: '#1d1d24' }),
  F('fireplace', 'Fireplace', '🔥', 2, 1, 2100, 'rare', 'Luxury', { interact: 'toggle', color: '#a9503a', light: 4 }),
  F('fountain_small', 'Garden Fountain', '⛲', 2, 2, 3000, 'epic', 'Luxury', { color: '#79c2e8' }),
  F('throne', 'Golden Throne', '👑', 1, 1, 18000, 'legendary', 'Luxury', { interact: 'sit', color: '#ffc928' }),
  F('home_roulette', 'Home Roulette (Fun Chips)', '🎡', 2, 2, 1800, 'rare', 'Casino', { interact: 'play', color: '#118a4d' }),
  F('home_poker', 'Home Card Table', '🃏', 2, 2, 1200, 'uncommon', 'Casino', { interact: 'play', color: '#1c7d4f' }),
  F('slot_cabinet', 'Slot Cabinet (decor)', '🎰', 1, 1, 900, 'uncommon', 'Casino', { interact: 'play', color: '#d4a017' }),
  F('trophy_case', 'Trophy Case', '🏆', 1, 1, 1600, 'rare', 'Collectibles', { interact: 'storage', cap: 12, color: '#e0b84a' }),
  F('statue', 'Marble Statue', '🗿', 1, 1, 6500, 'epic', 'Collectibles', { color: '#c9c9c9' }),
  F('pumpkin', 'Carved Pumpkin', '🎃', 1, 1, 150, 'uncommon', 'Seasonal', { interact: 'toggle', color: '#ff8a00', light: 1 }),
  F('xmas_tree', 'Festive Tree', '🎄', 1, 1, 380, 'uncommon', 'Seasonal', { interact: 'toggle', color: '#2e8b57', light: 2 }),
  F('golden_horseshoe', 'Golden Horseshoe', '🧲', 1, 1, 0, 'collectible', 'Collectibles', { color: '#ffd700', untradable: true, reward: true, tradable: false }),
];

// ---- Cosmetics ----
const C = (id, slot, name, emoji, price, rarity, extra = {}) => ({ id, slot, name, emoji, price, rarity, type: 'cosmetic', tradable: price > 0, ...extra });
export const COSMETICS = [
  C('top_basic', 'top', 'Basic Tee', '👕', 0, 'common', { free: true }), C('bottom_basic', 'bottom', 'Basic Jeans', '👖', 0, 'common', { free: true }), C('shoes_basic', 'shoes', 'Basic Sneakers', '👟', 0, 'common', { free: true }),
  C('top_hoodie', 'top', 'Hoodie', '🧥', 160, 'common'), C('top_shirt', 'top', 'Button Shirt', '👔', 140, 'common'), C('top_tank', 'top', 'Tank Top', '🎽', 70, 'common'), C('top_dress', 'full', 'Summer Dress', '👗', 380, 'uncommon'),
  C('top_suit', 'top', 'Tuxedo Jacket', '🤵', 1900, 'rare'), C('top_gown', 'full', 'Sparkle Gown', '✨', 4800, 'epic'),
  C('bottom_shorts', 'bottom', 'Shorts', '🩳', 90, 'common'), C('bottom_skirt', 'bottom', 'Skirt', '👗', 120, 'common'), C('bottom_slacks', 'bottom', 'Slacks', '👖', 260, 'uncommon'),
  C('shoes_boots', 'shoes', 'Boots', '🥾', 220, 'uncommon'), C('shoes_sandals', 'shoes', 'Sandals', '🩴', 80, 'common'), C('shoes_heels', 'shoes', 'Heels', '👠', 500, 'uncommon'),
  C('hat_cap', 'hat', 'Cap', '🧢', 100, 'common'), C('hat_beret', 'hat', 'Beret', '🎨', 130, 'common'), C('hat_top', 'hat', 'Top Hat', '🎩', 900, 'rare'), C('hat_crown', 'hat', 'Crown', '👑', 9000, 'legendary'), C('hat_party', 'hat', 'Party Hat', '🥳', 60, 'common'), C('hat_cowboy', 'hat', 'Cowboy Hat', '🤠', 320, 'uncommon'),
  C('gl_round', 'glasses', 'Round Glasses', '👓', 120, 'common'), C('gl_sun', 'glasses', 'Sunglasses', '🕶️', 260, 'uncommon'), C('gl_star', 'glasses', 'Star Shades', '🤩', 1500, 'rare'),
  C('back_pack', 'back', 'Backpack', '🎒', 240, 'common'), C('back_wings', 'back', 'Angel Wings', '🪽', 3800, 'epic'), C('back_cape', 'back', 'Cape', '🦸', 1200, 'rare'),
  C('acc_chain', 'acc', 'Gold Chain', '📿', 700, 'rare'), C('acc_ring', 'acc', 'Ring', '💍', 600, 'uncommon'),
  C('hat_vip', 'hat', 'VIP Fedora', '🕴️', 2500, 'rare', { vip: true }),
];
export const FREE_LOOK = { top: 'top_basic', bottom: 'bottom_basic', shoes: 'shoes_basic' };
export const SKIN_COLORS = ['#ffe0c7', '#f6caa4', '#e5b088', '#c88a5e', '#a96b43', '#7c4a2c', '#5a331d', '#3e2415'];
export const HAIR_COLORS = ['#2b1d14', '#5a3825', '#8b5a2b', '#c68b3e', '#e8c27a', '#d9d9d9', '#d94f4f', '#4f7fd9', '#7a4fd9', '#2bb3a3'];
export const CLOTH_COLORS = ['#e8795e', '#5ea3e8', '#6fcf7f', '#f2c744', '#b06cff', '#ff8fb8', '#3a4a6b', '#f1f1f1', '#222', '#2bb3a3'];
export const HAIR_STYLES = ['Buzz', 'Short', 'Bob', 'Long', 'Curls', 'Spiky', 'Ponytail', 'Bun', 'Mohawk', 'Bald'];
export const BODIES = ['Slim', 'Standard', 'Broad'];
export const EMOTES = [
  { id: 'wave', e: '👋', name: 'Wave' }, { id: 'laugh', e: '😂', name: 'Laugh' }, { id: 'clap', e: '👏', name: 'Clap' }, { id: 'point', e: '👉', name: 'Point' },
  { id: 'dance', e: '💃', name: 'Dance' }, { id: 'cheer', e: '🎉', name: 'Cheer' }, { id: 'heart', e: '❤️', name: 'Heart' }, { id: 'shrug', e: '🤷', name: 'Shrug' },
  { id: 'cry', e: '😭', name: 'Cry' }, { id: 'think', e: '🤔', name: 'Think' }, { id: 'sleep', e: '😴', name: 'Sleep' }, { id: 'thumbs', e: '👍', name: 'Thumbs up' },
];

// ---- Consumables / misc ----
export const MISC = [
  { id: 'fish_small', name: 'Small Fish', emoji: '🐟', type: 'collectible', rarity: 'common', price: 0, sell: 20, tradable: true },
  { id: 'fish_big', name: 'Big Fish', emoji: '🐠', type: 'collectible', rarity: 'uncommon', price: 0, sell: 90, tradable: true },
  { id: 'fish_golden', name: 'Golden Fish', emoji: '🐡', type: 'collectible', rarity: 'rare', price: 0, sell: 600, tradable: true },
  { id: 'dye_gold', name: 'Gold Dye', emoji: '🧪', type: 'consumable', rarity: 'rare', price: 1500, tradable: true },
  { id: 'confetti', name: 'Confetti Popper', emoji: '🎊', type: 'consumable', rarity: 'common', price: 25, tradable: true },
  { id: 'gift_box', name: 'Gift Box', emoji: '🎁', type: 'consumable', rarity: 'uncommon', price: 50, tradable: false },
];

export const DEFS = {};
for (const d of [...FURNITURE, ...COSMETICS, ...MISC]) DEFS[d.id] = d;
export const sellValue = (d) => d.sell ?? Math.floor((d.price || 0) * 0.4);

// ---- Shops ----
export const SHOPS = {
  furn: { id: 'furn', name: 'Home & Hearth', mult: 1.0, entries: FURNITURE.filter(f => f.price > 0 && ['common', 'uncommon', 'rare', 'epic'].includes(f.rarity) && !['Collectibles', 'Casino'].includes(f.cat) && !f.reward && f.rarity !== 'legendary').map(f => ({ def: f.id })) },
  curio: { id: 'curio', name: 'Curio Cabinet', mult: 1.2, entries: [
    { def: 'trophy_case', stock: 20 }, { def: 'statue', stock: 5, perPlayer: 1 }, { def: 'throne', stock: 2, perPlayer: 1 }, { def: 'home_roulette' }, { def: 'home_poker' }, { def: 'slot_cabinet' },
    { def: 'dye_gold' }, { def: 'confetti' }, { def: 'gift_box' }, { def: 'pumpkin' }, { def: 'xmas_tree' }] },
  cloth: { id: 'cloth', name: 'Threadworks', mult: 1.0, entries: COSMETICS.filter(c => c.price > 0).map(c => ({ def: c.id, minLevel: c.vip ? 20 : 0 })) },
  hardware: { id: 'hardware', name: 'Plumb & Plank (build parts)', mult: 1, entries: [], services: true },
};
export const WALL_COST = 5, DOOR_COST = 25, WINDOW_COST = 20;
export const FLOOR_COLORS = ['#d9b98a', '#c9a27a', '#8d6e63', '#cfd8dc', '#a5d6a7', '#90caf9', '#f8bbd0', '#ffe082', '#6d6d78', '#37474f', '#e1bee7', '#fff3e0'];
export const WALL_COLORS = ['#f5ebe0', '#ffd6a5', '#bde0fe', '#cdb4db', '#b7e4c7', '#ffafcc', '#8d99ae', '#3d405b'];

// ---- Properties (lots) ----
export const PROPERTIES = {
  h1: { id: 'h1', name: 'Sunny Row #1', tier: 'Studio', w: 8, h: 6, price: 3000, cap: 150, upkeep: 30 },
  h2: { id: 'h2', name: 'Sunny Row #2', tier: 'Studio', w: 8, h: 6, price: 3000, cap: 150, upkeep: 30 },
  h3: { id: 'h3', name: 'Sunny Row #3', tier: 'Cottage', w: 12, h: 8, price: 25000, cap: 300, upkeep: 125 },
  h4: { id: 'h4', name: 'Sunny Row #4', tier: 'Cottage', w: 12, h: 8, price: 25000, cap: 300, upkeep: 125 },
  h5: { id: 'h5', name: 'Maple House', tier: 'Family House', w: 16, h: 10, price: 90000, cap: 500, upkeep: 450 },
  h6: { id: 'h6', name: 'Maple House II', tier: 'Family House', w: 16, h: 10, price: 90000, cap: 500, upkeep: 450 },
  c1: { id: 'c1', name: 'Crest Villa', tier: 'Villa', w: 22, h: 12, price: 450000, cap: 800, upkeep: 2200, minLevel: 15 },
  c2: { id: 'c2', name: 'Crest Mansion', tier: 'Mansion', w: 26, h: 14, price: 1500000, cap: 1200, upkeep: 7500, minLevel: 25 },
};
export const UPGRADES = {
  cap100: { id: 'cap100', name: '+100 object cap', price: (tier) => 1500 + 500 * tier },
  expand: { id: 'expand', name: 'Expand room (+2 × +2 tiles)', price: (tier) => 4000 + 2500 * tier },
};
export const ROLES = ['visitor', 'friend', 'decorator', 'builder', 'coowner'];
export const ROLE_CAPS = {
  visitor: ['enter', 'use'],
  friend: ['enter', 'enterLocked', 'use', 'storage'],
  decorator: ['enter', 'enterLocked', 'use', 'storage', 'place', 'recolor', 'moveOwn'],
  builder: ['enter', 'enterLocked', 'use', 'storage', 'place', 'recolor', 'moveOwn', 'moveOthers', 'removeOthers', 'walls', 'floors', 'blueprint'],
  coowner: ['enter', 'enterLocked', 'use', 'storage', 'place', 'recolor', 'moveOwn', 'moveOthers', 'removeOthers', 'walls', 'floors', 'blueprint', 'invite', 'kick', 'roles', 'upgrade'],
  owner: ['*'],
};
export const ACCESS_MODES = ['open', 'friends', 'invite', 'locked'];

// ---- Progression ----
export const xpForLevel = (L) => Math.round(80 * Math.pow(L, 1.6));
export const levelFromXp = (xp) => { let L = 1; while (L < 50 && xp >= xpForLevel(L + 1)) L++; return L; };
export const ACHIEVEMENTS = [
  { id: 'first_step', name: 'First Steps', desc: 'Join the world', ev: 'join', target: 1, coins: 100 },
  { id: 'homeowner', name: 'Homeowner', desc: 'Own a property', ev: 'propBuy', target: 1, coins: 500, title: 'Homeowner' },
  { id: 'decorator10', name: 'Decorator', desc: 'Place 10 pieces of furniture', ev: 'place', target: 10, coins: 300 },
  { id: 'decorator100', name: 'Interior Designer', desc: 'Place 100 pieces of furniture', ev: 'place', target: 100, coins: 2000, stars: 2, title: 'Designer' },
  { id: 'variety10', name: 'Variety Pack', desc: 'Place 10 different furniture types', ev: 'placeUnique', target: 10, coins: 600 },
  { id: 'builder', name: 'Builder', desc: 'Place 20 walls', ev: 'wall', target: 20, coins: 400 },
  { id: 'shopper', name: 'Shopper', desc: 'Buy 10 items', ev: 'buy', target: 10, coins: 300 },
  { id: 'fashion', name: 'Fashionista', desc: 'Buy 5 cosmetics', ev: 'buyCosmetic', target: 5, coins: 400, stars: 1 },
  { id: 'social5', name: 'Social Butterfly', desc: 'Visit 5 different homes', ev: 'visitUnique', target: 5, coins: 500, stars: 1, title: 'Neighbor' },
  { id: 'host5', name: 'Good Host', desc: 'Welcome 5 different guests home', ev: 'hostUnique', target: 5, coins: 500 },
  { id: 'chatty', name: 'Chatterbox', desc: 'Send 25 chat messages', ev: 'chat', target: 25, coins: 150 },
  { id: 'friend1', name: 'Friend', desc: 'Make a friend', ev: 'friend', target: 1, coins: 200 },
  { id: 'trader', name: 'Trader', desc: 'Complete a trade', ev: 'trade', target: 1, coins: 300 },
  { id: 'explorer5', name: 'Postcard Collector', desc: 'Find 5 postcards', ev: 'postcard', target: 5, coins: 500, stars: 1 },
  { id: 'explorer10', name: 'Cartographer', desc: 'Find all 10 postcards', ev: 'postcard', target: 10, coins: 2000, stars: 3, title: 'Cartographer' },
  { id: 'angler', name: 'Angler', desc: 'Catch 5 fish', ev: 'fish', target: 5, coins: 300 },
  { id: 'courier', name: 'Courier', desc: 'Deliver 3 parcels', ev: 'deliver', target: 3, coins: 400 },
  { id: 'roulette_win', name: 'Lucky Spin', desc: 'Win a roulette round', ev: 'rouletteWin', target: 1, coins: 200 },
  { id: 'blackjack_win', name: 'Twenty-One', desc: 'Win a blackjack hand', ev: 'bjWin', target: 1, coins: 200 },
  { id: 'poker_hand', name: 'Card Shark', desc: 'Win a poker hand', ev: 'pokerWin', target: 1, coins: 300 },
  { id: 'slots_play', name: 'Reel Deal', desc: 'Play 10 slot spins', ev: 'slotSpin', target: 10, coins: 150 },
  { id: 'race_watch', name: 'At the Races', desc: 'Watch 3 races from the stands', ev: 'raceWatch', target: 3, coins: 300 },
  { id: 'race_win', name: 'Winning Horse', desc: 'Win a horse bet', ev: 'raceWin', target: 1, coins: 300 },
  { id: 'daily', name: 'Regular', desc: 'Claim 3 daily rewards', ev: 'daily', target: 3, coins: 300, stars: 1 },
];
export const TITLES = Object.fromEntries(ACHIEVEMENTS.filter(a => a.title).map(a => [a.id, a.title]));
