// SPDX-License-Identifier: 0BSD

// Chord generator. One trigger sounds several notes: the host asks chordNotes()
// for the interval set (chosen by the Type knob) and allocates one sub-voice per
// note. Each sub-voice is a simple saw/square-morph oscillator. Detune spreads
// the outer voices for width. Params (0..1) from chord-meta.js:
// [type, detune, wave, decay, drive].
import { Env } from '../env.js';

const TWO_PI = Math.PI * 2;

// Interval sets, chosen by the Type knob (params[0]) and ordered simple to lush
// so sweeping the knob moves from triads through sevenths into extended jazz
// voicings. Index 0 must stay major: starters select a chord by the knob value
// (floor(type * CHORDS.length)), and changing the order or count re-maps those
// values. When you add or reorder entries, re-check the starters that set a
// chord Type (currently lemon = min7).
//
//   0 major        4 power+8ve   8 major7      12 dominant9
//   1 minor        5 major6      9 minor7      13 major9
//   2 sus2         6 minor6     10 minor7 b5   14 minor9
//   3 sus4         7 dominant7  11 dim7        15 six-nine
const CHORDS = [
  [0, 4, 7],           // major
  [0, 3, 7],           // minor
  [0, 2, 7],           // sus2
  [0, 5, 7],           // sus4
  [0, 7, 12],          // power + octave
  [0, 4, 7, 9],        // major 6
  [0, 3, 7, 9],        // minor 6
  [0, 4, 7, 10],       // dominant 7
  [0, 4, 7, 11],       // major 7
  [0, 3, 7, 10],       // minor 7
  [0, 3, 6, 10],       // minor 7 b5 (half-diminished)
  [0, 3, 6, 9],        // diminished 7
  [0, 4, 7, 10, 14],   // dominant 9
  [0, 4, 7, 11, 14],   // major 9
  [0, 3, 7, 10, 14],   // minor 9
  [0, 4, 7, 9, 14],    // six-nine
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
