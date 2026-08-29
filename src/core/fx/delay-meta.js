// SPDX-License-Identifier: 0BSD

// Main-thread metadata for the Delay pedal. The matching DSP lives in
// ../fx/voices.js (DelayVoice), keyed by the same id. color tints the pedal
// enclosure and its LED; knobs are up-to-4 normalized 0..1 controls in the same
// order the DSP reads them.
import { fmtDuration } from '../format.js';

export const delayMeta = {
  id: 'delay',
  label: 'Delay',
  color: '#35e8ff',
  stereo: true,
  knobs: [
    // Time readout mirrors DelayVoice: 0.02 + time * 0.73 seconds (20..750 ms).
    { key: 'time', label: 'Time', default: 0.40, format: (v) => fmtDuration(0.02 + v * 0.73) },
    { key: 'feedback', label: 'Repeats', default: 0.45 },
    { key: 'tone', label: 'Tone', default: 0.60 },
    { key: 'mix', label: 'Mix', default: 0.50 },
  ],
  // Secondary footswitch: hold to freeze the buffer into an infinite loop.
  sw2: { label: 'Hold', mode: 'momentary' },
};
