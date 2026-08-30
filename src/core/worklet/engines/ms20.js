// SPDX-License-Identifier: 0BSD

// MS-20: a Korg MS-20 style monophonic lead voice. It shares the acid/sh101
// oscillator + envelope platform (PolyBLEP saw/pulse, fast filter envelope,
// mono with slide + accent) but replaces the smooth 4-pole Moog-style ladder
// with a 2-pole Sallen-Key lowpass whose resonance is NONLINEAR: the fed-back
// output is saturated (tanh) before it re-enters the loop, so at high resonance
// the filter distorts and screams instead of ringing cleanly. That aggressive,
// clipping 12 dB/oct resonance is the MS-20 character, and a distinct second
// filter colour next to the roster's ladder monoculture (acid, sh101, csaw).
// Bright, nasty acid / techno / industrial leads.
//
// Params (0..1) from ms20-meta.js: [cutoff, reso, envmod, decay, drive].
// Toggle 0 = waveform (0 saw, 1 pulse); toggle 1 = sub-octave; toggle 2 = Scream
// (drives the resonance nonlinearity harder for a more vocal, distorted peak).

const ACCENT = 0.7;

function polyBlep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

export class MS20Voice {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.active = false;
    this.phase = 0;
    this.subPhase = 0;
    this.freq = 110;
    this.freqTarget = 110;
    this.glideCoef = 1 - Math.exp(-1 / (0.045 * sampleRate)); // fixed ~45 ms slide
    this.p = [0.4, 0.6, 0.5, 0.4, 0.3];
    this.wave = false;
    this.sub = false;
    this.scream = false;
    // 2-pole Sallen-Key states
    this.s1 = 0; this.s2 = 0;
    // envelopes
    this.envF = 0;    // filter envelope (fast decay)
    this.accentV = 0;
    this.ampV = 0;
    this.ampLevel = 0;
    this.ampGate = 0;
    this.t = 0; this.gateSamples = 1; this.released = false;
    this.ampAtk = 1 - Math.exp(-1 / (0.002 * sampleRate));
    this.ampRel = 1 - Math.exp(-1 / (0.012 * sampleRate));
  }

  noteOn({ freq, vel, gateSec, params, slide, accent, toggles, tie }) {
    this.p = params;
    if (toggles) { this.wave = !!toggles[0]; this.sub = !!toggles[1]; this.scream = !!toggles[2]; }
    const glide = slide && this.active;
    const hold = (slide || tie) && this.active;
    this.freqTarget = freq;
    const v = (vel ?? 100) / 127;
    this.ampLevel = v * (accent ? 1.5 : 1.0);
    if (accent) this.accentV = 1;
    this.accentDec = Math.exp(-1 / (0.2 * this.sr));
    const decaySec = 0.05 + (params[3] || 0) * 1.6;
    this.envDec = Math.exp(-1 / (decaySec * this.sr));
    if (!glide) this.freq = freq;
    if (!hold) {
      this.phase = 0;
      this.subPhase = 0;
      this.envF = 1;
    }
    this.gateSamples = Math.max(1, Math.floor((gateSec || 0.1) * this.sr));
    this.t = 0;
    this.released = false;
    this.ampGate = 1;
    this.active = true;
  }

  render() {
    if (!this.active) return 0;
    const sr = this.sr;

    this.freq += (this.freqTarget - this.freq) * this.glideCoef;

    // amp AR envelope
    this.t += 1;
    if (!this.released && this.t >= this.gateSamples) { this.released = true; this.ampGate = 0; }
    const ampTarget = this.ampGate ? this.ampLevel : 0;
    this.ampV += (ampTarget - this.ampV) * (ampTarget > this.ampV ? this.ampAtk : this.ampRel);
    if (this.released && this.ampV < 1e-4) { this.active = false; return 0; }

    this.envF *= this.envDec;
    this.accentV *= this.accentDec;

    const cutoff = this.p[0], reso = this.p[1], envmod = this.p[2], drive = this.p[4];

    // base cutoff ~60 Hz .. ~7.7 kHz, opened by the filter envelope and accent.
    const fcBase = 60 * Math.pow(2, cutoff * 7);
    const openOct = envmod * this.envF * 5.0 + ACCENT * this.accentV * 3.0;
    let fc = fcBase * Math.pow(2, openOct);
    if (fc > sr * 0.45) fc = sr * 0.45;
    if (fc < 20) fc = 20;
    // damping kq = 1/Q: high reso drives it toward 0, where the 2-pole self-
    // oscillates. Accent (and Scream) push it lower still for a hotter peak.
    const scream = this.scream;
    let kq = 1.35 - reso * 1.28 - ACCENT * this.accentV * 0.22 - (scream ? 0.08 : 0);
    if (kq < 0.02) kq = 0.02;

    // oscillator (PolyBLEP saw or pulse), pre-driven into the filter
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
    if (this.sub) {
      const sdt = dt * 0.5;
      this.subPhase += sdt; if (this.subPhase >= 1) this.subPhase -= 1;
      let sub = this.subPhase < 0.5 ? 1 : -1;
      sub += polyBlep(this.subPhase, sdt);
      let sp2 = this.subPhase + 0.5; if (sp2 >= 1) sp2 -= 1;
      sub -= polyBlep(sp2, sdt);
      osc = osc * 0.85 + sub * 0.7;
    }
    const inGain = 1 + drive * 2.5;
    const oscIn = Math.tanh(osc * inGain);   // input drive/saturation into the filter

    // 2-pole self-oscillating state-variable lowpass (Zavalishin/Cytomic TPT),
    // kept LINEAR so the resonance rings and self-oscillates. The MS-20 scream is
    // the loud resonant PEAK overdriving the output stage: a high Q makes the
    // peak huge and the output tanh clips it into a distorted, vocal howl (Scream
    // drives that harder). This is the resonance-into-clipping the MS-20 does.
    const g = Math.tan(Math.PI * fc / sr);
    const a1 = 1 / (1 + g * (g + kq));
    const a2 = g * a1;
    const a3 = g * a2;
    const v3 = oscIn - this.s2;
    const v1 = a1 * this.s1 + a2 * v3;            // bandpass
    const v2 = this.s2 + a2 * this.s1 + a3 * v3;  // lowpass
    this.s1 = 2 * v1 - this.s1;
    this.s2 = 2 * v2 - this.s2;

    // A little bandpass bleed sharpens the resonant peak, then the output stage
    // saturates: high Q -> loud peak -> the tanh clips it into the scream.
    const peak = v2 + v1 * (scream ? 0.5 : 0.25);
    const outDrive = (scream ? 2.2 : 1.3) + drive * 1.6;
    const mk = 1 / (1 + drive * 0.8);
    return Math.tanh(peak * outDrive) * mk * this.ampV * 0.7;
  }
}
