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
    this.hold = false; // freeze footswitch (sw2): loop the buffer, mute input
    this.setParams([0.4, 0.45, 0.6, 0.5]);
  }

  // values = [time, feedback, tone, mix], each 0..1.
  setParams(values) {
    this.time = values[0] || 0;
    this.feedback = values[1] || 0;
    this.tone = values[2] || 0;
    this.mix = values[3] || 0;
  }

  // Secondary footswitch = Freeze/Hold (momentary). While held, the delay stops
  // capturing new input and recirculates at near-unity so the current contents
  // loop as a frozen phrase; releasing returns to the knob feedback.
  setSecondary(on) {
    this.hold = !!on;
  }

  process(inL, inR, outL, outR, n) {
    const max = this.max;
    // Time maps to 20ms..750ms. No tempo sync yet.
    const delaySamp = Math.max(1, Math.min(max - 1, Math.round((0.02 + this.time * 0.73) * this.sr)));
    // While frozen, drive the feedback to near-unity and mute the input so the
    // captured audio loops instead of decaying or taking new sound.
    const fb = this.hold ? 0.995 : Math.min(0.95, this.feedback * 0.95);
    const inG = this.hold ? 0 : 1;
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
      const inMono = (inL[i] + inR[i]) * 0.5 * inG;
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

// RAT-style distortion, ported from the DooomFuzzz RAT profile (dooomfuzzz.c:
// CLIP_SYM + slew + TONE_RAT). The LM308 op-amp overdrive into hard silicon
// clipping: a slew limiter softens the input (the LM308's slew rate), the
// silicon cubic clips hard, and the RAT "Filter" variable low-pass sets the
// tone. No octave, so it stacks cleanly (two in a row = the Hardfloor rig).
//
//   Drive (1x..100x)   Tone (RAT variable LP, up = brighter)   Level
export class RatVoice {
  constructor(sr) {
    this.sr = sr;
    this.fs2 = 2 * sr;
    this.dcR = 1 - 2 * Math.PI * 5 / sr;
    this.os = new Oversampler2x();
    this.slewLast = 0;
    this.dcx = 0; this.dcy = 0;
    this.ratS = 0;
    this.setParams([0.5, 0.5, 0.5]);
  }

  // values = [drive, tone, level], each 0..1.
  setParams(values) {
    this.drive = Math.pow(10, 2 * (values[0] || 0));
    let fc = 400 * Math.exp(3.68888 * (values[1] || 0)); // ~400 Hz .. ~16 kHz
    const nyq = this.sr * 0.49;
    if (fc > nyq) fc = nyq;
    let w = Math.PI * fc / this.sr;
    if (w > 1.4) w = 1.4;
    const g = Math.tan(w);
    this.ratG = g / (1 + g);
    this.level = (values[2] || 0) * 1.3;
    // Fixed LM308 slew rate (the RAT has no slew knob); the DooomFuzzz rat
    // profile forces it on at 0.2, step = 0.5 - 0.45*0.2 (per 2x sample).
    this.slewStep = 0.41;
  }

  // Slew-limit the pre-drive signal, then silicon cubic clip. Shared slew state
  // across the even and odd subsamples in time order, matching the C.
  _slewClip(x, drive, step) {
    let d = x - this.slewLast;
    if (d > step) d = step; else if (d < -step) d = -step;
    this.slewLast += d;
    return clipCubic(this.slewLast, drive, 0);
  }

  process(inL, inR, outL, outR, n) {
    const os = this.os, drive = this.drive, ratG = this.ratG, level = this.level;
    const R = this.dcR, step = this.slewStep;
    for (let i = 0; i < n; i++) {
      const x = (inL[i] + inR[i]) * 0.5 + 1e-20;
      os.up(x);
      const ev = this._slewClip(os.ev, drive, step);
      const od = this._slewClip(os.od, drive, step);
      let wet = os.down(ev, od);
      const dc = wet - this.dcx + R * this.dcy; this.dcx = wet; this.dcy = dc; wet = dc;
      const v = (wet - this.ratS) * ratG; const lp = v + this.ratS; this.ratS = lp + v; wet = lp;
      wet *= level;
      outL[i] = wet; outR[i] = wet;
    }
  }
}

// Distortion+ / DOD 250, the near-identical op-amp-into-diode-clipper circuit.
// One pedal, a Ge/Si toggle picks the diode: germanium (MXR Distortion+) is the
// soft, compressed, quieter clip (clip.h CLIP_GE, 0.45 ceiling); silicon (DOD
// 250) is the harder, louder cubic clip. A fixed output low-pass tames the fizz
// both circuits leave. 2x oversampled.
//
//   Drive (1x..100x)   Level      toggle: Silicon (on) vs Germanium (off)
export class DistVoice {
  constructor(sr) {
    this.sr = sr;
    this.fs2 = 2 * sr;
    this.dcR = 1 - 2 * Math.PI * 5 / sr;
    this.outLpCoef = 1 - Math.exp(-2 * Math.PI * 4000 / sr); // fixed ~4 kHz de-fizz
    this.os = new Oversampler2x();
    this.dcx = 0; this.dcy = 0;
    this.outLp = 0;
    this.silicon = false;
    this.setParams([0.5, 0.5]);
  }

  // values = [drive, level], each 0..1.
  setParams(values) {
    this.drive = Math.pow(10, 2 * (values[0] || 0));
    this.level = (values[1] || 0) * 1.3;
  }

  // toggles[0] = silicon (DOD 250) when true, germanium (Distortion+) when false.
  setToggles(values) {
    this.silicon = !!(values && values[0]);
  }

  _clip(x) {
    if (this.silicon) return clipCubic(x, this.drive, 0); // silicon: hard cubic
    // germanium: soft exp knee, low 0.45 ceiling, compressed and quieter
    const y = x * this.drive;
    if (y >= 0) return 0.45 * (1 - Math.exp(-3 * y));
    return -0.45 * (1 - Math.exp(3 * y));
  }

  process(inL, inR, outL, outR, n) {
    const os = this.os, R = this.dcR, level = this.level, lpc = this.outLpCoef;
    for (let i = 0; i < n; i++) {
      const x = (inL[i] + inR[i]) * 0.5 + 1e-20;
      os.up(x);
      const ev = this._clip(os.ev);
      const od = this._clip(os.od);
      let wet = os.down(ev, od);
      const dc = wet - this.dcx + R * this.dcy; this.dcx = wet; this.dcy = dc; wet = dc;
      this.outLp += lpc * (wet - this.outLp); wet = this.outLp; // fixed de-fizz LP
      wet *= level;
      outL[i] = wet; outR[i] = wet;
    }
  }
}

// Echo: a lo-fi analog stereo delay after a PT2399-based DIY pedal, the dirty
// counterpart to the clean digital Delay. The signature is an asymmetric diode
// overdrive on the input (two 1N4148 in series, Vf ~1.4 V, against a BAT41
// Schottky, Vf ~0.4 V) that adds even-order harmonics and soft-clips hot input;
// then a dark, bandwidth-limited delay that loses top end as the time grows
// (the PT2399 character), a slow modulation for analog width/warble, companding
// soft-saturation in the loop that lets the feedback settle into a musical
// self-oscillation, and a dry/wet mix. Two lines for stereo.
//
//   Time  Repeats  Drive(asym diode)  Tone(dark)  Mod(warble/width)  Mix
//   toggle: Ping (ping-pong)          sw2: Osc (momentary self-oscillation)
export class EchoVoice {
  constructor(sr) {
    this.sr = sr;
    this.max = Math.ceil(sr * 0.7) + 2; // up to ~700 ms
    this.bufL = new Float32Array(this.max);
    this.bufR = new Float32Array(this.max);
    this.w = 0;
    this.lpL = 0; this.lpR = 0;   // dark feedback tone one-poles
    this.idcX = 0; this.idcY = 0; // input DC blocker (removes the drive offset)
    this.modPh = 0;
    this.ping = false;
    this.osc = false;
    this.setParams([0.4, 0.45, 0.3, 0.45, 0.25, 0.5]);
  }

  // values = [time, repeats, drive, tone, mod, mix], each 0..1.
  setParams(values) {
    const time = values[0] || 0, repeats = values[1] || 0, drive = values[2] || 0;
    const tone = values[3] || 0, mod = values[4] || 0, mix = values[5] || 0;
    const ms = 40 + time * 560;     // 40..600 ms
    this.delaySamp = Math.max(2, Math.min(this.max - 3, ms * 0.001 * this.sr));
    this.fb = Math.min(1.02, repeats * 1.02);
    this.driveGain = 1 + drive * 7;
    // Feedback low-pass: Tone sets brightness, and a longer time darkens it
    // further, the way a PT2399 loses bandwidth as the delay grows.
    this.toneA = (0.06 + tone * tone * 0.7) * (1 - time * 0.5);
    this.mix = mix;
    this.modInc = 2 * Math.PI * 0.4 / this.sr;  // ~0.4 Hz warble
    this.modDepth = mod * 0.004 * this.sr;      // up to ~4 ms
  }

  setToggles(values) { this.ping = !!(values && values[0]); }
  setSecondary(on) { this.osc = !!on; }

  // Fractional read `d` samples behind the write head (linear interpolation).
  _read(buf, d) {
    let rp = this.w - d;
    if (rp < 0) rp += this.max;
    if (rp >= this.max) rp -= this.max; // guard float rounding to exactly max
    const i0 = rp | 0;
    const fr = rp - i0;
    const a = buf[i0];
    const b = buf[i0 + 1 >= this.max ? 0 : i0 + 1];
    return a + (b - a) * fr;
  }

  process(inL, inR, outL, outR, n) {
    const fb = this.osc ? Math.max(this.fb, 1.06) : this.fb; // Osc: self-oscillate
    const dg = this.driveGain, toneA = this.toneA, mix = this.mix;
    const depth = this.modDepth, ping = this.ping, base = this.delaySamp;
    const tPos = 1.4, tNeg = 0.42; // the silicon / Schottky diode thresholds
    for (let i = 0; i < n; i++) {
      // asymmetric diode overdrive, then block its DC offset
      let x = clipCubicT((inL[i] + inR[i]) * 0.5 * dg, tPos, tNeg);
      const dcy = x - this.idcX + 0.9995 * this.idcY; this.idcX = x; this.idcY = dcy; x = dcy;
      // quadrature modulation gives the two lines a stereo image
      this.modPh += this.modInc; if (this.modPh > 6.2831853) this.modPh -= 6.2831853;
      const dL = this._read(this.bufL, base + Math.sin(this.modPh) * depth);
      const dR = this._read(this.bufR, base + Math.cos(this.modPh) * depth);
      // dark PT2399-style feedback tone
      this.lpL += (dL - this.lpL) * toneA;
      this.lpR += (dR - this.lpR) * toneA;
      // write with feedback; companding tanh keeps self-oscillation musical
      const wl = ping ? x + this.lpR * fb : x + this.lpL * fb;
      const wr = ping ? this.lpL * fb : x + this.lpR * fb;
      this.bufL[this.w] = Math.tanh(wl);
      this.bufR[this.w] = Math.tanh(wr);
      this.w = this.w + 1 >= this.max ? 0 : this.w + 1;
      outL[i] = inL[i] * (1 - mix) + dL * mix;
      outR[i] = inR[i] * (1 - mix) + dR * mix;
    }
  }
}

// Dimension: a Roland Dimension D / Boss DC-2 style stereo chorus. Its identity
// is the "dimensional" widener, not a wobble: two short modulated delay taps
// read in anti-phase so the stereo image spreads without an obvious pitch
// warble, with the dry kept common so it stays mostly mono-safe. Like the
// hardware it has no rate/depth knobs, just mode buttons I/II/III (the toggles,
// combinable for in-between settings) that step the rate and depth; Mix and
// Width are the only knobs. The chord/pad widener for dub techno, French house,
// and vaporwave.
export class DimVoice {
  constructor(sr) {
    this.sr = sr;
    this.max = Math.ceil(sr * 0.05) + 2; // ~50 ms, plenty for a chorus tap
    this.buf = new Float32Array(this.max);
    this.w = 0;
    this.ph = 0;
    this.baseSamp = 0.009 * sr; // ~9 ms base delay
    this.setToggles([true, false, false]);
    this.setParams([0.6, 0.7]);
  }

  // values = [mix, width], each 0..1.
  setParams(values) {
    this.mix = values[0] || 0;
    this.width = values[1] || 0;
  }

  // Mode buttons I/II/III. Higher/more buttons = more intensity (rate + depth),
  // combos push a little further, matching the hardware's stacked buttons. No
  // button = dry (the effect idles).
  setToggles(values) {
    const t0 = !!(values && values[0]), t1 = !!(values && values[1]), t2 = !!(values && values[2]);
    let mode = 0;
    if (t0) mode = 1;
    if (t1) mode = 2;
    if (t2) mode = 3;
    const extra = (t0 ? 1 : 0) + (t1 ? 1 : 0) + (t2 ? 1 : 0) > 1 ? 0.5 : 0;
    const intensity = mode + extra; // 0..3.5
    this.wetOn = intensity > 0 ? 1 : 0;
    this.modInc = 2 * Math.PI * (0.25 + intensity * 0.4) / this.sr; // ~0.25..~1.65 Hz
    this.depthSamp = (intensity > 0 ? 1.5 + intensity * 1.2 : 0) * 0.001 * this.sr; // ms->samp
  }

  _read(d) {
    let rp = this.w - d;
    if (rp < 0) rp += this.max;
    if (rp >= this.max) rp -= this.max; // guard float rounding to exactly max
    const i0 = rp | 0;
    const fr = rp - i0;
    const a = this.buf[i0];
    const b = this.buf[i0 + 1 >= this.max ? 0 : i0 + 1];
    return a + (b - a) * fr;
  }

  process(inL, inR, outL, outR, n) {
    const base = this.baseSamp, depth = this.depthSamp, mix = this.mix;
    const width = this.width, wet = this.wetOn, modInc = this.modInc;
    for (let i = 0; i < n; i++) {
      const x = (inL[i] + inR[i]) * 0.5;
      this.buf[this.w] = x;
      this.ph += modInc; if (this.ph > 6.2831853) this.ph -= 6.2831853;
      const lfo = Math.sin(this.ph);
      // Width decorrelates the right tap: 0 = mono (same as L), 1 = anti-phase.
      const lfoR = lfo * (1 - 2 * width);
      const wetL = this._read(base + depth * (0.5 + 0.5 * lfo));
      const wetR = this._read(base + depth * (0.5 + 0.5 * lfoR));
      this.w = this.w + 1 >= this.max ? 0 : this.w + 1;
      outL[i] = wet ? inL[i] * (1 - mix) + wetL * mix : inL[i];
      outR[i] = wet ? inR[i] * (1 - mix) + wetR * mix : inR[i];
    }
  }
}

// Reverb: a Freeverb-style algorithmic reverb (Schroeder-Moorer): eight
// lowpass-feedback comb filters in parallel into four series allpasses, per
// stereo channel, the right channel offset for width. Tuned for the lush,
// dark tails our electronic genres want. Extras: pre-delay, a modulated tail
// (fractional comb reads) for plate shimmer, a Gate toggle for the 80s
// gated-snare, and a momentary Hold (secondary footswitch) that freezes the
// wash into an infinite reverb.
const RV_COMB = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617]; // @44.1k
const RV_ALLP = [556, 441, 341, 225];
const RV_SPREAD = 23;   // right-channel stereo offset
const RV_MAXMOD = 48;   // comb modulation margin, samples

class RvComb {
  constructor(size) { this.buf = new Float32Array(size); this.size = size; this.idx = 0; this.store = 0; }
  // The feedback path uses the fixed integer tap (buf[idx], the standard stable
  // Freeverb comb); only a separate OUTPUT tap is modulated `mod` samples short
  // for chorus shimmer, so the loop gain never changes and cannot run away.
  process(x, fb, damp, mod) {
    const outInt = this.buf[this.idx];
    let rp = this.idx + mod; while (rp >= this.size) rp -= this.size;
    const i0 = rp | 0; const fr = rp - i0;
    const a = this.buf[i0]; const b = this.buf[i0 + 1 >= this.size ? 0 : i0 + 1];
    const outMod = a + (b - a) * fr;
    this.store = outInt * (1 - damp) + this.store * damp;
    this.buf[this.idx] = x + this.store * fb;
    this.idx = this.idx + 1 >= this.size ? 0 : this.idx + 1;
    return outMod;
  }
}

class RvAllpass {
  constructor(size) { this.buf = new Float32Array(size); this.size = size; this.idx = 0; }
  process(x) {
    const bufout = this.buf[this.idx];
    const out = -x + bufout;
    this.buf[this.idx] = x + bufout * 0.5;
    this.idx = this.idx + 1 >= this.size ? 0 : this.idx + 1;
    return out;
  }
}

export class ReverbVoice {
  constructor(sr) {
    this.sr = sr;
    const scale = sr / 44100;
    const cs = (t) => Math.round(t * scale) + RV_MAXMOD;
    const as = (t) => Math.round(t * scale);
    this.combL = RV_COMB.map((t) => new RvComb(cs(t)));
    this.combR = RV_COMB.map((t) => new RvComb(cs(t + RV_SPREAD)));
    this.apL = RV_ALLP.map((t) => new RvAllpass(as(t)));
    this.apR = RV_ALLP.map((t) => new RvAllpass(as(t + RV_SPREAD)));
    this.pre = new Float32Array(Math.ceil(sr * 0.12) + 2); // up to 120 ms pre-delay
    this.preIdx = 0;
    this.ph = 0;
    this.gateEnv = 0; this.gateGain = 1;
    this.gateOn = false; this.hold = false;
    this.setParams([0.6, 0.4, 0.1, 0.2, 0.8, 0.4]);
  }

  // values = [decay, tone, pre, mod, width, mix], each 0..1.
  setParams(values) {
    const decay = values[0] || 0, tone = values[1] || 0, pre = values[2] || 0;
    const mod = values[3] || 0, width = values[4] || 0, mix = values[5] || 0;
    this.fb = 0.7 + decay * 0.28;          // 0.7..0.98 tail length
    this.damp = (1 - tone) * 0.4;          // Tone up = brighter tail
    this.preSamp = Math.min(this.pre.length - 2, pre * 0.1 * this.sr); // 0..100 ms
    this.modDepth = mod * RV_MAXMOD;
    this.modInc = 2 * Math.PI * 0.5 / this.sr; // 0.5 Hz plate shimmer
    this.width = width;
    this.mix = mix;
  }

  setToggles(values) { this.gateOn = !!(values && values[0]); }
  setSecondary(on) { this.hold = !!on; }

  process(inL, inR, outL, outR, n) {
    const gain = 0.015;
    const fb = this.hold ? 0.997 : this.fb;   // Hold: near-infinite tail
    const damp = this.hold ? 0 : this.damp;
    const inGain = this.hold ? 0 : 1;         // Hold: freeze the current wash
    const modDepth = this.modDepth, mix = this.mix;
    const w = this.width, wg1 = w * 0.5 + 0.5, wg2 = (1 - w) * 0.5;
    const plen = this.pre.length;
    for (let i = 0; i < n; i++) {
      const x = (inL[i] + inR[i]) * 0.5;
      // pre-delay (fractional)
      this.pre[this.preIdx] = x;
      let rp = this.preIdx - this.preSamp; if (rp < 0) rp += plen; if (rp >= plen) rp -= plen;
      const pi0 = rp | 0; const pfr = rp - pi0;
      const pa = this.pre[pi0]; const pb = this.pre[pi0 + 1 >= plen ? 0 : pi0 + 1];
      const inp = (pa + (pb - pa) * pfr) * gain * inGain;
      this.preIdx = this.preIdx + 1 >= plen ? 0 : this.preIdx + 1;
      // gate: key an envelope from the dry input; a fast close chops the tail
      if (this.gateOn) {
        const a = Math.abs(x);
        this.gateEnv += (a > this.gateEnv ? 0.3 : 0.003) * (a - this.gateEnv);
        const target = this.gateEnv > 0.02 ? 1 : 0;
        this.gateGain += (target > this.gateGain ? 0.5 : 0.05) * (target - this.gateGain);
      } else {
        this.gateGain = 1;
      }
      this.ph += this.modInc; if (this.ph > 6.2831853) this.ph -= 6.2831853;
      let wl = 0, wr = 0;
      for (let c = 0; c < 8; c++) {
        const m = modDepth * (0.5 + 0.5 * Math.sin(this.ph + c * 0.5));
        wl += this.combL[c].process(inp, fb, damp, m);
        wr += this.combR[c].process(inp, fb, damp, m);
      }
      for (let a = 0; a < 4; a++) { wl = this.apL[a].process(wl); wr = this.apR[a].process(wr); }
      wl *= this.gateGain; wr *= this.gateGain;
      const oL = wl * wg1 + wr * wg2;
      const oR = wr * wg1 + wl * wg2;
      outL[i] = inL[i] * (1 - mix) + oL * mix;
      outR[i] = inR[i] * (1 - mix) + oR * mix;
    }
  }
}

// VaporCloud: a one-knob vaporwave tape-wash, after an RP2040 single-knob
// ambient-delay design (fixed-point on the hardware; plain float here). Two
// short modulated delay lines with mismatched base offsets are read in
// anti-phase for a wide, swimming stereo cloud, not a rhythmic echo. A 1-pole
// low-pass sits INSIDE the feedback path so each repeat is darker than the last,
// the recursive darkening of an over-biased tape head, and a fixed ~120 Hz high-
// pass on the recirculated copy stops a bass note's fundamental piling up into
// mud (the dry and first repeats keep full body). The Wash macro morphs the
// three zones at once: feedback tail (0..~0.85), LFO wow/flutter depth, and the
// feedback low-pass, so one knob takes it from dry-dominant slap through tape
// wobble to an infinite muffled wash.
//
//   Wash(macro: feedback+wow+darken)  Time(base tap 1x..8x)  Tone(darken bias)
//   Mod(LFO trim)  Width(mono..anti-phase)  Mix
//   toggle: Dream (fade dry out as Wash rises)   sw2: Hold (freeze the buffer)
export class VaporVoice {
  constructor(sr) {
    this.sr = sr;
    this.max = Math.ceil(sr * 0.9) + 4; // room for the longest tap + modulation
    this.bufL = new Float32Array(this.max);
    this.bufR = new Float32Array(this.max);
    this.w = 0;
    this.lpL = 0; this.lpR = 0; // feedback low-pass state, one per line (darkening)
    this.hpL = 0; this.hpR = 0; // feedback high-pass state (keeps sub from piling up)
    this.fbHpG = 1 - Math.exp(-2 * Math.PI * 120 / sr); // ~120 Hz loop high-pass
    this.phL = 0; this.phR = 0;
    // Mismatched base taps (~78 ms / ~94 ms), the prime-like spacing that keeps
    // the two lines decorrelated even before the anti-phase modulation.
    this.baseL = 0.0784 * sr;
    this.baseR = 0.0936 * sr;
    this.dream = false;
    this.hold = false;
    this.setParams([0.5, 0.3, 0.5, 0.55, 0.75, 0.55]);
  }

  // values = [wash, time, tone, mod, width, mix], each 0..1.
  setParams(values) {
    this.wash = values[0] || 0;
    const time = values[1] || 0, tone = values[2] || 0, mod = values[3] || 0;
    this.width = values[4] || 0;
    this.mix = values[5] || 0;
    this.timeScale = 1 + time * 7;                // 1x..8x base tap
    this.toneBias = (tone - 0.5) * 0.6;           // shift the feedback LP bright/dark
    this.modInc = 2 * Math.PI * (0.45 + mod * 0.4) / this.sr; // ~0.45..~0.85 Hz
    this.modDepth = (0.5 + mod) * 0.005 * this.sr; // up to ~7.5 ms of wow/flutter
  }

  setToggles(values) { this.dream = !!(values && values[0]); }
  setSecondary(on) { this.hold = !!on; }

  // Fractional read `d` samples behind the write head (linear interpolation).
  _read(buf, d) {
    let rp = this.w - d;
    if (rp < 0) rp += this.max;
    if (rp >= this.max) rp -= this.max; // guard float rounding to exactly max
    const i0 = rp | 0;
    const fr = rp - i0;
    const a = buf[i0];
    const b = buf[i0 + 1 >= this.max ? 0 : i0 + 1];
    return a + (b - a) * fr;
  }

  process(inL, inR, outL, outR, n) {
    const wash = this.wash, mix = this.mix, width = this.width;
    // Wash macro: feedback 0..~0.85, wow depth scales in, and the feedback
    // low-pass darkens (alpha 0.90 bright -> 0.15 dark), Tone biasing it.
    let alpha = 0.90 - 0.75 * wash + this.toneBias;
    if (alpha > 0.95) alpha = 0.95; else if (alpha < 0.05) alpha = 0.05;
    // A small feedback floor keeps a repeat or two even low on the knob, and the
    // ceiling climbs near self-oscillation at the top for the infinite wash.
    const fb = this.hold ? 0.998 : 0.12 + 0.8 * wash;
    const inG = this.hold ? 0 : 1;
    const depth = this.modDepth * (0.35 + 0.65 * wash);
    const baseL = this.baseL * this.timeScale, baseR = this.baseR * this.timeScale;
    const maxD = this.max - 3;
    // Dream fades the dry signal out as Wash pushes past ~0.6, leaving a pure
    // wash at the ceiling; without it the dry follows the Mix knob as usual.
    let dryFade = 1;
    if (this.dream) { dryFade = 1 - (wash - 0.6) / 0.4; if (dryFade < 0) dryFade = 0; else if (dryFade > 1) dryFade = 1; }
    const dryG = (1 - mix) * dryFade;
    const modInc = this.modInc;
    for (let i = 0; i < n; i++) {
      const x = (inL[i] + inR[i]) * 0.5 * inG + 1e-20;
      this.phL += modInc; if (this.phL > 6.2831853) this.phL -= 6.2831853;
      this.phR += modInc; if (this.phR > 6.2831853) this.phR -= 6.2831853;
      const lfo = Math.sin(this.phL);
      const lfoR = lfo * (1 - 2 * width); // Width: 0 correlated, 1 anti-phase
      let dL = baseL + lfo * depth; if (dL > maxD) dL = maxD; else if (dL < 1) dL = 1;
      let dR = baseR + lfoR * depth; if (dR > maxD) dR = maxD; else if (dR < 1) dR = 1;
      const wetL = this._read(this.bufL, dL);
      const wetR = this._read(this.bufR, dR);
      // 1-pole low-pass in the feedback: each pass loses more top end.
      this.lpL += alpha * (wetL - this.lpL);
      this.lpR += alpha * (wetR - this.lpR);
      // 1-pole high-pass on only the recirculated copy (loop signal), so the
      // fundamental of a bass note does not pile up into mud as it feeds back.
      // The dry and the wet output tap keep full body; just the tail thins.
      // Hold bypasses it: a frozen drone must recirculate losslessly, not decay.
      this.hpL += this.fbHpG * (this.lpL - this.hpL);
      this.hpR += this.fbHpG * (this.lpR - this.hpR);
      const fbL = this.hold ? this.lpL : this.lpL - this.hpL;
      const fbR = this.hold ? this.lpR : this.lpR - this.hpR;
      // write input + darkened, sub-trimmed feedback; tanh keeps a hot wash
      // bounded and musical.
      this.bufL[this.w] = Math.tanh(x + fbL * fb);
      this.bufR[this.w] = Math.tanh(x + fbR * fb);
      this.w = this.w + 1 >= this.max ? 0 : this.w + 1;
      outL[i] = inL[i] * dryG + this.lpL * mix;
      outR[i] = inR[i] * dryG + this.lpR * mix;
    }
  }
}

// Factory keyed by pedal type id, mirroring kitPartVoice(). Unknown ids fall
// back to Thru so an empty or future slot is a safe passthrough.
export function fxVoice(type, sr) {
  if (type === 'vapor') return new VaporVoice(sr);
  if (type === 'delay') return new DelayVoice(sr);
  if (type === 'fuzz') return new FuzzVoice(sr);
  if (type === 'octave') return new OctaveVoice(sr);
  if (type === 'muff') return new MuffVoice(sr);
  if (type === 'rat') return new RatVoice(sr);
  if (type === 'dist') return new DistVoice(sr);
  if (type === 'echo') return new EchoVoice(sr);
  if (type === 'dim') return new DimVoice(sr);
  if (type === 'reverb') return new ReverbVoice(sr);
  return new ThruVoice(sr);
}
