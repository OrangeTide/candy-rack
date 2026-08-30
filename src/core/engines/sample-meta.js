// SPDX-License-Identifier: 0BSD

// Metadata for the SAMPLE ROMpler. Sample picks a factory ROM slot; the played
// note pitches it (or picks a slice in Slice mode); Tone and Crush give the lo-fi
// character. DSP and the synthesised ROM live in src/core/worklet/engines/sample.js.
import { fmtEnum } from '../format.js';
import { SAMPLE_SLOTS } from '../worklet/engines/sample.js';

export const sampleMeta = {
  id: 'sample',
  label: 'SAMPLE',
  params: [
    { key: 'sample', label: 'Sample', default: 0.0, format: fmtEnum(SAMPLE_SLOTS) },
    { key: 'start', label: 'Start', default: 0.0 },
    { key: 'length', label: 'Length', default: 0.5 },
    { key: 'tone', label: 'Tone', default: 0.6 },
    { key: 'crush', label: 'Crush', default: 0.0 },
  ],
  // Loop the playback region, play it in reverse, and Slice mode (the note picks
  // one of 16 equal slices at native pitch, for chopping a break) instead of
  // pitching the whole sample by the note.
  toggles: [
    { key: 'loop', label: 'Loop', default: false },
    { key: 'reverse', label: 'Reverse', default: false },
    { key: 'slice', label: 'Slice', default: false },
  ],
  modOutputs: [],
};
