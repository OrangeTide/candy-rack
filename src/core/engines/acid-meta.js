// SPDX-License-Identifier: 0BSD

// Metadata for the ACID engine, a TB-303-style monophonic bassline (acid
// squelch). DSP in src/core/worklet/engines/acid.js. Monophonic with slide
// (portamento) and accent on the alt lane, like the hardware. The finishing
// overdrive lives in the FX rack (RAT / Dist+), the classic acid stack.
export const acidMeta = {
  id: 'acid',
  label: 'ACID',
  mono: true,
  altMode: 'accent',
  params: [
    { key: 'cutoff', label: 'Cutoff', default: 0.35 },
    { key: 'reso', label: 'Reso', default: 0.60 },
    { key: 'envmod', label: 'Env Mod', default: 0.50 },
    { key: 'decay', label: 'Decay', default: 0.40 },
    { key: 'accent', label: 'Accent', default: 0.50 },
  ],
  // One on/off switch: the oscillator waveform (off = saw, on = square).
  toggles: [
    { key: 'wave', label: 'Square', default: false },
  ],
  modOutputs: [],
};
