// SPDX-License-Identifier: 0BSD

// 808-flavoured percussion voices for kit parts: a handclap and a cowbell. Both
// share the drum sub-voice interface (constructor(sr); noteOn({note,vel,params});
// render()->sample; active flag) and the same 5 controls [Tune, Decay, Tone,
// Snap, Drive], so a kit part can be any of them. Analog modelling, not samples.

// A resonant bandpass biquad (constant 0 dB peak gain), recomputed on note-on.
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

// 808 handclap: bandpassed white noise with the signature envelope of three fast
// bursts (the "claps") followed by a longer diffuse tail.
export class ClapVoice {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.active = false;
    this.bp = new BandPass();
    this.p = [0.4, 0.4, 0.5, 0.5, 0.2];
  }

  noteOn({ vel, params }) {
    this.p = params;
    const [tune, decay, tone] = params;
    this.bp.set(600 + tune * 1700, 0.7 + tone * 2.2, this.sr);
    // Three bursts spaced ~9ms, each a fast spike; then a slow tail.
    this.spacing = Math.floor((0.006 + (1 - params[3]) * 0.009) * this.sr);
    this.burstCoef = Math.exp(-1 / (0.0018 * this.sr));
    this.tailCoef = Math.exp(-1 / ((0.02 + decay * 0.09) * this.sr));
    this.env = 1;
    this.burst = 0;
    this.t = 0;
    this.nextBurst = this.spacing;
    this.vel = (vel ?? 100) / 127;
    this.active = true;
  }

  render() {
    if (!this.active) return 0;
    this.t += 1;
    if (this.burst < 3 && this.t >= this.nextBurst) {
      this.env = 1;
      this.burst += 1;
      this.nextBurst += this.spacing;
    }
    this.env *= this.burst < 3 ? this.burstCoef : this.tailCoef;
    if (this.burst >= 3 && this.env < 1e-3) { this.active = false; return 0; }

    const noise = Math.random() * 2 - 1;
    let s = this.bp.process(noise) * this.env * this.vel;
    const drive = this.p[4];
    s = Math.tanh(s * (2 + drive * 6));
    return s * 0.8;
  }
}

// 808 cowbell: two square oscillators (~540 / 800 Hz, a fixed inharmonic ratio)
// summed through a bandpass, with a sharp attack and medium decay.
export class CowbellVoice {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.active = false;
    this.bp = new BandPass();
    this.ph1 = 0;
    this.ph2 = 0;
    this.p = [0.4, 0.4, 0.5, 0.5, 0.2];
  }

  noteOn({ note, vel, params }) {
    this.p = params;
    const [tune, decay, tone, snap] = params;
    const mul = Math.pow(2, ((note ?? 60) - 60) / 12) * (0.6 + tune * 1.4);
    this.f1 = 540 * mul;
    this.f2 = 800 * mul;
    this.bp.set(1400 + tone * 2600, 1.0 + tone * 1.5, this.sr);
    this.ampCoef = Math.exp(-1 / ((0.02 + decay * 0.06) * this.sr));
    // Snap sets a short attack ramp so it can click or soften.
    this.atkInc = 1 / (Math.max(1, (0.0004 + (1 - snap) * 0.004) * this.sr));
    this.amp = 0;
    this.env = 1;
    this.ph1 = 0;
    this.ph2 = 0;
    this.vel = (vel ?? 100) / 127;
    this.active = true;
  }

  render() {
    if (!this.active) return 0;
    if (this.amp < 1) { this.amp += this.atkInc; if (this.amp > 1) this.amp = 1; }
    this.ph1 += this.f1 / this.sr; if (this.ph1 >= 1) this.ph1 -= 1;
    this.ph2 += this.f2 / this.sr; if (this.ph2 >= 1) this.ph2 -= 1;
    const sq = ((this.ph1 < 0.5 ? 1 : -1) + (this.ph2 < 0.5 ? 1 : -1)) * 0.5;

    let s = this.bp.process(sq) * this.amp * this.env * this.vel;
    const drive = this.p[4];
    s = Math.tanh(s * (1.5 + drive * 5));
    this.env *= this.ampCoef;
    if (this.env < 1e-3) { this.active = false; return 0; }
    return s * 0.7;
  }
}
