// The force-balance flight model. All physics runs in SI units and
// the display converts to knots and feet elsewhere. One fixed tick
// is 1/120 s; the main loop calls stepFlight that often.

import { clamp, lerp } from './noise.js';
import { groundHeight, isOnRunway, inLakeArea, RUNWAY, WORLD_HALF } from './terrain.js';

export const GRAV = 9.81;
export const MASS = 1150;
export const WING_AREA = 16.5;
export const MAX_THRUST = 4100;
export const FUEL_CAPACITY = 120; // kg
export const STALL_SPEED = 26;
export const GEAR_HEIGHT = 1.6;

export function makePlane(livery) {
  return {
    x: -600, y: RUNWAY.height + GEAR_HEIGHT, z: RUNWAY.cz,
    heading: 0, gamma: 0, pitch: 0, roll: 0,
    speed: 0, throttle: 0, flaps: false,
    fuel: FUEL_CAPACITY, damage: 0,
    onGround: true, crashed: false, crashReason: '',
    landed: false, stalled: false,
    rpm: 0, aoa: 0, sinkRate: 0, trim: 0.08,
    livery: livery || 'crimson',
    distance: 0, maxAlt: 0,
  };
}

export function airDensity(y) {
  // ISA-style falloff with altitude.
  return 1.225 * Math.exp(-y / 8500);
}

// Lift coefficient vs angle of attack: rises to a peak near 15
// degrees, then falls away softly past the stall.
export function liftCoeff(alphaDeg, flaps) {
  const a = alphaDeg * Math.PI / 180;
  let cl = 0.25 + 5.1 * a;
  const peak = 15;
  if (alphaDeg > peak) {
    const over = alphaDeg - peak;
    cl = 0.25 + 5.1 * (peak * Math.PI / 180) - 0.055 * over - 0.0012 * over * over;
  }
  if (alphaDeg < -6) cl = 0.25 + 5.1 * (-6 * Math.PI / 180);
  if (flaps) cl += 0.35;
  return cl;
}

export function stepFlight(plane, input, env, dt) {
  // A wrecked aeroplane stays a wreck: it rolls to a stop and no
  // further landing or crash event fires for it.
  if (plane.crashed) {
    plane.speed = Math.max(0, plane.speed - 25 * dt);
    plane.onGround = true;
    return null;
  }
  const { wind, time } = env;
  const rho = airDensity(plane.y);
  const v = Math.max(plane.speed, 0.1);

  // Engine spools toward its target instead of snapping.
  const targetRpm = plane.fuel > 0 ? plane.throttle : 0;
  plane.rpm += (targetRpm - plane.rpm) * Math.min(1, dt / 0.5);
  const thrust = plane.rpm * MAX_THRUST * (rho / 1.225);

  const alphaDeg = (plane.pitch - plane.gamma) * 180 / Math.PI;
  plane.aoa = alphaDeg;
  let cl = liftCoeff(alphaDeg, plane.flaps);

  const groundH = groundHeight(plane.x, plane.z);
  const agl = plane.y - groundH;
  // Ground effect: a little extra lift, a little less induced drag.
  let groundFactor = 1;
  let inducedFactor = 1;
  if (agl < 11 && agl > 0) {
    groundFactor = 1 + 0.13 * (1 - agl / 11);
    inducedFactor = 1 - 0.2 * (1 - agl / 11);
  }
  cl *= groundFactor;

  const q = 0.5 * rho * v * v;
  const lift = q * WING_AREA * cl;
  let cd = 0.030 + 0.045 * cl * cl * inducedFactor + 0.010;
  if (plane.flaps) cd += 0.045;
  const drag = q * WING_AREA * cd;

  const weight = MASS * GRAV;

  if (plane.onGround) {
    // Rolling: thrust fights drag and rolling friction.
    const accel = (thrust - drag - 0.03 * weight) / MASS;
    plane.speed = Math.max(0, plane.speed + accel * dt);
    if (input.brake) plane.speed = Math.max(0, plane.speed - 6 * dt);
    plane.gamma = 0;
    // Rotating: pull the nose up to raise the angle of attack. In the
    // forgiving mode the aeroplane also starts to rotate on its own
    // once it is fast enough — but only when the throttle is up and
    // the brake is off, so a fast landing roll never rotates itself
    // back into the air.
    let pull = input.pitch;
    if (env.assist && plane.speed > 29 && plane.throttle > 0.5 && !input.brake) {
      pull = Math.max(pull, 0.6);
    }
    plane.pitch = plane.gamma + pull * 0.24;
    // Rotate when the wing, at this attitude, can carry the weight.
    const clNow = liftCoeff(plane.pitch * 180 / Math.PI, plane.flaps) * groundFactor;
    if (q * WING_AREA * clNow > weight * 0.98 && plane.speed > 26) {
      plane.onGround = false;
      plane.gamma = 0.10;
    }
  } else {
    const aAlong = (thrust - drag) / MASS - GRAV * Math.sin(plane.gamma);
    plane.speed = Math.max(0, plane.speed + aAlong * dt);
    const gammaDot = (lift * Math.cos(plane.roll) - weight * Math.cos(plane.gamma)) / (MASS * v);
    plane.gamma += gammaDot * dt;
    plane.gamma = clamp(plane.gamma, -0.6, 0.55);
    // Bank turns the nose; rudder adds a small direct yaw.
    const turnRate = (GRAV * Math.tan(plane.roll)) / Math.max(v, 8);
    plane.heading += (turnRate + input.rudder * 0.12) * dt;
  }

  // Control feel: roll and pitch chase their targets with momentum.
  const rollTarget = plane.onGround ? 0 : clamp(input.roll, -1, 1) * 0.96;
  const rollRate = plane.onGround ? 8 : 5.5;
  plane.roll += (rollTarget - plane.roll) * Math.min(1, dt * rollRate);
  plane.roll *= (1 - plane.damage * 0.004); // damage dulls roll authority
  if (!plane.onGround) {
    const pitchRate = 4.5;
    // Trim holds altitude hands-off: the angle of attack that makes
    // lift carry the weight at the current speed (and bank), so the
    // aeroplane flies level with the stick centred and only climbs
    // or descends when the pilot pulls or pushes. The trim moves
    // slowly, like a real trim tab, so a flare or a gust changes the
    // flight path for a moment and the aeroplane then settles back
    // instead of holding the new angle forever. Near the stall no
    // trim can hold it, and the wing gives up as it should.
    const qNow = 0.5 * rho * v * v;
    const clNeed = weight / (qNow * WING_AREA * Math.max(0.4, Math.cos(plane.roll)));
    // Flaps already add lift, so the trim asks for less angle of
    // attack with them down — otherwise a flaps-down approach balloons.
    const flapLift = plane.flaps ? 0.35 : 0;
    const trimTarget = clamp((clNeed - flapLift - 0.25) / 5.1, 0.02, 0.24);
    plane.trim += (trimTarget - plane.trim) * Math.min(1, dt * 0.25);
    const pitchTarget = plane.gamma + plane.trim + clamp(input.pitch, -1, 1) * 0.22;
    plane.pitch += (pitchTarget - plane.pitch) * Math.min(1, dt * pitchRate);
    plane.pitch = clamp(plane.pitch, -0.5, 0.6);
  }

  // Gentle auto-level when the stick is centred (forgiving handling).
  if (!plane.onGround && Math.abs(input.roll) < 0.05 && env.assist) {
    plane.roll *= (1 - Math.min(1, dt * 0.5));
  }
  // Rudder assist coordinates the turn.
  if (!plane.onGround && env.assist) {
    plane.heading += Math.sin(plane.roll) * 0.02 * dt * 10 * 0.1;
  }

  // Stall: below the wing's speed the nose drops and the aeroplane sinks.
  plane.stalled = !plane.onGround && plane.speed < STALL_SPEED;
  if (plane.stalled) {
    plane.gamma -= 0.25 * dt;
    plane.pitch -= 0.12 * dt;
  }

  // Fuel burns faster than linearly with throttle.
  if (plane.fuel > 0) {
    plane.fuel -= (0.012 + 0.085 * Math.pow(plane.throttle, 2.2)) * dt;
    if (plane.fuel < 0) plane.fuel = 0;
  }

  // Move: air-relative velocity plus the wind. On the ground the
  // wheels hold the aeroplane, so the wind does not push it around.
  const fwd = {
    x: Math.cos(plane.heading) * Math.cos(plane.gamma),
    y: Math.sin(plane.gamma),
    z: Math.sin(plane.heading) * Math.cos(plane.gamma),
  };
  const vx = fwd.x * plane.speed + (plane.onGround ? 0 : wind.x);
  const vy = fwd.y * plane.speed;
  const vz = fwd.z * plane.speed + (plane.onGround ? 0 : wind.z);
  plane.x += vx * dt;
  plane.y += vy * dt;
  plane.z += vz * dt;
  plane.distance += plane.speed * dt;
  plane.sinkRate = -vy;
  if (plane.y > plane.maxAlt) plane.maxAlt = plane.y;

  // The valley rim gently turns the aeroplane back inside.
  const edge = Math.max(Math.abs(plane.x), Math.abs(plane.z));
  if (edge > WORLD_HALF - 60) {
    const back = Math.atan2(-plane.z, -plane.x);
    let diff = back - plane.heading;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    plane.heading += clamp(diff, -1, 1) * dt * 0.5;
  }

  // Ground contact, judged by the same height the renderer draws.
  const g2 = groundHeight(plane.x, plane.z);
  const gearY = g2 + GEAR_HEIGHT;
  if (!plane.onGround && plane.y <= gearY && plane.sinkRate >= -0.5) {
    plane.y = gearY;
    return checkTouchdown(plane, env);
  }
  if (!plane.onGround && plane.y < gearY) {
    // Arriving below the surface means terrain or water.
    if (inLakeArea(plane.x, plane.z)) {
      plane.crashed = true;
      plane.crashReason = 'ditched in the lake';
      return 'crash';
    }
    if (plane.sinkRate > 8 || Math.abs(plane.roll) > 0.9) {
      plane.crashed = true;
      plane.crashReason = 'struck the ridge';
      return 'crash';
    }
    plane.y = gearY;
    return checkTouchdown(plane, env);
  }
  if (plane.onGround) plane.y = gearY;
  return null;
}

function checkTouchdown(plane, env) {
  const onRwy = isOnRunway(plane.x, plane.z);
  const sink = plane.sinkRate;
  const latSpeed = Math.abs(Math.sin(plane.heading - RUNWAY.heading)) * plane.speed;
  if (!onRwy) {
    if (inLakeArea(plane.x, plane.z)) {
      plane.crashed = true;
      plane.crashReason = 'ditched in the lake';
      return 'crash';
    }
    if (sink > 6 || Math.abs(plane.roll) > 0.7) {
      plane.crashed = true;
      plane.crashReason = 'landed off the runway on rough ground';
      return 'crash';
    }
    // Rough-field arrival: survivable but costly.
    plane.damage += 25;
    plane.onGround = true;
    plane.speed *= 0.6;
    return 'rough';
  }
  // Runway touchdown quality.
  const centreOffset = Math.abs(plane.z - RUNWAY.cz);
  const zonePos = (plane.x - (RUNWAY.cx - RUNWAY.length / 2)) / RUNWAY.length;
  const quality = scoreLanding(plane, centreOffset, zonePos, sink);
  plane.lastLanding = { quality, centreOffset, zonePos, sink, bank: Math.abs(plane.roll) };
  if (sink > 9 || Math.abs(plane.roll) > 1.0 || latSpeed > 12) {
    plane.crashed = true;
    plane.crashReason = 'hard arrival on the runway';
    return 'crash';
  }
  if (sink > 5.5) {
    plane.damage += 18;
    plane.lastLanding.hard = true;
  } else if (sink > 3.5) {
    plane.damage += 6;
    plane.lastLanding.hard = true;
  }
  if (plane.damage >= 100) {
    plane.damage = 100;
    plane.crashed = true;
    plane.crashReason = 'airframe gave out after the damage';
    return 'crash';
  }
  plane.onGround = true;
  plane.gamma = 0;
  plane.pitch = 0;
  plane.landed = true;
  return 'land';
}

// Landing score out of 100 from centre line, zone, sink and bank.
export function scoreLanding(plane, centreOffset, zonePos, sink) {
  const centreScore = Math.max(0, 30 - centreOffset * 0.8);
  const zoneScore = zonePos >= 0.05 && zonePos <= 0.45 ? 25 : Math.max(0, 25 - Math.abs(zonePos - 0.25) * 60);
  const sinkScore = sink <= 1.5 ? 30 : Math.max(0, 30 - (sink - 1.5) * 6);
  const bankScore = Math.max(0, 15 - Math.abs(plane.roll) * 18);
  return Math.round(clamp(centreScore + zoneScore + sinkScore + bankScore, 0, 100));
}

export function landingLabel(quality) {
  if (quality >= 90) return 'Greased It';
  if (quality >= 75) return 'Smooth';
  if (quality >= 55) return 'Firm';
  return 'Rough';
}

// Headless sanity numbers for the test harness.
export function takeoffRollDistance() {
  const plane = makePlane('crimson');
  const env = { wind: { x: 0, z: 0 }, time: 0, assist: true };
  const input = { pitch: 0, roll: 0, rudder: 0, brake: false };
  plane.throttle = 1;
  let t = 0;
  const startX = plane.x;
  while (plane.onGround && t < 60) {
    stepFlight(plane, input, env, 1 / 120);
    t += 1 / 120;
  }
  return { distance: plane.x - startX, time: t, liftoffSpeed: plane.speed };
}

export function levelTopSpeed() {
  const plane = makePlane('crimson');
  plane.onGround = false;
  plane.x = 0; plane.y = 600; plane.z = 1500;
  plane.heading = -Math.PI / 2; // north, along the valley axis
  plane.speed = 40;
  plane.throttle = 1;
  const env = { wind: { x: 0, z: 0 }, time: 0, assist: true };
  // Hold level flight by damping the flight-path angle toward zero
  // and holding altitude, then read the speed the engine settles at
  // with full throttle. Thirty seconds keeps the run inside the
  // valley.
  for (let i = 0; i < 120 * 30; i++) {
    const pitchIn = clamp(-plane.gamma * 4 - (plane.y - 600) * 0.005, -1, 1);
    stepFlight(plane, { pitch: pitchIn, roll: 0, rudder: 0, brake: false }, env, 1 / 120);
    if (plane.crashed) break;
  }
  return plane.speed;
}
