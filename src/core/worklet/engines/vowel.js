// SPDX-License-Identifier: 0BSD

// Vowel / talkbox engine: a bright sawtooth run through three resonant bandpass
// filters tuned to vocal formants. Morphing the formant frequencies between the
// vowels a-e-i-o-u makes the tone "talk". It is a limited substitute for a real
// talkbox or vocoder: it gives vowel colour, but no consonants and no voice
// input. Sweep the Vowel control from the mod matrix (an LFO or envelope) to get
// the talking motion.
//
// Params (0..1) from vowel-meta.js: [vowel, formant, resonance, decay, drive].
import { Env } from '../env.js';

const TWO_PI = Math.PI * 2;

// Formant tables: F1/F2/F3 centre frequencies (Hz) and their relative gains for
// each vowel. Approximate tenor-range values; enough to read as vowels.
const VOWELS = [
  { f: [800, 1150, 2800], g: [1.0, 0.45, 0.15] }, // a  (ah)
  { f: [400, 1700, 2600], g: [1.0, 0.35, 0.15] }, // e  (eh)
  { f: [300, 2100, 3000], g: [1.0, 0.25, 0.12] }, // i  (ee)
  { f: [450, 800, 2830], g: [1.0, 0.50, 0.15] },  // o  (oh)
  { f: [325, 700, 2700], g: [1.0, 0.40, 0.10] },  // u  (oo)
];

const lerp = (a, b, t) => a + (b - a) * t;

// PolyBLEP correction for a naive sawtooth, to tame aliasing on the high
// formants where the harmonics that feed them live.
function polyBlep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

// One RBJ bandpass biquad (constant 0 dB peak gain), recomputed when its
// frequency or Q changes.
class BandPass {
  constructor() { this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0; }
  set(freq, Q, sr) {
    const w0 = (TWO_PI * Math.min(freq, sr * 0.45)) / sr;
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

export class VowelVoice {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.env = new Env(sampleRate);
    this.active = false;
    this.phase = 0;
    this.freq = 220;
    this.vel = 1;
    this.p = [0.3, 0.5, 0.5, 0.5, 0.2];
    this.bp = [new BandPass(), new BandPass(), new BandPass()];
    this.gains = [1, 0.4, 0.15];
    this.lastKey = -1;
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
      this.phase = 0;
      this.env.trigger(gateSec, params[3]);
      this.lastKey = -1; // force filter recompute
    }
    this.active = true;
  }

  // Recompute the three formant filters from the current vowel / formant shift /
  // resonance. Only runs when those controls actually change (mod moves them per
  // block, not per sample).
  updateFormants() {
    const vowel = this.p[0];
    const shift = Math.pow(2, (this.p[1] - 0.5) * 1.5); // formant up/down ~+-0.75 oct
    const Q = 3 + this.p[2] * 16;                        // resonance -> vocal pinch
    const pos = vowel * (VOWELS.length - 1);
    const i = Math.min(VOWELS.length - 2, Math.floor(pos));
    const frac = pos - i;
    const A = VOWELS[i], B = VOWELS[i + 1];
    for (let k = 0; k < 3; k++) {
      const f = lerp(A.f[k], B.f[k], frac) * shift;
      this.bp[k].set(f, Q, this.sr);
      this.gains[k] = lerp(A.g[k], B.g[k], frac);
    }
  }

  render() {
    if (!this.active) return 0;
    const e = this.env.process();
    if (this.env.done) { this.active = false; return 0; }

    // Recompute formants only when a control moved (quantised so mod sweeps
    // rebuild at most a few hundred times a second, not per sample).
    const key = (Math.round(this.p[0] * 200) * 131 + Math.round(this.p[1] * 100) * 17 + Math.round(this.p[2] * 100)) | 0;
    if (key !== this.lastKey) { this.lastKey = key; this.updateFormants(); }

    // Band-limited sawtooth source.
    const dt = this.freq / this.sr;
    this.phase += dt;
    if (this.phase >= 1) this.phase -= 1;
    let saw = 2 * this.phase - 1 - polyBlep(this.phase, dt);

    // Sum the three formant bands.
    let s = this.bp[0].process(saw) * this.gains[0]
          + this.bp[1].process(saw) * this.gains[1]
          + this.bp[2].process(saw) * this.gains[2];

    // Drive into a soft clip: the formant bands are narrow so the raw sum is
    // quiet; pushing it fills the tone out and adds the buzzy talkbox grit.
    const drive = this.p[4];
    s = Math.tanh(s * (4.0 + drive * 8));
    return s * e * this.vel * 0.9;
  }
}
