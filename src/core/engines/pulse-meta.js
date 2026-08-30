// SPDX-License-Identifier: 0BSD

// Metadata for the PULSE chiptune engine. Duty sets the pulse width, Arp picks a
// chord shape the built-in arpeggiator cycles through, Rate is the arp speed, and
// Vibrato adds a pitch wobble. DSP in src/core/worklet/engines/pulse.js.
import { fmtEnum, fmtHz } from '../format.js';
import { ARP_SHAPES } from '../worklet/engines/pulse.js';

export const pulseMeta = {
  id: 'pulse',
  label: 'PULSE',
  params: [
    { key: 'duty', label: 'Duty', default: 0.4 },
    { key: 'arp', label: 'Arp', default: 0.0, format: fmtEnum(ARP_SHAPES) },
    { key: 'rate', label: 'Rate', default: 0.5, format: (v) => fmtHz(10 + v * 50) },
    { key: 'decay', label: 'Decay', default: 0.4 },
    { key: 'vibrato', label: 'Vibrato', default: 0.0 },
  ],
  // Tri swaps the pulse for a quantised triangle (the NES bass channel); Noise is
  // the LFSR noise channel (drums and hats); Sub adds a square an octave down.
  toggles: [
    { key: 'tri', label: 'Tri', default: false },
    { key: 'noise', label: 'Noise', default: false },
    { key: 'sub', label: 'Sub', default: false },
  ],
  modOutputs: [],
};
