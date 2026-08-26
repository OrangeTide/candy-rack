// SPDX-License-Identifier: 0BSD

// CS-SAW: a fat CS-80 style sawtooth in the spirit of the Braids CSAW model.
// Approximation, not a literal port. Two slightly detuned saws give the CS-80
// beat; Timbre morphs a variable-width pulse into the mix for the hollow edge;
// Color is a one-pole lowpass. Params (0..1) from csaw-meta.js:
// [timbre, color, detune, decay, drive].
import { Env } from '../env.js';

const TWO_PI = Math.PI * 2;

export class CsawVoice {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.env = new Env(sampleRate);
    this.active = false;
    this.p1 = 0;
    this.p2 = 0;
    this.lp = 0;
    this.freq = 220;
    this.vel = 1;
    this.p = [0.4, 0.6, 0.2, 0.5, 0.2];
  }

  noteOn({ freq, vel, gateSec, params }) {
    this.p = params;
    this.freq = freq;
    this.vel = (vel ?? 100) / 127;
    this.p1 = 0;
    this.p2 = 0;
    this.lp = 0;
    this.env.trigger(gateSec, params[3]);
    this.active = true;
  }

  render() {
    if (!this.active) return 0;
    const e = this.env.process();
    if (this.env.done) { this.active = false; return 0; }

    const timbre = this.p[0];
    const color = this.p[1];
    const detune = this.p[2];
    const drive = this.p[4];

    const f1 = this.freq;
    const f2 = this.freq * (1 + detune * 0.03);
    this.p1 += (TWO_PI * f1) / this.sr; if (this.p1 > TWO_PI) this.p1 -= TWO_PI;
    this.p2 += (TWO_PI * f2) / this.sr; if (this.p2 > TWO_PI) this.p2 -= TWO_PI;

    const saw1 = this.p1 / Math.PI - 1;
    const saw2 = this.p2 / Math.PI - 1;
    // Variable-width pulse, blended in by Timbre for the hollow CS edge.
    const width = 0.5 + timbre * 0.45;
    const pulse = (this.p1 / TWO_PI) < width ? 1 : -1;
    let s = (saw1 + saw2) * 0.5 * (1 - timbre) + pulse * timbre * 0.7;

    // Color: one-pole lowpass.
    const a = Math.max(0.02, color * color);
    this.lp += (s - this.lp) * a;
    s = this.lp;

    s = Math.tanh(s * (1 + drive * 3));
    return s * e * this.vel * 0.85;
  }
}
