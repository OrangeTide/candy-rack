// SPDX-License-Identifier: 0BSD

// Metadata for the MS-20 engine, a Korg MS-20 style monophonic lead. DSP in
// src/core/worklet/engines/ms20.js. Monophonic with slide (portamento) and
// accent on the alt lane. Its 2-pole Sallen-Key filter has a nonlinear,
// distorting resonance (the MS-20 "scream"), a distinct character from the
// roster's 4-pole ladder. Aggressive acid / techno / industrial leads.
export const ms20Meta = {
  id: 'ms20',
  label: 'MS-20',
  mono: true,
  altMode: 'accent',
  params: [
    { key: 'cutoff', label: 'Cutoff', default: 0.45 },
    { key: 'reso', label: 'Peak', default: 0.65 },
    { key: 'envmod', label: 'Env Mod', default: 0.55 },
    { key: 'decay', label: 'Decay', default: 0.40 },
    { key: 'drive', label: 'Drive', default: 0.25 },
  ],
  // Waveform (off = saw, on = pulse), a sub-octave square, and Scream (drives the
  // resonance nonlinearity harder for a vocal, distorted peak).
  toggles: [
    { key: 'wave', label: 'Pulse', default: false },
    { key: 'sub', label: 'Sub', default: false },
    { key: 'scream', label: 'Scream', default: false },
  ],
  modOutputs: [],
};
