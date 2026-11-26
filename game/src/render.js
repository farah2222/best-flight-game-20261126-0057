// The software 3D renderer: sky, sun, clouds, terrain, runway,
// rings, trees, particles and the aeroplane itself, all drawn on
// one 2D canvas with a hand-rolled perspective projection.

import { makeCamera, projectPoint, projectPoly, toCamera, aircraftBasis, forwardFrom, norm, sub, add, scale, cross, dot } from './project.js';
import { heightAt, groundHeight, terrainColor, slopeAt, RUNWAY, LAKE, WORLD_HALF, isOnRunway } from './terrain.js';
import { lightingFor } from './weather.js';
import { nextGate, gateFacing, GATE_RADIUS } from './rings.js';
import { clamp, lerp, smoothstep } from './noise.js';
import { lakeGlitter } from './effects.js';

export const VIEW_W = 1280;
export const VIEW_H = 720;

const LIVERIES = {
  crimson: { body: [196, 38, 38], dark: [120, 20, 20], wing: [240, 228, 200], accent: [255, 210, 60] },
  yellow: { body: [232, 178, 32], dark: [150, 105, 10], wing: [250, 244, 214], accent: [40, 80, 160] },
  glacier: { body: [64, 132, 196], dark: [30, 70, 120], wing: [225, 236, 244], accent: [255, 120, 60] },
};

export function makeCameraState() {
  return { pos: { x: -620, y: 60, z: 1250 }, smooth: null, mode: 'chase', flybyT: 0 };
}

// Chase / cockpit camera, with spring lag, speed-based distance and
// FOV, terrain avoidance and a horizon that stays readable.
export function updateCamera(camState, plane, mode, dt, time) {
  const speed = plane.speed;
  const fwd = forwardFrom(plane.heading, plane.gamma);
  const basis = aircraftBasis(plane.heading, plane.pitch, plane.roll);
  let desired, lookAt, fov = 68, rollKeep = 0;
  if (mode === 'cockpit') {
    desired = add(add({ x: plane.x, y: plane.y, z: plane.z }, scale(fwd, 0.9)), { x: 0, y: 0.95, z: 0 });
    desired.y += Math.sin(time * 2.2) * 0.03;
    lookAt = add(desired, fwd);
    fov = 72;
    rollKeep = 1;
  } else if (mode === 'flyby') {
    const a = time * 0.5;
    desired = {
      x: plane.x + Math.cos(a) * 26,
      y: plane.y + 6 + Math.sin(a * 0.7) * 3,
      z: plane.z + Math.sin(a) * 26,
    };
    lookAt = { x: plane.x, y: plane.y, z: plane.z };
    fov = 62;
  } else {
    const dist = 12 + speed * 0.06;
    const height = 3.1 + speed * 0.014;
    desired = add(add({ x: plane.x, y: plane.y, z: plane.z }, scale(fwd, -dist)), { x: 0, y: height, z: 0 });
    // Never clip through the ridge: pull the camera in toward the
    // aeroplane and lift it just above the ground, so the view stays
    // level instead of dropping to a top-down shot.
    const gh = groundHeight(desired.x, desired.z) + 5;
    if (desired.y < gh) {
      const planePos = { x: plane.x, y: plane.y, z: plane.z };
      desired = {
        x: lerp(desired.x, planePos.x, 0.45),
        y: gh,
        z: lerp(desired.z, planePos.z, 0.45),
      };
    }
    lookAt = add(add({ x: plane.x, y: plane.y, z: plane.z }, scale(fwd, 16)), { x: 0, y: 1.2, z: 0 });
    fov = 68 + clamp(speed / 95, 0, 1) * 8;
    rollKeep = 0.35;
  }
  if (!camState.smooth) camState.smooth = { ...desired };
  const k = mode === 'cockpit' ? 1 : Math.min(1, dt / 0.25);
  camState.smooth.x = lerp(camState.smooth.x, desired.x, k);
  camState.smooth.y = lerp(camState.smooth.y, desired.y, k);
  camState.smooth.z = lerp(camState.smooth.z, desired.z, k);
  camState.pos = { ...camState.smooth };
  const lookDir = sub(lookAt, camState.pos);
  const cam = makeCamera(camState.pos, lookDir, fov, VIEW_W / VIEW_H);
  // Horizon stabilisation: keep only part of the aeroplane's roll.
  if (rollKeep < 1) {
    const ang = plane.roll * (1 - rollKeep);
    const c = Math.cos(ang), s = Math.sin(ang);
    const r = cam.right, u = cam.up;
    cam.right = { x: r.x * c + u.x * s, y: r.y * c + u.y * s, z: r.z * c + u.z * s };
    cam.up = { x: u.x * c - r.x * s, y: u.y * c - r.y * s, z: u.z * c - r.z * s };
  }
  return cam;
}

function rgb(c, a) {
  return a === undefined ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
}

function mix(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

// Three-step toon shade from a 0..1 light level.
function toon(level) {
  if (level > 0.72) return 1.0;
  if (level > 0.42) return 0.72;
  return 0.45;
}

function shadeColor(base, level, hazeColor, hazeAmt) {
  const s = toon(level);
  const c = [base[0] * s, base[1] * s, base[2] * s];
  return mix(c, hazeColor, clamp(hazeAmt, 0, 0.85));
}

export function drawScene(ctx, G) {
  const w = VIEW_W, h = VIEW_H;
  const light = lightingFor(G.lighting);
  const cam = G.cam;
  const plane = G.plane;
  const time = G.time;

  // --- Sky: gradient whose horizon slides with camera pitch.
  const pitch = Math.asin(clamp(cam.fwd.y, -1, 1));
  const horizonY = h / 2 - Math.tan(pitch) * cam.focal;
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, rgb(light.skyTop));
  sky.addColorStop(clamp(horizonY / h, 0.05, 0.95), rgb(light.skyMid));
  sky.addColorStop(1, rgb(light.skyHorizon));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // --- Sun disc with a warm glow.
  const sunPos = add(cam.pos, scale(light.sunDir, 2600));
  const sun = projectPoint(cam, sunPos, w, h);
  if (sun) {
    const glow = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, 130);
    glow.addColorStop(0, rgb(light.sunColor, 0.9 * light.sunGlare));
    glow.addColorStop(0.25, rgb(light.sunColor, 0.35 * light.sunGlare));
    glow.addColorStop(1, rgb(light.sunColor, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(sun.x - 140, sun.y - 140, 280, 280);
    ctx.fillStyle = rgb(light.sunColor);
    ctx.beginPath();
    ctx.arc(sun.x, sun.y, 26, 0, Math.PI * 2);
    ctx.fill();
  }

  drawClouds(ctx, cam, G.clouds, light, w, h);
  drawTerrain(ctx, cam, light, w, h);
  drawRunway(ctx, cam, light, G, w, h);
  drawRings(ctx, cam, G, w, h, time);
  drawTrees(ctx, cam, G.trees, light, w, h);
  drawParticles(ctx, cam, G.fx.particles, w, h);
  lakeGlitter(ctx, cam, LAKE, light, time, w, h);

  if (G.camMode === 'chase' || G.camMode === 'flyby') {
    drawPlane(ctx, cam, plane, light, time, w, h);
  } else {
    drawCockpitFrame(ctx, plane, w, h);
  }
}

function drawClouds(ctx, cam, clouds, light, w, h) {
  ctx.save();
  for (const c of clouds) {
    const p = projectPoint(cam, { x: c.x, y: c.y, z: c.z }, w, h);
    if (!p || p.z > 4200) continue;
    const s = (cam.focal / p.z) * c.s * 0.5;
    if (s < 4) continue;
    ctx.fillStyle = light.name === 'golden' ? 'rgba(255,214,170,0.55)' : 'rgba(255,255,255,0.6)';
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.ellipse(p.x + i * s * 0.55, p.y + (i === 0 ? -s * 0.12 : s * 0.08), s * 0.62, s * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawTerrain(ctx, cam, light, w, h) {
  const CELL = 90;
  const N = 33;
  const cx = Math.round(cam.pos.x / CELL) * CELL;
  const cz = Math.round(cam.pos.z / CELL) * CELL;
  const half = ((N - 1) / 2) * CELL;
  const sun = norm(light.sunDir);
  const quads = [];
  for (let iz = 0; iz < N - 1; iz++) {
    for (let ix = 0; ix < N - 1; ix++) {
      const x0 = cx - half + ix * CELL;
      const z0 = cz - half + iz * CELL;
      const x1 = x0 + CELL;
      const z1 = z0 + CELL;
      const mx = (x0 + x1) / 2;
      const mz = (z0 + z1) / 2;
      const d = Math.hypot(mx - cam.pos.x, mz - cam.pos.z);
      if (d > 2600) continue;
      const h00 = heightAt(x0, z0);
      const h10 = heightAt(x1, z0);
      const h01 = heightAt(x0, z1);
      const h11 = heightAt(x1, z1);
      const base = terrainColor(mx, mz, (h00 + h10 + h01 + h11) / 4);
      // Slope shading from the quad's normal against the sun.
      const nx = (h00 + h01 - h10 - h11) / (2 * CELL);
      const nz = (h00 + h10 - h01 - h11) / (2 * CELL);
      const nl = Math.sqrt(nx * nx + 1 + nz * nz);
      const nrm = { x: -nx / nl, y: 1 / nl, z: -nz / nl };
      const dl = clamp(dot(nrm, sun) * 0.6 + light.ambient, 0.15, 1.15);
      const hazeAmt = smoothstep(500, 2400, d) * light.hazeStrength;
      quads.push({
        pts: [
          { x: x0, y: h00, z: z0 }, { x: x1, y: h10, z: z0 },
          { x: x1, y: h11, z: z1 }, { x: x0, y: h01, z: z1 },
        ],
        color: shadeColor(base, dl, light.haze, hazeAmt),
        depth: d,
      });
    }
  }
  quads.sort((a, b) => b.depth - a.depth);
  ctx.save();
  for (const q of quads) {
    const sp = projectPoly(cam, q.pts, w, h);
    if (!sp) continue;
    ctx.fillStyle = rgb(q.color);
    ctx.beginPath();
    ctx.moveTo(sp[0].x, sp[0].y);
    for (let i = 1; i < sp.length; i++) ctx.lineTo(sp[i].x, sp[i].y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawRunway(ctx, cam, light, G, w, h) {
  const r = RUNWAY;
  const y = r.height + 0.4;
  const x0 = r.cx - r.length / 2, x1 = r.cx + r.length / 2;
  const z0 = r.cz - r.width / 2, z1 = r.cz + r.width / 2;
  const strip = projectPoly(cam, [
    { x: x0, y, z: z0 }, { x: x1, y, z: z0 },
    { x: x1, y, z: z1 }, { x: x0, y, z: z1 },
  ], w, h);
  if (!strip) return;
  ctx.save();
  ctx.fillStyle = '#3a3d42';
  ctx.beginPath();
  ctx.moveTo(strip[0].x, strip[0].y);
  for (let i = 1; i < strip.length; i++) ctx.lineTo(strip[i].x, strip[i].y);
  ctx.closePath();
  ctx.fill();
  // Centre-line dashes.
  ctx.fillStyle = '#f2f2ea';
  for (let d = 0; d < 12; d++) {
    const a = x0 + 30 + d * 48;
    const dash = projectPoly(cam, [
      { x: a, y: y + 0.1, z: r.cz - 1.2 }, { x: a + 24, y: y + 0.1, z: r.cz - 1.2 },
      { x: a + 24, y: y + 0.1, z: r.cz + 1.2 }, { x: a, y: y + 0.1, z: r.cz + 1.2 },
    ], w, h);
    if (!dash) continue;
    ctx.beginPath();
    ctx.moveTo(dash[0].x, dash[0].y);
    for (let i = 1; i < dash.length; i++) ctx.lineTo(dash[i].x, dash[i].y);
    ctx.closePath();
    ctx.fill();
  }
  // Threshold bars at both ends.
  ctx.fillStyle = '#f2f2ea';
  for (const tx of [x0 + 8, x1 - 8]) {
    const bar = projectPoly(cam, [
      { x: tx - 6, y: y + 0.1, z: z0 + 4 }, { x: tx + 6, y: y + 0.1, z: z0 + 4 },
      { x: tx + 6, y: y + 0.1, z: z1 - 4 }, { x: tx - 6, y: y + 0.1, z: z1 - 4 },
    ], w, h);
    if (!bar) continue;
    ctx.beginPath();
    ctx.moveTo(bar[0].x, bar[0].y);
    for (let i = 1; i < bar.length; i++) ctx.lineTo(bar[i].x, bar[i].y);
    ctx.closePath();
    ctx.fill();
  }
  // Runway number 09 at the east end.
  const num = projectPoint(cam, { x: x1 - 46, y: y + 0.2, z: r.cz }, w, h);
  if (num && num.z < 1200) {
    const s = clamp(900 / num.z, 0.4, 2.2);
    ctx.fillStyle = '#f2f2ea';
    ctx.font = `bold ${Math.round(34 * s)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('09', num.x, num.y);
  }
  // Lit edge lights at golden hour.
  if (light.edgeLights) {
    for (let d = 0; d <= 10; d++) {
      for (const zz of [z0 - 3, z1 + 3]) {
        const p = projectPoint(cam, { x: x0 + (d / 10) * r.length, y: y + 1, z: zz }, w, h);
        if (!p) continue;
        ctx.fillStyle = 'rgba(255,190,80,0.95)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  drawPapi(ctx, cam, G, w, h);
  ctx.restore();
}

// Four precision-approach lights beside the threshold: red or white
// by the aeroplane's glideslope.
function drawPapi(ctx, cam, G, w, h) {
  const plane = G.plane;
  const r = RUNWAY;
  const tx = r.cx - r.length / 2 + 30; // threshold end (west, runway 09)
  const dx = plane.x - tx;
  const dz = plane.z - (r.cz + 34);
  const dist = Math.hypot(dx, dz);
  if (dist < 30 || dist > 4000) return;
  const glide = Math.atan2(plane.y - (r.height + 2), Math.max(dist, 1)) * 180 / Math.PI;
  const whites = glide > 3.4 ? 4 : glide > 3.0 ? 3 : glide > 2.6 ? 2 : glide > 2.2 ? 1 : 0;
  for (let i = 0; i < 4; i++) {
    const p = projectPoint(cam, { x: tx, y: r.height + 2, z: r.cz + 30 + i * 7 }, w, h);
    if (!p) continue;
    ctx.fillStyle = i < whites ? 'rgba(255,255,255,0.95)' : 'rgba(255,40,40,0.95)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawRings(ctx, cam, G, w, h, time) {
  const rings = G.rings;
  if (!rings) return;
  ctx.save();
  for (let i = 0; i < rings.gates.length; i++) {
    const g = rings.gates[i];
    const facing = gateFacing(rings, i);
    const state = g.passed ? 'passed' : i === rings.next ? 'next' : 'later';
    if (state === 'passed') continue;
    const dist = Math.hypot(g.x - cam.pos.x, g.y - cam.pos.y, g.z - cam.pos.z);
    if (dist > 3600) continue;
    const pulse = state === 'next' ? 1 + 0.12 * Math.sin(time * 4) : 1;
    const radius = GATE_RADIUS * pulse;
    const nx = Math.cos(facing), nz = Math.sin(facing);
    // Circle in the plane facing the course: basis across and up.
    const across = { x: -nz, y: 0, z: nx };
    const up = { x: 0, y: 1, z: 0 };
    const pts = [];
    const N = 18;
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      pts.push({
        x: g.x + across.x * Math.cos(a) * radius + up.x * Math.sin(a) * radius,
        y: g.y + Math.sin(a) * radius,
        z: g.z + across.z * Math.cos(a) * radius + up.z * Math.sin(a) * radius,
      });
    }
    const sp = pts.map((p) => projectPoint(cam, p, w, h)).filter(Boolean);
    if (sp.length < 6) continue;
    const col = state === 'next' ? '255,190,40' : '70,160,255';
    // Soft halo, then the bright core line.
    ctx.strokeStyle = `rgba(${col},0.22)`;
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(sp[0].x, sp[0].y);
    for (let k = 1; k < sp.length; k++) ctx.lineTo(sp[k].x, sp[k].y);
    ctx.closePath();
    ctx.stroke();
    ctx.strokeStyle = `rgba(${col},0.95)`;
    ctx.lineWidth = 4;
    ctx.stroke();
    // Label above the next gate.
    if (state === 'next') {
      const top = projectPoint(cam, { x: g.x, y: g.y + radius + 8, z: g.z }, w, h);
      if (top) {
        ctx.fillStyle = `rgba(255,205,70,0.95)`;
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(g.label || `Gate ${i + 1}`, top.x, top.y);
      }
    }
  }
  ctx.restore();
}

function drawTrees(ctx, cam, trees, light, w, h) {
  const sun = norm(light.sunDir);
  const items = [];
  for (const t of trees) {
    const d = Math.hypot(t.x - cam.pos.x, t.y - cam.pos.y, t.z - cam.pos.z);
    if (d > 1500 || d < 8) continue;
    items.push({ t, d });
  }
  items.sort((a, b) => b.d - a.d);
  ctx.save();
  for (const { t } of items) {
    const base = projectPoint(cam, { x: t.x, y: t.y, z: t.z }, w, h);
    const top = projectPoint(cam, { x: t.x, y: t.y + t.s * 2.2, z: t.z }, w, h);
    const mid = projectPoint(cam, { x: t.x, y: t.y + t.s * 1.1, z: t.z }, w, h);
    if (!base || !top || !mid) continue;
    const halfW = Math.max(2, (t.s * cam.focal) / Math.max(base.z, 1) * 0.55);
    const shade = 0.75 + 0.25 * clamp(dot({ x: 0, y: 0, z: 1 }, sun), 0, 1);
    const g = Math.round(96 * shade * t.shade);
    ctx.fillStyle = `rgb(34,${g},44)`;
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(mid.x - halfW * 0.7, mid.y);
    ctx.lineTo(mid.x + halfW * 0.7, mid.y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgb(26,${Math.round(g * 0.85)},36)`;
    ctx.beginPath();
    ctx.moveTo(mid.x, mid.y - (base.y - mid.y) * 0.4);
    ctx.lineTo(base.x - halfW, base.y);
    ctx.lineTo(base.x + halfW, base.y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawParticles(ctx, cam, particles, w, h) {
  ctx.save();
  for (const p of particles) {
    const sp = projectPoint(cam, { x: p.x, y: p.y, z: p.z }, w, h);
    if (!sp) continue;
    const a = clamp(p.life / p.maxLife, 0, 1);
    const rBase = Math.max(1, p.size * (cam.focal / Math.max(sp.z, 1)) * 0.05);
    const r = p.color === 'dust' ? rBase * 0.55 : rBase;
    if (p.color === 'smoke') ctx.fillStyle = `rgba(60,60,60,${0.5 * a})`;
    else if (p.color === 'dust') ctx.fillStyle = `rgba(210,190,150,${0.3 * a})`;
    else ctx.fillStyle = `rgba(255,180,60,${0.8 * a})`;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// The aeroplane as flat-shaded faceted faces with a dark outline
// and a warm rim on the sun side.
function drawPlane(ctx, cam, plane, light, time, w, h) {
  const L = LIVERIES[plane.livery] || LIVERIES.crimson;
  const basis = aircraftBasis(plane.heading, plane.pitch, plane.roll);
  const pos = { x: plane.x, y: plane.y, z: plane.z };
  const local = (f, u, r) => add(add(add(pos, scale(basis.fwd, f)), scale(basis.up, u)), scale(basis.right, r));
  const sun = norm(light.sunDir);
  const faces = [];
  const addFace = (pts, color, rim) => {
    // Face normal from the first three points.
    const a = sub(pts[1], pts[0]);
    const b = sub(pts[2], pts[0]);
    const n = norm(cross(a, b));
    const dl = clamp(dot(n, sun) * 0.55 + 0.55, 0.25, 1.1);
    const s = toon(dl);
    let c = [color[0] * s, color[1] * s, color[2] * s];
    if (rim && dot(n, sun) > 0.5) c = mix(c, [255, 200, 120], 0.25);
    const sp = projectPoly(cam, pts, w, h);
    if (!sp) return;
    const depth = pts.reduce((acc, p) => acc + Math.hypot(p.x - cam.pos.x, p.y - cam.pos.y, p.z - cam.pos.z), 0) / pts.length;
    faces.push({ sp, c, depth });
  };
  const B = L.body, D = L.dark, Wg = L.wing;
  // Fuselage: tapered prism, nose at +3.6, tail at -3.4.
  addFace([local(3.6, 0.1, 0), local(1.2, 0.75, 0.55), local(-3.2, 0.55, 0.4), local(-3.4, 0.35, 0)], B, true);
  addFace([local(3.6, 0.1, 0), local(-3.4, 0.35, 0), local(-3.2, 0.55, -0.4), local(1.2, 0.75, -0.55)], B, true);
  addFace([local(3.6, 0.1, 0), local(1.2, -0.55, 0.55), local(-3.2, -0.4, 0.4), local(-3.4, -0.2, 0)], D, false);
  addFace([local(3.6, 0.1, 0), local(-3.4, -0.2, 0), local(-3.2, -0.4, -0.4), local(1.2, -0.55, -0.55)], D, false);
  addFace([local(1.2, 0.75, 0.55), local(1.2, 0.75, -0.55), local(-3.2, 0.55, -0.4), local(-3.2, 0.55, 0.4)], B, true);
  addFace([local(1.2, -0.55, 0.55), local(-3.2, -0.4, 0.4), local(-3.2, -0.4, -0.4), local(1.2, -0.55, -0.55)], D, false);
  addFace([local(-3.4, 0.35, 0), local(-3.2, 0.55, 0.4), local(-3.2, -0.4, 0.4), local(-3.4, -0.2, 0)], D, false);
  addFace([local(-3.4, 0.35, 0), local(-3.4, -0.2, 0), local(-3.2, -0.4, -0.4), local(-3.2, 0.55, -0.4)], D, false);
  // High wing: cream, span 10.6.
  addFace([local(1.0, 0.78, 5.3), local(-0.6, 0.78, 5.3), local(-0.6, 0.78, -5.3), local(1.0, 0.78, -5.3)], Wg, true);
  addFace([local(1.0, 0.68, 5.3), local(1.0, 0.68, -5.3), local(-0.6, 0.68, -5.3), local(-0.6, 0.68, 5.3)], [190, 180, 158], false);
  // Tailplane and fin.
  addFace([local(-2.6, 0.5, 1.7), local(-3.4, 0.5, 1.7), local(-3.4, 0.5, -1.7), local(-2.6, 0.5, -1.7)], Wg, true);
  addFace([local(-2.7, 0.5, 0), local(-3.4, 0.5, 0), local(-3.4, 1.9, 0), local(-2.7, 1.5, 0)], B, true);
  // Canopy: blue-tinted glass.
  addFace([local(2.2, 0.6, 0.45), local(1.0, 0.95, 0.5), local(0.2, 0.85, 0.45), local(1.6, 0.35, 0.5)], [90, 150, 210], true);
  addFace([local(2.2, 0.6, -0.45), local(1.6, 0.35, -0.5), local(0.2, 0.85, -0.45), local(1.0, 0.95, -0.5)], [90, 150, 210], true);
  addFace([local(1.0, 0.95, 0.5), local(1.0, 0.95, -0.5), local(0.2, 0.85, -0.45), local(0.2, 0.85, 0.45)], [120, 175, 225], true);
  // Landing gear legs and wheels.
  addFace([local(0.6, -0.55, 0.5), local(0.6, -1.5, 0.5), local(0.6, -1.5, 0.7), local(0.6, -0.55, 0.7)], [40, 40, 44], false);
  addFace([local(0.6, -0.55, -0.5), local(0.6, -0.55, -0.7), local(0.6, -1.5, -0.7), local(0.6, -1.5, -0.5)], [40, 40, 44], false);
  faces.sort((a, b) => b.depth - a.depth);
  ctx.save();
  for (const f of faces) {
    ctx.fillStyle = rgb(f.c);
    ctx.beginPath();
    ctx.moveTo(f.sp[0].x, f.sp[0].y);
    for (let i = 1; i < f.sp.length; i++) ctx.lineTo(f.sp[i].x, f.sp[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,10,10,0.55)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  // Spinning propeller disc with a moving blade line.
  const hub = local(3.75, 0.1, 0);
  const hubP = projectPoint(cam, hub, w, h);
  if (hubP) {
    const discR = clamp((2.1 * cam.focal) / Math.max(hubP.z, 1), 4, 90);
    ctx.fillStyle = 'rgba(235,226,210,0.10)';
    ctx.beginPath();
    ctx.arc(hubP.x, hubP.y, discR, 0, Math.PI * 2);
    ctx.fill();
    const ba = time * 28;
    const bx = Math.cos(ba) * discR, by = Math.sin(ba) * discR;
    ctx.strokeStyle = 'rgba(30,30,34,0.7)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(hubP.x - bx, hubP.y - by);
    ctx.lineTo(hubP.x + bx, hubP.y + by);
    ctx.stroke();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(hubP.x, hubP.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Navigation lights: red left, green right, white tail.
  const lights = [
    { p: local(0.2, 0.78, -5.3), c: 'rgba(255,60,60,0.95)' },
    { p: local(0.2, 0.78, 5.3), c: 'rgba(60,255,120,0.95)' },
    { p: local(-3.4, 0.4, 0), c: 'rgba(255,255,255,0.95)' },
  ];
  for (const l of lights) {
    const sp = projectPoint(cam, l.p, w, h);
    if (!sp) continue;
    ctx.fillStyle = l.c;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Cockpit view: glareshield, nose peeking over the panel, canopy pillars.
function drawCockpitFrame(ctx, plane, w, h) {
  ctx.save();
  const grad = ctx.createLinearGradient(0, h * 0.62, 0, h);
  grad.addColorStop(0, '#2a2d33');
  grad.addColorStop(1, '#14161a');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.78);
  ctx.quadraticCurveTo(w / 2, h * 0.6, w, h * 0.78);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();
  // Nose cone peeking over the panel.
  ctx.fillStyle = '#a02828';
  ctx.beginPath();
  ctx.moveTo(w / 2 - 70, h * 0.66);
  ctx.quadraticCurveTo(w / 2, h * 0.58, w / 2 + 70, h * 0.66);
  ctx.lineTo(w / 2 + 46, h * 0.72);
  ctx.lineTo(w / 2 - 46, h * 0.72);
  ctx.closePath();
  ctx.fill();
  // Canopy pillars at the edges.
  ctx.fillStyle = 'rgba(18,20,24,0.9)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w * 0.045, 0);
  ctx.lineTo(w * 0.02, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w, 0);
  ctx.lineTo(w * 0.955, 0);
  ctx.lineTo(w * 0.98, h);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
