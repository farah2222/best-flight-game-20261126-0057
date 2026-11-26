// Wind, gusts and the two lighting presets: bright midday and
// low warm golden hour. The sun direction also shades the terrain.

import { clamp } from './noise.js';

export function makeWeather() {
  return {
    windBase: 3.5, // m/s, from the west
    windDir: Math.PI, // blowing toward the east
    gustPhase: 0,
    preset: 'midday',
  };
}

// Wind vector at time t (seconds): steady west flow plus slow gusts.
export function windAt(weather, t) {
  const gust = Math.sin(t * 0.11) * 1.5 + Math.sin(t * 0.043 + 2.1) * 1.2;
  const speed = weather.windBase + gust;
  return {
    x: Math.cos(weather.windDir) * speed,
    z: Math.sin(weather.windDir) * speed,
    speed,
    gust,
  };
}

export const LIGHTING = {
  midday: {
    name: 'midday',
    sunDir: { x: -0.45, y: 0.78, z: -0.42 },
    sunColor: [255, 246, 224],
    skyTop: [58, 122, 196],
    skyMid: [132, 178, 222],
    skyHorizon: [214, 230, 240],
    haze: [198, 214, 228],
    hazeStrength: 0.55,
    ambient: 0.62,
    edgeLights: false,
    sunGlare: 0.5,
  },
  golden: {
    name: 'golden',
    sunDir: { x: -0.82, y: 0.24, z: -0.35 },
    sunColor: [255, 176, 92],
    skyTop: [72, 84, 148],
    skyMid: [214, 132, 92],
    skyHorizon: [255, 196, 128],
    haze: [246, 178, 118],
    hazeStrength: 0.85,
    ambient: 0.5,
    edgeLights: true,
    sunGlare: 1.0,
  },
};

export function lightingFor(preset) {
  return LIGHTING[preset] || LIGHTING.midday;
}

// Sun elevation factor (0..1) used to place the sun disc on screen.
export function sunElevation(light) {
  return clamp(light.sunDir.y, 0.05, 1);
}

// Headwind (positive = headwind) and crosswind for a given heading.
export function windForHeading(weather, t, heading) {
  const w = windAt(weather, t);
  const head = -(w.x * Math.cos(heading) + w.z * Math.sin(heading));
  const cross = -w.x * Math.sin(heading) + w.z * Math.cos(heading);
  return { head, cross, speed: w.speed };
}
