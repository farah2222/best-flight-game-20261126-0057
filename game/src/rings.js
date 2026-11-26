// The gate courses: where each ring sits, which way it faces, and
// how a crossing is detected from the positions either side of a tick.

import { groundHeight, RUNWAY } from './terrain.js';

export const GATE_RADIUS = 26;

function gate(x, z, y, label) {
  return { x, y, z, label: label || '', passed: false };
}

// Courses are data: a list of gates per mission kind.
export function courseFor(kind) {
  const rwy = { x: RUNWAY.cx, z: RUNWAY.cz };
  if (kind === 'ring') {
    return [
      gate(-100, 900, 160, 'Gate 1'),
      gate(500, 300, 220, 'Gate 2'),
      gate(1150, -950, 120, 'Gate 3'), // low over the lake
      gate(700, -1400, 450, 'Gate 4'), // high over the north-east ridge
      gate(100, -1200, 420, 'Gate 5'), // up over the ridge
      gate(-800, -700, 300, 'Gate 6'),
      gate(-1200, 400, 180, 'Gate 7'),
      gate(-700, 1250, 120, 'Gate 8'), // back toward the runway
    ];
  }
  if (kind === 'ridge') {
    return [
      gate(300, 1250, 200, 'Downwind'),
      gate(100, 1750, 160, 'Base'),
      gate(-1100, 1250, 110, 'Final'),
    ];
  }
  if (kind === 'free') {
    return [
      gate(600, 600, 200, 'Bonus 1'),
      gate(1150, -950, 120, 'Bonus 2'),
      gate(-1400, -1000, 350, 'Bonus 3'),
      gate(-400, -1600, 400, 'Bonus 4'),
      gate(0, 1600, 180, 'Bonus 5'),
    ];
  }
  if (kind === 'golden') {
    return [
      gate(200, 800, 180, 'Gate 1'),
      gate(1150, -950, 130, 'Gate 2'),
      gate(1200, -1400, 500, 'Gate 3'),
      gate(-200, -1400, 420, 'Gate 4'),
      gate(-1400, -300, 260, 'Gate 5'),
      gate(-900, 1250, 120, 'Gate 6'),
    ];
  }
  return [];
}

export function makeRings(kind) {
  const gates = courseFor(kind);
  return { gates, next: 0, passed: 0 };
}

// Each gate faces along the course INTO it: toward the gate from
// the previous gate (or from the runway for the first one), so the
// ring faces the aeroplane coming at it instead of edge-on.
export function gateFacing(rings, i) {
  const g = rings.gates[i];
  const prev = i > 0 ? rings.gates[i - 1] : { x: -600, z: RUNWAY.cz };
  return Math.atan2(g.z - prev.z, g.x - prev.x);
}

// Crossing test: did the segment from prev to now pierce the gate
// plane inside its radius? Interpolates to the crossing point.
export function checkGateCross(rings, prev, now) {
  const i = rings.next;
  if (i >= rings.gates.length) return null;
  const g = rings.gates[i];
  const facing = gateFacing(rings, i);
  const nx = Math.cos(facing);
  const nz = Math.sin(facing);
  const dPrev = (prev.x - g.x) * nx + (prev.z - g.z) * nz;
  const dNow = (now.x - g.x) * nx + (now.z - g.z) * nz;
  if (dPrev <= 0 && dNow > 0) {
    const t = -dPrev / (dNow - dPrev);
    const cx = prev.x + (now.x - prev.x) * t;
    const cy = prev.y + (now.y - prev.y) * t;
    const cz = prev.z + (now.z - prev.z) * t;
    const dy = cy - g.y;
    const dz = cz - g.z;
    const dx = cx - g.x;
    // Distance from the gate centre in the gate plane.
    const px = dx - (dx * nx + dz * nz) * nx;
    const pz = dz - (dx * nx + dz * nz) * nz;
    const dist = Math.sqrt(px * px + dy * dy + pz * pz);
    if (dist <= GATE_RADIUS) {
      g.passed = true;
      rings.next++;
      rings.passed++;
      return { gate: g, index: i, dist, speed: now.speed || 0 };
    }
  }
  return null;
}

export function nextGate(rings) {
  return rings.next < rings.gates.length ? rings.gates[rings.next] : null;
}

// Straight-line distance from the aeroplane to the next gate.
export function nextGateDistance(rings, plane) {
  const g = nextGate(rings);
  if (!g) return 0;
  return Math.hypot(g.x - plane.x, g.y - plane.y, g.z - plane.z);
}

export function gatesLeft(rings) {
  return rings.gates.length - rings.next;
}
