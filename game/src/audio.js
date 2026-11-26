// All sound is synthesised with the Web Audio API — no audio files.
// Engine drone, wind rush, gate chime, thumps and warnings.

export function makeAudio() {
  return {
    ctx: null, master: null, engineOsc: null, engineOsc2: null,
    engineGain: null,
    windSrc: null, windGain: null, windFilter: null,
    stallOsc: null, stallGain: null,
    muted: false, started: false, stallOn: false,
  };
}

function ensure(audio) {
  if (audio.ctx) return true;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    audio.ctx = new Ctx();
    audio.master = audio.ctx.createGain();
    audio.master.gain.value = 0.5;
    audio.master.connect(audio.ctx.destination);
    return true;
  } catch (e) {
    return false;
  }
}

export function startAudio(audio) {
  if (audio.started) return;
  if (!ensure(audio)) return;
  const ctx = audio.ctx;
  try {
    if (ctx.state === 'suspended') ctx.resume();
    // Engine: sawtooth plus a blade-pass tone an octave up.
    audio.engineOsc = ctx.createOscillator();
    audio.engineOsc.type = 'sawtooth';
    audio.engineOsc.frequency.value = 50;
    audio.engineOsc2 = ctx.createOscillator();
    audio.engineOsc2.type = 'square';
    audio.engineOsc2.frequency.value = 100;
    const engGain = ctx.createGain();
    engGain.gain.value = 0.0;
    const engFilter = ctx.createBiquadFilter();
    engFilter.type = 'lowpass';
    engFilter.frequency.value = 900;
    audio.engineOsc.connect(engFilter);
    audio.engineOsc2.connect(engFilter);
    engFilter.connect(engGain);
    engGain.connect(audio.master);
    audio.engineGain = engGain;
    audio.engineOsc.start();
    audio.engineOsc2.start();
    // Wind: looped noise through a band-pass filter.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    audio.windSrc = ctx.createBufferSource();
    audio.windSrc.buffer = buf;
    audio.windSrc.loop = true;
    audio.windFilter = ctx.createBiquadFilter();
    audio.windFilter.type = 'bandpass';
    audio.windFilter.frequency.value = 700;
    audio.windFilter.Q.value = 0.6;
    audio.windGain = ctx.createGain();
    audio.windGain.gain.value = 0;
    audio.windSrc.connect(audio.windFilter);
    audio.windFilter.connect(audio.windGain);
    audio.windGain.connect(audio.master);
    audio.windSrc.start();
    audio.started = true;
  } catch (e) {
    audio.started = false;
  }
}

// Called every frame while flying: engine pitch follows rpm, wind
// follows dynamic pressure.
export function updateAudio(audio, plane, speedMs) {
  if (!audio.started || !audio.ctx) return;
  const t = audio.ctx.currentTime;
  const rpm = plane.rpm || 0;
  const freq = 40 + rpm * 100;
  audio.engineOsc.frequency.setTargetAtTime(freq, t, 0.08);
  audio.engineOsc2.frequency.setTargetAtTime(freq * 2.02, t, 0.08);
  const engVol = audio.muted ? 0 : 0.05 + rpm * 0.11;
  audio.engineGain.gain.setTargetAtTime(engVol, t, 0.1);
  const dyn = Math.min(1, (speedMs * speedMs) / 8000);
  audio.windGain.gain.setTargetAtTime(audio.muted ? 0 : dyn * 0.16, t, 0.15);
  audio.windFilter.frequency.setTargetAtTime(500 + dyn * 900, t, 0.2);
}

function blip(audio, freq, dur, type, vol, when) {
  if (!audio.ctx || audio.muted) return;
  const t = audio.ctx.currentTime + (when || 0);
  const o = audio.ctx.createOscillator();
  o.type = type || 'sine';
  o.frequency.value = freq;
  const g = audio.ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol || 0.2, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(audio.master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export function playChime(audio) {
  if (!audio.ctx) return;
  blip(audio, 880, 0.35, 'sine', 0.22, 0);
  blip(audio, 1318, 0.5, 'sine', 0.18, 0.08);
}

export function playThump(audio, hard) {
  if (!audio.ctx || audio.muted) return;
  const t = audio.ctx.currentTime;
  const o = audio.ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(90, t);
  o.frequency.exponentialRampToValueAtTime(38, t + 0.18);
  const g = audio.ctx.createGain();
  g.gain.setValueAtTime(hard ? 0.5 : 0.3, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  o.connect(g);
  g.connect(audio.master);
  o.start(t);
  o.stop(t + 0.3);
}

export function playCrash(audio) {
  if (!audio.ctx || audio.muted) return;
  const ctx = audio.ctx;
  const len = ctx.sampleRate * 0.7;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 600;
  const g = ctx.createGain();
  g.gain.value = 0.6;
  src.connect(f);
  f.connect(g);
  g.connect(audio.master);
  src.start();
}

export function playClick(audio) {
  blip(audio, 1200, 0.07, 'square', 0.08, 0);
}

export function playFlap(audio) {
  if (!audio.ctx || audio.muted) return;
  const t = audio.ctx.currentTime;
  const o = audio.ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(180, t);
  o.frequency.linearRampToValueAtTime(320, t + 0.25);
  const g = audio.ctx.createGain();
  g.gain.setValueAtTime(0.05, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  o.connect(g);
  g.connect(audio.master);
  o.start(t);
  o.stop(t + 0.32);
}

// Stall reed: a rising tone while stalled, silent otherwise.
export function stallWarning(audio, stalled) {
  if (!audio.ctx) return;
  if (stalled && !audio.stallOsc) {
    const o = audio.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 620;
    const g = audio.ctx.createGain();
    g.gain.value = audio.muted ? 0 : 0.07;
    o.connect(g);
    g.connect(audio.master);
    o.start();
    audio.stallOsc = o;
    audio.stallGain = g;
  } else if (!stalled && audio.stallOsc) {
    try { audio.stallOsc.stop(); } catch (e) {}
    audio.stallOsc = null;
  }
  if (audio.stallOsc && audio.stallGain) {
    audio.stallGain.gain.setTargetAtTime(audio.muted ? 0 : 0.07, audio.ctx.currentTime, 0.05);
  }
}

export function toggleMute(audio) {
  audio.muted = !audio.muted;
  if (audio.master) audio.master.gain.value = audio.muted ? 0 : 0.5;
  return audio.muted;
}
