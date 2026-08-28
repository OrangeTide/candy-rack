// SPDX-License-Identifier: 0BSD

// Main-thread metadata for the Dimension pedal, a Roland Dimension D / Boss DC-2
// style stereo chorus (DimVoice in ../fx/voices.js). Faithful to the hardware,
// it has no rate/depth knobs, only mode buttons I/II/III on the toggles
// (combinable for in-between settings); Mix and Width are the only knobs. The
// dimensional chord/pad widener for dub techno, French house, and vaporwave.
export const dimMeta = {
  id: 'dim',
  label: 'Dimension',
  color: '#5b7cff',
  stereo: true,
  knobs: [
    { key: 'mix', label: 'Mix', default: 0.60 },
    { key: 'width', label: 'Width', default: 0.70 },
  ],
  toggles: [
    { key: 'm1', label: 'I', default: true },
    { key: 'm2', label: 'II', default: false },
    { key: 'm3', label: 'III', default: false },
  ],
};
