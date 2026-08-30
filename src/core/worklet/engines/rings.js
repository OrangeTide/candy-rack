// SPDX-License-Identifier: 0BSD

// RINGS: a modal resonator voice in the Mutable Instruments Rings spirit. A bank
// of tuned two-pole resonators (the partials of a struck or bowed object) is
// excited by a short noise burst and rings out. The Structure knob morphs the
// partial ratios from harmonic (a string) to inharmonic (a bell or metal bar),
// which, with a ring-mod option, gives the clangorous metallic timbres a
// gothic-industrial machine wants.
//
// This is not a port; it is a small modal synth: y[n] = 2*r*cos(w)*y[n-1] -
// r^2*y[n-2] + gain*x[n] per partial, summed. The resonator decay (pole radius r)
// is the note's ring, so gate length mostly does not matter except when bowed.
//
// Params (0..1) from rings-meta.js: [structure, bright, damp, position, exciter].
// Toggles: 0 = Bow (sustained excitation while the gate holds), 1 = Ring
// (ring-modulate the output), 2 = Even (thin out the odd partials, hollow tone).
import { makeRng } from '../../gen.js';

const TWO_PI = Math.PI * 2;
const MODES = 6;
const HARM = [1, 2, 3, 4, 5, 6];
const METAL = [1, 2.76, 5.40, 8.93, 13.34, 18.64]; // struck-bar / bell partials

export class RingsVoice {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.active = false;
    this.p = [0.3, 0.5, 0.6, 0.3, 0.5];
    this.bow = false; this.ring = false; this.even = false;
    this.note = 60; this.vel = 1;
    // per-mode coefficients and state
    this.cw = new Float32Array(MODES);
    this.r = new Float32Array(MODES);
    this.r2 = new Float32Array(MODES);
    this.g = new Float32Array(MODES);
    this.y1 = new Float32Array(MODES);
    this.y2 = new Float32Array(MODES);
    this.burstT = 0; this.burstGain = 0;
    this.ringPhase = 0; this.ringInc = 0;
    this.t = 0; this.gateSamples = 1; this.released = false;
    this.lvl = 0; this.quiet = 0;
    this.rng = makeRng(1);
  }

  noteOn({ freq, note, vel, gateSec, params, toggles, tie }) {
    this.p = params;
    if (toggles) { this.bow = !!toggles[0]; this.ring = !!toggles[1]; this.even = !!toggles[2]; }
    this.note = note;
    this.vel = (vel ?? 100) / 127;
    const sr = this.sr;
    const structure = params[0], bright = params[1], damp = params[2], position = params[3], exciter = params[4];

    const decayTime = 0.05 + damp * damp * 3.0; // base ring in seconds (0.05..3.05)
    const tilt = 0.3 + bright * 0.65;           // high-partial rolloff
    for (let i = 0; i < MODES; i++) {
      const ratio = HARM[i] * (1 - structure) + METAL[i] * structure;
      const fi = freq * ratio;
      if (fi > sr * 0.45) { this.g[i] = 0; this.cw[i] = 0; this.r[i] = 0; this.r2[i] = 0; continue; }
      const w = (TWO_PI * fi) / sr;
      this.cw[i] = Math.cos(w);
      const tau = decayTime / Math.sqrt(ratio); // higher partials ring shorter
      let r = Math.exp(-1 / (tau * sr));
      if (r > 0.9999975) r = 0.9999975; // stability guard only, rarely reached
      this.r[i] = r; this.r2[i] = r * r;
      let gain = Math.pow(tilt, i);
      gain *= Math.abs(Math.sin(Math.PI * (0.08 + position * 0.9) * (i + 1))); // excitation position comb
      if (this.even && i % 2 === 1) gain *= 0.15; // thin the odd partials
      this.g[i] = gain;
    }

    // Cross-loop hold: a tied trigger keeps the ringing state (no re-strike).
    const hold = !!tie && this.active && this.lvl > 1e-3;
    this.gateSamples = Math.max(1, Math.floor((gateSec || 0.1) * sr));
    this.t = 0; this.released = false;
    this.ringInc = (TWO_PI * freq * 1.5) / sr;
    if (!hold) {
      for (let i = 0; i < MODES; i++) { this.y1[i] = 0; this.y2[i] = 0; }
      this.ringPhase = 0; this.quiet = 0; this.lvl = 0;
      this.burstT = Math.max(1, Math.floor((0.001 + (1 - exciter) * 0.012) * sr)); // hard..soft strike
      this.burstGain = this.vel * (0.6 + exciter * 0.4);
      this.rng = makeRng((note | 0) * 2654435761 >>> 0 || 1); // deterministic exciter
    }
    this.active = true;
  }

  render() {
    if (!this.active) return 0;
    const sr = this.sr;

    this.t += 1;
    if (!this.released && this.t >= this.gateSamples) this.released = true;

    // exciter: a short strike burst, plus continuous noise while bowed and held
    let x = 0;
    if (this.burstT > 0) { x += (this.rng() * 2 - 1) * this.burstGain; this.burstT -= 1; }
    if (this.bow && !this.released) x += (this.rng() * 2 - 1) * 0.008 * this.vel;

    let sum = 0;
    for (let i = 0; i < MODES; i++) {
      const g = this.g[i];
      if (g === 0) continue;
      const y = 2 * this.r[i] * this.cw[i] * this.y1[i] - this.r2[i] * this.y2[i] + g * x;
      this.y2[i] = this.y1[i]; this.y1[i] = y;
      sum += y;
    }
    let s = Math.tanh(sum * 0.5);

    if (this.ring) {
      this.ringPhase += this.ringInc; if (this.ringPhase >= TWO_PI) this.ringPhase -= TWO_PI;
      s *= Math.sin(this.ringPhase); // ring-mod for metallic clang
    }

    // free the voice once it has rung out (and is not being bowed)
    this.lvl += (Math.abs(s) - this.lvl) * 0.001;
    if (this.burstT <= 0 && (!this.bow || this.released) && this.lvl < 3e-4) {
      this.quiet += 1;
      if (this.quiet > 1200) { this.active = false; return 0; }
    } else {
      this.quiet = 0;
    }

    return s * 0.35;
  }
}
