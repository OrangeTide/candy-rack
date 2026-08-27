// SPDX-License-Identifier: 0BSD

// 808 cowbell engine: two square oscillators (~540/800 Hz) through a bandpass.
// DSP in src/core/worklet/engines/percussion.js (CowbellVoice), the same voice a
// kit part uses when its type is 'cowbell'. Five controls; Tune sets the pitch.
export const cowbellMeta = {
  id: 'cowbell',
  label: 'COWBELL',
  params: [
    { key: 'tune', label: 'Tune', default: 0.40 },
    { key: 'decay', label: 'Decay', default: 0.40 },
    { key: 'tone', label: 'Tone', default: 0.50 },
    { key: 'snap', label: 'Snap', default: 0.50 },
    { key: 'drive', label: 'Drive', default: 0.20 },
  ],
  modOutputs: [],
};
