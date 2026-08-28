// SPDX-License-Identifier: 0BSD

// Main-thread metadata for the Delay pedal. The matching DSP lives in
// ../fx/voices.js (DelayVoice), keyed by the same id. color tints the pedal
// enclosure and its LED; knobs are up-to-4 normalized 0..1 controls in the same
// order the DSP reads them.
export const delayMeta = {
  id: 'delay',
  label: 'Delay',
  color: '#35e8ff',
  stereo: true,
  knobs: [
    { key: 'time', label: 'Time', default: 0.40 },
    { key: 'feedback', label: 'Repeats', default: 0.45 },
    { key: 'tone', label: 'Tone', default: 0.60 },
    { key: 'mix', label: 'Mix', default: 0.50 },
  ],
};
