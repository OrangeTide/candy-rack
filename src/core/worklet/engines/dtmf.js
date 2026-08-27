// SPDX-License-Identifier: 0BSD

// DTMF: a musical dual-tone generator in the spirit of a telephone touch-tone.
// Two pure sines sound at once, the second locked a musical interval above the
// root (Interval picks the ratio). The key to the phone character is that both
// tones are summed BEFORE a shared waveshaper: the nonlinearity intermodulates
// them into sum/difference partials that glue the pair into one chime. A linear
// mix of two separate voices would not do this. Telephone then squeezes the sum
// through a fixed 300-3400 Hz band plus light sample-rate decimation for the
// nasal, companded lo-fi voice. Params (0..1) from dtmf-meta.js:
// [interval, balance, grit, phone, decay].
import { Env } from '../env.js';

const TWO_PI = Math.PI * 2;

// Second-tone frequency ratios above the root. Musical intervals, then one
// deliberately inharmonic entry (the real DTMF high/low group ratio 1209/697)
// as the authentic touch-tone flavour.
const INTERVALS = [
  1.2,          // minor third (6/5)
  1.25,         // major third (5/4)
  4 / 3,        // perfect fourth
  1.5,          // perfect fifth (3/2)
  5 / 3,        // major sixth (5/3)
  2.0,          // octave
  1209 / 697,   // authentic DTMF (inharmonic)
];

// A resonant bandpass biquad (constant 0 dB peak gain). Same form as the
// percussion voices; here it is the telephone band, set once on note-on.
class BandPass {
  constructor() { this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0; }
  set(freq, Q, sr) {
    const w0 = (2 * Math.PI * Math.min(freq, sr * 0.45)) / sr;
    const cs = Math.cos(w0), sn = Math.sin(w0), al = sn / (2 * Q);
    const a0 = 1 + al;
    this.b0 = al / a0; this.b2 = -al / a0;
    this.a1 = (-2 * cs) / a0; this.a2 = (1 - al) / a0;
  }
  process(x) {
    const y = this.b0 * x + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x;
    this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

export class DtmfVoice {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.env = new Env(sampleRate);
    this.active = false;
    this.p1 = 0;
    this.p2 = 0;
    this.freq = 220;
    this.vel = 1;
    this.bp = new BandPass();
    this.decHold = 0;
    this.decPhase = 0;
    this.p = [0.50, 0.50, 0.30, 0.40, 0.35];
  }

  noteOn({ freq, vel, gateSec, params, toggles }) {
    this.p = params;
    this.freq = freq;
    this.vel = (vel ?? 100) / 127;
    this.p1 = 0;
    this.p2 = 0;
    this.decHold = 0;
    this.decPhase = 0;
    // Telephone band centre. Fixed at ~1700 Hz (between 300 and 3400) by
    // default, wide Q so it catches both tones across the playable range. When
    // the Track toggle is on, the band instead follows the note: it centres on
    // the geometric mean of the two tones (freq * sqrt(ratio)) so a low note
    // keeps its tone rather than being thinned by the fixed phone band.
    const ratio = INTERVALS[Math.min(INTERVALS.length - 1, Math.floor(params[0] * INTERVALS.length))];
    const track = !!(toggles && toggles[0]);
    const centre = track ? freq * Math.sqrt(ratio) : 1700;
    this.bp.set(centre, 0.7, this.sr);
    this.env.trigger(gateSec, params[4]);
    this.active = true;
  }

  render() {
    if (!this.active) return 0;
    const e = this.env.process();
    if (this.env.done) { this.active = false; return 0; }

    const interval = this.p[0];
    const balance = this.p[1];
    const grit = this.p[2];
    const phone = this.p[3];

    const ratio = INTERVALS[Math.min(INTERVALS.length - 1, Math.floor(interval * INTERVALS.length))];
    const f1 = this.freq;
    const f2 = this.freq * ratio;
    this.p1 += (TWO_PI * f1) / this.sr; if (this.p1 > TWO_PI) this.p1 -= TWO_PI;
    this.p2 += (TWO_PI * f2) / this.sr; if (this.p2 > TWO_PI) this.p2 -= TWO_PI;

    // Balance skews the two tone levels; equal (both unity) at 0.5.
    const aGain = Math.min(1, 2 * (1 - balance));
    const bGain = Math.min(1, 2 * balance);
    const sum = (Math.sin(this.p1) * aGain + Math.sin(this.p2) * bGain) * 0.5;

    // Intermodulation glue: shape the SUM, not each tone separately.
    let s = Math.tanh(sum * (1 + grit * 6));

    // Telephone squeeze: sample-rate decimation then bandpass, blended in by
    // Phone so the knob runs clean full-range -> nasal companded phone voice.
    if (phone > 0) {
      const step = 1 + Math.floor(phone * 7);
      if (this.decPhase <= 0) { this.decHold = s; this.decPhase = step; }
      this.decPhase -= 1;
      const banded = this.bp.process(this.decHold) * 2.5; // makeup for band loss
      s = s * (1 - phone) + banded * phone;
    }

    return s * e * this.vel * 0.5;
  }
}
