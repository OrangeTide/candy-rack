// SPDX-License-Identifier: 0BSD

// SH-101: a classic analog subtractive synth voice. A PolyBLEP saw or pulse
// oscillator (with pulse-width), an optional sub-oscillator, into the same
// resonant 4-pole zero-delay-feedback ladder as the ACID engine, shaped by an
// ADSR-style envelope on both the amplitude and the filter. Polyphonic (unlike
// the mono ACID/FM BASS), so it covers pads and leads as well as bass.
//
// Its modulation section is our mod matrix: PWM is param m4 and Cutoff is m0, so
// an LFO route -> PWM gives the moving-pulse pad and an LFO -> Cutoff the filter
// wobble, exactly what the hardware's LFO switches did.
//
// Params (0..1) from sh101-meta.js: [cutoff, reso, envmod, decay, pwm].
// Toggles: 0 = Pulse (off saw, on pulse), 1 = Sub, 2 = Slow (soft attack).

function polyBlep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

export class SH101Voice {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.active = false;
    this.phase = 0;
    this.subPhase = 0;
    this.freq = 110;
    this.vel = 1;
    this.p = [0.45, 0.35, 0.5, 0.4, 0.5];
    this.wave = false; this.sub = false; this.slow = false;
    this.s1 = 0; this.s2 = 0; this.s3 = 0; this.s4 = 0;
    this.env = 0; this.stage = 'idle';
    this.t = 0; this.gateSamples = 1; this.released = false;
    this.sustain = 0.7;
  }

  noteOn({ freq, vel, gateSec, params, toggles }) {
    this.p = params;
    if (toggles) { this.wave = !!toggles[0]; this.sub = !!toggles[1]; this.slow = !!toggles[2]; }
    this.freq = freq;
    this.phase = 0;
    this.subPhase = 0;
    this.vel = (vel ?? 100) / 127;
    this.gateSamples = Math.max(1, Math.floor((gateSec || 0.1) * this.sr));
    this.t = 0;
    this.released = false;
    // ADSR: attack (soft when Slow), decay toward the sustain level, release.
    const atkSec = this.slow ? 0.4 : 0.004;
    this.atkInc = 1 / (atkSec * this.sr);
    const decSec = 0.02 + (params[3] || 0) * 1.5;
    this.decCoef = Math.exp(-1 / (decSec * this.sr));
    this.relCoef = Math.exp(-1 / (0.15 * this.sr)); // ~150 ms release, frees promptly
    this.env = 0;
    this.stage = 'a';
    this.active = true;
  }

  render() {
    if (!this.active) return 0;
    const sr = this.sr;

    // ADSR envelope
    this.t += 1;
    if (!this.released && this.t >= this.gateSamples) { this.released = true; this.stage = 'r'; }
    if (this.stage === 'a') {
      this.env += this.atkInc;
      if (this.env >= 1) { this.env = 1; this.stage = 'd'; }
    } else if (this.stage === 'd') {
      this.env = this.sustain + (this.env - this.sustain) * this.decCoef;
    } else {
      this.env *= this.relCoef;
      if (this.env < 2e-3) { this.active = false; return 0; }
    }
    const env = this.env;

    const cutoff = this.p[0], reso = this.p[1], envmod = this.p[2], pwm = this.p[4];
    const fcBase = 60 * Math.pow(2, cutoff * 7.2);        // ~60 Hz .. ~9 kHz
    let fc = fcBase * Math.pow(2, envmod * env * 5);       // env opens the filter
    if (fc > sr * 0.45) fc = sr * 0.45;
    if (fc < 20) fc = 20;
    const k = Math.min(4.4, reso * 4.2);

    // oscillator
    const dt = this.freq / sr;
    this.phase += dt; if (this.phase >= 1) this.phase -= 1;
    let osc;
    if (this.wave) {
      // pulse with width from PWM (0.5 = square); DC-centered
      const w = 0.5 + (pwm - 0.5) * 0.9; // 0.05..0.95
      osc = this.phase < w ? 1 : -1;
      osc += polyBlep(this.phase, dt);
      let p2 = this.phase - w; if (p2 < 0) p2 += 1;
      osc -= polyBlep(p2, dt);
      osc -= 2 * w - 1;
    } else {
      osc = 2 * this.phase - 1;
      osc -= polyBlep(this.phase, dt);
    }
    if (this.sub) {
      const sdt = dt * 0.5;
      this.subPhase += sdt; if (this.subPhase >= 1) this.subPhase -= 1;
      let s = this.subPhase < 0.5 ? 1 : -1;
      s += polyBlep(this.subPhase, sdt);
      let sp2 = this.subPhase + 0.5; if (sp2 >= 1) sp2 -= 1;
      s -= polyBlep(sp2, sdt);
      osc = osc * 0.8 + s * 0.6;
    }

    // 4-pole ZDF ladder (same as ACID): self-oscillates near k = 4
    const g = Math.tan(Math.PI * fc / sr);
    const G = g / (1 + g);
    const omg = 1 - G;
    const G2 = G * G, G4 = G2 * G2;
    const beta = omg * (G2 * G * this.s1 + G2 * this.s2 + G * this.s3 + this.s4);
    const u = (osc - k * beta) / (1 + k * G4);
    let v = (u - this.s1) * G; const y1 = v + this.s1; this.s1 = y1 + v;
    v = (y1 - this.s2) * G; const y2 = v + this.s2; this.s2 = y2 + v;
    v = (y2 - this.s3) * G; const y3 = v + this.s3; this.s3 = y3 + v;
    v = (y3 - this.s4) * G; const y4 = v + this.s4; this.s4 = y4 + v;

    return Math.tanh(y4 * 1.1) * env * this.vel * 0.5;
  }
}
