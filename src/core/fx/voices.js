// SPDX-License-Identifier: 0BSD

// Effects pedal DSP, shared by the AudioWorklet fx-processor and the offline
// renderer, the same way engine sub-voices are shared. Each voice is mono-or-
// stereo in, stereo out, and processes a block:
//
//   voice.process(inL, inR, outL, outR, n)
//
// The send bus is mono, so inL and inR are usually equal; a voice may still
// write a stereo image to outL/outR (ping-pong delay does). The voice applies
// its own Mix knob (effect wet/dry). Footswitch bypass is handled one level up
// in the processor as a smoothed crossfade, so voices do not know about it.

// Straight-through: the empty slot. Copies input to output unchanged.
export class ThruVoice {
  // eslint-disable-next-line no-unused-vars
  constructor(sr) {}
  // eslint-disable-next-line no-unused-vars
  setParams(values) {}
  process(inL, inR, outL, outR, n) {
    for (let i = 0; i < n; i++) { outL[i] = inL[i]; outR[i] = inR[i]; }
  }
}

// Ping-pong delay. A mono input feeds the left line; the left line bounces to
// the right, and the right feeds back to the left, so repeats alternate across
// the stereo field. Knobs: Time, Repeats (feedback), Tone (damps the repeats),
// Mix (effect wet/dry).
export class DelayVoice {
  constructor(sr) {
    this.sr = sr;
    this.max = Math.ceil(sr * 1.0) + 1; // up to 1s of delay
    this.bufL = new Float32Array(this.max);
    this.bufR = new Float32Array(this.max);
    this.w = 0;
    this.lpL = 0;
    this.lpR = 0;
    this.setParams([0.4, 0.45, 0.6, 0.5]);
  }

  // values = [time, feedback, tone, mix], each 0..1.
  setParams(values) {
    this.time = values[0] || 0;
    this.feedback = values[1] || 0;
    this.tone = values[2] || 0;
    this.mix = values[3] || 0;
  }

  process(inL, inR, outL, outR, n) {
    const max = this.max;
    // Time maps to 20ms..750ms. No tempo sync yet.
    const delaySamp = Math.max(1, Math.min(max - 1, Math.round((0.02 + this.time * 0.73) * this.sr)));
    const fb = Math.min(0.95, this.feedback * 0.95);
    // Tone is a one-pole lowpass on the repeats: bright near 1, dark near 0.
    const toneA = 0.04 + this.tone * this.tone * 0.92;
    const mix = this.mix;
    let w = this.w;
    for (let i = 0; i < n; i++) {
      const rp = w - delaySamp + (w - delaySamp < 0 ? max : 0);
      const dL = this.bufL[rp];
      const dR = this.bufR[rp];
      this.lpL += (dL - this.lpL) * toneA;
      this.lpR += (dR - this.lpR) * toneA;
      const inMono = (inL[i] + inR[i]) * 0.5;
      this.bufL[w] = inMono + this.lpR * fb;
      this.bufR[w] = this.lpL * fb;
      w = w + 1 === max ? 0 : w + 1;
      outL[i] = inL[i] * (1 - mix) + dL * mix;
      outR[i] = inR[i] * (1 - mix) + dR * mix;
    }
    this.w = w;
  }
}

// Factory keyed by pedal type id, mirroring kitPartVoice(). Unknown ids fall
// back to Thru so an empty or future slot is a safe passthrough.
export function fxVoice(type, sr) {
  if (type === 'delay') return new DelayVoice(sr);
  return new ThruVoice(sr);
}
