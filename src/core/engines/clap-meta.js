// SPDX-License-Identifier: 0BSD

// 808 handclap engine: bandpassed noise with the three-burst-plus-tail envelope.
// DSP in src/core/worklet/engines/percussion.js (ClapVoice), the same voice a kit
// part uses when its type is 'clap'. Five controls, same layout as the drum.
export const clapMeta = {
  id: 'clap',
  label: 'CLAP',
  params: [
    { key: 'tune', label: 'Tune', default: 0.45 },
    { key: 'decay', label: 'Decay', default: 0.35 },
    { key: 'tone', label: 'Tone', default: 0.55 },
    { key: 'snap', label: 'Spread', default: 0.50 },
    { key: 'drive', label: 'Drive', default: 0.25 },
  ],
  modOutputs: [],
};
