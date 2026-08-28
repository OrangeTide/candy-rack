// SPDX-License-Identifier: 0BSD

// Main-thread metadata for the Octave pedal. The DSP (OctaveVoice in
// ../fx/voices.js) is the DooomFuzzz Green Ringer octave-up (ringer.h) split out
// as its own pedal. Blend mixes dry to octave; Null sweeps pure octave to
// fundamental bleed (ring-mod clang); Drive pushes the rectifier.
export const octaveMeta = {
  id: 'octave',
  label: 'Octave',
  color: '#6ee87b',
  stereo: false,
  knobs: [
    { key: 'blend', label: 'Octave', default: 0.50 },
    { key: 'null', label: 'Ring', default: 0.30 },
    { key: 'drive', label: 'Drive', default: 0.40 },
    { key: 'level', label: 'Level', default: 0.50 },
  ],
};
