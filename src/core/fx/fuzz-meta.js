// SPDX-License-Identifier: 0BSD

// Main-thread metadata for the Fuzz pedal. The DSP (FuzzVoice in ../fx/voices.js)
// is ported from the DooomFuzzz LV2 (rm-f.net/smoltrek), reduced to a single
// voiced overdrive-to-fuzz chain. Drive spans clean-ish overdrive to heavy
// fuzz; Fuzz adds the Green Ringer octave and clip bias for the doom snarl.
export const fuzzMeta = {
  id: 'fuzz',
  label: 'Fuzz',
  color: '#ff6a3d',
  stereo: false,
  knobs: [
    { key: 'drive', label: 'Drive', default: 0.50 },
    { key: 'tone', label: 'Tone', default: 0.50 },
    { key: 'fuzz', label: 'Fuzz', default: 0.25 },
    { key: 'level', label: 'Level', default: 0.50 },
  ],
};
