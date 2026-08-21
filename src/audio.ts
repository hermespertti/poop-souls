// POOP SOULS — pure WebAudio sound-effects engine. No assets, no imports.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

function ensureCtx(): AudioContext | null {
  if (!ctx) {
    const AC: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.45;
    master.connect(ctx.destination);
    const len = Math.floor(ctx.sampleRate); // 1 second of white noise
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }
  if (ctx.state !== "running") {
    void ctx.resume().catch(() => undefined); // fire and forget
  }
  return ctx;
}

function osc(
  type: OscillatorType,
  f0: number,
  f1: number,
  dur: number,
  gain: number,
  delay = 0,
): void {
  const c = ensureCtx();
  if (!c || !master) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.linearRampToValueAtTime(f1, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur);
}

function noise(
  dur: number,
  gain: number,
  filterFreq: number,
  delay = 0,
): void {
  const c = ensureCtx();
  if (!c || !master || !noiseBuffer) return;
  const t = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = c.createBiquadFilter();
  filter.type = filterFreq < 1000 ? "lowpass" : "bandpass";
  filter.frequency.value = filterFreq;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur);
}

export const SFX = {
  unlock(): void {
    ensureCtx();
  },

  swing(heavy: boolean): void {
    if (heavy) {
      noise(0.22, 0.3, 900);
      osc("sawtooth", 300, 80, 0.2, 0.15);
    } else {
      noise(0.12, 0.25, 2500);
      osc("triangle", 500, 180, 0.12, 0.08);
    }
  },

  hitEnemy(): void {
    osc("square", 180, 60, 0.12, 0.3);
    noise(0.08, 0.2, 1200);
  },

  hitPlayer(): void {
    osc("square", 120, 40, 0.18, 0.35);
    noise(0.1, 0.2, 700);
  },

  block(): void {
    osc("square", 800, 700, 0.05, 0.15);
  },

  parry(): void {
    osc("sine", 1200, 1900, 0.09, 0.3);
    noise(0.06, 0.12, 4000);
  },

  dodge(): void {
    noise(0.15, 0.12, 1800);
  },

  soulPickup(): void {
    osc("sine", 600, 600, 0.06, 0.2, 0);
    osc("sine", 900, 900, 0.06, 0.2, 0.07);
    osc("sine", 1200, 1200, 0.06, 0.2, 0.14);
  },

  equip(): void {
    osc("square", 400, 300, 0.05, 0.12);
    osc("square", 500, 400, 0.05, 0.1, 0.06);
  },

  levelUp(): void {
    osc("triangle", 500, 500, 0.09, 0.2, 0);
    osc("triangle", 700, 700, 0.09, 0.2, 0.09);
    osc("triangle", 1000, 1000, 0.09, 0.2, 0.18);
    osc("triangle", 1400, 1400, 0.09, 0.2, 0.27);
  },

  bonfire(): void {
    noise(0.9, 0.25, 300);
    osc("sine", 220, 330, 0.5, 0.12, 0.2);
  },

  death(): void {
    osc("sawtooth", 220, 45, 0.9, 0.3);
    noise(0.6, 0.15, 400, 0.15);
  },

  bossRoar(): void {
    osc("sawtooth", 80, 40, 1.2, 0.4);
    noise(0.9, 0.2, 500);
  },

  bossHit(): void {
    osc("square", 140, 45, 0.2, 0.45);
    noise(0.15, 0.25, 800);
  },

  bossDefeat(): void {
    osc("sawtooth", 300, 40, 1.5, 0.4);
    noise(1.0, 0.25, 600, 0.3);
  },

  ui(): void {
    osc("square", 700, 700, 0.04, 0.08);
  },
};
