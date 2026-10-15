// Procedural audio: no asset files. Independent bus volumes (master/music/sfx/ui/casino/ambience).
import { S, setting, saveSettings } from './state.js';
let ac = null; const bus = {}; let musicNodes = null, curMusic = null;
export const BUSES = ['master', 'music', 'sfx', 'ui', 'casino', 'ambience'];
export function initAudio() {
  if (ac) return; try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
  bus.master = ac.createGain(); bus.master.connect(ac.destination);
  for (const b of BUSES.slice(1)) { bus[b] = ac.createGain(); bus[b].connect(bus.master); }
  applyVolumes();
}
export function applyVolumes() { if (!ac) return; for (const b of BUSES) bus[b].gain.value = (setting('vol_' + b, b === 'music' ? 0.35 : 0.7)) * (b === 'master' && S.settings.mute ? 0 : 1); }
export const setVol = (b, v) => { S.settings['vol_' + b] = v; saveSettings(); applyVolumes(); };
export const getVol = (b) => setting('vol_' + b, b === 'music' ? 0.35 : 0.7);
function tone(freq, dur, { type = 'sine', vol = 0.3, at = 0, slide = 0, to = 'sfx' } = {}) {
  if (!ac) return; const t = ac.currentTime + at; const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(bus[to]); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, { vol = 0.2, at = 0, hp = 1000, to = 'sfx' } = {}) {
  if (!ac) return; const t = ac.currentTime + at; const buf = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = ac.createBufferSource(); s.buffer = buf; const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; const g = ac.createGain(); g.gain.value = vol; s.connect(f); f.connect(g); g.connect(bus[to]); s.start(t);
}
export const SFX = {
  click: () => tone(660, 0.06, { type: 'triangle', vol: 0.2, to: 'ui' }), open: () => { tone(440, 0.08, { to: 'ui' }); tone(660, 0.1, { at: 0.06, to: 'ui' }); }, error: () => tone(150, 0.18, { type: 'sawtooth', vol: 0.2, to: 'ui' }),
  coin: () => { tone(988, 0.08, { type: 'square', vol: 0.12, to: 'ui' }); tone(1319, 0.18, { type: 'square', vol: 0.12, at: 0.07, to: 'ui' }); },
  place: () => { tone(180, 0.1, { type: 'triangle', vol: 0.35 }); noise(0.05, { vol: 0.1, hp: 400 }); }, remove: () => tone(300, 0.15, { type: 'triangle', slide: -200, vol: 0.2 }), rotate: () => tone(520, 0.04, { type: 'square', vol: 0.08 }),
  step: () => noise(0.04, { vol: 0.05, hp: 2500 }), door: () => { tone(200, 0.12, { type: 'sawtooth', vol: 0.15 }); tone(150, 0.15, { type: 'sawtooth', at: 0.1, vol: 0.12 }); },
  chip: () => { noise(0.03, { vol: 0.25, hp: 3000, to: 'casino' }); tone(2400, 0.04, { vol: 0.08, to: 'casino' }); }, card: () => noise(0.06, { vol: 0.18, hp: 1500, to: 'casino' }),
  spin: () => { for (let i = 0; i < 18; i++) tone(300 + (i % 3) * 40, 0.05, { at: i * 0.12, type: 'square', vol: 0.05, to: 'casino' }); },
  ball: () => { for (let i = 0; i < 10; i++) tone(1200 - i * 60, 0.03, { at: i * (0.06 + i * 0.012), vol: 0.08, to: 'casino' }); },
  reel: () => tone(220, 0.05, { type: 'square', vol: 0.06, to: 'casino' }), reelStop: () => tone(130, 0.08, { type: 'triangle', vol: 0.2, to: 'casino' }),
  win: (big) => { const n = big ? [523, 659, 784, 1046, 1318] : [523, 659, 784]; n.forEach((f, i) => tone(f, 0.18, { at: i * 0.09, type: 'triangle', vol: 0.22, to: 'casino' })); },
  lose: () => { tone(220, 0.2, { type: 'sawtooth', vol: 0.12, to: 'casino' }); tone(165, 0.3, { at: 0.15, type: 'sawtooth', vol: 0.12, to: 'casino' }); },
  bell: () => { tone(880, 0.6, { vol: 0.25, to: 'casino' }); tone(1760, 0.4, { vol: 0.1, to: 'casino' }); }, hooves: () => { for (let i = 0; i < 6; i++) tone(90, 0.05, { at: i * 0.1, type: 'triangle', vol: 0.15, to: 'casino' }); },
  notify: () => { tone(784, 0.1, { to: 'ui' }); tone(1046, 0.14, { at: 0.1, to: 'ui' }); }, emote: () => tone(900, 0.1, { type: 'triangle', slide: 300, vol: 0.12 }), levelup: () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.2, { at: i * 0.08, type: 'triangle', vol: 0.25, to: 'ui' })),
};
export function sfx(n, ...a) { try { SFX[n]?.(...a); } catch { /* ignore */ } }
// gentle looping ambient music per area (arpeggios on triangle waves)
const SCALES = { world: [0, 4, 7, 12, 9, 7, 4, 2], shop: [0, 3, 7, 10, 7, 3], hall: [0, 5, 7, 12, 7, 5], casino: [0, 3, 7, 10, 12, 10, 7, 3], track: [0, 4, 7, 9, 12, 9, 7, 4], home: [0, 4, 7, 11, 7, 4], hall2: [0] };
export function setMusic(area) {
  if (!ac || curMusic === area) return; curMusic = area; if (musicNodes) clearInterval(musicNodes);
  const sc = SCALES[area] || SCALES.world; const base = { world: 220, shop: 262, hall: 196, casino: 175, track: 247, home: 233 }[area] || 220; let i = 0;
  musicNodes = setInterval(() => { if (S.settings.mute) return; const semi = sc[i++ % sc.length]; tone(base * Math.pow(2, semi / 12), 0.9, { type: 'triangle', vol: 0.09, to: 'music' }); if (i % 4 === 0) tone(base / 2 * Math.pow(2, sc[0] / 12), 1.6, { type: 'sine', vol: 0.1, to: 'music' }); }, area === 'casino' ? 420 : 560);
}
export const audioReady = () => !!ac;
