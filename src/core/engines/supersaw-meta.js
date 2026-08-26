// SPDX-License-Identifier: 0BSD

// Metadata for the SUPERSAW engine: a JP-8000 / Acid Rain Chainsaw style stack
// of detuned saws for pads and ambient drones. DSP in
// src/core/worklet/engines/supersaw.js. Two of the controls are the flexibility
// the design notes call out: Waves lowers the number of oscillators per cluster,
// Decimate lowers the effective sample rate for lo-fi grit.
export const supersawMeta = {
  id: 'supersaw',
  label: 'SUPERSAW',
  params: [
    { key: 'detune', label: 'Detune', default: 0.35 },
    { key: 'waves', label: 'Waves', default: 0.70 },
    { key: 'color', label: 'Color', default: 0.70 },
    { key: 'decimate', label: 'Decimate', default: 0.00 },
    { key: 'drive', label: 'Drive', default: 0.15 },
  ],
  modOutputs: [],
};
