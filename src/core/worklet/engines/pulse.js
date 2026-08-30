// SPDX-License-Identifier: 0BSD

// PULSE: a chiptune voice in the NES / Game Boy 2A03 spirit. A band-limited
// variable-duty pulse (the two square channels), a quantised triangle (the bass
// channel), and an LFSR noise mode (the drum/hat channel), plus the feature that
// makes chip music sound like chip music: a built-in ARPEGGIATOR. A held note
// cycles its pitch through a chord shape very fast (tens of hertz), so one
// monophonic channel reads as a chord shimmer, exactly the trick the hardware
// used to fake polyphony.
//
// Params (0..1) from pulse-meta.js: [duty, arp, rate, decay, vibrato].
// Toggles: 0 = Tri (triangle wave), 1 = Noise (LFSR), 2 = Sub (a sub-octave square).

// Arp chord shapes: semitone offsets the arpeggiator cycles through. 'off' holds
// the single note.
export const ARP_SHAPES = ['off', 'oct', '5th', 'maj', 'min', 'sus4', 'maj7', 'min7'];
const ARP_TABLE = {
  off: [0], oct: [0, 12], '5th': [0, 7, 12], maj: [0, 4, 7], min: [0, 3, 7],
  sus4: [0, 5, 7], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10],
};

const TWO_PI = Math.PI * 2;

function polyBlep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

export class PulseVoice {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.active = false;
    this.phase = 0; this.subPhase = 0;
    this.vibPhase = 0;
    this.lfsr = 0x7fff; this.nphase = 0;
    this.p = [0.5, 0.0, 0.4, 0.4, 0.0];
    this.tri = false; this.noise = false; this.sub = false;
    this.baseFreq = 220; this.note = 60; this.vel = 1;
    // amp envelope (attack / decay-to-sustain / release)
    this.env = 0; this.stage = 'idle'; this.t = 0; this.gateSamples = 1; this.released = false;
    this.atkInc = 1; this.decCoef = 0; this.relCoef = 0; this.sustain = 0.55;
    // arpeggiator
    this.arp = ARP_TABLE.off; this.arpIdx = 0; this.arpT = 0; this.arpSamples = 1;
  }

  noteOn({ freq, note, vel, gateSec, params, toggles, tie }) {
    this.p = params;
    if (toggles) { this.tri = !!toggles[0]; this.noise = !!toggles[1]; this.sub = !!toggles[2]; }
    this.note = note;
    this.baseFreq = freq;
    this.vel = (vel ?? 100) / 127;

    const shape = ARP_SHAPES[Math.min(ARP_SHAPES.length - 1, Math.max(0, Math.floor((params[1] || 0) * ARP_SHAPES.length)))];
    this.arp = ARP_TABLE[shape];
    const arpHz = 10 + (params[2] || 0) * 50; // 10..60 Hz: fast enough to read as a chord
    this.arpSamples = Math.max(1, Math.floor(this.sr / arpHz));

    this.gateSamples = Math.max(1, Math.floor((gateSec || 0.1) * this.sr));
    this.atkInc = 1 / (0.001 * this.sr);
    const decSec = 0.01 + (params[3] || 0) * 0.9;
    this.decCoef = Math.exp(-1 / (decSec * this.sr));
    this.relCoef = Math.exp(-1 / (0.03 * this.sr));

    // Cross-loop hold: a tied trigger on a sounding voice keeps phase and envelope.
    const hold = !!tie && this.active && this.env > 2e-3;
    this.t = 0; this.released = false;
    if (!hold) {
      this.phase = 0; this.subPhase = 0; this.vibPhase = 0;
      this.arpIdx = 0; this.arpT = 0;
      this.env = 0; this.stage = 'a';
    } else if (this.stage === 'r') {
      this.stage = 'd';
    }
    this.active = true;
  }

  render() {
    if (!this.active) return 0;
    const sr = this.sr;

    // amp envelope
    this.t += 1;
    if (!this.released && this.t >= this.gateSamples) { this.released = true; this.stage = 'r'; }
    if (this.stage === 'a') { this.env += this.atkInc; if (this.env >= 1) { this.env = 1; this.stage = 'd'; } }
    else if (this.stage === 'd') { this.env = this.sustain + (this.env - this.sustain) * this.decCoef; }
    else if (this.stage === 'r') { this.env *= this.relCoef; if (this.env < 1e-4) { this.active = false; return 0; } }

    // arpeggiator: step through the chord shape
    this.arpT += 1;
    if (this.arpT >= this.arpSamples) { this.arpT = 0; this.arpIdx = (this.arpIdx + 1) % this.arp.length; }
    const arpOff = this.arp[this.arpIdx];

    // vibrato: a gentle pitch LFO
    this.vibPhase += (TWO_PI * 6.5) / sr;
    const vib = Math.sin(this.vibPhase) * this.p[4] * 0.6; // up to ~0.6 semitone
    const freq = this.baseFreq * Math.pow(2, (arpOff + vib) / 12);

    let s;
    if (this.noise) {
      // LFSR noise, pitched by the note (higher = brighter hiss)
      this.nphase += (freq / sr) * 6;
      while (this.nphase >= 1) {
        this.nphase -= 1;
        const bit = (this.lfsr ^ (this.lfsr >> 1)) & 1;
        this.lfsr = (this.lfsr >> 1) | (bit << 14);
      }
      s = (this.lfsr & 1) ? 0.7 : -0.7;
    } else if (this.tri) {
      const inc = freq / sr;
      this.phase += inc; if (this.phase >= 1) this.phase -= 1;
      let tri = 4 * Math.abs(this.phase - 0.5) - 1; // -1..1 triangle
      s = Math.round(tri * 7.5) / 7.5;              // quantised to 16 steps (NES flavour)
    } else {
      const inc = freq / sr;
      const dt = inc;
      this.phase += inc; if (this.phase >= 1) this.phase -= 1;
      const duty = 0.06 + this.p[0] * 0.44; // 6%..50% pulse width
      let v = this.phase < duty ? 1 : -1;
      v += polyBlep(this.phase, dt);
      v -= polyBlep((this.phase - duty + 1) % 1, dt);
      v -= 2 * duty - 1; // remove the duty-dependent DC offset
      s = v * 0.7;
    }

    // sub-octave square for a fuller bass
    if (this.sub && !this.noise) {
      const subInc = (freq * 0.5) / sr;
      this.subPhase += subInc; if (this.subPhase >= 1) this.subPhase -= 1;
      s += (this.subPhase < 0.5 ? 1 : -1) * 0.4;
    }

    return s * this.env * this.vel * 0.5;
  }
}
