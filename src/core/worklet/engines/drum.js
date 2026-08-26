// SPDX-License-Identifier: 0BSD

// Analog-style drum voice as a polyphonic-host sub-voice. Monophonic per note,
// one-shot: ignores the step gate and runs its own amplitude decay. Params
// (normalized 0..1) in the order from drum-meta.js: [tune, decay, tone, snap,
// drive]. Sweeping Tune turns it from a kick into a tom into a rimshot; Tone
// blends the pitched body with noise for snares and hats. This is analog
// modelling, not a Mutable Instruments port.

const TWO_PI = Math.PI * 2;

export class DrumVoice {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.active = false;
    this.phase = 0;
    this.freq = 100;
    this.amp = 0;
    this.penv = 0;
    this.vel = 1;
    this.ampCoef = 0.999;
    this.pitchCoef = 0.99;
    this.p = [0.30, 0.50, 0.35, 0.45, 0.20];
  }

  // Drum ignores freq and gate; it derives pitch from Tune plus the note.
  noteOn({ note, vel, params }) {
    this.p = params;
    const tune = params[0];
    const decay = params[1];
    const snap = params[3];

    const base = 40 * Math.pow(10, tune * 1.4);
    const mult = Math.pow(2, ((note ?? 60) - 60) / 12);
    this.freq = base * mult;

    const decaySec = 0.02 + decay * 0.28;
    this.ampCoef = Math.exp(-1 / (decaySec * this.sr));
    const pitchSec = 0.006 + snap * 0.04;
    this.pitchCoef = Math.exp(-1 / (pitchSec * this.sr));

    this.amp = 1;
    this.penv = 1;
    this.phase = 0;
    this.vel = (vel ?? 100) / 127;
    this.active = true;
  }

  render() {
    if (!this.active) return 0;
    const tone = this.p[2];
    const snap = this.p[3];
    const drive = this.p[4];

    const f = this.freq * (1 + snap * 4 * this.penv);
    this.phase += (TWO_PI * f) / this.sr;
    if (this.phase > TWO_PI) this.phase -= TWO_PI;

    const sine = Math.sin(this.phase);
    const noise = Math.random() * 2 - 1;
    let s = sine * (1 - tone) + noise * tone;

    s *= this.amp * this.vel;
    s = Math.tanh(s * (1 + drive * 8));

    this.amp *= this.ampCoef;
    this.penv *= this.pitchCoef;
    if (this.amp < 1e-3) this.active = false;

    return s * 0.8;
  }
}
