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

// 2x polyphase IIR halfband decimator (osamp.h R=4 coefficients). The FM core
// generates two sub-samples per output at the doubled rate, where the sine
// operators and the tanh drive alias much less; this folds them back to one
// base-rate sample. Fed the even sub-sample then the odd; ~65 dB stopband.
const HB_A = [0.089698028, 0.577350269];
const HB_B = [0.310919387, 0.850669771];

class Decim2x {
  constructor() { this.ax = [0, 0]; this.ay = [0, 0]; this.bx = [0, 0]; this.by = [0, 0]; }
  process(ev, od) {
    let o;
    o = HB_A[0] * (ev - this.ay[0]) + this.ax[0]; this.ax[0] = ev; this.ay[0] = o; ev = o;
    o = HB_A[1] * (ev - this.ay[1]) + this.ax[1]; this.ax[1] = ev; this.ay[1] = o; ev = o;
    o = HB_B[0] * (od - this.by[0]) + this.bx[0]; this.bx[0] = od; this.by[0] = o; od = o;
    o = HB_B[1] * (od - this.by[1]) + this.bx[1]; this.bx[1] = od; this.by[1] = o; od = o;
    return 0.5 * (ev + od);
  }
}

// DX7 output level (0..127) to modulation index. This nonlinear curve is what the
// ROM patch levels are calibrated against: a full-level (99) modulator gives an
// index of ~2.09, not the 5+ a linear map produces. Using it is what keeps the
// modulators from overdriving into buzz and aliasing. From the
// music-synthesizer-for-android / dx7-synth-js OL_TO_MOD reference table.
const OL_TO_MOD = [
  0.000000, 0.000039, 0.000078, 0.000117, 0.000157, 0.000196, 0.000254, 0.000303, 0.000360, 0.000428,
  0.000509, 0.000606, 0.000721, 0.000857, 0.001019, 0.001212, 0.001322, 0.001442, 0.001715, 0.001870,
  0.002224, 0.002425, 0.002645, 0.002884, 0.003145, 0.003430, 0.003740, 0.004079, 0.004448, 0.004851,
  0.005290, 0.005768, 0.006290, 0.006860, 0.007481, 0.008158, 0.008896, 0.009702, 0.010580, 0.011537,
  0.012582, 0.013720, 0.014962, 0.016316, 0.017793, 0.019404, 0.021160, 0.023075, 0.025163, 0.027441,
  0.029925, 0.032633, 0.035587, 0.038808, 0.042320, 0.046150, 0.050327, 0.054882, 0.059850, 0.065267,
  0.071174, 0.077616, 0.084641, 0.092301, 0.100656, 0.109766, 0.119700, 0.130534, 0.142349, 0.155232,
  0.169282, 0.184603, 0.201311, 0.219532, 0.239401, 0.261068, 0.284697, 0.310464, 0.338564, 0.369207,
  0.402623, 0.439063, 0.478802, 0.522137, 0.569394, 0.620929, 0.677128, 0.738413, 0.805245, 0.878126,
  0.957603, 1.044270, 1.138790, 1.241860, 1.354260, 1.476830, 1.610490, 1.756250, 1.915210, 2.088550,
  2.277580, 2.483720, 2.708510, 2.953650, 3.220980, 3.512500, 3.830410, 4.177100, 4.555150, 4.967430,
  5.417020, 5.907300, 6.441960, 7.025010, 7.660830, 8.354190, 9.110310, 9.934860, 10.83400, 11.81460,
  12.88390, 14.05000, 15.32170, 16.70840, 18.22060, 19.86970, 21.66810, 23.62920,
];
// Interpolated table lookup; the level is clamped so no macro can push a
// modulator into the runaway top of the curve.
const OL_MAX = 99;
function ol2mod(ol) {
  if (ol <= 0) return 0;
  if (ol >= OL_MAX) return OL_TO_MOD[OL_MAX];
  const i = ol | 0;
  return OL_TO_MOD[i] + (OL_TO_MOD[i + 1] - OL_TO_MOD[i]) * (ol - i);
}

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
    this.tog = [false, false, false];
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
    this.decim = new Decim2x();
  }

  // Overridden by each engine. Returns { ops, drive, index }. ops is a 1-based
  // array (index 0 unused); each op is { ratio, level, mods, fb, carrier, env }.
  buildOps() { return { ops: [], drive: 0, indexScale: 1 }; }

  // A short signature of the params buildOps depends on, so held notes rebuild
  // their operator layout only when a structural knob (ratio/morph) actually
  // moves, not every sample.
  structureKey() { return ''; }

  rebuild() {
    const cfg = this.buildOps();
    this.cfg = cfg;
    this.ops = cfg.ops;
  }

  noteOn({ freq, vel, gateSec, params, slide, accent, toggles }) {
    this.p = params;
    if (toggles) this.tog = toggles; // read by subclasses that use switches (DX100)
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
    // Tone / accent scale the modulation on top of the per-operator index that
    // buildOps already took from the DX curve.
    const idxScale = this.cfg.indexScale * this.accentIndex;
    const drive = this.cfg.drive;

    // Envelopes run once per output sample (control rate); their values are held
    // across the two oversampled sub-samples below.
    let alive = false;
    for (let i = 1; i <= 6; i++) {
      this.env[i].process();
      if (!this.env[i].done) alive = true;
    }
    if (!alive) { this.active = false; return 0; }

    // Run the operator math twice at the doubled rate (phase increment halved),
    // where the sines and the drive alias far less, then decimate. Operator
    // outputs and feedback update every sub-sample; the envelope values are held.
    const inc = (TWO_PI * this.freq) / (this.sr * 2);
    let sub0 = 0, sub1 = 0;
    for (let s = 0; s < 2; s++) {
      let outSum = 0;
      let carriers = 0;
      for (let i = 6; i >= 1; i--) {
        const op = ops[i];
        this.phase[i] += inc * op.ratio;
        if (this.phase[i] > TWO_PI) this.phase[i] -= TWO_PI;

        let mod = 0;
        const m = op.mods;
        for (let k = 0; k < m.length; k++) {
          const j = m[k];
          mod += this.out[j] * this.env[j].v * ops[j].modIndex * idxScale;
        }
        if (op.fb > 0) {
          // Feedback amount is the DX 2^(fb-7) ratio; two-sample average tames it.
          mod += op.fb * (this.prev[i] + this.prev2[i]) * 0.5;
        }

        const sig = Math.sin(this.phase[i] + mod);
        this.prev2[i] = this.prev[i];
        this.prev[i] = sig;
        this.out[i] = sig;

        if (op.carrier) {
          outSum += sig * (op.level / 99) * this.env[i].v;
          carriers += 1;
        }
      }
      let y = carriers > 1 ? outSum / Math.sqrt(carriers) : outSum;
      if (drive > 0) y = Math.tanh(y * (1 + drive * 4));
      if (s === 0) sub0 = y; else sub1 = y;
    }

    const out = this.decim.process(sub0, sub1);
    return out * this.vel * 0.7 * (this.cfg.trim ?? 1);
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
    const tine = 0.9 + this.p[0] * 1.0 * (0.3 + 0.7 * this.vel);
    const body = 0.45 + this.p[1] * 0.7;
    const ops = [null];
    for (let i = 1; i <= 6; i++) {
      const src = EPIANO[i];
      let level = src.out;
      if (i === 2) level *= tine;         // tine modulator
      if (i === 4 || i === 6) level *= body; // tower B/C modulators
      ops.push({ ratio: src.ratio, level, modIndex: ol2mod(level), mods: src.mods, fb: src.fb, carrier: src.carrier, env: src.env });
    }
    return { ops, drive: this.p[4], indexScale: 1, trim: 0.62 };
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
    const punch = 0.6 + this.p[1] * 0.7;
    const tone = 0.6 + this.p[2] * 1.1;
    const ops = [null];
    for (let i = 1; i <= 6; i++) {
      const a = BASS_A[i], b = BASS_B[i];
      const ratio = quantRatio(lerp(a.ratio, b.ratio, t));
      let level = lerp(a.out, b.out, t);
      if (i === 4 || i === 6) level *= punch;
      const fb = lerp(BASS_FB_A[i], BASS_FB_B[i], t);
      ops.push({
        ratio, level, modIndex: ol2mod(level), mods: BASS_MODS[i], fb,
        carrier: i === 1, env: lerpEnv(a.env, b.env, t),
      });
    }
    return { ops, drive: this.p[4], indexScale: tone };
  }
}

// --- DX100 engine (4-op FM) -------------------------------------------------
// The Yamaha DX100 / TX81Z four-operator voice, our subset of the six-operator
// core: it uses ops 1-4 and parks 5 and 6 idle. Two 2-op stacks (op2->op1,
// op4->op3) with the two carriers slightly detuned give the fat, chorused
// "Lately Bass" that ran through late-80s and early-90s house. Op2 carries the
// feedback growl. Params: [Harmonic, Timbre, Feedback, Decay, Drive]; toggles
// Sub (op3 drops an octave for a deep sub) and Bright (extra modulation index).

// Musical modulator ratios the Harmonic knob steps through. Higher = brighter,
// more metallic; 1 is the round fundamental bass.
const DX100_HARM = [1, 2, 3, 4, 5, 6, 7];

// Fixed carrier and modulator output levels + envelopes (DX 0..99). Carriers
// sustain like a bass; modulators pluck (peak, then decay to a low sustain) so
// the tone is bright on the attack and rounder on the hold.
const DX100 = [
  null,
  { out: 99, env: eg([99, 70, 66, 60], [99, 92, 88, 0]) }, // op1 carrier
  { out: 86, env: eg([99, 52, 28, 62], [99, 55, 20, 0]) }, // op2 modulator -> op1 (feedback)
  { out: 92, env: eg([99, 70, 66, 60], [99, 92, 88, 0]) }, // op3 carrier (detuned or sub)
  { out: 80, env: eg([99, 50, 24, 62], [99, 52, 16, 0]) }, // op4 modulator -> op3
];
// A parked operator: level 0, no routing, and an envelope that finishes at once
// so it never keeps the voice alive.
const DX100_IDLE = { ratio: 1, level: 0, modIndex: 0, mods: [], fb: 0, carrier: false, env: eg([99, 99, 99, 99], [0, 0, 0, 0]) };

export class DX100Voice extends FM6Voice {
  decScale() { return 0.4 + this.p[3] * 2.0; }
  // Rebuild a held note only when a structural control (harmonic step, toggle,
  // feedback, or timbre) actually moves.
  structureKey() {
    return `${Math.floor(this.p[0] * DX100_HARM.length)}:${this.tog[0] ? 1 : 0}:${this.tog[1] ? 1 : 0}:${Math.round(this.p[2] * 6)}:${Math.round(this.p[1] * 6)}`;
  }

  buildOps() {
    const harm = DX100_HARM[Math.min(DX100_HARM.length - 1, Math.floor(this.p[0] * DX100_HARM.length))];
    const sub = !!this.tog[0];
    const bright = !!this.tog[1];
    const fb = this.p[2] * 0.9;                       // op2 feedback growl
    const c3ratio = sub ? 0.5 : 1.007;               // sub octave, or a subtle detune for width
    const timbre = (0.45 + this.p[1] * 1.25) * (bright ? 1.35 : 1);
    const mk = (ratio, src, mods, fbAmt, carrier) => ({
      ratio, level: src.out, modIndex: ol2mod(src.out), mods, fb: fbAmt, carrier, env: src.env,
    });
    const ops = [null,
      mk(1.0, DX100[1], [2], 0, true),
      mk(harm, DX100[2], [], fb, false),
      mk(c3ratio, DX100[3], [4], 0, true),
      mk(harm, DX100[4], [], 0, false),
      DX100_IDLE, DX100_IDLE,
    ];
    return { ops, drive: this.p[4], indexScale: timbre, trim: 0.7 };
  }
}
