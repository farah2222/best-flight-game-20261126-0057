// The four staged screenshot moments, read from the page query
// string (?shot=cover|cockpit|ring|landing). Staging only sets the
// same state a player could reach by flying; it never edits pixels.

import { missionById } from './missions.js';
import { RUNWAY } from './terrain.js';
import { spawnDust } from './effects.js';

export const SHOT_NAMES = ['cover', 'cockpit', 'ring', 'landing'];

export function isShotName(name) {
  return SHOT_NAMES.includes(name);
}

export function applyShot(G, name, startSortie) {
  if (!isShotName(name)) return;
  if (name === 'cover') {
    // Chase view low over the lake, banked hard toward gate three
    // 120 m ahead, just after passing gate two.
    startSortie(missionById('ring'));
    G.plane.x = 1095; G.plane.y = 85; G.plane.z = -844;
    G.plane.heading = Math.atan2(-950 + 844, 1150 - 1095); // on the course line into gate three
    G.plane.gamma = 0.22; G.plane.pitch = 0.18; G.plane.roll = 0.55;
    G.plane.speed = 55; G.plane.throttle = 0.75; G.plane.onGround = false;
    G.plane.rpm = 0.75; G.plane.trim = 0.08;
    G.rings.gates[0].passed = true;
    G.rings.gates[1].passed = true;
    G.rings.next = 2; G.rings.passed = 2;
    G.score.gates = 2; G.score.points = 1180; G.score.time = 42; G.score.started = true;
    G.camMode = 'chase';
    G.mode = 'flying';
    G.banner = 'GATE 2 — +620';
    G.bannerSub = 'Gate 3 ahead — 120 m';
    G.bannerT = 99;
  } else if (name === 'cockpit') {
    // On final approach with flaps down, runway ahead, panel lit.
    startSortie(missionById('ridge'));
    G.plane.x = -1250; G.plane.y = 110; G.plane.z = RUNWAY.cz;
    G.plane.heading = 0; G.plane.gamma = -0.1; G.plane.pitch = -0.05; G.plane.roll = 0;
    G.plane.speed = 36; G.plane.throttle = 0.4; G.plane.flaps = true;
    G.plane.onGround = false; G.plane.rpm = 0.4; G.plane.trim = 0.08;
    G.rings.gates[0].passed = true;
    G.rings.gates[1].passed = true;
    G.rings.next = 2; G.rings.passed = 2;
    G.score.gates = 2; G.score.points = 400; G.score.time = 88; G.score.started = true;
    G.camMode = 'cockpit';
    G.mode = 'flying';
    G.banner = 'FINAL — RUNWAY 09 AHEAD';
    G.bannerSub = 'Flaps down — hold 70 kt — nose on the numbers';
    G.bannerT = 99;
  } else if (name === 'ring') {
    // Golden Hour Run: high over the lake's north edge, banked
    // toward gate three over the ridge in low warm light.
    startSortie(missionById('golden'));
    G.plane.x = 1187; G.plane.y = 480; G.plane.z = -1281;
    G.plane.heading = Math.atan2(-1400 + 1281, 1200 - 1187); // on the course line into gate three
    G.plane.gamma = 0; G.plane.pitch = 0.02; G.plane.roll = 0.5;
    G.plane.speed = 55; G.plane.throttle = 0.7; G.plane.onGround = false;
    G.plane.rpm = 0.7;
    G.rings.gates[0].passed = true;
    G.rings.gates[1].passed = true;
    G.rings.next = 2; G.rings.passed = 2;
    G.score.gates = 2; G.score.points = 1440; G.score.time = 75; G.score.started = true;
    G.camMode = 'chase';
    G.mode = 'flying';
  } else if (name === 'landing') {
    // Wheels just down on runway 09, dust up, mission complete banner.
    startSortie(missionById('ridge'));
    G.plane.x = -480; G.plane.y = RUNWAY.height + 1.6; G.plane.z = RUNWAY.cz + 2;
    G.plane.heading = 0; G.plane.gamma = 0; G.plane.pitch = 0; G.plane.roll = 0;
    G.plane.speed = 24; G.plane.throttle = 0.25; G.plane.onGround = true;
    G.plane.rpm = 0.25;
    G.rings.gates.forEach((g) => { g.passed = true; });
    G.rings.next = 3; G.rings.passed = 3;
    G.score.gates = 3; G.score.points = 1520; G.score.time = 131; G.score.started = true;
    G.camMode = 'chase';
    G.mode = 'flying';
    G.banner = 'GREASED IT — PERFECT LANDING!';
    G.bannerSub = '96/100  •  +384 pts  •  Runway 09';
    G.bannerT = 99;
    spawnDust(G.fx, G.plane.x, G.plane.y, G.plane.z, 10);
  }
  // Snap the camera to the staged pose.
  G.camState.pos = { x: G.plane.x, y: G.plane.y + 6, z: G.plane.z };
  G.camState.smooth = { ...G.camState.pos };
}
