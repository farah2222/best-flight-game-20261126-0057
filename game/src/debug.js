// A window-level handle for automated tests, plus a small debug
// overlay (seed, frame rate, state) shown with ?debug=1.

import { projectPoint } from './project.js';
import { heightAt } from './terrain.js';

export function setupDebug(G) {
  window.__kestrel = {
    state: () => ({
      mode: G.mode,
      mission: G.mission.id,
      x: G.plane.x, y: G.plane.y, z: G.plane.z,
      heading: G.plane.heading,
      speed: G.plane.speed,
      throttle: G.plane.throttle,
      fuel: G.plane.fuel,
      damage: G.plane.damage,
      score: G.score.points,
      gates: G.score.gates,
      onGround: G.plane.onGround,
      stalled: G.plane.stalled,
      camMode: G.camMode,
      time: G.time,
    }),
    project: (x, y, z) => (G.cam ? projectPoint(G.cam, { x, y, z }, 1280, 720) : null),
    groundAt: (x, z) => heightAt(x, z),
    game: G,
  };
}

// Rolling frame-rate estimate, updated once a second by the main loop.
export function updateFps(G, now) {
  if (G._fpsLast === undefined) {
    G._fpsLast = now;
    G._fpsFrames = 0;
    return;
  }
  G._fpsFrames++;
  const elapsed = now - G._fpsLast;
  if (elapsed >= 1000) {
    G._fps = (G._fpsFrames * 1000) / elapsed;
    G._fpsLast = now;
    G._fpsFrames = 0;
  }
}

export function drawDebugOverlay(ctx, G) {
  const fps = G._fps ? G._fps.toFixed(0) : '?';  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(8, 84, 300, 74);
  ctx.fillStyle = '#7ee081';
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`seed 20261126   fps ${fps}   state ${G.mode}`, 14, 90);
  ctx.fillText(`pos ${G.plane.x.toFixed(0)}, ${G.plane.y.toFixed(0)}, ${G.plane.z.toFixed(0)}`, 14, 108);
  ctx.fillText(`spd ${G.plane.speed.toFixed(1)} m/s   hdg ${((G.plane.heading * 180 / Math.PI) % 360 + 360) % 360 | 0} deg`, 14, 126);
  ctx.fillText(`gates ${G.score.gates}   score ${G.score.points}   fuel ${G.plane.fuel.toFixed(0)} kg`, 14, 144);
  ctx.restore();
}
