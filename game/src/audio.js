// All sound is synthesized with WebAudio: engine hum, sirens, gunfire,
// thunder, rain hiss and three radio stations of little generated loops.
// No audio files exist anywhere in the entry. Every entry point is safe
// to call before the first user gesture; the context wakes up lazily.

let ctx = null;
let master = null;
let engineNodes = null;
let sirenNodes = null;
let radioNodes = null;
let rainNode = null;

export const STATIONS = [
  { name: 'PALM FM', root: 220, pattern: [0, 3, 5, 7, 5, 3, 2, 3] },
  { name: 'NEON DRIVE', root: 164.81, pattern: [0, 0, 7, 0, 10, 7, 5, 3] },
  { name: 'BAY TALK', root: 110, pattern: [0, 5, 0, 5, 7, 5, 3, 2] },
];

function ensure() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

function env(gain, t0, peak, seconds) {
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
}

function tone(freq, type, peak, seconds, slideTo) {
  if (!ensure()) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + seconds);
  env(gain, t0, peak, seconds);
  osc.connect(gain).connect(master);
  osc.start(t0);
  osc.stop(t0 + seconds + 0.05);
}

function noise(peak, seconds, filterFreq, type = 'lowpass') {
  if (!ensure()) return;
  const t0 = ctx.currentTime;
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = filterFreq;
  const gain = ctx.createGain();
  env(gain, t0, peak, seconds);
  src.connect(filter).connect(gain).connect(master);
  src.start(t0);
}

export const sfx = {
  shot() { noise(0.5, 0.12, 1800, 'highpass'); tone(150, 'square', 0.2, 0.08, 60); },
  dryFire() { tone(1200, 'square', 0.08, 0.03); },
  reload() { tone(500, 'square', 0.1, 0.05); setTimeout(() => tone(700, 'square', 0.1, 0.05), 90); },
  punch() { noise(0.3, 0.08, 500); },
  crash(big) { noise(big ? 0.6 : 0.3, big ? 0.4 : 0.2, 700); tone(90, 'sawtooth', 0.2, 0.25, 40); },
  cash() { tone(1320, 'sine', 0.15, 0.09); setTimeout(() => tone(1760, 'sine', 0.15, 0.12), 70); },
  pickup() { tone(880, 'triangle', 0.2, 0.1); setTimeout(() => tone(1174, 'triangle', 0.2, 0.14), 80); },
  checkpoint() { tone(1046, 'sine', 0.2, 0.12); setTimeout(() => tone(1568, 'sine', 0.2, 0.18), 90); },
  door() { tone(220, 'square', 0.12, 0.07, 180); },
  spray() { noise(0.25, 0.5, 3000, 'highpass'); },
  thunder() { noise(0.7, 1.4, 220); setTimeout(() => noise(0.4, 1.0, 160), 180); },
  pop() { noise(0.45, 0.15, 900); tone(70, 'sine', 0.3, 0.2, 35); },
  busted() { tone(392, 'square', 0.2, 0.18); setTimeout(() => tone(311, 'square', 0.22, 0.3), 160); },
  wasted() { tone(220, 'sawtooth', 0.25, 0.5, 55); },
  phone() { tone(1568, 'sine', 0.12, 0.1); setTimeout(() => tone(1568, 'sine', 0.12, 0.1), 140); },
  raceGo() { tone(523, 'square', 0.2, 0.12); setTimeout(() => tone(523, 'square', 0.2, 0.12), 180); setTimeout(() => tone(1046, 'square', 0.25, 0.3), 360); },
};

/** Continuous engine loop; call every frame with speed 0..1, or null to stop. */
export function engineSound(level) {
  if (level === null) {
    if (engineNodes) { try { engineNodes.osc.stop(); } catch { /* already stopped */ } engineNodes = null; }
    return;
  }
  if (!ensure()) return;
  if (!engineNodes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    gain.gain.value = 0.0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    osc.connect(filter).connect(gain).connect(master);
    osc.start();
    engineNodes = { osc, gain, filter };
  }
  const t = ctx.currentTime;
  engineNodes.osc.frequency.setTargetAtTime(55 + level * 130, t, 0.08);
  engineNodes.gain.gain.setTargetAtTime(0.05 + level * 0.06, t, 0.1);
  engineNodes.filter.frequency.setTargetAtTime(300 + level * 900, t, 0.1);
}

/** Two-tone police siren loop toggle. */
export function sirenSound(on) {
  if (!on) {
    if (sirenNodes) { try { sirenNodes.osc.stop(); } catch { /* stopped */ } sirenNodes = null; }
    return;
  }
  if (!ensure() || sirenNodes) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = 840;
  lfo.frequency.value = 0.7;
  lfoGain.gain.value = 180;
  lfo.connect(lfoGain).connect(osc.frequency);
  gain.gain.value = 0.035;
  osc.connect(gain).connect(master);
  osc.start();
  lfo.start();
  sirenNodes = { osc, lfo };
}

/** Helicopter rotor: chopped noise whose rate follows distance. */
export function rotorSound(level) {
  sirenLikeRotor(level);
}
let rotorNodes = null;
function sirenLikeRotor(level) {
  if (level <= 0) {
    if (rotorNodes) { try { rotorNodes.src.stop(); } catch { /* stopped */ } rotorNodes = null; }
    return;
  }
  if (!ensure()) return;
  if (!rotorNodes) {
    const len = ctx.sampleRate;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 300;
    const gain = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 11;
    lfoGain.gain.value = 0.5;
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    lfo.connect(lfoGain).connect(depth.gain);
    src.connect(filter).connect(depth).connect(gain).connect(master);
    gain.gain.value = 0;
    src.start();
    lfo.start();
    rotorNodes = { src, gain, lfo };
  }
  rotorNodes.gain.gain.setTargetAtTime(0.12 * level, ctx.currentTime, 0.2);
}

/** Radio: a small step sequencer playing the station's generated loop. */
export function radioSound(stationIndex) {
  if (stationIndex === null || stationIndex === undefined) {
    if (radioNodes) { clearInterval(radioNodes.timer); radioNodes = null; }
    return;
  }
  if (!ensure()) return;
  if (radioNodes && radioNodes.index === stationIndex) return;
  if (radioNodes) clearInterval(radioNodes.timer);
  const station = STATIONS[stationIndex];
  let step = 0;
  const timer = setInterval(() => {
    if (!ctx) return;
    const semis = station.pattern[step % station.pattern.length];
    const freq = station.root * Math.pow(2, semis / 12);
    tone(freq, 'triangle', 0.10, 0.22);
    if (step % 2 === 0) tone(station.root / 2, 'sine', 0.12, 0.2);
    step += 1;
  }, 240);
  radioNodes = { timer, index: stationIndex };
}

/** Rain hiss loop, intensity 0..1 (0 stops it). */
export function rainSound(intensity) {
  if (intensity <= 0.02) {
    if (rainNode) { try { rainNode.src.stop(); } catch { /* stopped */ } rainNode = null; }
    return;
  }
  if (!ensure()) return;
  if (!rainNode) {
    const len = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1200;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(master);
    src.start();
    rainNode = { src, gain };
  }
  rainNode.gain.gain.setTargetAtTime(0.05 * intensity, ctx.currentTime, 0.3);
}
