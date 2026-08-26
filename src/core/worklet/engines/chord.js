// SPDX-License-Identifier: 0BSD

// Chord generator. One trigger sounds several notes: the host asks chordNotes()
// for the interval set (chosen by the Type knob) and allocates one sub-voice per
// note. Each sub-voice is a simple saw/square-morph oscillator. Detune spreads
// the outer voices for width. Params (0..1) from chord-meta.js:
// [type, detune, wave, decay, drive].
import { Env } from '../env.js';

const TWO_PI = Math.PI * 2;

const CHORDS = [
  [0, 4, 7],       // major
  [0, 3, 7],       // minor
  [0, 4, 7, 11],   // major 7
  [0, 3, 7, 10],   // minor 7
  [0, 5, 7],       // sus4
  [0, 4, 7, 10],   // dominant 7
  [0, 3, 6],       // diminished
  [0, 7, 12],      // power + octave
];

// Returns fractional semitone offsets from the played note. Detune pushes the
// outer voices slightly sharp/flat so the chord beats.
export function chordNotes(_note, params) {
  const type = CHORDS[Math.min(CHORDS.length - 1, Math.floor(params[0] * CHORDS.length))];
  const detune = params[1];
  const n = type.length;
  return type.map((semi, i) => semi + (i - (n - 1) / 2) * detune * 0.2);
}

export class ChordVoice {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.env = new Env(sampleRate);
    this.active = false;
    this.phase = 0;
    this.freq = 220;
    this.vel = 1;
    this.p = [0.0, 0.2, 0.3, 0.5, 0.2];
  }

  noteOn({ freq, vel, gateSec, params }) {
    this.p = params;
    this.freq = freq;
    this.vel = (vel ?? 100) / 127;
    this.phase = 0;
    this.env.trigger(gateSec, params[3]);
    this.active = true;
  }

  render() {
    if (!this.active) return 0;
    const e = this.env.process();
    if (this.env.done) { this.active = false; return 0; }

    const wave = this.p[2]; // 0 = saw, 1 = square
    const drive = this.p[4];

    this.phase += (TWO_PI * this.freq) / this.sr;
    if (this.phase > TWO_PI) this.phase -= TWO_PI;

    const saw = this.phase / Math.PI - 1;         // -1..1 ramp
    const square = this.phase < Math.PI ? 1 : -1;
    let s = saw * (1 - wave) + square * wave;

    s = Math.tanh(s * (1 + drive * 3));
    // Chords stack several voices; keep each modest.
    return s * e * this.vel * 0.4;
  }
}
