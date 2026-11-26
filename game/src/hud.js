// The heads-up display: gauges, attitude ball, compass, minimap,
// banners, warnings, menus and end screens — all drawn on canvas.

import { MISSIONS, formatTime, loadBest } from './missions.js';
import { nextGate, GATE_RADIUS } from './rings.js';
import { RUNWAY, LAKE } from './terrain.js';
import { clamp } from './noise.js';

const W = 1280, H = 720;

function panel(ctx, x, y, w, h) {
  ctx.save();
  ctx.fillStyle = 'rgba(10,14,20,0.55)';
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function text(ctx, s, x, y, size, color, align, bold) {
  ctx.save();
  ctx.fillStyle = color || '#fff';
  ctx.font = `${bold ? 'bold ' : ''}${size}px sans-serif`;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
  ctx.restore();
}

function gauge(ctx, cx, cy, r, value, max, label, unit, color) {
  ctx.save();
  ctx.fillStyle = 'rgba(10,14,20,0.6)';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
    const inner = i % 5 === 0 ? r - 14 : r - 8;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = i % 5 === 0 ? 2.5 : 1;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ctx.lineTo(cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3));
    ctx.stroke();
  }
  const frac = clamp(value / max, 0, 1);
  const na = -Math.PI * 0.75 + frac * Math.PI * 1.5;
  ctx.strokeStyle = color || '#ffd23e';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(na) * (r - 16), cy + Math.sin(na) * (r - 16));
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();
  text(ctx, label, cx, cy + r * 0.42, 12, '#cfe0f0', 'center');
  text(ctx, unit, cx, cy - r * 0.45, 11, '#9fb4c8', 'center');
  ctx.restore();
}

function attitudeBall(ctx, cx, cy, r, roll, pitch) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-roll);
  const py = clamp(pitch, -0.6, 0.6) * r * 1.6;
  ctx.fillStyle = '#3d7ec2';
  ctx.fillRect(-r, -r - py, r * 2, r + py);
  ctx.fillStyle = '#8a6a44';
  ctx.fillRect(-r, -py, r * 2, r + py);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-r, -py);
  ctx.lineTo(r, -py);
  ctx.stroke();
  for (let i = -2; i <= 2; i++) {
    if (i === 0) continue;
    const y = -py + i * r * 0.28;
    ctx.beginPath();
    ctx.moveTo(-r * 0.3, y);
    ctx.lineTo(r * 0.3, y);
    ctx.stroke();
  }
  ctx.restore();
  // Fixed gold wings symbol.
  ctx.save();
  ctx.strokeStyle = '#ffd23e';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.7, cy);
  ctx.lineTo(cx - r * 0.15, cy);
  ctx.moveTo(cx + r * 0.15, cy);
  ctx.lineTo(cx + r * 0.7, cy);
  ctx.stroke();
  ctx.fillStyle = '#ffd23e';
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function compassStrip(ctx, headingDeg) {
  const cx = W / 2, y = 26;
  ctx.save();
  ctx.fillStyle = 'rgba(10,14,20,0.55)';
  ctx.beginPath();
  ctx.roundRect(cx - 260, y - 16, 520, 32, 8);
  ctx.fill();
  const span = 90;
  let hdg = headingDeg;
  while (hdg < 0) hdg += 360;
  while (hdg >= 360) hdg -= 360;
  for (let d = -span; d <= span; d += 5) {
    let deg = Math.round(hdg + d);
    while (deg < 0) deg += 360;
    while (deg >= 360) deg -= 360;
    const x = cx + (d / span) * 250;
    const major = deg % 30 === 0;
    ctx.strokeStyle = major ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, y + 6);
    ctx.lineTo(x, y + (major ? 14 : 10));
    ctx.stroke();
    if (major) {
      const names = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
      text(ctx, names[deg] || String(deg), x, y - 8, 11, '#fff', 'center', true);
    }
  }
  // Gold caret at the centre.
  ctx.fillStyle = '#ffd23e';
  ctx.beginPath();
  ctx.moveTo(cx - 7, y - 15);
  ctx.lineTo(cx + 7, y - 15);
  ctx.lineTo(cx, y - 4);
  ctx.closePath();
  ctx.fill();
  text(ctx, `${String(Math.round(hdg)).padStart(3, '0')}°`, cx, y + 24, 12, '#ffd23e', 'center', true);
  ctx.restore();
}

function minimap(ctx, plane, rings, camMode) {
  // Top right, under the score strip, where it never covers a gauge.
  const size = 150;
  const x = W - size - 18, y = 74;
  panel(ctx, x - 8, y - 8, size + 16, size + 16);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, size, size);
  ctx.clip();
  ctx.fillStyle = 'rgba(40,70,50,0.7)';
  ctx.fillRect(x, y, size, size);
  const scale = size / 4400;
  const toMap = (wx, wz) => ({ x: x + size / 2 + wx * scale, y: y + size / 2 + wz * scale });
  // Lake.
  const lk = toMap(LAKE.cx, LAKE.cz);
  ctx.fillStyle = 'rgba(80,140,190,0.8)';
  ctx.beginPath();
  ctx.ellipse(lk.x, lk.y, LAKE.rx * scale, LAKE.rz * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  // Runway.
  const r0 = toMap(RUNWAY.cx - RUNWAY.length / 2, RUNWAY.cz);
  const r1 = toMap(RUNWAY.cx + RUNWAY.length / 2, RUNWAY.cz);
  ctx.strokeStyle = '#eee';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(r0.x, r0.y);
  ctx.lineTo(r1.x, r1.y);
  ctx.stroke();
  // Gates.
  if (rings) {
    for (let i = 0; i < rings.gates.length; i++) {
      const g = rings.gates[i];
      const p = toMap(g.x, g.z);
      ctx.fillStyle = g.passed ? '#4caf50' : i === rings.next ? '#ffd23e' : '#5aa0ff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, i === rings.next ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // The aeroplane: a small triangle pointing along its heading.
  const p = toMap(plane.x, plane.z);
  ctx.translate(p.x, p.y);
  ctx.rotate(Math.atan2(Math.sin(plane.heading), Math.cos(plane.heading)));
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(-6, -5);
  ctx.lineTo(-6, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function bars(ctx, plane) {
  // Throttle and fuel bars above the airspeed gauge.
  const x = 36, y = H - 218, w = 150;
  const fuelFrac = clamp(plane.fuel / 120, 0, 1);
  text(ctx, 'THR', x, y, 11, '#cfe0f0', 'left', true);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x + 40, y - 5, w, 10);
  ctx.fillStyle = '#7ec8ff';
  ctx.fillRect(x + 40, y - 5, w * clamp(plane.throttle, 0, 1), 10);
  text(ctx, 'FUEL', x, y + 18, 11, '#cfe0f0', 'left', true);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x + 40, y + 13, w, 10);
  ctx.fillStyle = fuelFrac < 0.2 ? '#ff5040' : '#7ee081';
  ctx.fillRect(x + 40, y + 13, w * fuelFrac, 10);
  if (plane.flaps) text(ctx, 'FLAPS', x + 200, y + 18, 11, '#ffd23e', 'left', true);
}

function offscreenChevron(ctx, cam, gate, w, h) {
  if (!gate) return;
  // Project the gate; if it is behind or off-screen, point at it.
  const dx = gate.x - cam.pos.x;
  const dy = gate.y - cam.pos.y;
  const dz = gate.z - cam.pos.z;
  const cx = dx * cam.right.x + dy * cam.right.y + dz * cam.right.z;
  const cy = dx * cam.up.x + dy * cam.up.y + dz * cam.up.z;
  const cz = dx * cam.fwd.x + dy * cam.fwd.y + dz * cam.fwd.z;
  let sx, sy;
  if (cz <= 1) { sx = -cx; sy = -cy; }
  else {
    sx = (w / 2 + (cx / cz) * cam.focal) - w / 2;
    sy = (h / 2 - (cy / cz) * cam.focal) - h / 2;
  }
  const onScreen = cz > 1 && Math.abs(sx) < w / 2 - 60 && Math.abs(sy) < h / 2 - 60;
  if (onScreen) return;
  const ang = Math.atan2(sy, sx);
  const ex = w / 2 + Math.cos(ang) * (w / 2 - 90);
  const ey = h / 2 + Math.sin(ang) * (h / 2 - 90);
  ctx.save();
  ctx.translate(ex, ey);
  ctx.rotate(ang);
  ctx.fillStyle = 'rgba(255,205,70,0.95)';
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(-10, -11);
  ctx.lineTo(-4, 0);
  ctx.lineTo(-10, 11);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  const dist = Math.round(Math.hypot(dx, dy, dz));
  text(ctx, `${dist} m`, ex, ey + 26, 13, '#ffd23e', 'center', true);
}

export function drawHud(ctx, G) {
  const plane = G.plane;
  const knots = Math.round(plane.speed * 1.94384);
  const altFt = Math.round(plane.y * 3.28084);
  const aglFt = Math.round(Math.max(0, plane.y - G.groundH) * 3.28084);
  const vsFpm = Math.round(-plane.sinkRate * 196.85);
  const headingDeg = ((plane.heading * 180 / Math.PI) % 360 + 360) % 360;

  compassStrip(ctx, headingDeg);

  // Mission strip, top left.
  panel(ctx, 16, 10, 300, 54);
  text(ctx, G.mission.name, 28, 26, 16, '#fff', 'left', true);
  text(ctx, G.objective, 28, 46, 12, '#cfe0f0', 'left');

  // Score strip, top right.
  panel(ctx, W - 316, 10, 300, 54);
  text(ctx, `SCORE ${G.score.points}`, W - 304, 26, 16, '#ffd23e', 'left', true);
  text(ctx, `TIME ${formatTime(G.score.time)}   GATES ${G.score.gates}/${G.rings ? G.rings.gates.length : 0}`, W - 304, 46, 12, '#fff', 'left');

  // Gauges. In cockpit view the lit panel below replaces them, so
  // they are only drawn in chase view.
  if (G.camMode !== 'cockpit') {
    bars(ctx, plane);
    gauge(ctx, 110, H - 100, 62, knots, 180, 'KNOTS', String(knots), knots > 150 ? '#ff5040' : '#ffd23e');
    gauge(ctx, W - 110, H - 100, 62, altFt, 9000, 'FEET', String(altFt), '#7ec8ff');
    text(ctx, `AGL ${aglFt} ft`, W - 110, H - 22, 12, '#cfe0f0', 'center');
    const vsColor = vsFpm < -1200 ? '#ff5040' : '#cfe0f0';
    text(ctx, `V/S ${vsFpm >= 0 ? '+' : ''}${vsFpm} fpm`, W - 110, H - 178, 13, vsColor, 'center', true);
    // Attitude ball, bottom centre.
    attitudeBall(ctx, W / 2, H - 86, 52, plane.roll, plane.pitch);
  }

  minimap(ctx, plane, G.rings, G.camMode);

  // Next-gate distance under the compass.
  const gate = G.rings ? nextGate(G.rings) : null;
  if (gate) {
    const d = Math.round(Math.hypot(gate.x - plane.x, gate.y - plane.y, gate.z - plane.z));
    text(ctx, `${gate.label || 'Next gate'} — ${d} m`, W / 2, 76, 13, '#ffd23e', 'center', true);
    offscreenChevron(ctx, G.cam, gate, W, H);
  }

  // Flight-path marker in cockpit view.
  if (G.camMode === 'cockpit') {
    const fwd = { x: Math.cos(plane.heading), y: 0, z: Math.sin(plane.heading) };
    const cx = W / 2 + Math.sin(plane.roll) * 30;
    const cy = H / 2 - plane.gamma * 260;
    ctx.save();
    ctx.strokeStyle = '#7ee081';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 22, cy);
    ctx.lineTo(cx - 10, cy);
    ctx.moveTo(cx + 10, cy);
    ctx.lineTo(cx + 22, cy);
    ctx.moveTo(cx, cy + 10);
    ctx.lineTo(cx, cy + 18);
    ctx.stroke();
    ctx.restore();
    drawPanel(ctx, G, knots, altFt, headingDeg);
  }

  // Damage smoke is drawn in the world; the number shows here.
  if (plane.damage > 0) {
    text(ctx, `DAMAGE ${Math.round(plane.damage)}%`, W / 2, H - 158, 13, plane.damage > 60 ? '#ff5040' : '#ffb040', 'center', true);
  }

  // Warnings, centred.
  let warnY = 150;
  if (plane.stalled) {
    text(ctx, 'STALL — NOSE DOWN, THROTTLE UP', W / 2, warnY, 20, '#ff5040', 'center', true);
    warnY += 30;
  }
  if (plane.fuel <= 0) {
    text(ctx, 'FUEL EMPTY — GLIDING', W / 2, warnY, 20, '#ff5040', 'center', true);
    warnY += 30;
  } else if (plane.fuel < 24) {
    text(ctx, 'LOW FUEL — HEAD FOR RUNWAY 09', W / 2, warnY, 18, '#ffb040', 'center', true);
    warnY += 30;
  }
  if (plane.damage > 0 && plane.damage < 100) {
    text(ctx, `AIRFRAME DAMAGE ${Math.round(plane.damage)}% — SMOKE TRAILING`, W / 2, warnY, 15, '#ffb040', 'center');
  }

  // Banner (mission complete / gate / landing).
  if (G.banner && G.bannerT > 0) {
    ctx.save();
    ctx.globalAlpha = clamp(G.bannerT, 0, 1);
    panel(ctx, W / 2 - 330, 88, 660, 84);
    text(ctx, G.banner, W / 2, 116, 30, '#ffd23e', 'center', true);
    if (G.bannerSub) text(ctx, G.bannerSub, W / 2, 150, 15, '#fff', 'center');
    ctx.restore();
  }
}

// Lit instrument panel across the bottom in cockpit view.
function drawPanel(ctx, G, knots, altFt, headingDeg) {
  const plane = G.plane;
  const y = H - 118;
  panel(ctx, 0, y, W, 118);
  gauge(ctx, 130, y + 56, 44, knots, 180, 'KT', String(knots), '#ffd23e');
  gauge(ctx, 250, y + 56, 44, altFt, 9000, 'FT', String(altFt), '#7ec8ff');
  attitudeBall(ctx, 380, y + 56, 42, plane.roll, plane.pitch);
  // Heading dial.
  ctx.save();
  ctx.fillStyle = 'rgba(10,14,20,0.6)';
  ctx.beginPath();
  ctx.arc(500, y + 56, 42, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.stroke();
  text(ctx, `${String(Math.round(headingDeg)).padStart(3, '0')}°`, 500, y + 56, 16, '#fff', 'center', true);
  text(ctx, 'HDG', 500, y + 92, 11, '#9fb4c8', 'center');
  ctx.restore();
  // Fuel and throttle bars on the panel.
  text(ctx, 'FUEL', 570, y + 34, 11, '#cfe0f0', 'left', true);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(620, y + 28, 160, 12);
  ctx.fillStyle = plane.fuel < 24 ? '#ff5040' : '#7ee081';
  ctx.fillRect(620, y + 28, 160 * clamp(plane.fuel / 120, 0, 1), 12);
  text(ctx, 'THR', 570, y + 62, 11, '#cfe0f0', 'left', true);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(620, y + 56, 160, 12);
  ctx.fillStyle = '#7ec8ff';
  ctx.fillRect(620, y + 56, 160 * clamp(plane.throttle, 0, 1), 12);
  const status = plane.stalled ? 'STALL' : plane.fuel <= 0 ? 'GLIDING' : plane.damage > 0 ? `DAMAGE ${Math.round(plane.damage)}%` : 'FLYING';
  text(ctx, status, 820, y + 48, 15, status === 'FLYING' ? '#7ee081' : '#ff5040', 'left', true);
  text(ctx, `${G.mission.name}  •  SCORE ${G.score.points}`, 820, y + 78, 12, '#cfe0f0', 'left');
}

// ---- Title screen -------------------------------------------------

export function drawTitle(ctx, G) {
  const w = W, h = H;
  // Dark gradient over the orbiting valley view.
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(8,12,20,0.55)');
  g.addColorStop(0.55, 'rgba(8,12,20,0.25)');
  g.addColorStop(1, 'rgba(8,12,20,0.78)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  text(ctx, 'KESTREL RIDGE', w / 2, 92, 54, '#fff', 'center', true);
  text(ctx, 'ALPINE FLIGHT CHALLENGE', w / 2, 128, 18, '#ffd23e', 'center', true);
  text(ctx, 'One valley. One aeroplane. Four sorties. One tank of fuel.', w / 2, 156, 15, '#e8f0f8', 'center');

  const cardW = 272, cardH = 118, gap = 20;
  const total = cardW * 4 + gap * 3;
  const x0 = (w - total) / 2;
  G.titleCards = [];
  MISSIONS.forEach((m, i) => {
    const x = x0 + i * (cardW + gap);
    const y = 196;
    const best = loadBest(m.id);
    const hover = G.mouseX >= x && G.mouseX <= x + cardW && G.mouseY >= y && G.mouseY <= y + cardH;
    ctx.save();
    ctx.fillStyle = hover ? 'rgba(30,44,64,0.92)' : 'rgba(14,20,30,0.82)';
    ctx.strokeStyle = hover ? '#ffd23e' : 'rgba(255,255,255,0.3)';
    ctx.lineWidth = hover ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, cardW, cardH, 12);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    text(ctx, `[${m.key}]  ${m.name}`, x + 16, y + 24, 17, '#fff', 'left', true);
    text(ctx, m.blurb, x + 16, y + 52, 12, '#cfe0f0', 'left');
    text(ctx, m.par ? `Par ${formatTime(m.par)}` : 'No clock', x + 16, y + 78, 12, '#ffd23e', 'left');
    if (best > 0) text(ctx, `Best ${best}`, x + cardW - 16, y + 78, 12, '#7ee081', 'right', true);
    text(ctx, m.goal, x + 16, y + 100, 11, '#9fb4c8', 'left');
    G.titleCards.push({ x, y, w: cardW, h: cardH, mission: m });
  });

  // Livery and physics selectors.
  const y2 = 348;
  text(ctx, 'LIVERY', w / 2 - 330, y2, 13, '#cfe0f0', 'left', true);
  const liveries = [
    { id: 'crimson', label: 'Crimson' },
    { id: 'yellow', label: 'Sun Yellow' },
    { id: 'glacier', label: 'Glacier Blue' },
  ];
  G.liveryBtns = [];
  liveries.forEach((lv, i) => {
    const x = w / 2 - 330 + i * 150;
    const sel = G.livery === lv.id;
    ctx.save();
    ctx.fillStyle = sel ? 'rgba(255,210,62,0.9)' : 'rgba(14,20,30,0.8)';
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.roundRect(x, y2 + 12, 132, 34, 8);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    text(ctx, lv.label, x + 66, y2 + 30, 13, sel ? '#111' : '#fff', 'center', true);
    G.liveryBtns.push({ x, y: y2 + 12, w: 132, h: 34, id: lv.id });
  });
  text(ctx, 'HANDLING', w / 2 + 130, y2, 13, '#cfe0f0', 'left', true);
  const modes = [
    { id: 'forgiving', label: 'Forgiving' },
    { id: 'realistic', label: 'Realistic' },
  ];
  G.modeBtns = [];
  modes.forEach((md, i) => {
    const x = w / 2 + 130 + i * 150;
    const sel = G.physicsMode === md.id;
    ctx.save();
    ctx.fillStyle = sel ? 'rgba(255,210,62,0.9)' : 'rgba(14,20,30,0.8)';
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.roundRect(x, y2 + 12, 132, 34, 8);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    text(ctx, md.label, x + 66, y2 + 30, 13, sel ? '#111' : '#fff', 'center', true);
    G.modeBtns.push({ x, y: y2 + 12, w: 132, h: 34, id: md.id });
  });

  // Controls panel.
  const y3 = 428;
  panel(ctx, w / 2 - 430, y3, 860, 150);
  text(ctx, 'CONTROLS', w / 2, y3 + 22, 14, '#ffd23e', 'center', true);
  const rows = [
    'W / S — pitch up / down      A / D — bank and turn      Q / E — rudder',
    'Shift / Ctrl — throttle up / down      F — flaps      B — brake on the runway',
    'C — camera (chase / cockpit)      P — pause      R — restart      M — sound',
    'Mouse — hold left button and drag to steer      Right button — look around      1–4 — start a sortie',
  ];
  rows.forEach((r, i) => text(ctx, r, w / 2, y3 + 52 + i * 26, 13, '#e8f0f8', 'center'));
  text(ctx, 'Press 1–4 or click a card to fly.  Land on runway 09 to finish.', w / 2, y3 + 168, 13, '#ffd23e', 'center');
}

// ---- Pause and end screens ---------------------------------------

export function drawPause(ctx) {
  ctx.fillStyle = 'rgba(6,10,16,0.72)';
  ctx.fillRect(0, 0, W, H);
  text(ctx, 'PAUSED', W / 2, H / 2 - 40, 44, '#fff', 'center', true);
  text(ctx, 'P — resume      R — restart sortie      M — sound', W / 2, H / 2 + 16, 15, '#cfe0f0', 'center');
}

export function drawEnd(ctx, G) {
  ctx.fillStyle = 'rgba(6,10,16,0.78)';
  ctx.fillRect(0, 0, W, H);
  const crashed = G.mode === 'crashed';
  text(ctx, crashed ? 'FLIGHT OVER' : 'SORTIE COMPLETE', W / 2, 120, 40, crashed ? '#ff5040' : '#7ee081', 'center', true);
  text(ctx, crashed ? G.plane.crashReason : `${G.mission.name} — ${G.endTitle || ''}`, W / 2, 162, 18, '#fff', 'center');
  // Debrief lines.
  let y = 220;
  for (const line of G.debrief) {
    text(ctx, line.label, W / 2 - 180, y, 15, '#cfe0f0', 'left');
    text(ctx, line.value, W / 2 + 180, y, 15, '#fff', 'right', true);
    y += 30;
  }
  // Landing quality bars.
  if (G.landing) {
    y += 10;
    text(ctx, 'LANDING BREAKDOWN', W / 2, y, 14, '#ffd23e', 'center', true);
    y += 28;
    const parts = [
      { label: 'Centre line', frac: clamp(1 - G.landing.centreOffset / 40, 0, 1) },
      { label: 'Touchdown zone', frac: G.landing.zonePos >= 0.05 && G.landing.zonePos <= 0.45 ? 1 : 0.5 },
      { label: 'Sink rate', frac: clamp(1 - (G.landing.sink - 1.5) / 6, 0, 1) },
      { label: 'Wings level', frac: clamp(1 - G.landing.bank / 0.8, 0, 1) },
    ];
    for (const p of parts) {
      text(ctx, p.label, W / 2 - 180, y, 13, '#cfe0f0', 'left');
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(W / 2 - 40, y - 6, 220, 12);
      ctx.fillStyle = '#7ee081';
      ctx.fillRect(W / 2 - 40, y - 6, 220 * clamp(p.frac, 0, 1), 12);
      y += 26;
    }
  }
  text(ctx, `FINAL SCORE  ${G.score.points}`, W / 2, y + 16, 24, '#ffd23e', 'center', true);
  text(ctx, `Best for ${G.mission.name}: ${G.bestScore}`, W / 2, y + 50, 14, '#7ee081', 'center');
  text(ctx, 'R — fly again      1–4 — another sortie', W / 2, y + 92, 15, '#cfe0f0', 'center');
}
