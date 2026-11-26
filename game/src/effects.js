// Screen shake, speed streaks, the gravity vignette and the sun
// glitter on the lake. All of it decays smoothly — never a random
// offset per frame.

import { clamp } from './noise.js';

export function makeEffects() {
  return {
    trauma: 0,
    particles: [],
    time: 0,
  };
}

export function addTrauma(fx, amount) {
  fx.trauma = clamp(fx.trauma + amount, 0, 1);
}

// Trauma decays; the shake offset is a smooth function of time.
export function shakeOffset(fx, dt) {
  fx.trauma = Math.max(0, fx.trauma - dt * 1.4);
  const s = fx.trauma * fx.trauma * 14;
  const t = fx.time * 31;
  return {
    x: s * (Math.sin(t * 1.1) * 0.6 + Math.sin(t * 2.3) * 0.4),
    y: s * (Math.cos(t * 1.7) * 0.6 + Math.sin(t * 2.9) * 0.4),
  };
}

export function spawnBurst(fx, x, y, z, n, color, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const e = Math.random() * Math.PI - Math.PI / 2;
    fx.particles.push({
      x, y, z,
      vx: Math.cos(a) * Math.cos(e) * speed * (0.4 + Math.random() * 0.8),
      vy: Math.sin(e) * speed * 0.6 + 2,
      vz: Math.sin(a) * Math.cos(e) * speed * (0.4 + Math.random() * 0.8),
      life: 0.6 + Math.random() * 0.9,
      maxLife: 1.5,
      size: 2 + Math.random() * 5,
      color,
    });
  }
}

export function spawnSmoke(fx, x, y, z, dt) {
  if (Math.random() < dt * 22) {
    fx.particles.push({
      x: x + (Math.random() - 0.5) * 2,
      y: y + (Math.random() - 0.5) * 1,
      z: z + (Math.random() - 0.5) * 2,
      vx: (Math.random() - 0.5) * 2, vy: 1.5 + Math.random() * 2,
      vz: (Math.random() - 0.5) * 2,
      life: 1.2 + Math.random() * 0.8, maxLife: 2,
      size: 4 + Math.random() * 6,
      color: 'smoke',
    });
  }
}

export function spawnDust(fx, x, y, z, n) {
  for (let i = 0; i < n; i++) {
    fx.particles.push({
      x: x + (Math.random() - 0.5) * 8,
      y: y + Math.random() * 1.5,
      z: z + (Math.random() - 0.5) * 4,
      vx: (Math.random() - 0.5) * 6, vy: 1 + Math.random() * 2,
      vz: (Math.random() - 0.5) * 6,
      life: 0.5 + Math.random() * 0.7, maxLife: 1.2,
      size: 3 + Math.random() * 5,
      color: 'dust',
    });
  }
}

export function updateParticles(fx, dt) {
  for (const p of fx.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    p.vy -= 1.2 * dt;
    p.life -= dt;
  }
  fx.particles = fx.particles.filter((p) => p.life > 0);
  if (fx.particles.length > 220) fx.particles.length = 220;
}

// Speed streaks at the screen edges, only when really moving.
export function drawStreaks(ctx, w, h, speedMs, cameraMode) {
  if (cameraMode !== 'chase' || speedMs < 62) return;
  const k = clamp((speedMs - 62) / 35, 0, 1);
  ctx.save();
  ctx.strokeStyle = `rgba(255,255,255,${0.35 * k})`;
  ctx.lineWidth = 2;
  for (let i = 0; i < 10; i++) {
    const y = ((i * 97 + 31) % 100) / 100 * h;
    const len = 40 + k * 120;
    const side = i % 2 === 0 ? 0 : w;
    const x0 = side === 0 ? 6 : w - 6;
    const dir = side === 0 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + dir * len, y);
    ctx.stroke();
  }
  ctx.restore();
}

// Dark corners when the flight gets heavy (high g / damage).
export function drawVignette(ctx, w, h, amount) {
  if (amount <= 0.01) return;
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(10,8,6,${clamp(amount, 0, 0.55)})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// Moving glitter where the sun hits the lake.
export function lakeGlitter(ctx, cam, lake, light, time, w, h) {
  const sun = light.sunDir;
  const gx = lake.cx + sun.x * 300;
  const gz = lake.cz + sun.z * 300;
  const p = { x: gx, y: 7, z: gz };
  // Project manually through the camera basis.
  const dx = p.x - cam.pos.x;
  const dy = p.y - cam.pos.y;
  const dz = p.z - cam.pos.z;
  const cx = dx * cam.right.x + dy * cam.right.y + dz * cam.right.z;
  const cy = dx * cam.up.x + dy * cam.up.y + dz * cam.up.z;
  const cz = dx * cam.fwd.x + dy * cam.fwd.y + dz * cam.fwd.z;
  if (cz < 10) return;
  const s = cam.focal / cz;
  const px = w / 2 + cx * s;
  const py = h / 2 - cy * s;
  if (px < -100 || px > w + 100 || py < -100 || py > h + 100) return;
  ctx.save();
  for (let i = 0; i < 14; i++) {
    const a = i * 2.4 + time * 0.7;
    const r = 18 + (i % 5) * 26;
    const x = px + Math.cos(a) * r;
    const y = py + Math.sin(a) * r * 0.4;
    const tw = 0.25 + 0.35 * Math.abs(Math.sin(time * 2 + i));
    ctx.fillStyle = `rgba(255,240,190,${tw})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 7 + (i % 3) * 3, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
