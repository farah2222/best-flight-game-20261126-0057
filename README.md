# Kestrel Ridge — Alpine Flight Challenge

[![make.fun — Make the best flight game](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/c/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![Rank](https://make.fun/badge/best-flight-game-20261126-0057/farah2222/best-flight-game-20261126-0057/rank.svg)](https://make.fun/c/best-flight-game-20261126-0057/leaderboard)
[![Reward](https://make.fun/badge/best-flight-game-20261126-0057/farah2222/best-flight-game-20261126-0057/reward.svg)](https://make.fun/c/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

Kestrel Ridge is a complete alpine flight game built for the [Make the best flight game](https://make.fun/c/best-flight-game-20261126-0057) bounty on make.fun. Fly a small single-propeller high-wing aeroplane over a procedural alpine valley: thread glowing gates, mind your fuel and airframe damage, ride the wind and gusts, and land on runway 09. Everything is drawn by a hand-rolled canvas 2D software renderer — no images, no libraries, no network requests — with a force-balance flight model, a chase and a cockpit camera, a full heads-up display, and synthesised engine and wind sound.

## How to play

Open `game/index.html` from any static server (for example `npx serve game` or `python3 -m http.server` inside `game/`) and play in a desktop browser. Pick a sortie on the title screen with keys 1–4 or by clicking a card.

The four sorties:

1. **Ring Run** — thread eight gates over the valley, the lake and the ridge; each gate pays 500 points plus a speed bonus, and finishing under the 2:30 par pays 20 points per second saved. Land on runway 09 to bank the score.
2. **Ridge Landing** — fly the downwind, base and final guide gates, then land on runway 09. The landing is scored out of 100 (centre line, touchdown zone, sink rate, wings level) and pays four points per quality point.
3. **Free Flight** — explore the valley; five bonus gates pay points, and landing any time ends the sortie.
4. **Golden Hour Run** — six gates cross-country in low golden-hour light against a 3:30 clock, with tight fuel. Full throttle the whole way will not make it.

Controls:

- **W / S** (or ↑ / ↓) — pitch up / down
- **A / D** (or ← / →) — bank and turn
- **Q / E** — rudder
- **Shift / Ctrl** — throttle up / down
- **F** — flaps, **B** — brake on the runway
- **C** — camera (chase / cockpit), **P** — pause, **R** — restart, **M** — sound
- **Mouse** — hold the left button and drag to steer; hold the right button to look around
- **1–4** — start a sortie from the title screen

## Layout

- `game/index.html` — the canvas and page shell; loads the main module.
- `game/src/style.css` — page background, canvas sizing, centred layout.
- `game/src/main.js` — game states, the fixed-timestep loop, starting and ending sorties, banners, the render call.
- `game/src/project.js` — vector helpers, the aircraft and camera bases, point and polygon projection with near-plane clipping.
- `game/src/noise.js` — seeded random generator and fractal value noise.
- `game/src/terrain.js` — the valley height function, the lake, the runway definition, tree scattering, terrain colours.
- `game/src/weather.js` — wind and gusts, the midday and golden-hour lighting presets, the sun direction and haze.
- `game/src/flight.js` — the force-balance model, ground contact, damage, fuel, speeds.
- `game/src/rings.js` — the gate courses for each mission kind, gate facing, crossing detection, the next gate.
- `game/src/missions.js` — the four sorties as data, scoring, landing quality and the debrief, time formatting.
- `game/src/render.js` — sky, sun, clouds, terrain, runway, rings, trees, particles, the aeroplane model, the cockpit frame.
- `game/src/effects.js` — screen shake, speed streaks, the gravity vignette, sun glitter on the lake.
- `game/src/hud.js` — gauges, attitude ball, compass, minimap, banners, warnings, menus and end screens.
- `game/src/input.js` — keyboard and mouse state, axes, edge-triggered actions.
- `game/src/audio.js` — the synthesised engine, wind, chimes, thumps, warnings and mute.
- `game/src/shots.js` — the four staged screenshot moments, read from the page query string.
- `game/src/debug.js` — a window-level handle for automated tests, plus the debug overlay.
- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to the output folder and writes `dossier.json`.
- `vendor/makefun-game.ts` — make.fun's dossier library, unchanged from the kit.
- `screenshots/` — four renders of the game itself: chase, cockpit, ring over the lake, landing.

## Testing

- `node /tmp/test-flight.mjs`-style headless checks live outside the repo: take-off roll 151 m with liftoff at 31.7 m/s, level top speed about 87 m/s, stall warning with a sink at 20 m/s, a flared landing on runway 09 scoring 69/100 with a 125 m roll to a stop, and a gate-crossing detection check.
- In a real browser (Playwright + headless Chromium): the page loads with zero console errors and zero remote requests; missions start from a key press and from a click; the aeroplane lifts off, climbs, turns and passes a gate; the landing mission completes with a debrief; a crash shows the crash screen and restarts; pause, restart, camera and sound toggles all work.
- The four screenshots under `screenshots/` are real renders of the game (`?shot=cover|cockpit|ring|landing`), 1280×720 each.

## License

MIT — see `LICENSE`.
