// SPDX-License-Identifier: 0BSD

// Effects pedal DSP, shared by the AudioWorklet fx-processor and the offline
// renderer, the same way engine sub-voices are shared. Each voice is mono-or-
// stereo in, stereo out, and processes a block:
//
//   voice.process(inL, inR, outL, outR, n)
//
// The send bus is mono, so inL and inR are usually equal; a voice may still
// write a stereo image to outL/outR (ping-pong delay does). The voice applies
// its own Mix knob (effect wet/dry). Footswitch bypass is handled one level up
// in the processor as a smoothed crossfade, so voices do not know about it.

// Straight-through: the empty slot. Copies input to output unchanged.
export class ThruVoice {
  // eslint-disable-next-line no-unused-vars
  constructor(sr) {}
  // eslint-disable-next-line no-unused-vars
  setParams(values) {}
  process(inL, inR, outL, outR, n) {
    for (let i = 0; i < n; i++) { outL[i] = inL[i]; outR[i] = inR[i]; }
  }
}

// Ping-pong delay. A mono input feeds the left line; the left line bounces to
// the right, and the right feeds back to the left, so repeats alternate across
// the stereo field. Knobs: Time, Repeats (feedback), Tone (damps the repeats),
// Mix (effect wet/dry).
export class DelayVoice {
  constructor(sr) {
    this.sr = sr;
    this.max = Math.ceil(sr * 1.0) + 1; // up to 1s of delay
    this.bufL = new Float32Array(this.max);
    this.bufR = new Float32Array(this.max);
    this.w = 0;
    this.lpL = 0;
    this.lpR = 0;
    this.setParams([0.4, 0.45, 0.6, 0.5]);
  }

  // values = [time, feedback, tone, mix], each 0..1.
  setParams(values) {
    this.time = values[0] || 0;
    this.feedback = values[1] || 0;
    this.tone = values[2] || 0;
    this.mix = values[3] || 0;
  }

  process(inL, inR, outL, outR, n) {
    const max = this.max;
    // Time maps to 20ms..750ms. No tempo sync yet.
    const delaySamp = Math.max(1, Math.min(max - 1, Math.round((0.02 + this.time * 0.73) * this.sr)));
    const fb = Math.min(0.95, this.feedback * 0.95);
    // Tone is a one-pole lowpass on the repeats: bright near 1, dark near 0.
    const toneA = 0.04 + this.tone * this.tone * 0.92;
    const mix = this.mix;
    let w = this.w;
    for (let i = 0; i < n; i++) {
      const rp = w - delaySamp + (w - delaySamp < 0 ? max : 0);
      const dL = this.bufL[rp];
      const dR = this.bufR[rp];
      this.lpL += (dL - this.lpL) * toneA;
      this.lpR += (dR - this.lpR) * toneA;
      const inMono = (inL[i] + inR[i]) * 0.5;
      this.bufL[w] = inMono + this.lpR * fb;
      this.bufR[w] = this.lpL * fb;
      w = w + 1 === max ? 0 : w + 1;
      outL[i] = inL[i] * (1 - mix) + dL * mix;
      outR[i] = inR[i] * (1 - mix) + dR * mix;
    }
    this.w = w;
  }
}

// Fuzz / overdrive, ported from the DooomFuzzz LV2 (smoltrek
// src/plugins/dooomfuzzz, doc/dsp/fuzz.md), reduced to the "dooom" heart, which
// its tuning notes rate the best-sounding profile. The full pedal has a dozen
// profiles and ~20 controls; this is the single voiced chain:
//
//   2x oversample -> [octave blend -> silicon cubic clip] -> downsample
//                  -> DC block -> RAT variable-LP tone -> level
//
// Knobs: Drive (1x..100x), Tone (RAT sweep, up = brighter), Fuzz (Green Ringer
// octave blend + clip bias, sweeping overdrive -> octave fuzz), Level. The 2x
// oversampler is a polyphase IIR halfband (osamp.h, R=4); it is what keeps hard
// clipping from aliasing into fizz. Slew, sag, the other clip curves, and the
// Muff/cascade tone stacks are left for later, as in the C.
const OSHB_A = [0.089698028, 0.577350269]; // even-phase allpass cascade
const OSHB_B = [0.310919387, 0.850669771]; // odd-phase allpass cascade

// 2x polyphase IIR halfband oversampler (osamp.h, R=4). up() splits one
// base-rate sample into an even and an odd 2x subsample (in this.ev/this.od);
// process both, then down() folds them back to one base-rate sample. Separate
// allpass states for the up and down passes, one-multiply sections.
class Oversampler2x {
  constructor() {
    this.uaX = [0, 0]; this.uaY = [0, 0]; this.ubX = [0, 0]; this.ubY = [0, 0];
    this.daX = [0, 0]; this.daY = [0, 0]; this.dbX = [0, 0]; this.dbY = [0, 0];
    this.ev = 0; this.od = 0;
  }
  up(x) {
    let ev = x, od = x, o;
    o = OSHB_A[0] * (ev - this.uaY[0]) + this.uaX[0]; this.uaX[0] = ev; this.uaY[0] = o; ev = o;
    o = OSHB_A[1] * (ev - this.uaY[1]) + this.uaX[1]; this.uaX[1] = ev; this.uaY[1] = o; ev = o;
    o = OSHB_B[0] * (od - this.ubY[0]) + this.ubX[0]; this.ubX[0] = od; this.ubY[0] = o; od = o;
    o = OSHB_B[1] * (od - this.ubY[1]) + this.ubX[1]; this.ubX[1] = od; this.ubY[1] = o; od = o;
    this.ev = ev; this.od = od;
  }
  down(ev, od) {
    let o;
    o = OSHB_A[0] * (ev - this.daY[0]) + this.daX[0]; this.daX[0] = ev; this.daY[0] = o; ev = o;
    o = OSHB_A[1] * (ev - this.daY[1]) + this.daX[1]; this.daX[1] = ev; this.daY[1] = o; ev = o;
    o = OSHB_B[0] * (od - this.dbY[0]) + this.dbX[0]; this.dbX[0] = od; this.dbY[0] = o; od = o;
    o = OSHB_B[1] * (od - this.dbY[1]) + this.dbX[1]; this.dbX[1] = od; this.dbY[1] = o; od = o;
    return 0.5 * (ev + od);
  }
}

// Clipping curves from clip.h. clipCubic is the silicon Big Muff cubic (T = 1
// with a small bias, 1.5x restores unity); clipCubicT is the parametric cubic
// clamped to [-tneg, tpos], saturating with zero slope at a (2/3)T ceiling.
function clipCubic(inp, gain, bias) {
  let x = inp * gain + bias;
  if (x > 1) x = 1; else if (x < -1) x = -1;
  x = x - (1 / 3) * x * x * x;
  return 1.5 * x - bias;
}

function clipCubicT(x, tpos, tneg) {
  if (x > tpos) x = tpos; else if (x < -tneg) x = -tneg;
  const t = x >= 0 ? tpos : tneg;
  return x - x * x * x / (3 * t * t);
}

export class FuzzVoice {
  constructor(sr) {
    this.sr = sr;
    this.fs2 = 2 * sr;
    // Green Ringer input high-pass (~200 Hz at the 2x rate) and the ~5 Hz DC
    // blocker pole, both init-time constants (ringer.h, util.h).
    this.ringerHpCoef = 1 - Math.exp(-2 * Math.PI * 200 / this.fs2);
    this.dcR = 1 - 2 * Math.PI * 5 / sr;
    this.os = new Oversampler2x();
    this.rhp = 0;      // ringer high-pass state
    this.dcx = 0; this.dcy = 0;
    this.ratS = 0;     // RAT tone one-pole state
    this.setParams([0.5, 0.5, 0.25, 0.5]);
  }

  // values = [drive, tone, fuzz, level], each 0..1.
  setParams(values) {
    const drive = values[0] || 0;
    const tone = values[1] || 0;
    const fuzz = values[2] || 0;
    const level = values[3] || 0;
    this.drive = Math.pow(10, 2 * drive);  // 1x..100x, the fuzz.md gain map
    this.oct = fuzz;                        // octave/fuzz blend amount
    this.bias = 0.12 * fuzz;                // asymmetry grows with fuzz
    // RAT-style variable one-pole low-pass, but inverted so tone up = brighter
    // (fuzz.md's knob is clockwise-darker; candyRACK expects the opposite).
    let fc = 400 * Math.exp(3.68888 * tone); // ~400 Hz .. ~16 kHz
    const nyq = this.sr * 0.49;
    if (fc > nyq) fc = nyq;
    let w = Math.PI * fc / this.sr;
    if (w > 1.4) w = 1.4;
    const g = Math.tan(w);
    this.ratG = g / (1 + g);
    this.level = level * 1.3;
  }

  // One 2x-region subsample through octave -> cubic clip (clip.h clip_cubic,
  // ringer.h ringer_process). The ringer state is shared across the even and
  // odd subsamples in time order, matching the C.
  _stage(x, drive, bias, oct, hpc) {
    if (oct > 0.0009) {
      this.rhp += hpc * (x - this.rhp);
      const xx = (x - this.rhp) * 2.0;      // pre-gain
      const vf = 0.25;                       // diode drop per branch
      const pos = xx > vf ? xx - vf : 0.0;
      const neg = -xx > vf ? -xx - vf : 0.0;
      const o = (pos + neg) * 1.8;           // full-wave rectify, make up vf
      x = (1 - oct) * x + oct * o;
    }
    let y = x * drive + bias;
    if (y > 1) y = 1; else if (y < -1) y = -1;
    y = y - y * y * y * (1 / 3);
    return 1.5 * y - bias;
  }

  process(inL, inR, outL, outR, n) {
    const drive = this.drive, bias = this.bias, oct = this.oct;
    const ratG = this.ratG, level = this.level, hpc = this.ringerHpCoef, R = this.dcR;
    const os = this.os;
    for (let i = 0; i < n; i++) {
      const x = (inL[i] + inR[i]) * 0.5 + 1e-20; // mono send, anti-denorm
      os.up(x);
      const ev = this._stage(os.ev, drive, bias, oct, hpc);
      const od = this._stage(os.od, drive, bias, oct, hpc);
      let wet = os.down(ev, od);
      // DC blocker
      const dc = wet - this.dcx + R * this.dcy; this.dcx = wet; this.dcy = dc; wet = dc;
      // RAT variable low-pass tone (TPT one-pole)
      const v = (wet - this.ratS) * ratG; const lp = v + this.ratS; this.ratS = lp + v; wet = lp;
      wet *= level;
      outL[i] = wet; outR[i] = wet;
    }
  }
}

// Octave-up / ring, ported from the DooomFuzzz Green Ringer (ringer.h) plus its
// blend and null controls (dooomfuzzz.c octave section). Full-wave rectifying a
// note doubles its frequency (octave up); balanced branches cancel the
// fundamental for a pure octave, and the Null knob bleeds it back for the
// ring-mod clang. Runs in the 2x region so the rectifier corners do not alias.
//
//   Blend: dry .. full octave     Null: pure octave .. fundamental bleed
//   Drive: pre-gain into the rectifier (how hard/clean the octave tracks)
//   Level: output
export class OctaveVoice {
  constructor(sr) {
    this.sr = sr;
    this.fs2 = 2 * sr;
    this.ringerHpCoef = 1 - Math.exp(-2 * Math.PI * 200 / this.fs2);
    this.dcR = 1 - 2 * Math.PI * 5 / sr;
    this.os = new Oversampler2x();
    this.rhp = 0;
    this.dcx = 0; this.dcy = 0;
    this.setParams([0.5, 0.3, 0.4, 0.5]);
  }

  // values = [blend, null, drive, level], each 0..1.
  setParams(values) {
    this.blend = values[0] || 0;
    this.nul = values[1] || 0;
    this.pre = 1 + 5 * (values[2] || 0); // 1x..6x pre-gain into the rectifier
    this.level = (values[3] || 0) * 1.2;
  }

  // Green Ringer at one 2x subsample: input high-pass, full-wave rectify with a
  // diode drop per branch, the Null knob unbalancing the negative branch.
  _ring(x) {
    this.rhp += this.ringerHpCoef * (x - this.rhp);
    const xx = (x - this.rhp) * this.pre;
    const vf = 0.25;
    const pos = xx > vf ? xx - vf : 0.0;
    const neg = -xx > vf ? -xx - vf : 0.0;
    return (pos + neg * (1.0 - 0.3 * this.nul)) * 1.8;
  }

  process(inL, inR, outL, outR, n) {
    const blend = this.blend, level = this.level, R = this.dcR;
    const os = this.os;
    for (let i = 0; i < n; i++) {
      const x = (inL[i] + inR[i]) * 0.5 + 1e-20;
      os.up(x);
      let ev = os.ev, od = os.od;
      // rectify each subsample (shared high-pass state, even then odd in time
      // order) and blend against the dry 2x signal
      ev = (1 - blend) * ev + blend * this._ring(ev);
      od = (1 - blend) * od + blend * this._ring(od);
      // soft-limit the blended octave so hot rectification stays musical
      ev = Math.tanh(ev);
      od = Math.tanh(od);
      let wet = os.down(ev, od);
      const dc = wet - this.dcx + R * this.dcy; this.dcx = wet; this.dcy = dc; wet = dc;
      wet *= level;
      outL[i] = wet; outR[i] = wet;
    }
  }
}

// Muff-style sustain, ported from the DooomFuzzz MUFF profile (dooomfuzzz.c
// two_stage path, clip.h, tone.h). The classic Big Muff violin sustain: two
// cascaded soft cubic clipping stages, each followed by the in-stage high-cut
// the feedback caps give (stagelp), into the Muff parallel LP/HP tone stack.
// The Sag knob adds the vintage supply-sag compression on attacks; without it
// the stage is the stiff op-amp Muff.
//
//   Sustain (drive into both stages)  Tone (dark LP .. bright HP crossfade)
//   Sag (supply-sag depth on stage 1) Level
export class MuffVoice {
  constructor(sr) {
    this.sr = sr;
    this.fs2 = 2 * sr;
    this.dcR = 1 - 2 * Math.PI * 5 / sr;
    this.stagelpCoef = 1 - Math.exp(-2 * Math.PI * 7000 / this.fs2); // ~7 kHz at 2x
    this.sagCoef = 1 - Math.exp(-1 / (0.004 * this.fs2));            // ~4 ms at 2x
    this.os = new Oversampler2x();
    this.lp1 = 0; this.lp2 = 0;   // in-stage rolloff states, one per stage
    this.sagEnv = 0;
    this.dcx = 0; this.dcy = 0;
    this.mLp = 0; this.mHp = 0;    // Muff tone stack states
    this.setParams([0.6, 0.5, 0.2, 0.5]);
  }

  // values = [sustain, tone, sag, level], each 0..1.
  setParams(values) {
    this.drive = Math.pow(10, 2 * (values[0] || 0)); // 1x..100x
    this.tone = values[1] || 0;
    this.sagOn = (values[2] || 0) > 0.01;
    this.sagDepth = 0.3 * (values[2] || 0);
    // Muff tone: parallel 1st-order LP at 400 Hz, HP at 1.5 kHz, base rate.
    const glp = Math.tan(Math.PI * 400 / this.sr);
    const ghp = Math.tan(Math.PI * 1500 / this.sr);
    this.mGlp = glp / (1 + glp);
    this.mGhp = ghp / (1 + ghp);
    this.level = (values[3] || 0) * 1.3;
  }

  // Two cascaded cubics with in-stage rolloff between and after, at one 2x
  // subsample. Stage 1 swaps to the sag path when the Sag knob is up.
  _stage(x) {
    if (this.sagOn) {
      const y = x * this.drive;
      this.sagEnv += this.sagCoef * (Math.abs(y) - this.sagEnv);
      let ceil = 1 - this.sagDepth * this.sagEnv;
      if (ceil < 0.6) ceil = 0.6;   // sag floor: always stable
      x = clipCubicT(y, ceil, ceil);
    } else {
      x = clipCubic(x, this.drive, 0);
    }
    this.lp1 += this.stagelpCoef * (x - this.lp1); x = this.lp1;
    x = clipCubic(x, 0.8, 0.05);    // second stage, slightly biased
    this.lp2 += this.stagelpCoef * (x - this.lp2); x = this.lp2;
    return x;
  }

  process(inL, inR, outL, outR, n) {
    const os = this.os, R = this.dcR, tone = this.tone;
    const Glp = this.mGlp, Ghp = this.mGhp, level = this.level;
    for (let i = 0; i < n; i++) {
      const x = (inL[i] + inR[i]) * 0.5 + 1e-20;
      os.up(x);
      const ev = this._stage(os.ev);
      const od = this._stage(os.od);
      let wet = os.down(ev, od);
      const dc = wet - this.dcx + R * this.dcy; this.dcx = wet; this.dcy = dc; wet = dc;
      // Muff parallel LP/HP tone crossfade (tone.h muff_tone_process)
      const vlp = (wet - this.mLp) * Glp; const outlp = vlp + this.mLp; this.mLp = outlp + vlp;
      const vhp = (wet - this.mHp) * Ghp; const lpofhp = vhp + this.mHp; this.mHp = lpofhp + vhp;
      const outhp = wet - lpofhp;
      wet = (1 - tone) * outlp + tone * outhp;
      wet *= level;
      outL[i] = wet; outR[i] = wet;
    }
  }
}

// Factory keyed by pedal type id, mirroring kitPartVoice(). Unknown ids fall
// back to Thru so an empty or future slot is a safe passthrough.
export function fxVoice(type, sr) {
  if (type === 'delay') return new DelayVoice(sr);
  if (type === 'fuzz') return new FuzzVoice(sr);
  if (type === 'octave') return new OctaveVoice(sr);
  if (type === 'muff') return new MuffVoice(sr);
  return new ThruVoice(sr);
}
