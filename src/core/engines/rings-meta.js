// SPDX-License-Identifier: 0BSD

// Metadata for the RINGS modal resonator. Structure morphs the partials from
// harmonic (string) to inharmonic (bell/metal), Damp sets the ring time, Position
// combs the excitation, and Exciter goes from a soft mallet to a hard pluck. DSP
// in src/core/worklet/engines/rings.js.
export const ringsMeta = {
  id: 'rings',
  label: 'RINGS',
  params: [
    { key: 'structure', label: 'Structure', default: 0.3 },
    { key: 'bright', label: 'Bright', default: 0.5 },
    { key: 'damp', label: 'Damp', default: 0.6 },
    { key: 'position', label: 'Position', default: 0.3 },
    { key: 'exciter', label: 'Exciter', default: 0.5 },
  ],
  // Bow excites continuously while the gate is held (a sustained resonant drone);
  // Ring ring-modulates the output for a metallic clang; Even thins the odd
  // partials for a hollow tone.
  toggles: [
    { key: 'bow', label: 'Bow', default: false },
    { key: 'ring', label: 'Ring', default: false },
    { key: 'even', label: 'Even', default: false },
  ],
  modOutputs: [],
};
