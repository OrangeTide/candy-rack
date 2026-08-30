// SPDX-License-Identifier: 0BSD

// Two-operator FM voice. One modulator into one carrier, with modulator
// feedback. Pitched from the host (equal temperament from the step note).
// Params (0..1) from fm2-meta.js: [ratio, index, feedback, decay, drive].
import { Env } from '../env.js';

const TWO_PI = Math.PI * 2;
// Musical modulator:carrier ratios selected by the Ratio knob.
const RATIOS = [0.5, 1, 1.5, 2, 3, 4, 5, 6, 7, 8];

export class FM2Voice {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.env = new Env(sampleRate);
    this.active = false;
    this.cphase = 0;
    this.mphase = 0;
    this.lastMod = 0;
    this.freq = 220;
    this.vel = 1;
    this.p = [0.5, 0.4, 0.2, 0.5, 0.2];
  }

  noteOn({ freq, note, vel, gateSec, params, tie }) {
    this.p = params;
    const hold = !!tie && this.active && !this.env.done; // held note carries across the loop
    this.note = note;
    this.freq = freq;
    this.vel = (vel ?? 100) / 127;
    if (hold) {
      this.env.hold(gateSec);
    } else {
      this.cphase = 0;
      this.mphase = 0;
      this.lastMod = 0;
      this.env.trigger(gateSec, params[3]);
    }
    this.active = true;
  }

  render() {
    if (!this.active) return 0;
    const e = this.env.process();
    if (this.env.done) { this.active = false; return 0; }

    const ratio = RATIOS[Math.min(RATIOS.length - 1, Math.floor(this.p[0] * RATIOS.length))];
    const index = this.p[1] * 8;
    const fb = this.p[2] * 0.8;
    const drive = this.p[4];

    this.mphase += (TWO_PI * this.freq * ratio) / this.sr;
    if (this.mphase > TWO_PI) this.mphase -= TWO_PI;
    const mod = Math.sin(this.mphase + fb * this.lastMod);
    this.lastMod = mod;

    this.cphase += (TWO_PI * this.freq) / this.sr;
    if (this.cphase > TWO_PI) this.cphase -= TWO_PI;
    let s = Math.sin(this.cphase + index * mod);

    s = Math.tanh(s * (1 + drive * 4));
    return s * e * this.vel * 0.7;
  }
}
