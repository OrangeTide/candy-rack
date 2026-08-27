// SPDX-License-Identifier: 0BSD

// Metadata for the E.PIANO engine, a 6-operator FM voice on DX7 algorithm 5
// (three 2-op towers). Params normalized 0..1; DSP in
// src/core/worklet/engines/fm6.js. Tine tracks step velocity for the classic
// bright-on-hard attack. modOutputs reserved for the future matrix.
export const epianoMeta = {
  id: 'epiano',
  label: 'E.PIANO',
  params: [
    { key: 'tine', label: 'Tine', default: 0.55 },
    { key: 'body', label: 'Body', default: 0.45 },
    { key: 'attack', label: 'Attack', default: 0.15 },
    { key: 'decay', label: 'Decay', default: 0.55 },
    { key: 'drive', label: 'Drive', default: 0.15 },
  ],
  modOutputs: [],
};
