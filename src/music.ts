// POOP SOULS — pure WebAudio ambient + boss music engine. No assets, no imports.
// Design: a continuous low drone per zone (detuned saws + sub + filtered air),
// sparse character "hits" (drips / bubbles / heart-pulses), and a driving
// ostinato that layers in when a boss is active. All synthesized.

let ctx: AudioContext | null = null;
let bus: GainNode | null = null;        // music master (ducked on menus)
let noiseBuffer: AudioBuffer | null = null;

// live layers
let droneNodes: { stop: (t: number) => void } | null = null;
let hitTimer: number | null = null;
let bossTimer: number | null = null;

let curZone = -1;
let curBoss = false;
let ducked = false;

const BUS_VOL = 0.5;
const DUCK_VOL = 0.06;

function ensureCtx(): AudioContext | null {
  if (!ctx) {
    const AC: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    // Start at full volume. The drone only starts in setZone(), so nothing
    // sounds until gameplay begins; this also makes duck(false) a no-op that
    // leaves the bus at the right level (ducked is already false on first use).
    bus = ctx.createGain();
    bus.gain.value = BUS_VOL;
    bus.connect(ctx.destination);
    const len = Math.floor(ctx.sampleRate * 2);
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state !== "running") void ctx.resume().catch(() => undefined);
  return ctx;
}

// ---------- shared voices ----------
function droneOsc(type: OscillatorType, freq: number, cents: number, gain: number): OscillatorNode {
  const c = ctx!;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = cents;
  const g = c.createGain();
  g.gain.value = gain;
  o.connect(g).connect(bus!);
  o.start();
  return o;
}

function noiseSrc(loop: boolean): AudioBufferSourceNode {
  const c = ctx!;
  const s = c.createBufferSource();
  s.buffer = noiseBuffer!;
  s.loop = loop;
  return s;
}

// ---------- drone (per zone) ----------
interface ZoneDrone {
  root: number;      // sub sine freq
  saw: number;       // saw pair freq
  lp: number;        // lowpass center
  lfoDepth: number;
  airGain: number;
  airFreq: number;
}
const DRONES: ZoneDrone[] = [
  // The Porcelain Hollow — cold ceramic, still air
  { root: 55.0, saw: 110.0, lp: 240, lfoDepth: 90, airGain: 0.012, airFreq: 700 },
  // The Stinking Marsh — wet, low, gurgling
  { root: 41.2, saw: 82.4, lp: 190, lfoDepth: 130, airGain: 0.02, airFreq: 420 },
  // The Grand Throne — heavy, resonant, final
  { root: 36.7, saw: 73.4, lp: 150, lfoDepth: 70, airGain: 0.016, airFreq: 300 },
];

function startDrone(i: number) {
  const c = ctx!;
  const z = DRONES[i % DRONES.length];
  // master envelope for the whole drone — fades in over 1.5s, out on stop()
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, c.currentTime);
  env.gain.linearRampToValueAtTime(1, c.currentTime + 1.5);
  env.connect(bus!);
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = z.lp;
  filter.Q.value = 0.8;
  const filtGain = c.createGain();
  filtGain.gain.value = 1;
  filter.connect(filtGain).connect(env);
  const oscs: (OscillatorNode | AudioBufferSourceNode)[] = [];
  // saw pair through the filter
  for (const cents of [-6, 5]) {
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = z.saw;
    o.detune.value = cents;
    const g = c.createGain();
    g.gain.value = 0.05;
    o.connect(g).connect(filter);
    o.start();
    oscs.push(o);
  }
  // sub sine, direct (bypasses filter so it stays clean)
  const sub = c.createOscillator();
  sub.type = "sine";
  sub.frequency.value = z.root;
  const subG = c.createGain();
  subG.gain.value = 0.16;
  sub.connect(subG).connect(env);
  sub.start();
  oscs.push(sub);
  // slow LFO on the filter cutoff so the pad breathes
  const lfo = c.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.045 + i * 0.012;
  const lfoG = c.createGain();
  lfoG.gain.value = z.lfoDepth;
  lfo.connect(lfoG).connect(filter.frequency);
  lfo.start();
  oscs.push(lfo);
  // air: looped noise through bandpass, very quiet
  const air = noiseSrc(true);
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = z.airFreq;
  bp.Q.value = 0.6;
  const airG = c.createGain();
  airG.gain.value = z.airGain;
  air.connect(bp).connect(airG).connect(env);
  air.start();
  oscs.push(air);

  droneNodes = {
    stop(t: number) {
      const fade = 0.8;
      env.gain.cancelScheduledValues(t);
      env.gain.setValueAtTime(Math.max(0.0001, env.gain.value), t);
      env.gain.linearRampToValueAtTime(0.0001, t + fade);
      for (const o of oscs) {
        try { o.stop(t + fade + 0.05); } catch { /* already stopped */ }
      }
      setTimeout(() => {
        try { env.disconnect(); filter.disconnect(); filtGain.disconnect(); } catch { /* noop */ }
      }, (fade + 0.2) * 1000);
    },
  };
}

// ---------- character hits (per zone) ----------
function rand(a: number, b: number) { return a + Math.random() * (b - a); }

function drip() {
  const c = ctx!;
  if (c.state !== "running" || !noiseBuffer) return;
  const t = c.currentTime;
  const f = rand(900, 1500);
  const o = c.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f * 0.7, t + 0.12);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.06, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  const pan = c.createStereoPanner();
  pan.pan.value = rand(-0.8, 0.8);
  g.connect(pan).connect(bus!);
  o.connect(g);
  o.start(t);
  o.stop(t + 0.25);
}

function bubble() {
  const c = ctx!;
  if (c.state !== "running") return;
  const t = c.currentTime;
  const o = c.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(rand(140, 260), t);
  o.frequency.exponentialRampToValueAtTime(rand(60, 90), t + rand(0.15, 0.35));
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(rand(0.05, 0.09), t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  o.connect(g).connect(bus!);
  o.start(t);
  o.stop(t + 0.45);
  if (Math.random() < 0.22) {
    // the occasional low "fart" gurgle
    const t2 = t + rand(0.3, 0.9);
    const o2 = c.createOscillator();
    o2.type = "sawtooth";
    o2.frequency.setValueAtTime(rand(70, 110), t2);
    o2.frequency.linearRampToValueAtTime(rand(45, 60), t2 + rand(0.3, 0.6));
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 400;
    const g2 = c.createGain();
    g2.gain.setValueAtTime(0.0001, t2);
    g2.gain.exponentialRampToValueAtTime(0.05, t2 + 0.05);
    g2.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.7);
    o2.connect(lp).connect(g2).connect(bus!);
    o2.start(t2);
    o2.stop(t2 + 0.75);
  }
}

function throb() {
  const c = ctx!;
  if (c.state !== "running" || !noiseBuffer) return;
  const t = c.currentTime;
  // double low thump (heart)
  for (const dt of [0, 0.18]) {
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(62, t + dt);
    o.frequency.exponentialRampToValueAtTime(38, t + dt + 0.14);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t + dt);
    g.gain.exponentialRampToValueAtTime(0.14, t + dt + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.2);
    o.connect(g).connect(bus!);
    o.start(t + dt);
    o.stop(t + dt + 0.25);
  }
  // rare long airy swell
  if (Math.random() < 0.12) {
    const t2 = t + rand(1, 3);
    const s = noiseSrc(false);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 220;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t2);
    g.gain.linearRampToValueAtTime(0.045, t2 + 1.6);
    g.gain.linearRampToValueAtTime(0.0001, t2 + 3.4);
    s.connect(lp).connect(g).connect(bus!);
    s.start(t2);
    s.stop(t2 + 3.5);
  }
}

function startHits(i: number) {
  stopHits();
  const c = ctx!;
  const zone = i % 3;
  const schedule = () => {
    if (zone === 0) drip();
    else if (zone === 1) bubble();
    else throb();
    const base = zone === 0 ? rand(1.4, 4.5) : zone === 1 ? rand(0.8, 3.2) : 2.4;
    hitTimer = window.setTimeout(schedule, base * 1000);
  };
  schedule();
  void c;
}
function stopHits() {
  if (hitTimer !== null) { clearTimeout(hitTimer); hitTimer = null; }
}

// ---------- boss ostinato ----------
// Driving 8th-note ostinato over a minor pentatonic, root per boss.
const BOSS_ROOTS = [110.0, 98.0, 73.42]; // A2, G2, D2
const PENT = [0, 3, 5, 7, 10, 12, 10, 7]; // degrees in semitones
const PAT = [0, 2, 4, 6, 1, 3, 5, 7, 0, 2, 4, 6, 3, 5, 7, 4];

function startBossLayer() {
  stopBossLayer();
  const c = ctx!;
  const zone = ((curZone >= 0 ? curZone : 0) % 3);
  const root = BOSS_ROOTS[zone];
  const step = 0.21; // ~143 bpm eighths
  let n = 0;
  const tick = () => {
    if (c.state !== "running") return;
    const t = c.currentTime;
    const deg = PENT[PAT[n % PAT.length]];
    const f = root * Math.pow(2, deg / 12);
    // lead hit: short square through lowpass
    const o = c.createOscillator();
    o.type = "square";
    o.frequency.value = f;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1100;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(n % 4 === 0 ? 0.1 : 0.06, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(lp).connect(g).connect(bus!);
    o.start(t);
    o.stop(t + 0.18);
    // downbeat boom every 8 steps
    if (n % 8 === 0) {
      const b = c.createOscillator();
      b.type = "sine";
      b.frequency.setValueAtTime(root / 2, t);
      b.frequency.exponentialRampToValueAtTime(root / 4, t + 0.3);
      const bg = c.createGain();
      bg.gain.setValueAtTime(0.0001, t);
      bg.gain.exponentialRampToValueAtTime(0.28, t + 0.01);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      b.connect(bg).connect(bus!);
      b.start(t);
      b.stop(t + 0.4);
    }
    n++;
  };
  tick();
  bossTimer = window.setInterval(tick, step * 1000);
}
function stopBossLayer() {
  if (bossTimer !== null) { clearInterval(bossTimer); bossTimer = null; }
}

// ---------- public API ----------
export const MUS = {
  unlock(): void {
    ensureCtx();
  },

  // Start (or switch) zone ambience. Fades the old drone out. Entering a
  // zone means gameplay, so un-duck.
  setZone(i: number): void {
    const c = ensureCtx();
    if (!c) return;
    this.duck(false);
    if (i === curZone && droneNodes) return;
    if (droneNodes) droneNodes.stop(c.currentTime);
    curZone = i;
    startDrone(i);
    startHits(i);
    if (curBoss) startBossLayer(); // restart ostinato on the new root
  },

  setBoss(on: boolean): void {
    const c = ensureCtx();
    if (!c) return;
    curBoss = on;
    if (on) startBossLayer();
    else stopBossLayer();
  },

  // Duck to near-silence on title / game-over / win screens.
  duck(on: boolean): void {
    const c = ctx;
    if (!c || !bus) { ducked = on; return; }
    if (on === ducked) return;
    ducked = on;
    const t = c.currentTime;
    bus.gain.cancelScheduledValues(t);
    bus.gain.setValueAtTime(bus.gain.value, t);
    bus.gain.linearRampToValueAtTime(on ? DUCK_VOL : BUS_VOL, t + 0.6);
  },

  // expose the live context for verification taps (reads the final mix)
  ctx(): AudioContext | null {
    return ctx;
  },

  // Average RMS of the full music mix over durMs — taps the bus with an
  // analyser (parallel connection, doesn't disturb routing). 0 = silent.
  level(durMs = 500): Promise<number> {
    const c = ctx;
    const b = bus;
    if (!c || !b || c.state !== "running") return Promise.resolve(0);
    const an = c.createAnalyser();
    an.fftSize = 2048;
    b.connect(an);
    const data = new Float32Array(an.fftSize);
    const t0 = performance.now();
    let acc = 0, n = 0;
    return new Promise((resolve) => {
      const step = () => {
        an.getFloatTimeDomainData(data);
        let s = 0;
        for (let i = 0; i < data.length; i++) s += data[i] * data[i];
        acc += Math.sqrt(s / data.length); n++;
        if (performance.now() - t0 < durMs) setTimeout(step, 40);
        else {
          try { an.disconnect(); b.disconnect(an); } catch { /* noop */ }
          resolve(Math.round((acc / n) * 100000) / 100000);
        }
      };
      step();
    });
  },

  debug(): { ctx: string | null; zone: number; boss: boolean; duck: boolean; busGain: number | null } {
    return {
      ctx: ctx ? ctx.state : null,
      zone: curZone,
      boss: curBoss,
      duck: ducked,
      busGain: bus ? Math.round(bus.gain.value * 1000) / 1000 : null,
    };
  },
};
