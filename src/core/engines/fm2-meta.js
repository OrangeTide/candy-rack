// SPDX-License-Identifier: 0BSD

// Metadata for the 2-operator FM engine. Params normalized 0..1; DSP in
// src/core/worklet/engines/fm2.js. modOutputs reserved for the future matrix.
export const fm2Meta = {
  id: 'fm2',
  label: '2-OP FM',
  params: [
    { key: 'ratio', label: 'Ratio', default: 0.50 },
    { key: 'index', label: 'Index', default: 0.40 },
    { key: 'feedback', label: 'Feedback', default: 0.20 },
    { key: 'decay', label: 'Decay', default: 0.50 },
    { key: 'drive', label: 'Drive', default: 0.20 },
  ],
  modOutputs: [],
};
