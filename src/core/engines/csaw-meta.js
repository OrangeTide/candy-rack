// SPDX-License-Identifier: 0BSD

// Metadata for the CS-SAW engine (CS-80 style fat sawtooth, Braids CSAW spirit).
// DSP in src/core/worklet/engines/csaw.js.
export const csawMeta = {
  id: 'csaw',
  label: 'CS-SAW',
  params: [
    { key: 'timbre', label: 'Timbre', default: 0.40 },
    { key: 'color', label: 'Color', default: 0.60 },
    { key: 'detune', label: 'Detune', default: 0.20 },
    { key: 'decay', label: 'Decay', default: 0.55 },
    { key: 'drive', label: 'Drive', default: 0.20 },
  ],
  modOutputs: [],
};
