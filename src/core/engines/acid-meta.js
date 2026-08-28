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
    // Variable slide (Devilfish): portamento time for slide steps, ~10..160 ms.
    { key: 'slide', label: 'Slide', default: 0.30 },
  ],
  // Waveform (off = saw, on = square) and a sub-octave square (Devilfish sub).
  // Per-step accent lives on the alt lane at a fixed intensity, not a knob.
  toggles: [
    { key: 'wave', label: 'Square', default: false },
    { key: 'sub', label: 'Sub', default: false },
  ],
  modOutputs: [],
};
