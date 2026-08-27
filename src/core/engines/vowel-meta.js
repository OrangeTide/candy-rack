// SPDX-License-Identifier: 0BSD

// Metadata for the Vowel / talkbox engine: a sawtooth through three formant
// bandpass filters. Vowel morphs a-e-i-o-u; sweep it from the mod matrix for the
// talking motion. DSP in src/core/worklet/engines/vowel.js.
export const vowelMeta = {
  id: 'vowel',
  label: 'VOWEL',
  params: [
    { key: 'vowel', label: 'Vowel', default: 0.30 },
    { key: 'formant', label: 'Formant', default: 0.50 },
    { key: 'resonance', label: 'Reso', default: 0.55 },
    { key: 'decay', label: 'Decay', default: 0.50 },
    { key: 'drive', label: 'Drive', default: 0.25 },
  ],
  modOutputs: [],
};
