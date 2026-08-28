// SPDX-License-Identifier: 0BSD

// Main-thread metadata for the RAT distortion pedal. The DSP (RatVoice in
// ../fx/voices.js) is the DooomFuzzz RAT profile: silicon cubic clipping behind
// the LM308 slew limiter, into the RAT variable-LP tone. No octave, so two in a
// row stack into the classic acid-techno rig (Hardfloor: 303 into two RATs).
export const ratMeta = {
  id: 'rat',
  label: 'RAT',
  color: '#c2cad6',
  stereo: false,
  knobs: [
    { key: 'drive', label: 'Drive', default: 0.50 },
    { key: 'tone', label: 'Tone', default: 0.50 },
    { key: 'level', label: 'Level', default: 0.50 },
  ],
};
