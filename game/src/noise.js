// Seeded randomness and smooth fractal noise for the valley.
// Everything in the world derives from a fixed seed, so the same
// valley, trees and clouds appear on every run.

export function makeRng(seed) {
  let s = seed >>> 0;
  if (s === 0) s = 0x9e3779b9;
  return function next() {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function hash2(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 974634211) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

// Smooth value noise on a grid of the given cell size.
export function valueNoise(x, z, cell, seed) {
  const gx = x / cell;
  const gz = z / cell;
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const fx = smooth(gx - ix);
  const fz = smooth(gz - iz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  const top = a + (b - a) * fx;
  const bot = c + (d - c) * fx;
  return top + (bot - top) * fz;
}

// Fractal sum of value noise across octaves, output roughly 0..1.
export function fbm(x, z, cell, octaves, seed) {
  let sum = 0;
  let amp = 0.5;
  let total = 0;
  let c = cell;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(x, z, c, seed + o * 131);
    total += amp;
    amp *= 0.5;
    c *= 0.5;
  }
  return sum / total;
}

// Ridged variant: sharp crests, good for the high peaks.
export function ridged(x, z, cell, octaves, seed) {
  let sum = 0;
  let amp = 0.55;
  let total = 0;
  let c = cell;
  for (let o = 0; o < octaves; o++) {
    const n = valueNoise(x, z, c, seed + 977 + o * 57);
    const r = 1 - Math.abs(2 * n - 1);
    sum += amp * r * r;
    total += amp;
    amp *= 0.5;
    c *= 0.45;
  }
  return sum / total;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// A random value in [lo, hi) from a seeded generator.
export function randRange(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(a, b, t) {
  const x = clamp((t - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
}
