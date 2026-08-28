// SPDX-License-Identifier: 0BSD

// Main-thread metadata for the Distortion+ / DOD 250 pedal. The DSP (DistVoice
// in ../fx/voices.js) is the shared op-amp-into-diode-clipper; the Silicon
// toggle flips the diode: off = germanium (MXR Distortion+, soft and quieter),
// on = silicon (DOD 250, harder and louder).
//
// `colors` gives the split enclosure a diagonal two-tone (Distortion+ mustard
// yellow, DOD 250 green); the live accent follows the switch position.
export const distMeta = {
  id: 'dist',
  label: 'Dist+',
  color: '#f4c430',
  colors: ['#f4c430', '#5bbf5b'], // [germanium / off, silicon / on]
  stereo: false,
  knobs: [
    { key: 'drive', label: 'Drive', default: 0.50 },
    { key: 'level', label: 'Level', default: 0.50 },
  ],
  toggles: [
    { key: 'silicon', label: 'Silicon', default: false },
  ],
};
