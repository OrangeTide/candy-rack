// SPDX-License-Identifier: 0BSD

// Metadata for the SH-101 engine, a classic analog subtractive synth (saw/pulse
// + sub into a resonant ladder with an ADSR). DSP in
// src/core/worklet/engines/sh101.js. Polyphonic. Its LFO modulation is the mod
// matrix: route an LFO to PWM (m4) for the moving-pulse pad, or to Cutoff (m0)
// for the filter wobble.
export const sh101Meta = {
  id: 'sh101',
  label: 'SH-101',
  params: [
    { key: 'cutoff', label: 'Cutoff', default: 0.45 },
    { key: 'reso', label: 'Reso', default: 0.35 },
    { key: 'envmod', label: 'Env Mod', default: 0.50 },
    { key: 'decay', label: 'Decay', default: 0.40 },
    { key: 'pwm', label: 'PWM', default: 0.50 },
  ],
  // Pulse (off = saw, on = pulse with PWM), Sub-oscillator, and Slow attack.
  toggles: [
    { key: 'pulse', label: 'Pulse', default: false },
    { key: 'sub', label: 'Sub', default: false },
    { key: 'slow', label: 'Slow', default: false },
  ],
  modOutputs: [],
};
