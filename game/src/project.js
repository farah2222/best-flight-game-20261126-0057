// Three-component vectors, the aircraft attitude basis, the camera
// basis, and perspective projection with near-plane clipping.
// All drawing in the game goes through the helpers here.

export function v3(x, y, z) {
  return { x, y, z };
}

export function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(a, s) {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function length(a) {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}

export function norm(a) {
  const l = length(a) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}

// Forward direction from heading (0 = east, +pi/2 = south) and
// flight-path angle (positive = climbing). y is up, z is south.
export function forwardFrom(heading, gamma) {
  const c = Math.cos(gamma);
  return {
    x: Math.cos(heading) * c,
    y: Math.sin(gamma),
    z: Math.sin(heading) * c,
  };
}

// Orthonormal basis for the aeroplane: forward, right, up, built from
// heading, pitch (nose angle) and roll.
export function aircraftBasis(heading, pitch, roll) {
  const fwd = forwardFrom(heading, pitch);
  const rightFlat = { x: -Math.sin(heading), y: 0, z: Math.cos(heading) };
  const upFlat = cross(rightFlat, fwd);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const right = {
    x: rightFlat.x * cr + upFlat.x * sr,
    y: rightFlat.y * cr + upFlat.y * sr,
    z: rightFlat.z * cr + upFlat.z * sr,
  };
  const up = cross(fwd, right);
  return { fwd, right, up };
}

// Camera basis from a look direction and a world-up hint.
export function cameraBasis(lookDir, worldUp) {
  const fwd = norm(lookDir);
  let right = cross(fwd, worldUp);
  if (length(right) < 0.001) right = { x: 1, y: 0, z: 0 };
  right = norm(right);
  const up = cross(right, fwd);
  return { fwd, right, up };
}

export function makeCamera(pos, lookDir, fovDeg, aspect) {
  const basis = cameraBasis(lookDir, { x: 0, y: 1, z: 0 });
  const focal = focalFromFov(fovDeg);
  return { pos, ...basis, focal, aspect, fovDeg };
}

// Focal length in pixels for a vertical field of view on a 720-high view.
export function focalFromFov(fovDeg) {
  return (720 / 2) / Math.tan((fovDeg * Math.PI / 180) / 2);
}

// World point into camera space: x right, y up, z forward depth.
export function toCamera(cam, p) {
  const d = sub(p, cam.pos);
  return { x: dot(d, cam.right), y: dot(d, cam.up), z: dot(d, cam.fwd) };
}

// Camera-space point to screen pixels. Returns null behind the camera.
export function projectPoint(cam, p, w, h) {
  const c = toCamera(cam, p);
  if (c.z <= 0.5) return null;
  const s = cam.focal / c.z;
  return { x: w / 2 + c.x * s, y: h / 2 - c.y * s, z: c.z };
}

const NEAR = 4;

// Clip a polygon (camera-space points) against the near plane.
export function clipNear(poly) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const aIn = a.z >= NEAR;
    const bIn = b.z >= NEAR;
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const t = (NEAR - a.z) / (b.z - a.z);
      out.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: NEAR,
      });
    }
  }
  return out;
}

// Project a world-space polygon to screen space, clipping first.
// Returns null when nothing survives in front of the camera.
export function projectPoly(cam, worldPts, w, h) {
  const camPts = worldPts.map((p) => toCamera(cam, p));
  const clipped = clipNear(camPts);
  if (clipped.length < 3) return null;
  const pts = [];
  for (const c of clipped) {
    const s = cam.focal / c.z;
    pts.push({ x: w / 2 + c.x * s, y: h / 2 - c.y * s, z: c.z });
  }
  return pts;
}
