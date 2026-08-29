// SPDX-License-Identifier: 0BSD

// Metadata for the chord generator. Type selects the interval set; the root is
// the step note. DSP in src/core/worklet/engines/chord.js.
import { fmtEnum } from '../format.js';
import { CHORD_NAMES } from '../worklet/engines/chord.js';

export const chordMeta = {
  id: 'chord',
  label: 'CHORD',
  params: [
    { key: 'type', label: 'Type', default: 0.00, format: fmtEnum(CHORD_NAMES) },
    { key: 'detune', label: 'Detune', default: 0.20 },
    { key: 'wave', label: 'Wave', default: 0.30 },
    { key: 'decay', label: 'Decay', default: 0.55 },
    { key: 'drive', label: 'Drive', default: 0.20 },
  ],
  modOutputs: [],
};
