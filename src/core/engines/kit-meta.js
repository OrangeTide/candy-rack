// SPDX-License-Identifier: 0BSD

// The KIT engine turns a track into a 4-part drum kit: four freely-assignable
// drum voices, each with its own step row and its own five controls (the drum
// engine's Tune/Decay/Tone/Snap/Drive). The worklet hosts the four parts on one
// node (src/core/worklet/runtime.js kit mode), so a kit is still one mixer
// channel. The editor renders four part rows and a part selector.
export const kitMeta = {
  id: 'kit',
  label: 'KIT',
  kit: true,
  parts: 4,
  params: [
    { key: 'tune', label: 'Tune', default: 0.30 },
    { key: 'decay', label: 'Decay', default: 0.50 },
    { key: 'tone', label: 'Tone', default: 0.35 },
    { key: 'snap', label: 'Snap', default: 0.45 },
    { key: 'drive', label: 'Drive', default: 0.20 },
  ],
  modOutputs: [],
};
