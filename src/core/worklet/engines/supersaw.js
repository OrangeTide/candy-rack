// SPDX-License-Identifier: 0BSD

// SUPERSAW: a stack of detuned band-limited saws per note, in the spirit of the
// Roland JP-8000 SuperSaw and the Acid Rain Chainsaw (see the design notes in
// ~/Documents/supersaw-algo.pdf). Built for pads and ambient drones.
//
// Per note it runs N saw oscillators (Waves, 1..9): one locked to the pitch, the
// rest detuned symmetrically with the non-linear spacing from the notes, phases
// randomized to avoid a keypress click. Each saw is anti-aliased with PolyBLEP.
// The sum is gain-scaled by 1/sqrt(N), shaped by a lowpass (Color) and drive,
// then optionally run through a sample-and-hold decimator (Decimate) for lo-fi
// sample-rate reduction. A slow attack / long release envelope lets overlapping
// notes bleed into a drone. This is mono for now; true stereo spread, saw/square
// morphing, and wavetables are left for later.
//
// Params (0..1) from supersaw-meta.js: [detune, waves, color, decimate, drive].

const MAX_WAVES = 9;

// PolyBLEP residual: corrects the saw's discontinuity within a window dt wide
// around the wrap point. Straight from the reference C in the design notes.
function polyBlep(t, dt) {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

export class SupersawVoice {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.active = false;
    this.freq = 110;
    this.vel = 1;
    this.p = [0.35, 0.70, 0.70, 0.00, 0.15];

    this.phases = new Float32Array(MAX_WAVES);
    this.mult = new Float32Array(MAX_WAVES); // per-wave frequency multiplier
    this.dt = new Float32Array(MAX_WAVES);   // per-wave phase increment
    this.lGain = new Float32Array(MAX_WAVES); // constant-power pan, left
    this.rGain = new Float32Array(MAX_WAVES); // constant-power pan, right
    this.gainScale = 1;
    this._cachedDetune = -1;
    this._cachedWaves = -1;

    this.lpL = 0;
    this.lpR = 0;
    this.decimCount = 0;
    this.decimHoldL = 0;
    this.decimHoldR = 0;
    this.outL = 0;
    this.outR = 0;

    // Envelope
    this.envV = 0;
    this.envStage = 'idle';
    this.envDone = true;
    this.envT = 0;
    this.gateSamples = 1;
    this.atkInc = 1;
    this.relCoef = 0.999;
  }

  waveCount() {
    return 1 + Math.round(this.p[1] * (MAX_WAVES - 1));
  }

  // Recompute per-wave detune multipliers and phase increments. Only runs when
  // Detune or Waves changes, so no pow() per sample.
  recompute() {
    const detune = this.p[0];
    const n = this.waveCount();
    const detuneAmount = Math.pow(detune, 3) * 0.10; // up to ~10% spread
    for (let i = 0; i < n; i++) {
      let offset = 0;
      let pan = 0.5; // center wave dead-center
      if (i > 0) {
        const pairIndex = (i + 1) >> 1;
        const sign = i % 2 === 1 ? -1 : 1;
        const spread = pairIndex / (n / 2);
        offset = sign * detuneAmount * Math.pow(spread, 1.2);
        // Interleaved stereo spread: flat waves left, sharp waves right.
        pan = Math.min(0.9, Math.max(0.1, 0.5 + sign * 0.4 * spread));
      }
      this.mult[i] = 1 + offset;
      this.dt[i] = (this.freq * this.mult[i]) / this.sr;
      this.lGain[i] = Math.cos(pan * (Math.PI / 2));
      this.rGain[i] = Math.sin(pan * (Math.PI / 2));
    }
    this.gainScale = 1 / Math.sqrt(n);
    this._cachedDetune = detune;
    this._cachedWaves = n;
  }

  noteOn({ freq, note, vel, gateSec, params, tie }) {
    this.p = params;
    // Cross-loop hold: a tied trigger on an already-sounding voice keeps the
    // phases, filter, and envelope and just re-arms the gate, so a held pad or
    // drone sustains across the loop instead of re-attacking every bar.
    const hold = !!tie && this.active && !this.envDone;
    this.note = note;
    this.freq = freq;
    this.vel = (vel ?? 100) / 127;
    this._cachedDetune = -1; // force recompute against the new base freq
    this.recompute();

    this.atkInc = 1 / (0.025 * this.sr);
    this.relCoef = Math.exp(-1 / (0.9 * this.sr));
    this.envT = 0;
    this.gateSamples = Math.max(1, Math.floor((gateSec ?? 0.1) * this.sr));
    if (!hold) {
      for (let i = 0; i < MAX_WAVES; i++) this.phases[i] = Math.random();
      this.lpL = 0;
      this.lpR = 0;
      this.decimCount = 0;
      this.decimHoldL = 0;
      this.decimHoldR = 0;
      this.envV = 0;
      this.envStage = 'a';
      this.envDone = false;
    } else if (this.envStage === 'r') {
      this.envStage = 's'; // was releasing; resume the sustain
    }
    this.active = true;
  }

  envProcess() {
    this.envT += 1;
    if (this.envStage === 'a') {
      this.envV += this.atkInc;
      if (this.envV >= 1) { this.envV = 1; this.envStage = 's'; }
    } else if (this.envStage === 's') {
      if (this.envT >= this.gateSamples) this.envStage = 'r';
    } else if (this.envStage === 'r') {
      this.envV *= this.relCoef;
      if (this.envV < 6e-3) { this.envV = 0; this.envDone = true; }
    }
    return this.envV;
  }

  // Advance one sample, filling this.outL / this.outR with the stereo pair.
  _render() {
    if (!this.active) { this.outL = 0; this.outR = 0; return; }
    const e = this.envProcess();
    if (this.envDone) { this.active = false; this.outL = 0; this.outR = 0; return; }

    const n = this.waveCount();
    if (this.p[0] !== this._cachedDetune || n !== this._cachedWaves) this.recompute();

    let sL = 0;
    let sR = 0;
    for (let i = 0; i < n; i++) {
      const dt = this.dt[i];
      let ph = this.phases[i] + dt;
      if (ph >= 1) ph -= 1;
      this.phases[i] = ph;
      const saw = (2 * ph - 1) - polyBlep(ph, dt);
      sL += saw * this.lGain[i];
      sR += saw * this.rGain[i];
    }
    sL *= this.gainScale;
    sR *= this.gainScale;

    // Color: one-pole lowpass, per channel.
    const a = Math.max(0.02, this.p[2] * this.p[2]);
    this.lpL += (sL - this.lpL) * a;
    this.lpR += (sR - this.lpR) * a;

    // Drive and amplitude envelope.
    const drive = 1 + this.p[4] * 3;
    const amp = e * this.vel;
    let l = Math.tanh(this.lpL * drive) * amp;
    let r = Math.tanh(this.lpR * drive) * amp;

    // Decimate: sample-and-hold at a reduced rate, shared counter across L/R.
    const hold = 1 + Math.floor(this.p[3] * this.p[3] * 60);
    if (this.decimCount <= 0) {
      this.decimHoldL = l;
      this.decimHoldR = r;
      this.decimCount = hold;
    }
    this.decimCount -= 1;

    this.outL = this.decimHoldL * 0.7;
    this.outR = this.decimHoldR * 0.7;
  }

  renderStereo() {
    this._render();
  }

  // Mono fallback for offline tools and tests.
  render() {
    this._render();
    return (this.outL + this.outR) * 0.5;
  }
}
