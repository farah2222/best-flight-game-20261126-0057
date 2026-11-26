// Game states, the fixed-timestep loop, starting and ending
// sorties, banners and the render call. Everything else is a module
// this file wires together.

import { makePlane, stepFlight, FUEL_CAPACITY, landingLabel } from './flight.js';
import { makeRings, checkGateCross, nextGate } from './rings.js';
import { missionById, missionByKey, makeScore, gatePoints, timeBonus, buildDebrief, loadBest, saveBest } from './missions.js';
import { makeWeather, windAt, lightingFor } from './weather.js';
import { makeTrees, makeClouds, groundHeight, RUNWAY } from './terrain.js';
import { makeCameraState, updateCamera, drawScene, VIEW_W, VIEW_H } from './render.js';
import { drawHud, drawTitle, drawPause, drawEnd } from './hud.js';
import { makeInput, readAxes, takePressed, clearPressed } from './input.js';
import { makeAudio, startAudio, updateAudio, playChime, playThump, playCrash, playClick, playFlap, stallWarning, toggleMute } from './audio.js';
import { makeEffects, addTrauma, spawnBurst, spawnSmoke, spawnDust, updateParticles, shakeOffset, drawStreaks, drawVignette } from './effects.js';
import { applyShot } from './shots.js';
import { setupDebug, drawDebugOverlay, updateFps } from './debug.js';
import { clamp } from './noise.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const FIXED = 1 / 120;

const G = {
  mode: 'title',
  time: 0,
  plane: makePlane('crimson'),
  mission: missionById('ring'),
  rings: makeRings('ring'),
  score: makeScore(),
  weather: makeWeather(),
  trees: makeTrees(),
  clouds: makeClouds(),
  camState: makeCameraState(),
  cam: null,
  camMode: 'chase',
  lighting: 'midday',
  physicsMode: 'forgiving',
  livery: 'crimson',
  groundH: RUNWAY.height,
  objective: 'Pick a sortie to fly',
  banner: '', bannerSub: '', bannerT: 0,
  debrief: [], landing: null, endTitle: '', bestScore: 0,
  fx: makeEffects(),
  audio: makeAudio(),
  input: null,
  mouseX: 0, mouseY: 0,
  titleCards: [], liveryBtns: [], modeBtns: [],
  frozen: false,
  pendingEnd: null,
  roughStop: false,
  debug: new URLSearchParams(location.search).has('debug'),
};

G.input = makeInput(canvas);
setupDebug(G);

function resetCamera() {
  G.camState = makeCameraState();
  G.camState.pos = { x: G.plane.x - 12, y: G.plane.y + 5, z: G.plane.z };
  G.camState.smooth = { ...G.camState.pos };
}

export function startSortie(mission) {
  G.mission = mission;
  G.plane = makePlane(G.livery);
  G.plane.fuel = FUEL_CAPACITY * mission.fuelStart;
  G.rings = makeRings(mission.id);
  G.score = makeScore();
  G.lighting = mission.lighting;
  G.camMode = 'chase';
  G.fx.particles = [];
  G.fx.trauma = 0;
  G.banner = '';
  G.bannerSub = '';
  G.bannerT = 0;
  G.pendingEnd = null;
  G.roughStop = false;
  G.landing = null;
  G.mode = 'flying';
  resetCamera();
  updateObjective();
  startAudio(G.audio);
  playClick(G.audio);
}

function updateObjective() {
  const m = G.mission;
  const left = G.rings.gates.length - G.rings.next;
  if (G.mode === 'flying' || G.mode === 'paused') {
    G.objective = left > 0
      ? `${m.name}: ${left} gate${left === 1 ? '' : 's'} to go — then land on 09`
      : `${m.name}: all gates done — land on runway 09`;
  }
}

function showBanner(main, sub, seconds) {
  G.banner = main;
  G.bannerSub = sub || '';
  G.bannerT = seconds || 2.4;
}

function endSortie(kind, title) {
  G.mode = kind === 'crash' ? 'crashed' : 'landed';
  G.endTitle = title || '';
  G.bestScore = saveBest(G.mission.id, G.score.points);
  G.debrief = buildDebrief(G.mission, G.score, G.plane, G.landing);
  G.camMode = 'chase';
}

function queueEnd(kind, title, delay) {
  if (G.pendingEnd) return;
  G.pendingEnd = { kind, title, t: delay };
  G.camMode = 'flyby';
}

function finishPendingEnd() {
  const p = G.pendingEnd;
  G.pendingEnd = null;
  endSortie(p.kind, p.title);
}

function tick(dt) {
  G.time += dt;
  const plane = G.plane;
  const input = G.input;

  // Throttle.
  const axes = readAxes(input);
  plane.throttle = clamp(plane.throttle + axes.throttleDelta * dt * 0.7, 0, 1);

  // Edge-triggered actions.
  if (takePressed(input, 'camera')) {
    G.camMode = G.camMode === 'chase' ? 'cockpit' : 'chase';
    resetCamera();
    playClick(G.audio);
  }
  if (takePressed(input, 'flaps')) {
    plane.flaps = !plane.flaps;
    playFlap(G.audio);
  }
  if (takePressed(input, 'mute')) {
    toggleMute(G.audio);
  }
  if (takePressed(input, 'pause')) {
    G.mode = 'paused';
    return;
  }
  if (takePressed(input, 'restart')) {
    startSortie(G.mission);
    return;
  }

  const prev = { x: plane.x, y: plane.y, z: plane.z };
  const wind = windAt(G.weather, G.time);
  const env = { wind, time: G.time, assist: G.physicsMode === 'forgiving' };
  const result = stepFlight(plane, axes, env, dt);
  G.groundH = groundHeight(plane.x, plane.z);

  if (!plane.onGround && !G.score.started) {
    G.score.started = true;
  }
  if (G.score.started) G.score.time += dt;

  // Gate crossing.
  const cross = checkGateCross(G.rings, prev, plane);
  if (cross) {
    const pts = gatePoints(G.mission, plane.speed);
    G.score.points += pts;
    G.score.gates++;
    showBanner(`GATE ${cross.index + 1} — +${pts}`, G.rings.next < G.rings.gates.length ? `${G.rings.gates.length - G.rings.next} to go` : 'All gates done — land on 09', 2.2);
    playChime(G.audio);
    spawnBurst(G.fx, cross.gate.x, cross.gate.y, cross.gate.z, 14, 'gold', 8);
    updateObjective();
  }

  // Golden Hour clock running out.
  if (G.mission.id === 'golden' && G.mission.par && G.score.time > G.mission.par && !G.pendingEnd) {
    queueEnd('landed', 'Out of time — the light is gone', 0.1);
  }

  if (result === 'land') {
    const land = plane.lastLanding;
    if (land) {
      G.landing = {
        quality: land.quality,
        label: landingLabel(land.quality),
        centreOffset: land.centreOffset,
        zonePos: land.zonePos,
        sink: land.sink,
        bank: land.bank,
      };
      let pts = 0;
      if (G.mission.id === 'ridge') pts = land.quality * (G.mission.landingPoints || 4);
      const tb = timeBonus(G.mission, G.score.time);
      if (G.rings.next >= G.rings.gates.length && tb > 0) {
        G.score.points += tb;
        pts += tb;
      }
      if (land.hard) G.score.points = Math.max(0, G.score.points - 150);
      G.score.points += pts;
      playThump(G.audio, land.hard);
      addTrauma(G.fx, land.hard ? 0.5 : 0.2);
      spawnDust(G.fx, plane.x, plane.y, plane.z, 18);
      const title = `${G.landing.label} ${land.quality}/100`;
      showBanner('SORTIE COMPLETE', title, 3);
      queueEnd('landed', title, 1.5);
    }
  } else if (result === 'rough') {
    showBanner('ROUGH FIELD ARRIVAL', 'Damage +25 — roll to a stop', 2.5);
    playThump(G.audio, true);
    addTrauma(G.fx, 0.4);
    G.roughStop = true;
  } else if (result === 'crash') {
    playCrash(G.audio);
    addTrauma(G.fx, 1);
    spawnBurst(G.fx, plane.x, plane.y + 2, plane.z, 40, 'fire', 14);
    spawnBurst(G.fx, plane.x, plane.y + 2, plane.z, 24, 'smoke', 8);
    queueEnd('crash', plane.crashReason, 1.6);
  }

  if (G.roughStop && plane.onGround && plane.speed < 0.5) {
    G.roughStop = false;
    queueEnd('landed', 'Rough field landing', 0.5);
  }

  // Damage smoke trailing.
  if (plane.damage > 0 && !plane.crashed) {
    spawnSmoke(G.fx, plane.x - Math.cos(plane.heading) * 3, plane.y, plane.z - Math.sin(plane.heading) * 3, dt);
  }

  // Pending end countdown (fly-by cut plays meanwhile).
  if (G.pendingEnd) {
    G.pendingEnd.t -= dt;
    if (G.pendingEnd.t <= 0) finishPendingEnd();
  }

  // Clouds drift with the wind.
  for (const c of G.clouds) {
    c.x += c.drift * dt;
    if (c.x > 2100) c.x = -2100;
  }

  updateParticles(G.fx, dt);
  updateAudio(G.audio, plane, plane.speed);
  stallWarning(G.audio, plane.stalled);
  if (G.bannerT > 0) G.bannerT -= dt;
}

// ---- Title screen input ------------------------------------------

function titleClick(cx, cy) {
  for (const card of G.titleCards) {
    if (cx >= card.x && cx <= card.x + card.w && cy >= card.y && cy <= card.y + card.h) {
      startSortie(card.mission);
      return;
    }
  }
  for (const b of G.liveryBtns) {
    if (cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h) {
      G.livery = b.id;
      playClick(G.audio);
      return;
    }
  }
  for (const b of G.modeBtns) {
    if (cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h) {
      G.physicsMode = b.id;
      playClick(G.audio);
      return;
    }
  }
}

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const cx = ((e.clientX - rect.left) / rect.width) * VIEW_W;
  const cy = ((e.clientY - rect.top) / rect.height) * VIEW_H;
  G.mouseX = cx;
  G.mouseY = cy;
  if (G.mode === 'title') titleClick(cx, cy);
  else startAudio(G.audio);
});
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  G.mouseX = ((e.clientX - rect.left) / rect.width) * VIEW_W;
  G.mouseY = ((e.clientY - rect.top) / rect.height) * VIEW_H;
});

// ---- Main loop ----------------------------------------------------

let last = performance.now();
let acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  updateFps(G, now);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;

  if (!G.frozen) {
    if (G.mode === 'title') {
      G.time += dt;
      for (const key of ['mission1', 'mission2', 'mission3', 'mission4']) {
        if (takePressed(G.input, key)) {
          const m = missionByKey(key.slice(-1));
          if (m) startSortie(m);
        }
      }
      for (const c of G.clouds) {
        c.x += c.drift * dt;
        if (c.x > 2100) c.x = -2100;
      }
      // Slow orbit around the valley for the title backdrop.
      const a = G.time * 0.045;
      const camPos = { x: Math.cos(a) * 1500, y: 620, z: Math.sin(a) * 1500 };
      const look = { x: 0, y: 60, z: 300 };
      G.cam = orbitCamera(camPos, look);
    } else if (G.mode === 'flying') {
      acc += dt;
      let steps = 0;
      while (acc >= FIXED && steps < 24) {
        tick(FIXED);
        acc -= FIXED;
        steps++;
        if (G.mode !== 'flying') break;
      }
      if (steps >= 24) acc = 0;
    } else if (G.mode === 'paused') {
      if (takePressed(G.input, 'pause')) {
        G.mode = 'flying';
      }
      if (takePressed(G.input, 'restart')) startSortie(G.mission);
    } else {
      // Crashed or landed: keys restart or pick another sortie.
      if (takePressed(G.input, 'restart')) startSortie(G.mission);
      for (const key of ['mission1', 'mission2', 'mission3', 'mission4']) {
        if (takePressed(G.input, key)) {
          const m = missionByKey(key.slice(-1));
          if (m) startSortie(m);
        }
      }
    }
    clearPressed(G.input);
  }

  render();
}

function orbitCamera(pos, look) {
  // Built inline to keep the title orbit independent of the chase cam.
  const dx = look.x - pos.x, dy = look.y - pos.y, dz = look.z - pos.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  const fwd = { x: dx / len, y: dy / len, z: dz / len };
  let right = { x: fwd.z, y: 0, z: -fwd.x };
  const rl = Math.hypot(right.x, right.z) || 1;
  right = { x: right.x / rl, y: 0, z: right.z / rl };
  const up = {
    x: right.y * fwd.z - right.z * fwd.y,
    y: right.z * fwd.x - right.x * fwd.z,
    z: right.x * fwd.y - right.y * fwd.x,
  };
  const focal = (VIEW_H / 2) / Math.tan((62 * Math.PI / 180) / 2);
  return { pos, fwd, right, up, focal, aspect: VIEW_W / VIEW_H, fovDeg: 62 };
}

function render() {
  ctx.save();
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);

  if (G.mode === 'title') {
    drawScene(ctx, G);
    drawTitle(ctx, G);
  } else {
    if (!G.frozen || !G.cam) {
      G.cam = updateCamera(G.camState, G.plane, G.camMode, 1 / 60, G.time);
    }
    const sh = shakeOffset(G.fx, 1 / 60);
    ctx.translate(sh.x, sh.y);
    drawScene(ctx, G);
    ctx.restore();
    ctx.save();
    drawStreaks(ctx, VIEW_W, VIEW_H, G.plane.speed, G.camMode);
    drawVignette(ctx, VIEW_W, VIEW_H, G.plane.damage / 220 + (G.plane.stalled ? 0.15 : 0));
    if (G.mode === 'flying' || G.mode === 'paused') drawHud(ctx, G);
    if (G.mode === 'paused') drawPause(ctx);
    if (G.mode === 'crashed' || G.mode === 'landed') drawEnd(ctx, G);
    if (G.debug) drawDebugOverlay(ctx, G);
  }
  ctx.restore();
}

// Staged screenshot moments from the query string.
const params = new URLSearchParams(location.search);
const shot = params.get('shot');
if (shot) {
  applyShot(G, shot, startSortie);
  // Snap the camera to the staged pose and freeze the world.
  G.cam = updateCamera(G.camState, G.plane, G.camMode, 1, G.time);
  G.frozen = true;
}

requestAnimationFrame(frame);
