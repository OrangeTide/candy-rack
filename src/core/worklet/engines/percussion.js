// SPDX-License-Identifier: 0BSD

// 808-flavoured percussion voices for kit parts: a handclap and a cowbell. Both
// share the drum sub-voice interface (constructor(sr); noteOn({note,vel,params});
// render()->sample; active flag) and the same 5 controls [Tune, Decay, Tone,
// Snap, Drive], so a kit part can be any of them. Analog modelling, not samples.

const TWO_PI = Math.PI * 2;

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

// 909-style kick: a sine body with a fast, deep pitch sweep (the punch), a short
// noise "beater" click on the attack, a long amp decay, and saturation. Punchier
// and longer than the generic drum voice, which caps around 0.3 s. Params
// [Tune, Decay, Tone, Snap, Drive]: Tune = pitch, Decay = body length, Snap =
// the pitch sweep + click, Tone = beater-click amount.
export class KickVoice {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.active = false;
    this.phase = 0;
    this.p = [0.30, 0.60, 0.40, 0.50, 0.30];
  }

  noteOn({ note, vel, params }) {
    this.p = params;
    const [tune, decay, , snap] = params;
    this.base = 42 * Math.pow(2, tune * 1.0) * Math.pow(2, ((note ?? 60) - 60) / 12);
    this.sweep = 2 + snap * 8;                                  // deep 909 pitch drop
    this.pitchCoef = Math.exp(-1 / ((0.008 + snap * 0.02) * this.sr));
    this.ampCoef = Math.exp(-1 / ((0.03 + decay * 0.11) * this.sr)); // ~0.2..0.9 s tail
    this.clickCoef = Math.exp(-1 / (0.002 * this.sr));             // ~2 ms beater click
    this.penv = 1; this.amp = 1; this.click = 1; this.phase = 0;
    this.vel = (vel ?? 100) / 127;
    this.active = true;
  }

  render() {
    if (!this.active) return 0;
    const drive = this.p[4];
    const clickAmt = 0.3 + this.p[2] * 0.5;
    const f = this.base * (1 + this.sweep * this.penv);
    this.phase += (TWO_PI * f) / this.sr; if (this.phase > TWO_PI) this.phase -= TWO_PI;
    const body = Math.sin(this.phase);
    const click = (Math.random() * 2 - 1) * this.click * clickAmt;
    let s = (body + click) * this.amp * this.vel;
    s = Math.tanh(s * (1.4 + drive * 4));
    this.penv *= this.pitchCoef;
    this.amp *= this.ampCoef;
    this.click *= this.clickCoef;
    if (this.amp < 1e-3) { this.active = false; return 0; }
    return s * 0.9;
  }
}

// 909-style snare: a two-tone body (two sines ~185 / 330 Hz) plus a high-passed
// noise "snappy". Params [Tune, Decay, Tone, Snap, Drive]: Tune = body pitch,
// Decay = noise tail, Tone = snappy (noise vs body), Snap = body decay.
export class SnareVoice {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.active = false;
    this.ph1 = 0; this.ph2 = 0; this.hp = 0;
    this.p = [0.40, 0.40, 0.60, 0.50, 0.30];
  }

  noteOn({ note, vel, params }) {
    this.p = params;
    const [tune, decay, , snap] = params;
    const mul = Math.pow(2, ((note ?? 60) - 60) / 12) * (0.7 + tune * 0.9);
    this.f1 = 185 * mul; this.f2 = 330 * mul;
    this.bodyCoef = Math.exp(-1 / ((0.03 + snap * 0.06) * this.sr));
    this.noiseCoef = Math.exp(-1 / ((0.02 + decay * 0.14) * this.sr));
    this.bodyEnv = 1; this.noiseEnv = 1; this.ph1 = 0; this.ph2 = 0; this.hp = 0;
    this.vel = (vel ?? 100) / 127;
    this.active = true;
  }

  render() {
    if (!this.active) return 0;
    const drive = this.p[4];
    const snappy = 0.3 + this.p[2] * 0.6;
    this.ph1 += this.f1 / this.sr; if (this.ph1 >= 1) this.ph1 -= 1;
    this.ph2 += this.f2 / this.sr; if (this.ph2 >= 1) this.ph2 -= 1;
    const body = (Math.sin(TWO_PI * this.ph1) + Math.sin(TWO_PI * this.ph2)) * 0.5 * this.bodyEnv;
    const n = Math.random() * 2 - 1;
    this.hp += 0.5 * (n - this.hp);            // one-pole LP; noise = n - LP (high-pass)
    const noise = (n - this.hp) * this.noiseEnv;
    let s = (body * (1 - snappy) + noise * snappy * 1.4) * this.vel;
    s = Math.tanh(s * (1.2 + drive * 4));
    this.bodyEnv *= this.bodyCoef;
    this.noiseEnv *= this.noiseCoef;
    if (this.bodyEnv < 1e-3 && this.noiseEnv < 1e-3) { this.active = false; return 0; }
    return s * 0.7;
  }
}

// 808/909-style hi-hat: six square oscillators at an inharmonic ratio set,
// through a bandpass for the metallic sizzle. Decay spans closed (short) to open
// (long), so two kit parts on this voice give closed + open hats. Params
// [Tune, Decay, Tone, Snap, Drive]: Tune = cluster pitch, Decay = closed..open,
// Tone = brightness.
const HAT_RATIOS = [1.0, 1.342, 1.6, 1.857, 2.108, 2.539];
export class HatVoice {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.active = false;
    this.ph = new Float32Array(6);
    this.bp = new BandPass();
    this.p = [0.50, 0.10, 0.50, 0.50, 0.20];
  }

  noteOn({ note, vel, params }) {
    this.p = params;
    const [tune, decay, tone] = params;
    const base = 320 * Math.pow(2, tune * 1.2) * Math.pow(2, ((note ?? 60) - 60) / 12);
    this.freqs = HAT_RATIOS.map((r) => r * base);
    this.bp.set(6000 + tone * 6000, 1.2, this.sr);
    this.ampCoef = Math.exp(-1 / ((0.008 + decay * 0.12) * this.sr)); // closed..open
    this.env = 1;
    for (let i = 0; i < 6; i++) this.ph[i] = Math.random();
    this.vel = (vel ?? 100) / 127;
    this.active = true;
  }

  render() {
    if (!this.active) return 0;
    const drive = this.p[4];
    let sum = 0;
    for (let i = 0; i < 6; i++) {
      this.ph[i] += this.freqs[i] / this.sr; if (this.ph[i] >= 1) this.ph[i] -= 1;
      sum += this.ph[i] < 0.5 ? 1 : -1;
    }
    sum /= 6;
    let s = this.bp.process(sum) * this.env * this.vel;
    s = Math.tanh(s * (2 + drive * 5));
    this.env *= this.ampCoef;
    if (this.env < 1e-3) { this.active = false; return 0; }
    return s * 0.6;
  }
}
