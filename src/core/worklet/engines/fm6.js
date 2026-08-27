// SPDX-License-Identifier: 0BSD

// General 6-operator FM core plus the two voices built on it: E.PIANO (DX7
// algorithm 5) and FM BASS (a morph between DX7 algorithms 16 and 17). The
// algorithm is data: each patch lists, per operator, its frequency ratio,
// output level, envelope, which operators modulate it, and a feedback amount.
// A self-entry is expressed through the fb field, so feedback is just the
// diagonal of the modulation matrix and a tap that moves between patches is an
// ordinary interpolation. Operators are 1-indexed to match the DX7 numbering;
// the per-sample evaluation runs 6 -> 1 in a single pass, so every modulator is
// read fresh and a feedback operator reads its own previous samples.
//
// Ratios, levels, and envelopes below are decoded from the ROM1A factory voices
// E.PIANO 1, BASS 1, and BASS 2. This models their character on our 5-control
// contract, it is not a bit-exact DX7 clone.

// DX7 envelope rate (0..99, higher is faster) to an approximate segment time in
// seconds. Calibrated so 99 is near-instant, ~50 is a tenth of a second, and
// low rates stretch to seconds.
function rate2sec(r) {
  const s = 0.001 * Math.pow(2, (99 - r) * 0.14);
  return Math.min(20, Math.max(0.0005, s));
}

// A DX7 operator envelope is kept raw: four rates and four levels (0..99). The
// FMEnv below plays the real four-point shape, which matters because the bright
// bass modulators drop from their peak to a low L2 fast, then hold, giving a
// plucked attack rather than a sustained buzz.
function eg(r, l) {
  return { r, l };
}

// Per-operator four-segment envelope: ramp to L1 at R1, to L2 at R2, to L3 at R3
// (hold there while gated), then to L4 at R4 on release. Segments are linear in
// time; the Attack and Decay macros scale the segment durations.
class FMEnv {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.v = 0;
    this.done = true;
  }

  trigger(e, gateSec, atkScale, decScale) {
    this.L = [e.l[0] / 99, e.l[1] / 99, e.l[2] / 99, e.l[3] / 99];
    this.dur = [
      Math.max(1, rate2sec(e.r[0]) * atkScale * this.sr),
      Math.max(1, rate2sec(e.r[1]) * decScale * this.sr),
      Math.max(1, rate2sec(e.r[2]) * decScale * this.sr),
    ];
    this.relDur = Math.max(1, rate2sec(e.r[3]) * decScale * this.sr);
    this.v = 0;
    this.from = 0;
    this.seg = 0;
    this.segT = 0;
    this.gateSamples = Math.max(1, Math.floor(gateSec * this.sr));
    this.t = 0;
    this.released = false;
    this.done = false;
  }

  // Re-arm the gate for a legato (slide) note: keep the current level, resume
  // the sustain hold, and restart the hold timer.
  regate(gateSec) {
    this.gateSamples = Math.max(1, Math.floor(gateSec * this.sr));
    this.t = 0;
    if (this.released) { this.released = false; this.seg = 3; }
    this.done = false;
  }

  process() {
    this.t += 1;
    if (!this.released && this.t >= this.gateSamples) {
      this.released = true;
      this.relFrom = this.v;
      this.segT = 0;
    }
    if (this.released) {
      this.segT += 1;
      const p = this.segT / this.relDur;
      this.v = p >= 1 ? this.L[3] : this.relFrom + (this.L[3] - this.relFrom) * p;
      if (p >= 1 && this.v < 1e-4) this.done = true;
    } else if (this.seg < 3) {
      const target = this.L[this.seg];
      this.segT += 1;
      const p = this.segT / this.dur[this.seg];
      this.v = p >= 1 ? target : this.from + (target - this.from) * p;
      if (p >= 1) { this.from = target; this.seg += 1; this.segT = 0; }
    } else {
      this.v = this.L[2]; // hold at L3
    }
    // A percussive operator (L3 = 0) goes silent and frees even while gated.
    if (this.v < 1e-4 && this.seg > 0 && (this.released || this.L[2] < 1e-4)) {
      this.done = true;
    }
    return this.v;
  }
}

const TWO_PI = Math.PI * 2;
// Base modulation index (radians) a full-level modulator contributes, and the
// feedback self-modulation index. Tuned by ear against the reference patches.
const INDEX = 5.5;
// Bass uses a lower base index: its modulators sit at high ratios (5, 9), and at
// the epiano index they overdrive into bright, aliasing noise instead of reading
// as a bass. Feedback is milder too, for the same reason.
const BASS_INDEX = 2.6;
const FB_INDEX = 2.4;
// Portamento time for slide (legato) notes on monophonic engines.
const GLIDE_SEC = 0.055;

// Shared core. A subclass supplies buildOps(), which reads the live params and
// returns the six operator descriptors plus the output scalars. buildOps is
// called on note-on and again whenever the params it depends on change, so a
// morph control stays live on held notes.
export class FM6Voice {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.active = false;
    this.freq = 220;
    this.vel = 1;
    this.gateSec = 0.2;
    this.p = [0.5, 0.5, 0.5, 0.5, 0.2];
    this.freqTarget = 220;
    this.accentIndex = 1;
    // Per-sample glide coefficient: exponential approach to the target pitch.
    this.glideCoef = 1 - Math.exp(-1 / (GLIDE_SEC * sampleRate));
    this.phase = new Float64Array(7);   // index 1..6
    this.out = new Float64Array(7);
    this.prev = new Float64Array(7);
    this.prev2 = new Float64Array(7);
    this.env = [];
    for (let i = 0; i < 7; i++) this.env.push(new FMEnv(sampleRate));
    this.ops = null;
    this.dirtyKey = '';
  }

  // Overridden by each engine. Returns { ops, drive, index }. ops is a 1-based
  // array (index 0 unused); each op is { ratio, level, mods, fb, carrier, env }.
  buildOps() { return { ops: [], drive: 0, index: INDEX }; }

  // A short signature of the params buildOps depends on, so held notes rebuild
  // their operator layout only when a structural knob (ratio/morph) actually
  // moves, not every sample.
  structureKey() { return ''; }

  rebuild() {
    const cfg = this.buildOps();
    this.cfg = cfg;
    this.ops = cfg.ops;
  }

  noteOn({ freq, vel, gateSec, params, slide, accent }) {
    this.p = params;
    // Accent (a coincident alt-lane trigger) makes the note louder and, via a
    // higher modulation index, brighter, standing in for a 303 accent opening
    // the filter. Engines that never send accent get the plain note.
    this.vel = ((vel ?? 100) / 127) * (accent ? 1.4 : 1.0);
    this.accentIndex = accent ? 1.3 : 1.0;
    this.gateSec = gateSec;
    this.dirtyKey = this.structureKey();

    // Slide only ties into a note that is still sounding; otherwise it plays
    // normally. Legato keeps the oscillator phases and envelope stages running,
    // glides the pitch, and re-arms the gate. A normal note jumps pitch, resets
    // phases, and retriggers every operator envelope.
    const legato = slide && this.active && !this.env[1].done;
    this.freqTarget = freq;
    this.rebuild();
    if (legato) {
      for (let i = 1; i <= 6; i++) this.env[i].regate(gateSec);
    } else {
      this.freq = freq;
      for (let i = 1; i <= 6; i++) {
        this.phase[i] = 0;
        this.prev[i] = 0;
        this.prev2[i] = 0;
      }
      const atk = this.atkScale(), dec = this.decScale();
      for (let i = 1; i <= 6; i++) this.env[i].trigger(this.ops[i].env, gateSec, atk, dec);
    }
    this.active = true;
  }

  atkScale() { return 1; }
  decScale() { return 1; }

  render() {
    if (!this.active) return 0;

    // Rebuild the operator layout if a structural knob moved on a held note.
    const key = this.structureKey();
    if (key !== this.dirtyKey) {
      // A structural knob (the fmbass Type morph) moved on a held note. Rebuild
      // the operator ratios/levels; the running envelopes keep playing.
      this.dirtyKey = key;
      this.rebuild();
    }

    // Glide toward the target pitch. For a normal note freq already equals the
    // target, so this is a no-op; for a slide note it ramps over GLIDE_SEC.
    this.freq += (this.freqTarget - this.freq) * this.glideCoef;

    const ops = this.ops;
    const index = this.cfg.index * this.accentIndex;
    let outSum = 0;
    let carriers = 0;
    let alive = false;

    for (let i = 6; i >= 1; i--) {
      const op = ops[i];
      const e = this.env[i].process();
      if (!this.env[i].done) alive = true;

      this.phase[i] += (TWO_PI * this.freq * op.ratio) / this.sr;
      if (this.phase[i] > TWO_PI) this.phase[i] -= TWO_PI;

      let mod = 0;
      const m = op.mods;
      for (let k = 0; k < m.length; k++) {
        const j = m[k];
        mod += this.out[j] * (ops[j].level / 99) * this.env[j].v * index;
      }
      if (op.fb > 0) {
        mod += op.fb * FB_INDEX * (this.prev[i] + this.prev2[i]) * 0.5;
      }

      const s = Math.sin(this.phase[i] + mod);
      this.prev2[i] = this.prev[i];
      this.prev[i] = s;
      this.out[i] = s;

      if (op.carrier) {
        outSum += s * (op.level / 99) * e;
        carriers += 1;
      }
    }

    if (!alive) { this.active = false; return 0; }

    let y = carriers > 1 ? outSum / Math.sqrt(carriers) : outSum;
    const drive = this.cfg.drive;
    if (drive > 0) y = Math.tanh(y * (1 + drive * 4));
    return y * this.vel * 0.7 * (this.cfg.trim ?? 1);
  }
}

// --- Patch data decoded from ROM1A ------------------------------------------

// E.PIANO 1, algorithm 5: three 2-op towers (2->1, 4->3, 6->5), carriers on
// 1/3/5, feedback on op6. OP2 at ratio 14 is the tine ping.
const EPIANO = [
  null,
  { ratio: 1, out: 99, mods: [2], fb: 0, carrier: true, env: eg([96, 25, 25, 67], [99, 75, 0, 0]) },
  { ratio: 14, out: 58, mods: [], fb: 0, carrier: false, env: eg([95, 50, 35, 78], [99, 75, 0, 0]) },
  { ratio: 1, out: 99, mods: [4], fb: 0, carrier: true, env: eg([95, 20, 20, 50], [99, 95, 0, 0]) },
  { ratio: 1, out: 89, mods: [], fb: 0, carrier: false, env: eg([95, 29, 20, 50], [99, 95, 0, 0]) },
  { ratio: 1, out: 99, mods: [6], fb: 0, carrier: true, env: eg([95, 20, 20, 50], [99, 95, 0, 0]) },
  { ratio: 1, out: 79, mods: [6], fb: 0.5, carrier: false, env: eg([95, 29, 20, 50], [99, 95, 0, 0]) },
];

// FM BASS. Both patches share the single carrier (op1) and the same audio-path
// modulation (op1<-2,3,5; op3<-4; op5<-6). Only the ratios, levels, envelopes,
// and the feedback tap differ, so a Type morph slides between them. Feedback
// crossfades from op6 (BASS 1) to op2 (BASS 2).
const BASS_A = [ // BASS 1, algorithm 16, feedback op6
  null,
  { ratio: 0.5, out: 99, env: eg([95, 62, 17, 58], [99, 95, 32, 0]) },
  { ratio: 0.5, out: 80, env: eg([99, 20, 0, 0], [99, 0, 0, 0]) },
  { ratio: 0.5, out: 99, env: eg([88, 96, 32, 30], [79, 65, 0, 0]) },
  { ratio: 5.0, out: 93, env: eg([90, 42, 7, 55], [90, 30, 0, 0]) },
  { ratio: 0.5, out: 62, env: eg([99, 0, 0, 0], [99, 0, 0, 0]) },
  { ratio: 9.0, out: 85, env: eg([94, 56, 24, 55], [93, 28, 0, 0]) },
];
const BASS_B = [ // BASS 2, algorithm 17, feedback op2
  null,
  { ratio: 0.5, out: 99, env: eg([75, 37, 18, 63], [99, 70, 0, 0]) },
  { ratio: 0.5, out: 80, env: eg([28, 37, 42, 50], [99, 0, 0, 0]) },
  { ratio: 1.0, out: 68, env: eg([73, 25, 32, 30], [97, 78, 0, 0]) },
  { ratio: 0.5, out: 99, env: eg([80, 39, 28, 53], [93, 57, 0, 0]) },
  { ratio: 1.0, out: 75, env: eg([99, 51, 0, 0], [99, 74, 0, 0]) },
  { ratio: 0.5, out: 87, env: eg([25, 50, 24, 55], [96, 97, 0, 0]) },
];
// Shared audio-path modulation and the two feedback taps.
const BASS_MODS = [null, [2, 3, 5], [], [4], [], [6], []];
const BASS_FB_A = [null, 0, 0, 0, 0, 0, 1]; // op6 feedback in BASS 1
const BASS_FB_B = [null, 0, 1, 0, 0, 0, 0]; // op2 feedback in BASS 2

// Ratio steps a morph may pass through: harmonic values only, so an
// interpolated ratio snaps to a musical value instead of drifting inharmonic.
const RATIO_STEPS = [0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9];
function quantRatio(x) {
  let best = RATIO_STEPS[0], bd = Infinity;
  for (const r of RATIO_STEPS) { const d = Math.abs(r - x); if (d < bd) { bd = d; best = r; } }
  return best;
}
const lerp = (a, b, t) => a + (b - a) * t;
function lerpEnv(a, b, t) {
  const r = [0, 0, 0, 0], l = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) { r[i] = lerp(a.r[i], b.r[i], t); l[i] = lerp(a.l[i], b.l[i], t); }
  return { r, l };
}

// --- E.PIANO engine ---------------------------------------------------------
// Params: [Tine, Body, Attack, Decay, Drive]. Tine scales the op2 ping (and
// tracks velocity), Body scales the tower B/C modulators, Attack and Decay
// scale the envelopes, Drive is output saturation.
export class EpianoVoice extends FM6Voice {
  atkScale() { return 0.4 + this.p[2] * 2.6; }
  decScale() { return 0.4 + this.p[3] * 2.2; }
  structureKey() { return ''; } // fixed topology and ratios

  buildOps() {
    const tine = 0.5 + this.p[0] * 1.3 * (0.35 + 0.65 * this.vel);
    const body = 0.5 + this.p[1] * 1.1;
    const ops = [null];
    for (let i = 1; i <= 6; i++) {
      const src = EPIANO[i];
      let level = src.out;
      if (i === 2) level *= tine;         // tine modulator
      if (i === 4 || i === 6) level *= body; // tower B/C modulators
      ops.push({ ratio: src.ratio, level, mods: src.mods, fb: src.fb, carrier: src.carrier, env: src.env });
    }
    return { ops, drive: this.p[4], index: INDEX, trim: 0.62 };
  }
}

// --- FM BASS engine ---------------------------------------------------------
// Params: [Type, Punch, Tone, Decay, Drive]. Type morphs BASS 1 <-> BASS 2,
// Punch scales the deep modulators (op4/op6) that give the pluck, Tone scales
// overall modulation index, Decay scales the envelopes, Drive is saturation.
export class FmbassVoice extends FM6Voice {
  decScale() { return 0.4 + this.p[3] * 2.0; }
  // Quantize Type so held notes rebuild only at ratio-step boundaries.
  structureKey() { return String(Math.round(this.p[0] * 16)); }

  buildOps() {
    const t = this.p[0];
    const punch = 0.4 + this.p[1] * 1.4;
    const tone = 0.5 + this.p[2] * 0.9;
    const ops = [null];
    for (let i = 1; i <= 6; i++) {
      const a = BASS_A[i], b = BASS_B[i];
      const ratio = quantRatio(lerp(a.ratio, b.ratio, t));
      let level = lerp(a.out, b.out, t);
      if (i === 4 || i === 6) level *= punch;
      const fb = lerp(BASS_FB_A[i], BASS_FB_B[i], t);
      ops.push({
        ratio, level, mods: BASS_MODS[i], fb,
        carrier: i === 1, env: lerpEnv(a.env, b.env, t),
      });
    }
    return { ops, drive: this.p[4], index: BASS_INDEX * tone };
  }
}
