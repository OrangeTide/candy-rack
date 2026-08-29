// SPDX-License-Identifier: 0BSD

// Main-thread metadata for the Reverb pedal (ReverbVoice in ../fx/voices.js), a
// Freeverb-style algorithmic reverb tuned for lush, dark tails. Decay sets the
// tail length, Tone its brightness, Pre the pre-delay, Mod a plate shimmer,
// Width the stereo spread, Mix the blend. The Gate toggle is the 80s gated
// snare; the secondary footswitch (Hold) freezes the wash into an infinite
// reverb. The dub-techno chord goes Dimension into this.
import { fmtDuration } from '../format.js';

export const reverbMeta = {
  id: 'reverb',
  label: 'Reverb',
  color: '#a98bff',
  stereo: true,
  knobs: [
    { key: 'decay', label: 'Decay', default: 0.55 },
    { key: 'tone', label: 'Tone', default: 0.45 },
    // Pre readout mirrors ReverbVoice: pre * 0.1 seconds (0..100 ms).
    { key: 'pre', label: 'Pre', default: 0.10, format: (v) => fmtDuration(v * 0.1) },
    { key: 'mod', label: 'Mod', default: 0.25 },
    { key: 'width', label: 'Width', default: 0.80 },
    { key: 'mix', label: 'Mix', default: 0.35 },
  ],
  toggles: [
    { key: 'gate', label: 'Gate', default: false },
  ],
  sw2: { label: 'Hold', mode: 'momentary' },
};
