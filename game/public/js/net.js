import { S, bus } from './state.js';
let ws = null, nextId = 1; const pending = new Map();
export const connected = () => ws && ws.readyState === 1;
export function connect(url, hello) {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(url); let welcomed = false;
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', proto: 1, ...hello }));
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.t === 'r') { const p = pending.get(m.i); if (p) { pending.delete(m.i); p(m); } return; }
      if (m.t === 'welcome') { welcomed = true; resolve(m); }
      if (m.t === 'reject') { reject(new Error(m.reason)); bus.emit('reject', m); return; }
      bus.emit('msg', m);
    };
    ws.onerror = () => { if (!welcomed) reject(new Error('connection_failed')); };
    ws.onclose = () => { if (welcomed) bus.emit('disconnected'); else reject(new Error('closed')); };
  });
}
export function cmd(k, args = {}) {
  return new Promise((res) => {
    if (!connected()) return res({ ok: false, err: 'offline' });
    const i = nextId++; pending.set(i, res); ws.send(JSON.stringify({ t: 'c', i, k, cid: Math.random().toString(36).slice(2, 10), ...args }));
    setTimeout(() => { if (pending.has(i)) { pending.delete(i); res({ ok: false, err: 'timeout' }); } }, 8000);
  });
}
export const sendRaw = (o) => { if (connected()) ws.send(JSON.stringify(o)); };
export const disconnect = () => { try { ws?.close(); } catch { /* */ } };
export const ERR = {
  insufficient_funds: "You don't have enough Coins.", too_far: 'Move closer.', no_permission: "You don't have permission for that.", locked: 'Someone else is editing that.', overlap: "That spot is taken.", out_of_bounds: 'Out of bounds.',
  blocked_by_wall: "A wall is in the way.", object_cap: 'This home is full — upgrade the object cap.', not_in_inventory: "You don't have that item.", needs_wall: 'Wall items must hang on a wall.', blocks_entrance: "Keep the entrance clear.",
  stale: 'It changed — try again.', rate_limited: 'Slow down a little.', betting_closed: 'Betting is closed.', min_bet: 'Bet is below the table minimum.', table_limit: 'Over the table limit.', table_limit_total: 'Over your total limit for this table.',
  cooling_off: 'Casino cool-off is active.', daily_limit: 'Daily casino limit reached.', casino_disabled: 'The casino is closed by the Host.', sold_out: 'Sold out.', limit_reached: 'Per-player limit reached.', level_required: 'Level too low.',
  stale_price: 'The price changed — please retry.', already_owned: 'Already owned.', locked_home: 'This home is locked.', invite_only: 'Invite only — ring the doorbell.', friends_only: 'Friends only — ring the doorbell.', banned: 'You are banned from this home.', full: 'It is full.',
  dusty: 'This home is dusty (upkeep unpaid).', container_full: 'Storage is full.', container_not_empty: 'Empty the storage first.', wall_has_item: 'Remove the wall decor first.', tile_occupied: 'Something is standing there.', entrance: "That's the entrance.", border: "You can't change the outer wall.",
  slow_down: 'Chatting too fast.', not_seated: 'Sit down first.', not_your_turn: "It's not your turn.", seat_taken: 'Seat taken.', buyin_limits: 'Buy-in outside table limits.', illegal_action: 'Not allowed right now.', raise_too_small: 'Raise is too small.',
  muted: 'You are muted.', host_only: 'Only the Host can do that.', cheats_off: 'Dev tools are disabled.', occupied: 'Already occupied.', offline: 'Not connected.', missing_items: "You don't own all the needed items.", too_early: 'Too early! The fish got away.', too_late: 'Too late! The fish got away.',
  property_limit: 'You can own at most 5 properties.', not_owner: 'Only the owner can do that.', wait: 'Wait a moment before confirming.', untradable: "That item can't be traded.", not_nearby: 'They must be nearby.', busy: 'Already trading.',
};
export const errText = (r) => ERR[r?.err] || (r?.err ? r.err.replace(/_/g, ' ') : 'Something went wrong.');
