import { S, bus, setting, fmt, saveSettings } from './state.js';
import { connect, cmd, sendRaw, errText, disconnect } from './net.js';
import { h, $, toast, openPanel, closePanel, rerender, panelOpen, closeAll, anyPanelOpen } from './ui.js';
import { world, startWorld, setupHomeSolid, setupInterior } from './world.js';
import { initAudio, sfx, setMusic, applyVolumes } from './audio.js';
import { creatorWidget, defaultLook, randomLook } from './creator.js';
import { DEFS, EMOTES, xpForLevel } from '/shared/content.js';
import { districtAt } from '/shared/map.js';
import { installPanels } from './panels.js';
import { installBuild } from './build.js';
import { installCasino } from './casino-ui.js';
import { installSocial } from './social-ui.js';
import { loadTileset } from './sprites.js';

const LS = (k, v) => v === undefined ? localStorage.getItem('casinete.' + k) : localStorage.setItem('casinete.' + k, v);
const token = LS('token') || (() => { const t = Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join(''); LS('token', t); return t; })();
let hudBuilt = false;

function showMenu(msg) {
  closeAll(); $('#hud').classList.add('hidden'); $('#creator').classList.add('hidden'); const m = $('#menu'); m.classList.remove('hidden'); m.replaceChildren();
  const name = h('input', { type: 'text', maxlength: 16, value: LS('name') || '', placeholder: 'Your name' });
  const addr = h('input', { type: 'text', value: LS('addr') || location.host, placeholder: 'host:port or join code' });
  const pass = h('input', { type: 'password', placeholder: 'password (if the host set one)' });
  const err = h('div', { class: 'bad', style: { minHeight: '1.3em', fontWeight: 800 } }, msg || '');
  const info = h('div', { class: 'muted' }, '');
  const refresh = async () => { try { const r = await (await fetch(`http://${addr.value}/api/info`)).json(); info.textContent = `🟢 ${r.name} — ${r.players}/${r.max} players${r.password ? ' 🔒' : ''}`; } catch { info.textContent = location.protocol === 'file:' ? '' : '🔴 No host found at this address'; } };
  addr.addEventListener('change', () => { addr.value = resolveAddr(addr.value); refresh(); }); setTimeout(refresh, 100);
  const resolveAddr = (v) => { const m = v.trim().match(/^([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})$/i); if (!m) return v.trim(); const hex = m[1] + m[2]; const ip = [0, 2, 4, 6].map(i => parseInt(hex.slice(i, i + 2), 16)).join('.'); return `${ip}:${parseInt(m[3], 16)}`; };
  const play = async () => {
    addr.value = resolveAddr(addr.value); initAudio(); sfx('click'); const nm = name.value.trim(); if (!nm) { err.textContent = 'Please enter a name.'; return; }
    LS('name', nm); LS('addr', addr.value); let look = LS('look') ? JSON.parse(LS('look')) : null;
    if (!look) return showCreator(nm, (lk) => join(nm, lk));
    join(nm, look);
  };
  const join = async (nm, look) => {
    err.textContent = 'Connecting…';
    try { const w = await connect(`ws://${addr.value}`, { name: nm, token, look, password: pass.value }); onWelcome(w); }
    catch (e) { showMenu({ banned: 'You are banned from this world.', wrong_password: 'Wrong password.', full: 'This world is full.', version_mismatch: 'Version mismatch — update the game.', kicked: 'You were kicked by the Host.', connection_failed: 'Could not reach the host. Is it running? Right address?', closed: 'Connection closed.' }[e.message] || e.message); }
  };
  m.append(h('div', { class: 'col', style: { alignItems: 'center', gap: '14px' } },
    h('div', { class: 'title' }, '♣ Casinete'), h('div', { style: { color: '#fff', fontWeight: 800, marginTop: '-10px' } }, 'Little homes. Big nights.'),
    h('div', { class: 'card col' },
      h('label', {}, 'Name'), name, h('label', {}, 'Host address'), h('div', { class: 'row' }, addr, h('button', { class: 'btn sm ghost', onclick: refresh }, '↻')), info, pass, err,
      h('div', { class: 'row' }, h('button', { class: 'btn grow', onclick: play }, '▶ Play'), h('button', { class: 'btn alt', onclick: () => showCreator(name.value.trim() || 'Guest', (lk) => { showMenu(); }, true) }, '👤 Character')),
      h('details', {}, h('summary', { style: { cursor: 'pointer', fontWeight: 800 } }, '🏠 How to host a game'), h('div', { class: 'muted', style: { fontSize: '.88rem', marginTop: '6px' } }, 'One player runs the Host (it is also where the world is saved): ', h('code', {}, 'npm start'), ' in the game folder. The console prints a LAN address for friends (e.g. http://192.168.1.20:3000). Whoever plays on the host computer (localhost) gets the Host panel, dev tools & admin commands. Options: ', h('code', {}, '--port 3000 --world "My World" --password secret --fast'), '.')),
      h('div', { class: 'muted', style: { fontSize: '.8rem' } }, 'WASD move · E interact · B build (in your home) · I inventory · Tab phone · Enter chat · G emotes')),
  ));
}
function showCreator(nm, done, offline) {
  $('#menu').classList.add('hidden'); const el = $('#creator'); el.classList.remove('hidden'); el.replaceChildren();
  const look = LS('look') ? JSON.parse(LS('look')) : randomLook();
  const w = creatorWidget(look);
  el.append(h('div', { class: 'card col' }, h('h2', {}, `Create your character, ${nm}`), h('div', { class: 'muted' }, 'Starter clothes are free. Buy more at Threadworks — your look is saved on the host.'), w.root,
    h('div', { class: 'row' }, h('button', { class: 'btn grow', onclick: () => { LS('look', JSON.stringify(look)); el.classList.add('hidden'); done(look); } }, offline ? 'Save' : '✔ Start playing'), h('button', { class: 'btn ghost', onclick: () => { el.classList.add('hidden'); showMenu(); } }, 'Back'))));
}

function onWelcome(w) {
  S.me = w.you; S.inv = w.inv; S.world = w.world; S.isHost = w.isHost; S.isNew = w.isNew; S.props = w.world.props; S.serverOffset = w.serverTime - Date.now();
  S.players = new Map(); S.leases = new Map(); S.dragGhosts = new Map();
  $('#menu').classList.add('hidden'); $('#creator').classList.add('hidden'); buildHud(); $('#hud').classList.remove('hidden');
  if (w.world.recovery?.length) toast('Recovered world data: ' + w.world.recovery.join(' | '), 'warn', 8000);
  if (w.isNew) setTimeout(() => toast('Welcome! Talk to Pip, then claim your free studio at the Town Hall (north-west).', 'good', 9000), 800);
  addChat({ ch: 'system', text: `Welcome to ${w.world.name}${w.isHost ? ' (you are the Host)' : ''}. Press H for help.` });
  bus.emit('welcome', w);
}
bus.on('reject', (m) => { showMenu({ banned: 'You are banned.', kicked: 'You were kicked by the Host.', full: 'World is full.' }[m.reason] || m.reason); });
bus.on('disconnected', () => { toast('Disconnected from host.', 'bad', 6000); S.me = null; showMenu('Disconnected from the host. Your progress is saved on the Host.'); });

// ---------------- HUD ----------------
let hud = {};
function buildHud() {
  const root = $('#hud'); root.replaceChildren(); hud = {};
  hud.name = h('span', {}); hud.lv = h('small', {}); hud.xp = h('i', {}); hud.coins = h('span', {}); hud.stars = h('span', {}); hud.where = h('span', {}); hud.clock = h('small', {}); hud.invBadge = h('span', { class: 'badge hidden' });
  root.append(
    h('div', { class: 'hud-top' }, h('div', { class: 'pill', onclick: () => bus.emit('openProfile', S.me.id), style: { cursor: 'pointer' } }, hud.name, hud.lv, h('div', { class: 'xpbar' }, hud.xp)), h('div', { class: 'pill', title: 'Coins' }, '🪙', hud.coins), h('div', { class: 'pill', title: 'Stars (earned only, cannot be wagered)' }, '★', hud.stars)),
    h('div', { class: 'hud-right' }, h('div', { class: 'pill' }, hud.where, hud.clock), h('canvas', { id: 'minimap', width: 192, height: 132 }), h('div', { id: 'roleBanner' })),
    h('div', { id: 'prompt', class: 'hidden' }),
    h('div', { id: 'chat' }, h('div', { id: 'chatlog' }), h('div', { id: 'chatbar' }, h('select', { id: 'chch' }, ['local', 'party', 'shout'].map(c => h('option', { value: c }, c[0].toUpperCase() + c.slice(1)))), h('input', { id: 'chin', type: 'text', maxlength: 140, placeholder: 'Press Enter to chat — /w name msg · /me · /help', onfocus: () => { world.chatFocus = true; }, onblur: () => { world.chatFocus = false; }, onkeydown: chatKey }))),
    h('div', { class: 'hud-bottom' },
      hudBtn('🎒', 'Inventory (I)', 'I', () => bus.emit('openInventory')), hudBtn('📱', 'Phone (Tab)', 'Tab', () => bus.emit('openPhone')), hudBtn('🔨', 'Build mode (B) — in homes', 'B', () => bus.emit('toggleBuild'), 'buildBtn'),
      hudBtn('😀', 'Emotes (G)', 'G', () => bus.emit('openEmotes')), hudBtn('⚙', 'Settings (Esc)', 'Esc', () => bus.emit('openSettings')), S.isHost ? hudBtn('🛠', 'Host panel (F2)', 'F2', () => bus.emit('openHost')) : null));
  hudBuilt = true; refreshHud(); renderLoc();
}
const hudBtn = (ico, title, key, fn, id) => h('button', { class: 'hud-btn', title, id, onclick: () => { sfx('open'); fn(); } }, ico, h('kbd', {}, key));
export function refreshHud() {
  if (!hudBuilt || !S.me) return; const m = S.me;
  hud.name.textContent = m.name + (m.title ? ` · ${m.title}` : ''); hud.lv.textContent = `Lv ${m.level}`; const a = xpForLevel(m.level), b = xpForLevel(m.level + 1); hud.xp.style.width = Math.max(2, Math.min(100, (m.xp - a) / Math.max(1, b - a) * 100)) + '%';
  hud.coins.textContent = fmt(m.coins); hud.stars.textContent = m.stars;
}
function renderLoc() {
  if (!hudBuilt) return; const f = ((Date.now() + S.serverOffset) / 60000 % 40) / 40; const hh = Math.floor(f * 24), mm = Math.floor((f * 24 - hh) * 60);
  hud.clock.textContent = `${f > 0.62 && f < 0.95 ? '🌙' : '☀️'} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  const name = S.loc === 'world' ? (districtAt(S.x, S.y)?.name || 'Marigold Bay') : S.home ? S.home.name : S.world.interiors[S.loc]?.name; hud.where.textContent = '📍 ' + name;
  const bb = $('#buildBtn'); if (bb) bb.style.display = S.home ? '' : 'none';
  const rb = $('#roleBanner'); if (rb) rb.replaceChildren(S.home ? h('div', { class: 'pill' }, S.role === 'owner' ? '👑 Your home' : `Role: ${S.role}`) : '');
}
setInterval(renderLoc, 1000);
bus.on('me', refreshHud);

// ---------------- chat ----------------
export function addChat(m) {
  const log = $('#chatlog'); if (!log) return; const who = m.ch === 'whisper' ? (m.from ? `${m.from} whispers` : `to ${m.to}`) : m.name;
  const line = h('div', { class: 'c-' + m.ch }, m.ch === 'system' ? m.text : `${m.ch === 'party' ? '[Party] ' : m.ch === 'shout' ? '[Shout] ' : ''}${who}: ${m.text}`); log.append(line); log.scrollTop = 1e6; while (log.children.length > 200) log.firstChild.remove();
}
async function chatKey(e) {
  if (e.key === 'Escape') { e.target.blur(); return; } if (e.key !== 'Enter') return; const v = e.target.value.trim(); e.target.value = ''; e.target.blur(); if (!v) return;
  if (v.startsWith('/')) { const [c, ...rest] = v.slice(1).split(' '); const r = rest.join(' ');
    if (c === 'w' || c === 'msg') { const [to, ...t] = r.split(' '); const res = await cmd('chat', { ch: 'whisper', to, text: t.join(' ') }); if (!res.ok) toast(errText(res), 'warn'); return; }
    if (c === 'me') { const res = await cmd('chat', { text: `* ${S.me.name} ${r}` }); return; }
    if (c === 'help') { addChat({ ch: 'system', text: 'Keys: WASD move · E interact · B build · I inventory · Tab phone · G emotes · Enter chat · M zoom reset · F2 host panel. Commands: /w name msg, /me, /dance /wave /laugh…' }); return; }
    if (EMOTES.some(x => x.id === c)) { cmd('emote', { id: c }); return; }
    addChat({ ch: 'system', text: 'Unknown command. Try /help' }); return; }
  const res = await cmd('chat', { ch: $('#chch').value, text: v }); if (!res.ok) toast(errText(res), 'warn');
}

addEventListener('keydown', (e) => {
  if (!S.me || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) { if (e.key === 'Escape') document.activeElement.blur(); return; }
  if (e.code === 'Enter') { $('#chin')?.focus(); e.preventDefault(); }
  else if (e.code === 'KeyI') bus.emit('openInventory'); else if (e.code === 'Tab') { e.preventDefault(); bus.emit('openPhone'); }
  else if (e.code === 'KeyG') bus.emit('openEmotes'); else if (e.code === 'KeyB') bus.emit('toggleBuild'); else if (e.code === 'F2') { e.preventDefault(); bus.emit('openHost'); }
  else if (e.code === 'KeyH') addChat({ ch: 'system', text: 'Keys: WASD move · E interact · B build (home) · I inventory · Tab phone · G emotes · Enter chat · F2 host panel · mouse wheel zoom' });
  else if (e.code === 'Escape') { if (S.buildMode) return; if (anyPanelOpen()) closeAll(); else bus.emit('openSettings'); }
  else if (/^Digit[1-9]$/.test(e.code) && !S.buildMode) { const em = EMOTES[+e.code.slice(5) - 1]; if (em) cmd('emote', { id: em.id }); }
});

// ---------------- message router ----------------
bus.on('msg', (m) => {
  switch (m.t) {
    case 'me': S.me = m.me; refreshHud(); bus.emit('me'); break;
    case 'inv': S.inv = m.inv; bus.emit('inv'); break;
    case 'loc': onLoc(m); break;
    case 'join': addPlayer(m.p); break;
    case 'leave': S.players.delete(m.id); S.bubbles.delete(m.id); break;
    case 'pos': for (const [id, x, y, d] of m.p) { const p = S.players.get(id); if (p && id !== S.me.id) { p.tx = x; p.ty = y; p.dir = d; } } break;
    case 'snap': S.x = m.x; S.y = m.y; break;
    case 'look': { const p = S.players.get(m.id); if (p) p.look = m.look; if (m.id === S.me.id) S.me.look = m.look; break; }
    case 'title': { const p = S.players.get(m.id); if (p) p.title = m.title; break; }
    case 'chat': addChat(m); if (m.id && (m.ch === 'local' || m.ch === 'shout')) S.bubbles.set(m.id, { text: m.text, until: performance.now() + 5000 }); if (m.ch === 'whisper' && m.from) sfx('notify'); break;
    case 'emote': { const e = EMOTES.find(x => x.id === m.e); S.emotes.set(m.id, { e: e?.e || '❔', until: performance.now() + 2800 }); if (m.id !== S.me.id) sfx('emote'); break; }
    case 'sit': { const p = S.players.get(m.id); if (p) { p.sit = true; p.tx = m.x; p.ty = m.y; if (m.id === S.me.id) { S.x = m.x; S.y = m.y; S.sit = true; } else { p.x = m.x; p.y = m.y; } } break; }
    case 'unsit': { const p = S.players.get(m.id); if (p) p.sit = false; if (m.id === S.me.id) S.sit = null; break; }
    case 'note': toast(m.text, m.kind === 'good' ? 'good' : m.kind === 'warn' ? 'warn' : 'info', 5000); if (m.kind === 'good') sfx('notify'); break;
    case 'props': S.props = m.props; bus.emit('props'); break;
    case 'role': S.role = m.role; bus.emit('role'); renderLoc(); break;
    case 'h': bus.emit('home', m); break;
    case 'drag': bus.emit('drag', m); break;
    case 'tev': bus.emit('tev', m); break;
    case 'jackpot': S.jackpot = m.v; bus.emit('jackpot'); break;
    case 'presence': bus.emit('presence', m); break;
    case 'settings': Object.assign(S.world.settings, m.settings); break;
    default: bus.emit('push', m);
  }
});
function addPlayer(p) { S.players.set(p.id, { ...p, tx: p.x, ty: p.y, walk: 0 }); }
function onLoc(m) {
  S.loc = m.loc; S.x = m.x; S.y = m.y; S.sit = null; S.dragGhosts = new Map(); S.leases = new Map(); S.selected = new Set(); world.cam.tx = undefined; world.cam.ty = undefined;
  S.players = new Map(); S.home = null; S.role = null;
  if (m.snap.kind === 'home') { S.home = m.snap.home; S.role = m.snap.role; setupHomeSolid(); } else if (m.loc !== 'world') setupInterior(m.loc);
  addPlayer({ id: S.me.id, name: S.me.name, look: S.me.look, title: S.me.title, level: S.me.level, x: m.x, y: m.y, dir: 0 });
  for (const p of m.players) addPlayer(p); S.tables = m.tables || {};
  world.cam.zoom = S.loc === 'world' ? 1.0 : Math.max(0.6, Math.min(1.5, Math.min((innerWidth - 80) / (((S.home?.w || S.world.interiors[S.loc].w) + (S.home?.h || S.world.interiors[S.loc].h)) * 32), (innerHeight - 140) / ((((S.home?.w || S.world.interiors[S.loc].w) + (S.home?.h || S.world.interiors[S.loc].h)) * 16) + 70))));
  for (const id of ['shop', 'prop', 'slots', 'roulette', 'blackjack', 'poker', 'horses', 'cashier', 'storage', 'salon', 'fish']) closePanel(id, true);
  if (S.buildMode) bus.emit('toggleBuild', 'off');
  setMusic(S.home ? 'home' : S.loc === 'world' ? 'world' : (S.world.interiors[S.loc]?.music || 'shop')); renderLoc(); bus.emit('loc', m);
}
window.addEventListener('pointerdown', () => initAudio(), { once: true });

installPanels(); installBuild(); installCasino(); installSocial();
loadTileset().finally(() => startWorld($('#cv')));   // use the baked PNG tileset when present, otherwise render sprites from the procedural models
showMenu();
window.__casinete = { S, cmd, world, bus };
