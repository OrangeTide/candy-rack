// SPDX-License-Identifier: 0BSD

// Main-thread metadata for the Muff sustain pedal. The DSP (MuffVoice in
// ../fx/voices.js) is the DooomFuzzz MUFF profile: two cascaded cubic stages
// with in-stage rolloff into the Muff parallel tone stack, the classic Big Muff
// violin sustain. Sustain drives both stages; Tone crossfades dark LP to bright
// HP; Sag adds the vintage supply-sag compression.
export const muffMeta = {
  id: 'muff',
  label: 'Muff',
  color: '#ff4d8d',
  stereo: false,
  knobs: [
    { key: 'sustain', label: 'Sustain', default: 0.60 },
    { key: 'tone', label: 'Tone', default: 0.50 },
    { key: 'sag', label: 'Sag', default: 0.20 },
    { key: 'level', label: 'Level', default: 0.50 },
  ],
};
