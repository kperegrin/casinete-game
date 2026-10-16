// Modular isometric character (boxes for the body, billboard head with hair/hat/glasses) — 4 facings, 4 walk frames, sit pose.
import { box, cyl, sph, flat, renderModel, rotate, P, shade } from './iso.js';
import { SKIN_COLORS, HAIR_COLORS, CLOTH_COLORS, DEFS } from '/shared/content.js';
const ROT_OF_DIR = [0, 3, 2, 1];            // world facing 0:+y 1:+x 2:-y 3:-x  ->  model rotation (model front is +y)
const LONG = new Set(['top_hoodie', 'top_suit', 'top_shirt']);

export function characterPrims(look, rot, frame, sit) {
  const skin = SKIN_COLORS[look.skin ?? 2] || SKIN_COLORS[2]; const bw = [0.9, 1, 1.14][look.body ?? 1]; const hs = 1 + (look.height || 0) * 0.012;
  let topC = CLOTH_COLORS[look.topColor ?? 0], botC = CLOTH_COLORS[look.bottomColor ?? 6], shoeC = CLOTH_COLORS[look.shoeColor ?? 7];
  if (look.top === 'top_suit') topC = '#2c3e50'; if (look.bottom === 'bottom_slacks') botC = '#555b66'; if (look.full === 'top_gown') topC = '#6a3fa0';
  const z = (v) => v * hs; const x0 = 0.5 - 0.24 * bw, tw = 0.48 * bw; const sw = Math.sin(frame * Math.PI / 2) * 0.09; const dz = sit ? -4 : 0;
  const P_ = [];
  const dress = look.full && DEFS[look.full]; const shorts = look.bottom === 'bottom_shorts', skirt = look.bottom === 'bottom_skirt';
  const boots = look.shoes === 'shoes_boots', heels = look.shoes === 'shoes_heels', sandals = look.shoes === 'shoes_sandals';
  const shoeCol = boots ? '#6b4a2b' : heels ? '#c0392b' : sandals ? '#d9b38c' : shoeC;
  // legs + shoes
  const legBottom = (dress || shorts || skirt) ? skin : botC;
  if (!sit) {
    for (const [lx, s] of [[0.5 - 0.2 * bw, sw], [0.5 + 0.02 * bw, -sw]]) {
      P_.push(box(lx, 0.4 + s, z(4), 0.18 * bw, 0.2, z(13), legBottom)); if (shorts || skirt) P_.push(box(lx, 0.4 + s, z(11), 0.18 * bw, 0.2, z(6), botC));
      P_.push(box(lx - 0.01, 0.36 + s, 0, 0.2 * bw, 0.3, z(boots ? 9 : 5), shoeCol));
    }
  } else {
    for (const lx of [0.5 - 0.2 * bw, 0.5 + 0.02 * bw]) { P_.push(box(lx, 0.4, z(11), 0.18 * bw, 0.46, z(7), (dress || skirt) ? skin : botC), box(lx, 0.78, z(2), 0.18 * bw, 0.14, z(11), legBottom), box(lx - 0.01, 0.74, 0, 0.2 * bw, 0.26, z(4), shoeCol)); if (shorts || skirt) P_.push(box(lx, 0.4, z(11), 0.18 * bw, 0.46, z(7), botC)); }
  }
  // skirt / dress
  if (dress || skirt) P_.push(box(0.5 - 0.31 * bw, 0.32, z(sit ? 10 : 12), 0.62 * bw, 0.38, z(10), dress ? topC : botC));
  // torso (+ arms)
  const tz = z(17) + dz; const th = z(24);
  P_.push(box(x0, 0.36, tz, tw, 0.28, th, topC));
  if (look.top === 'top_suit') P_.push(box(0.5 - 0.06, 0.635, tz + z(6), 0.12, 0.02, z(16), '#f4f4f4'), box(0.5 - 0.02, 0.64, tz + z(6), 0.04, 0.02, z(12), '#c0392b'));
  if (look.top === 'top_hoodie') P_.push(box(0.5 - 0.15, 0.3, tz + th - z(2), 0.3, 0.1, z(5), shade(topC, 0.8)));
  const sleeveLong = LONG.has(look.top) || dress; const armC = look.top === 'top_tank' ? skin : topC;
  for (const [ax, s] of [[x0 - 0.15 * bw, -sw], [x0 + tw + 0.01, sw]]) {
    const ay = 0.4 + (sit ? 0 : s); P_.push(box(ax, ay, tz + z(sit ? 8 : 10), 0.14 * bw, 0.2, z(14), armC)); P_.push(box(ax, ay, tz + z(sit ? 4 : 1), 0.14 * bw, 0.2, z(sit ? 5 : 9.5), (sleeveLong && !dress) ? topC : skin));
    if (!sit) P_.push(box(ax + 0.01, ay + 0.01, tz - z(1), 0.12 * bw, 0.18, z(3), skin));
  }
  if (look.acc === 'acc_chain') P_.push(box(0.5 - 0.14, 0.64, tz + z(16), 0.28, 0.025, z(2), '#ffd54a'));
  // back items
  const back = look.back; if (back === 'back_pack') P_.push(box(0.5 - 0.2 * bw, 0.18, tz + z(2), 0.4 * bw, 0.17, z(18), '#c0562f'), box(0.5 - 0.16 * bw, 0.14, tz + z(4), 0.32 * bw, 0.04, z(8), '#8a3b1f'));
  if (back === 'back_cape') P_.push(box(0.5 - 0.22 * bw, 0.2, z(8) + dz, 0.44 * bw, 0.06, z(36), '#c62828'));
  if (back === 'back_wings') for (const sx of [-1, 1]) for (const [i, h] of [[0, 26], [1, 20], [2, 14]]) P_.push(box(0.5 + sx * (0.26 * bw + 0.07 * i) - 0.04, 0.2, tz + z(10 - i * 3), 0.08, 0.05, z(h), '#fbfbff'));
  if (dress && look.full === 'top_gown') for (let i = 0; i < 5; i++) P_.push(sph(0.34 + i * 0.08, 0.7, z(6 + (i % 3) * 5) + dz, 0.025, '#fff'));
  const zHead = z(40) + dz;
  return { prims: rotate(P_, 1, 1, rot).prims, zHead };
}

function hair(c, st, col, front, X, Y, R) {
  c.fillStyle = col; c.strokeStyle = 'rgba(20,12,30,.35)'; c.lineWidth = 1;
  const disc = (x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.stroke(); };
  const cap = (r = R + 1.3) => { c.beginPath(); c.arc(X, Y - 0.5, r, Math.PI, 0); c.closePath(); c.fill(); c.stroke(); };
  if (st === 9) return;
  if (!front) { if (st === 8) { c.fillRect(X - 3, Y - R - 7, 6, R + 5); } disc(X, Y, R + 1.4); if (st === 3) { c.fillRect(X - R - 2, Y, R * 2 + 4, R * 1.9); } if (st === 6) { disc(X, Y + R * 0.9, 4.5); } if (st === 7) disc(X, Y - R - 2, 4.5); if (st === 5) for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(X + i * 4 - 2.5, Y - R); c.lineTo(X + i * 4, Y - R - 8 + Math.abs(i)); c.lineTo(X + i * 4 + 2.5, Y - R); c.fill(); } if (st === 4) for (let i = -2; i <= 2; i++) disc(X + i * 4.5, Y - R + 1 + Math.abs(i), 5); return; }
  if (st === 0) { c.beginPath(); c.arc(X, Y - 1, R + 0.8, Math.PI * 1.08, Math.PI * 1.92); c.closePath(); c.fill(); return; }
  if (st === 8) { c.fillRect(X - 3, Y - R - 7, 6, R + 3); c.fillRect(X - R, Y - R * 0.55, R * 2, 3); return; }
  if (st === 4) { for (let i = -2; i <= 2; i++) disc(X + i * 4.6, Y - R + 1 + Math.abs(i) * 0.9, 5.2); disc(X - R, Y - 1, 4); disc(X + R, Y - 1, 4); return; }
  cap();
  if (st === 1) { c.fillRect(X - R - 1.2, Y - 1, 3.2, 5); c.fillRect(X + R - 2, Y - 1, 3.2, 5); }
  if (st === 2) { c.fillRect(X - R - 2, Y - 1, 4.5, R + 2); c.fillRect(X + R - 2.5, Y - 1, 4.5, R + 2); }
  if (st === 3) { c.fillRect(X - R - 2.5, Y - 1, 5, R * 2.1); c.fillRect(X + R - 2.5, Y - 1, 5, R * 2.1); }
  if (st === 5) for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(X + i * 4 - 2.5, Y - R); c.lineTo(X + i * 4, Y - R - 9 + Math.abs(i)); c.lineTo(X + i * 4 + 2.5, Y - R); c.closePath(); c.fill(); }
  if (st === 6) disc(X + R + 1, Y + 3, 4); if (st === 7) disc(X, Y - R - 3, 4.8);
  c.fillStyle = col; c.beginPath(); c.ellipse(X, Y - R * 0.55, R * 0.95, 3.2, 0, 0, Math.PI); c.fill();   // fringe
}
function hat(c, id, front, rotv, X, Y, R) {
  const top = Y - R * 0.55; c.lineWidth = 1; c.strokeStyle = 'rgba(20,12,30,.4)'; const ell = (x, y, rx, ry, col) => { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 7); c.fillStyle = col; c.fill(); c.stroke(); };
  const vx = rotv === 0 ? -R * 0.6 : R * 0.6;
  if (id === 'hat_cap') { c.beginPath(); c.ellipse(X, top, R + 1.5, R * 0.9, 0, Math.PI, 0); c.fillStyle = '#3a7bd5'; c.fill(); c.stroke(); if (front) ell(X + vx, top + 1, R * 0.7, 2.6, '#2a5ca8'); }
  else if (id === 'hat_beret') { c.save(); c.translate(X, top - 1); c.rotate(-0.15); ell(0, 0, R + 3, R * 0.55, '#8e2b3c'); ell(1, -R * 0.45, 2, 2, '#6d1f2d'); c.restore(); }
  else if (id === 'hat_top' || id === 'hat_vip') { const col = id === 'hat_vip' ? '#6b6f7a' : '#1b1b22'; ell(X, top + 1, R + 4, 3.6, col); c.fillStyle = col; c.fillRect(X - R * 0.62, top - 17, R * 1.24, 17); c.strokeRect(X - R * 0.62, top - 17, R * 1.24, 17); ell(X, top - 17, R * 0.62, 2.8, shade(col, 1.25)); c.fillStyle = id === 'hat_vip' ? '#e0b43a' : '#c0392b'; c.fillRect(X - R * 0.62, top - 6, R * 1.24, 4); }
  else if (id === 'hat_crown') { c.beginPath(); const w = R * 1.1; c.moveTo(X - w, top + 1); c.lineTo(X - w, top - 12); c.lineTo(X - w * 0.5, top - 5); c.lineTo(X, top - 14); c.lineTo(X + w * 0.5, top - 5); c.lineTo(X + w, top - 12); c.lineTo(X + w, top + 1); c.closePath(); c.fillStyle = '#e0b43a'; c.fill(); c.stroke(); for (const [gx, col] of [[-w * 0.55, '#e74c3c'], [0, '#3498db'], [w * 0.55, '#2ecc71']]) { c.beginPath(); c.arc(X + gx, top - 3, 1.8, 0, 7); c.fillStyle = col; c.fill(); } }
  else if (id === 'hat_party') { c.beginPath(); c.moveTo(X - R * 0.8, top + 1); c.lineTo(X, top - 22); c.lineTo(X + R * 0.8, top + 1); c.closePath(); c.fillStyle = '#ff5db1'; c.fill(); c.stroke(); c.fillStyle = '#ffe44d'; c.fillRect(X - R * 0.5, top - 7, R, 3); c.beginPath(); c.arc(X, top - 22, 2.6, 0, 7); c.fillStyle = '#4dd2ff'; c.fill(); }
  else if (id === 'hat_cowboy') { ell(X, top + 1, R + 8, 4.5, '#8b5a2b'); c.beginPath(); c.ellipse(X, top - 1, R * 0.9, R * 0.8, 0, Math.PI, 0); c.fillStyle = '#a56a35'; c.fill(); c.stroke(); c.fillStyle = '#5a3a1c'; c.fillRect(X - R * 0.9, top - 4, R * 1.8, 2.5); }
}
function glasses(c, id, X, Y, sx) {
  c.lineWidth = 1.4; const ex = [X - 3.6 + sx, X + 3.6 + sx];
  if (id === 'gl_round') { c.strokeStyle = '#2b2b2b'; for (const x of ex) { c.beginPath(); c.arc(x, Y + 1, 3.3, 0, 7); c.stroke(); } c.beginPath(); c.moveTo(ex[0] + 3.3, Y + 1); c.lineTo(ex[1] - 3.3, Y + 1); c.stroke(); }
  else if (id === 'gl_sun') { c.fillStyle = '#15151b'; for (const x of ex) { c.beginPath(); c.roundRect(x - 3.6, Y - 1.5, 7.2, 5, 2); c.fill(); } c.fillRect(ex[0] + 3, Y - 0.5, ex[1] - ex[0] - 6, 1.2); }
  else if (id === 'gl_star') { c.fillStyle = '#ff4fa3'; for (const x of ex) { c.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 2.2 : 5; const a = -Math.PI / 2 + i * Math.PI / 5; c.lineTo(x + Math.cos(a) * r, Y + 1 + Math.sin(a) * r); } c.closePath(); c.fill(); c.strokeStyle = '#8a1f5a'; c.stroke(); } }
}

export function renderCharacter(look, dir, frame = 0, sit = false, scale = 1) {
  const rot = ROT_OF_DIR[dir & 3]; const { prims, zHead } = characterPrims(look, rot, frame, sit);
  const skin = SKIN_COLORS[look.skin ?? 2] || SKIN_COLORS[2]; const hairCol = HAIR_COLORS[look.hairColor ?? 1] || HAIR_COLORS[1]; const front = rot === 0 || rot === 3; const hs = 1 + (look.height || 0) * 0.012;
  const R = 9.4;
  return renderModel(prims, { scale, pad: 3, extraTop: 52 * hs, extraSide: 10, post(c) {
    c.lineJoin = 'round'; const [X, Y0] = P(0.5, 0.5, zHead + R); const Y = Y0 - 3;
    // neck + head
    c.fillStyle = shade(skin, 0.85); c.fillRect(X - 3, Y + R - 3, 6, 5);
    const g = c.createRadialGradient(X - 3, Y - 4, 1, X, Y, R + 2); g.addColorStop(0, shade(skin, 1.12)); g.addColorStop(1, shade(skin, 0.86)); c.beginPath(); c.arc(X, Y, R, 0, 7); c.fillStyle = g; c.fill(); c.strokeStyle = 'rgba(20,12,30,.35)'; c.lineWidth = 1; c.stroke();
    if (front) {
      const sx = rot === 0 ? -2.4 : 2.4; c.fillStyle = '#2a2230'; for (const dx of [-3.4, 3.4]) { c.beginPath(); c.ellipse(X + dx + sx, Y + 1, 1.5, 2.1, 0, 0, 7); c.fill(); c.fillStyle = '#fff'; c.fillRect(X + dx + sx - 0.4, Y, 0.9, 0.9); c.fillStyle = '#2a2230'; }
      c.strokeStyle = '#9b4b3a'; c.lineWidth = 1.2; c.beginPath(); c.arc(X + sx * 0.8, Y + 4.2, 2.6, 0.2, Math.PI - 0.2); c.stroke(); c.fillStyle = 'rgba(255,120,120,.25)'; for (const dx of [-5.6, 5.6]) { c.beginPath(); c.arc(X + dx + sx, Y + 4, 1.9, 0, 7); c.fill(); }
      hair(c, look.hairStyle ?? 1, hairCol, true, X, Y, R); if (look.glasses) glasses(c, look.glasses, X, Y, sx);
    } else hair(c, look.hairStyle ?? 1, hairCol, false, X, Y, R);
    if (look.hat) hat(c, look.hat, front, rot, X, Y, R);
  } });
}
