// The valley itself: height, lake, runway, trees and ground colours.
// One height function drives both the picture and the physics, so
// the ground you see is the ground you can hit.

import { fbm, ridged, clamp, smoothstep, makeRng } from './noise.js';

export const WORLD_HALF = 2100;
export const VALLEY_FLOOR = 30;
export const LAKE_LEVEL = 6;
export const RUNWAY = {
  cx: -350, cz: 1250, length: 620, width: 46, height: 34,
  heading: 0, // runway 09 points east
};
export const LAKE = { cx: 1150, cz: -950, rx: 520, rz: 380 };

const SEED = 20261126;

// Gentle S-curve of the valley floor axis: x offset as a function of z.
export function valleyAxisX(z) {
  return 260 * Math.sin(z * 0.00055) + 120 * Math.sin(z * 0.0013 + 1.7);
}

function inLake(x, z) {
  const dx = (x - LAKE.cx) / LAKE.rx;
  const dz = (z - LAKE.cz) / LAKE.rz;
  return dx * dx + dz * dz < 1;
}

function nearRunway(x, z) {
  const dx = Math.abs(x - RUNWAY.cx);
  const dz = Math.abs(z - RUNWAY.cz);
  return dx < RUNWAY.length / 2 + 60 && dz < RUNWAY.width / 2 + 60;
}

export function isOnRunway(x, z) {
  return Math.abs(x - RUNWAY.cx) < RUNWAY.length / 2 &&
    Math.abs(z - RUNWAY.cz) < RUNWAY.width / 2;
}

export function inLakeArea(x, z) {
  return inLake(x, z);
}

export function heightAt(x, z) {
  // Rolling base plus sharp ridged crests.
  const base = fbm(x + 900, z - 400, 620, 4, SEED) * 170;
  const crest = ridged(x, z, 520, 4, SEED + 31) * 260;
  let h = 12 + base + crest;
  // The rim rises toward the map edges, enclosing the valley.
  const edge = Math.max(Math.abs(x), Math.abs(z)) / WORLD_HALF;
  h += smoothstep(0.55, 1.0, edge) * 420;
  // Flatten the valley floor along its S-curve.
  const distAxis = Math.abs(x - valleyAxisX(z));
  const flat = 1 - smoothstep(150, 800, distAxis);
  h = h * (1 - flat) + VALLEY_FLOOR * flat;
  // A flat apron around the runway and along its final approach,
  // so the strip and the last stretch of the approach sit on level
  // ground, blending out over a few hundred metres.
  const rx = clamp(x, RUNWAY.cx - 1050, RUNWAY.cx + RUNWAY.length / 2);
  const dRwy = Math.hypot(x - rx, z - RUNWAY.cz);
  const apron = 1 - smoothstep(90, 340, dRwy);
  h = h * (1 - apron) + RUNWAY.height * apron;
  // The lake basin sits low: a bowl around the lake pulls the
  // hillsides down toward the water, so the shore reads as a shore.
  const ldx = (x - LAKE.cx) / (LAKE.rx + 220);
  const ldz = (z - LAKE.cz) / (LAKE.rz + 220);
  const lakeDist = Math.sqrt(ldx * ldx + ldz * ldz);
  const bowl = 1 - smoothstep(0.7, 1.0, lakeDist);
  h = h * (1 - bowl) + 22 * bowl;
  if (inLake(x, z)) {
    const dx = (x - LAKE.cx) / LAKE.rx;
    const dz = (z - LAKE.cz) / LAKE.rz;
    const d = Math.sqrt(dx * dx + dz * dz);
    const rim = smoothstep(0.75, 1.0, d);
    h = 2 + (h - 2) * rim;
  }
  // The runway strip is dead flat at its published height.
  if (nearRunway(x, z)) {
    const dx = Math.abs(x - RUNWAY.cx) / (RUNWAY.length / 2 + 60);
    const dz = Math.abs(z - RUNWAY.cz) / (RUNWAY.width / 2 + 60);
    const m = Math.max(dx, dz);
    const w = 1 - smoothstep(0.55, 1.0, m);
    h = h * (1 - w) + RUNWAY.height * w;
  }
  return h;
}

export function groundHeight(x, z) {
  return heightAt(x, z);
}

// Approximate slope from a small central difference.
export function slopeAt(x, z) {
  const e = 6;
  const dx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
  const dz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  return Math.sqrt(dx * dx + dz * dz);
}

// Ground colour by height, slope and a patchy second noise field.
export function terrainColor(x, z, h) {
  const patch = fbm(x + 77, z - 31, 240, 3, SEED + 77);
  const slope = slopeAt(x, z);
  let r, g, b;
  if (inLake(x, z)) {
    return [52, 96, 128];
  }
  if (h > 300 || (h > 235 && slope > 0.55)) {
    // Snow on the high tops.
    if (h > 300) { r = 232; g = 238; b = 244; }
    else { r = 118; g = 108; b = 98; } // grey-brown rock
  } else if (h > 235 || slope > 0.6) {
    r = 118; g = 108; b = 98;
  } else if (h < 14) {
    r = 198; g = 178; b = 128; // sand near the waterline
  } else {
    // Meadow green, varied into field patches.
    const v = 0.82 + patch * 0.36;
    r = Math.round(96 * v);
    g = Math.round(148 * v);
    b = Math.round(72 * v);
    if (patch > 0.72) { r = 168; g = 158; b = 92; } // dry field patch
  }
  return [r, g, b];
}

// Deterministic pine scatter: valley floor and lower slopes only.
export function makeTrees() {
  const rng = makeRng(4242);
  const trees = [];
  let tries = 0;
  while (trees.length < 520 && tries < 20000) {
    tries++;
    const x = (rng() * 2 - 1) * (WORLD_HALF - 80);
    const z = (rng() * 2 - 1) * (WORLD_HALF - 80);
    if (isOnRunway(x, z)) continue;
    // Keep a clear margin around the runway strip.
    if (Math.abs(x - RUNWAY.cx) < RUNWAY.length / 2 + 45 &&
      Math.abs(z - RUNWAY.cz) < RUNWAY.width / 2 + 45) continue;
    if (inLake(x, z)) continue;
    const h = heightAt(x, z);
    if (h > 210) continue;
    if (slopeAt(x, z) > 0.7) continue;
    const s = 9 + rng() * 9;
    trees.push({ x, z, y: h, s, shade: 0.8 + rng() * 0.4 });
  }
  return trees;
}

export function makeClouds() {
  const rng = makeRng(777);
  const clouds = [];
  for (let i = 0; i < 26; i++) {
    clouds.push({
      x: (rng() * 2 - 1) * 1900,
      y: 420 + rng() * 260,
      z: (rng() * 2 - 1) * 1900,
      s: 90 + rng() * 160,
      drift: 2 + rng() * 3,
    });
  }
  return clouds;
}
