// POOP SOULS — pure WebAudio sound-effects engine. No assets, no imports.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

// M7: deterministic per-SFX counters — tests diff these (same pattern as juicePops)
const counters: Record<string, number> = {};
function count(name: string): void {
  counters[name] = (counters[name] ?? 0) + 1;
}

// M9: recent swing pitch multipliers — tests verify the combo pitch drift
const swingPitches: number[] = [];

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

  // M9: per-swing pitch wobble — consecutive combos drift so a combo chain
  // doesn't sound like a metronome. `pitchMul` ~0.94..1.0.
  swing(heavy: boolean, pitchMul = 1): void {
    count("swing");
    swingPitches.push(pitchMul);
    if (swingPitches.length > 24) swingPitches.shift();
    const p = pitchMul;
    if (heavy) {
      noise(0.22, 0.3, 900);
      osc("sawtooth", 300 * p, 80 * p, 0.2, 0.15);
    } else {
      noise(0.12, 0.25, 2500);
      osc("triangle", 500 * p, 180 * p, 0.12, 0.08);
    }
  },

  hitEnemy(): void {
    count("hitEnemy");
    osc("square", 180, 60, 0.12, 0.3);
    noise(0.08, 0.2, 1200);
  },

  hitPlayer(): void {
    count("hitPlayer");
    osc("square", 120, 40, 0.18, 0.35);
    noise(0.1, 0.2, 700);
  },

  block(): void {
    count("block");
    osc("square", 800, 700, 0.05, 0.15);
  },

  parry(): void {
    count("parry");
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

  drink(): void {
    osc("sine", 260, 160, 0.16, 0.18, 0);
    osc("sine", 240, 150, 0.16, 0.18, 0.14);
    noise(0.25, 0.1, 500);
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

  // ---- M7 audio impact: the big visual hits get a low end ------------------
  // Boss slam / ground impact — sub-bass drop + dirt transient. `power` 0..1.
  slam(power = 1): void {
    count("slam");
    const p = 0.5 + 0.5 * Math.min(1, power);
    osc("sine", 110, 28, 0.34 * p + 0.14, 0.55 * p);
    osc("sawtooth", 70, 30, 0.18, 0.18 * p);
    noise(0.3, 0.35 * p, 240);
    noise(0.06, 0.25 * p, 1800);
  },

  // Meteor landing — higher thump than a slam, with a long dust tail.
  meteor(): void {
    count("meteor");
    osc("sine", 90, 22, 0.42, 0.5);
    osc("square", 55, 24, 0.2, 0.2);
    noise(0.55, 0.3, 320);
    noise(0.1, 0.2, 1400);
  },

  // Spin / smear attack — a wide whoosh that peaks mid-sweep.
  spinSweep(): void {
    count("spin");
    noise(0.28, 0.22, 900);
    osc("sawtooth", 220, 90, 0.26, 0.12);
  },

  // Charge startup — rising rush before the body commits.
  chargeWhoosh(): void {
    count("charge");
    osc("sawtooth", 60, 180, 0.35, 0.2);
    noise(0.4, 0.18, 700);
  },

  // Parry — bright metallic ring over the existing chime.
  clink(): void {
    count("clink");
    osc("square", 2400, 2350, 0.04, 0.16);
    osc("sine", 5200, 4800, 0.12, 0.1);
  },

  // ---- M8 stings: the two narrative beats that had no musical payoff ------
  // Zone cleared — a grounded thud under a slow rising major arpeggio.
  // Lower register + slower spacing than levelUp, so it reads as "the door
  // opened" rather than "you grew".
  zoneClear(): void {
    count("zoneClear");
    osc("sine", 110, 40, 0.4, 0.4); // thud
    osc("sawtooth", 262, 262, 0.5, 0.1, 0.05); // C4
    osc("sawtooth", 330, 330, 0.5, 0.1, 0.18); // E4
    osc("sawtooth", 392, 392, 0.6, 0.1, 0.31); // G4
    osc("triangle", 523, 523, 0.9, 0.16, 0.44); // C5 — hold the top
    noise(0.5, 0.08, 2400, 0.44);
  },

  // Victory — the Throne is clean. A two-stage lift: pad chord under a rising
  // arpeggio, then a full major chord hit with a long decay. ~2s.
  victory(): void {
    count("victory");
    osc("sine", 80, 30, 0.6, 0.5); // sub boom under everything
    // pad: C major, sustained
    for (const f of [262, 330, 392, 494]) osc("sawtooth", f, f, 1.3, 0.05, 0.05);
    // rising arpeggio
    const arp = [523, 659, 784, 1047];
    arp.forEach((f, i) => osc("triangle", f, f, 0.5, 0.16, 0.25 + i * 0.11));
    // final chord hit with long decay
    const t = 1.0;
    for (const f of [523, 659, 784, 1047, 1319]) osc("sawtooth", f, f, 1.4, 0.07, t);
    osc("sine", 1568, 1568, 1.6, 0.06, t);
    noise(0.9, 0.1, 3000, t); // sparkle tail
  },

  // M9: low-HP dread — a single lub-dub thump. The game loop calls this at a
  // rate that scales with how close to death you are (0.9s at 35% hp down to
  // 0.45s below 10%). Sub-bass so it sits under the music, not over it.
  heartbeat(): void {
    count("heartbeat");
    osc("sine", 58, 38, 0.16, 0.5); // lub
    osc("sine", 50, 32, 0.14, 0.42, 0.17); // dub
    noise(0.1, 0.08, 160);
  },

  // Verification tap — cumulative SFX fire counts, keyed by sound name.
  counters(): Record<string, number> {
    return { ...counters };
  },

  // M9: recent swing pitch multipliers (oldest first) — proves combo drift.
  swingPitches(): number[] {
    return [...swingPitches];
  },
};
