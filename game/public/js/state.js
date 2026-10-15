export const S = {
  me: null, inv: [], loc: 'world', locSnap: null, players: new Map(), home: null, role: null, world: null, tables: {}, props: [], isHost: false, isNew: false,
  party: null, tradeState: null, x: 0, y: 0, dir: 0, sit: null, selected: null, buildMode: false, serverOffset: 0, jackpot: 0, online: new Map(),
  bubbles: new Map(), emotes: new Map(), parcel: null, settings: JSON.parse(localStorage.getItem('casinete.settings') || '{}'),
};
const handlers = {};
export const bus = { on(e, f) { (handlers[e] ||= []).push(f); return () => { handlers[e] = handlers[e].filter(x => x !== f); }; }, emit(e, d) { for (const f of handlers[e] || []) f(d); } };
export const saveSettings = () => localStorage.setItem('casinete.settings', JSON.stringify(S.settings));
export const setting = (k, d) => S.settings[k] ?? d;
export const fmt = (n) => (n ?? 0).toLocaleString('en-US');
