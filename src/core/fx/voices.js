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

export class FuzzVoice {
  constructor(sr) {
    this.sr = sr;
    this.fs2 = 2 * sr;
    // Green Ringer input high-pass (~200 Hz at the 2x rate) and the ~5 Hz DC
    // blocker pole, both init-time constants (ringer.h, util.h).
    this.ringerHpCoef = 1 - Math.exp(-2 * Math.PI * 200 / this.fs2);
    this.dcR = 1 - 2 * Math.PI * 5 / sr;
    // Oversampler allpass states: x/y per section, separate up and down sets.
    this.uaX = [0, 0]; this.uaY = [0, 0]; this.ubX = [0, 0]; this.ubY = [0, 0];
    this.daX = [0, 0]; this.daY = [0, 0]; this.dbX = [0, 0]; this.dbY = [0, 0];
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
    const A0 = OSHB_A[0], A1 = OSHB_A[1], B0 = OSHB_B[0], B1 = OSHB_B[1];
    const drive = this.drive, bias = this.bias, oct = this.oct;
    const ratG = this.ratG, level = this.level, hpc = this.ringerHpCoef, R = this.dcR;
    const uaX = this.uaX, uaY = this.uaY, ubX = this.ubX, ubY = this.ubY;
    const daX = this.daX, daY = this.daY, dbX = this.dbX, dbY = this.dbY;
    let o;
    for (let i = 0; i < n; i++) {
      const x = (inL[i] + inR[i]) * 0.5 + 1e-20; // mono send, anti-denorm
      // upsample 2x: even phase through the A cascade, odd through B
      let ev = x, od = x;
      o = A0 * (ev - uaY[0]) + uaX[0]; uaX[0] = ev; uaY[0] = o; ev = o;
      o = A1 * (ev - uaY[1]) + uaX[1]; uaX[1] = ev; uaY[1] = o; ev = o;
      o = B0 * (od - ubY[0]) + ubX[0]; ubX[0] = od; ubY[0] = o; od = o;
      o = B1 * (od - ubY[1]) + ubX[1]; ubX[1] = od; ubY[1] = o; od = o;
      ev = this._stage(ev, drive, bias, oct, hpc);
      od = this._stage(od, drive, bias, oct, hpc);
      // downsample 2x back to one base-rate sample
      o = A0 * (ev - daY[0]) + daX[0]; daX[0] = ev; daY[0] = o; ev = o;
      o = A1 * (ev - daY[1]) + daX[1]; daX[1] = ev; daY[1] = o; ev = o;
      o = B0 * (od - dbY[0]) + dbX[0]; dbX[0] = od; dbY[0] = o; od = o;
      o = B1 * (od - dbY[1]) + dbX[1]; dbX[1] = od; dbY[1] = o; od = o;
      let wet = 0.5 * (ev + od);
      // DC blocker
      const dc = wet - this.dcx + R * this.dcy; this.dcx = wet; this.dcy = dc; wet = dc;
      // RAT variable low-pass tone (TPT one-pole)
      const v = (wet - this.ratS) * ratG; const lp = v + this.ratS; this.ratS = lp + v; wet = lp;
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
  return new ThruVoice(sr);
}
