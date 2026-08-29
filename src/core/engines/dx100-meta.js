// SPDX-License-Identifier: 0BSD

// Metadata for the DX100 engine, a four-operator FM voice built on the shared
// six-operator core (ops 5-6 idle). DSP in src/core/worklet/engines/fm6.js. The
// headline sound is "Lately Bass": two slightly detuned 2-op stacks with op2
// feedback growl, the fat FM bass of late-80s / early-90s house. Monophonic with
// slide and accent on the alt lane, like the other bass engines.
export const dx100Meta = {
  id: 'dx100',
  label: 'DX100',
  mono: true,
  altMode: 'accent',
  params: [
    // Modulator ratio (harmonic), 1..7: round bass up to bright and metallic.
    { key: 'harmonic', label: 'Harmonic', default: 0.20 },
    { key: 'timbre', label: 'Timbre', default: 0.55 },
    { key: 'feedback', label: 'Feedback', default: 0.35 },
    { key: 'decay', label: 'Decay', default: 0.40 },
    { key: 'drive', label: 'Drive', default: 0.20 },
  ],
  // Sub drops the second carrier an octave for a deep sub bass; Bright raises
  // the modulation index for an edgier, brassier tone.
  toggles: [
    { key: 'sub', label: 'Sub', default: false },
    { key: 'bright', label: 'Bright', default: false },
  ],
  modOutputs: [],
};
