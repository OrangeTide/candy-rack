// SPDX-License-Identifier: 0BSD

// ACID: a TB-303-style monophonic bassline voice, the acid squelch. A PolyBLEP
// saw or square oscillator into a resonant, self-oscillating 4-pole zero-delay-
// feedback ladder filter, swept by a fast decay envelope. Per-step accent
// (louder, brighter, more filter sweep) and slide (portamento, no retrigger)
// give the 303 dynamics. The overdrive that finishes the acid sound lives in
// the FX rack (RAT / Dist+), the way Hardfloor stacked it.
//
// Params (0..1) from acid-meta.js: [cutoff, reso, envmod, decay, slide].
// Toggle 0 = waveform (0 saw, 1 square); toggle 1 = sub-octave (Devilfish).
// Per-step accent is a fixed intensity (the alt lane triggers it); it boosts the
// note level and sweeps the filter harder.

const ACCENT = 0.7; // fixed accent intensity (the knob is now Slide)

function polyBlep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

export class Acid303Voice {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.active = false;
    this.phase = 0;
    this.subPhase = 0;
    this.freq = 110;
    this.freqTarget = 110;
    this.glideCoef = 1 - Math.exp(-1 / (0.055 * sampleRate));
    this.lastSlide = -1;
    this.p = [0.35, 0.6, 0.5, 0.4, 0.3];
    this.wave = false;
    this.sub = false;
    // ladder states
    this.s1 = 0; this.s2 = 0; this.s3 = 0; this.s4 = 0;
    // envelopes
    this.envF = 0;    // filter envelope (fast decay)
    this.accentV = 0; // accent envelope (slower, adds sweep + level)
    this.ampV = 0;    // amp envelope level
    this.ampLevel = 0;
    this.ampGate = 0;
    this.t = 0; this.gateSamples = 1; this.released = false;
    this.ampAtk = 1 - Math.exp(-1 / (0.002 * sampleRate));
    this.ampRel = 1 - Math.exp(-1 / (0.012 * sampleRate));
  }

  noteOn({ freq, vel, gateSec, params, slide, accent, toggles }) {
    this.p = params;
    if (toggles) { this.wave = !!toggles[0]; this.sub = !!toggles[1]; }
    const legato = slide && this.active;
    this.freqTarget = freq;
    const v = (vel ?? 100) / 127;
    this.ampLevel = v * (accent ? 1.5 : 1.0);
    if (accent) this.accentV = 1;
    // Accent decay ~200 ms; filter env decay from the Decay knob.
    this.accentDec = Math.exp(-1 / (0.2 * this.sr));
    const decaySec = 0.06 + (params[3] || 0) * 1.6;
    this.envDec = Math.exp(-1 / (decaySec * this.sr));
    if (!legato) {
      this.freq = freq;
      this.phase = 0;
      this.subPhase = 0;
      this.envF = 1;         // retrigger the filter sweep
      // amp keeps its attack; a fresh note re-opens the gate below
    }
    // (re)arm the gate so the note sustains for this step's length
    this.gateSamples = Math.max(1, Math.floor((gateSec || 0.1) * this.sr));
    this.t = 0;
    this.released = false;
    this.ampGate = 1;
    this.active = true;
  }

  render() {
    if (!this.active) return 0;
    const sr = this.sr;

    // Slide knob sets the portamento time (~10..160 ms), recomputed only when it
    // moves. Non-slide notes set freq == target so the glide is a no-op.
    const slideKnob = this.p[4];
    if (slideKnob !== this.lastSlide) {
      this.lastSlide = slideKnob;
      this.glideCoef = 1 - Math.exp(-1 / ((0.01 + slideKnob * 0.15) * sr));
    }
    this.freq += (this.freqTarget - this.freq) * this.glideCoef;

    // amp AR envelope: attack to level while gated, release when the gate ends
    this.t += 1;
    if (!this.released && this.t >= this.gateSamples) { this.released = true; this.ampGate = 0; }
    const ampTarget = this.ampGate ? this.ampLevel : 0;
    this.ampV += (ampTarget - this.ampV) * (ampTarget > this.ampV ? this.ampAtk : this.ampRel);
    if (this.released && this.ampV < 1e-4) { this.active = false; return 0; }

    // filter + accent envelopes
    this.envF *= this.envDec;
    this.accentV *= this.accentDec;

    const cutoff = this.p[0], reso = this.p[1], envmod = this.p[2];

    // base cutoff ~70 Hz .. ~6 kHz, opened by the envelope (in octaves) and the
    // accent, which sweeps and brightens the note.
    const fcBase = 70 * Math.pow(2, cutoff * 6.4);
    const openOct = envmod * this.envF * 5.5 + ACCENT * this.accentV * 3.0;
    let fc = fcBase * Math.pow(2, openOct);
    if (fc > sr * 0.45) fc = sr * 0.45;
    if (fc < 20) fc = 20;
    // accent also pushes resonance a touch, for the accented "meow"
    const k = Math.min(4.5, reso * 4.2 + ACCENT * this.accentV * 0.6);

    // oscillator
    const dt = this.freq / sr;
    this.phase += dt; if (this.phase >= 1) this.phase -= 1;
    let osc;
    if (this.wave) {
      osc = this.phase < 0.5 ? 1 : -1;
      osc += polyBlep(this.phase, dt);
      let p2 = this.phase + 0.5; if (p2 >= 1) p2 -= 1;
      osc -= polyBlep(p2, dt);
    } else {
      osc = 2 * this.phase - 1;
      osc -= polyBlep(this.phase, dt);
    }
    // Sub-oscillator: a square one octave down for weight (Devilfish sub).
    if (this.sub) {
      const sdt = dt * 0.5;
      this.subPhase += sdt; if (this.subPhase >= 1) this.subPhase -= 1;
      let sub = this.subPhase < 0.5 ? 1 : -1;
      sub += polyBlep(this.subPhase, sdt);
      let sp2 = this.subPhase + 0.5; if (sp2 >= 1) sp2 -= 1;
      sub -= polyBlep(sp2, sdt);
      osc = osc * 0.85 + sub * 0.7;
    }

    // 4-pole ZDF ladder lowpass (Zavalishin), self-oscillates near k = 4
    const g = Math.tan(Math.PI * fc / sr);
    const G = g / (1 + g);
    const oneMinusG = 1 - G;
    const G2 = G * G, G4 = G2 * G2;
    const beta = oneMinusG * (G2 * G * this.s1 + G2 * this.s2 + G * this.s3 + this.s4);
    const u = (osc - k * beta) / (1 + k * G4);
    let vv = (u - this.s1) * G; const y1 = vv + this.s1; this.s1 = y1 + vv;
    vv = (y1 - this.s2) * G; const y2 = vv + this.s2; this.s2 = y2 + vv;
    vv = (y2 - this.s3) * G; const y3 = vv + this.s3; this.s3 = y3 + vv;
    vv = (y3 - this.s4) * G; const y4 = vv + this.s4; this.s4 = y4 + vv;

    // gentle output saturation for edge, then amp
    return Math.tanh(y4 * 1.3) * this.ampV * 0.7;
  }
}
