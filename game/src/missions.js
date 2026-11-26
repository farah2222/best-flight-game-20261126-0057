// The four sorties as data: their names, par times, scoring and
// the debrief. No mission logic hides in branches elsewhere.

export const MISSIONS = [
  {
    id: 'ring', key: '1', name: 'Ring Run',
    blurb: 'Thread eight glowing gates over the valley, the lake and the ridge.',
    par: 150, fuelStart: 1.0, lighting: 'midday',
    gatePoints: 500, speedBonus: true, timeBonus: 20,
    goal: 'Pass all 8 gates, then land on runway 09 to bank the score.',
  },
  {
    id: 'ridge', key: '2', name: 'Ridge Landing',
    blurb: 'Fly the downwind, base and final gates, then grease it onto runway 09.',
    par: 240, fuelStart: 1.0, lighting: 'midday',
    gatePoints: 200, speedBonus: false, timeBonus: 0,
    landingPoints: 4,
    goal: 'Pass the 3 guide gates, then land on runway 09 for a scored landing.',
  },
  {
    id: 'free', key: '3', name: 'Free Flight',
    blurb: 'Explore the valley. Bonus gates pay points; land any time to finish.',
    par: 0, fuelStart: 1.0, lighting: 'midday',
    gatePoints: 300, speedBonus: false, timeBonus: 0,
    goal: 'Collect bonus gates, then land anywhere safe to end the sortie.',
  },
  {
    id: 'golden', key: '4', name: 'Golden Hour Run',
    blurb: 'Six gates cross-country in low golden light. Fuel is tight — throttle wisely.',
    par: 210, fuelStart: 0.45, lighting: 'golden',
    gatePoints: 600, speedBonus: true, timeBonus: 15,
    goal: 'Pass all 6 gates and land on runway 09 before the clock runs out.',
  },
];

export function missionById(id) {
  return MISSIONS.find((m) => m.id === id) || MISSIONS[0];
}

export function missionByKey(key) {
  return MISSIONS.find((m) => m.key === key) || null;
}

export function makeScore() {
  return { points: 0, gates: 0, time: 0, started: false };
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function formatClock(seconds) {
  return formatTime(seconds);
}

// Points for a gate, with a speed bonus when the mission pays one.
export function gatePoints(mission, speedMs) {
  let pts = mission.gatePoints;
  if (mission.speedBonus) {
    pts += Math.round(Math.max(0, speedMs - 35) * 6);
  }
  return pts;
}

// Time bonus for finishing under par.
export function timeBonus(mission, elapsed) {
  if (!mission.par || !mission.timeBonus) return 0;
  const saved = mission.par - elapsed;
  return saved > 0 ? Math.round(saved * mission.timeBonus) : 0;
}

export function bestKey(missionId) {
  return `kestrel-best-${missionId}`;
}

// Gates done out of the course total, for the mission strip.
export function missionProgress(rings) {
  if (!rings) return { done: 0, total: 0 };
  return { done: rings.passed, total: rings.gates.length };
}

export function loadBest(missionId) {
  try {
    const v = Number(localStorage.getItem(bestKey(missionId)));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch (e) {
    return 0;
  }
}

export function saveBest(missionId, points) {
  try {
    const old = loadBest(missionId);
    if (points > old) localStorage.setItem(bestKey(missionId), String(points));
    return Math.max(old, points);
  } catch (e) {
    return points;
  }
}

// Line-by-line debrief for the end screen.
export function buildDebrief(mission, score, plane, landing) {
  const lines = [];
  lines.push({ label: 'Gates flown', value: String(score.gates) });
  lines.push({ label: 'Flight time', value: formatTime(score.time) });
  lines.push({ label: 'Distance', value: `${(plane.distance / 1000).toFixed(1)} km` });
  lines.push({ label: 'Best altitude', value: `${Math.round(plane.maxAlt * 3.28084)} ft` });
  lines.push({ label: 'Fuel left', value: `${Math.round((plane.fuel / 120) * 100)}%` });
  if (landing) {
    lines.push({ label: 'Landing', value: `${landing.quality}/100 — ${landing.label}` });
    lines.push({ label: 'Centre-line offset', value: `${Math.round(landing.centreOffset)} m` });
    lines.push({ label: 'Touchdown sink', value: `${landing.sink.toFixed(1)} m/s` });
  }
  if (mission.par && score.time > 0 && score.gates >= 1) {
    const tb = timeBonus(mission, score.time);
    if (tb > 0) lines.push({ label: 'Time bonus', value: `+${tb}` });
  }
  lines.push({ label: 'Final score', value: String(score.points) });
  return lines;
}
