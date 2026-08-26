// SPDX-License-Identifier: 0BSD

// Engine metadata shared between the main thread (knob labels, defaults,
// registry) and the AudioWorklet DSP (param order, defaults). The DSP lives in
// src/core/worklet/engines/drum.js. All five params are normalized 0..1; the
// engine maps them to real ranges internally.
//
// modOutputs is reserved for the future modulation matrix: each engine may
// expose up to two of its own mod sources. Empty for now.
export const drumMeta = {
  id: 'drum',
  label: 'Drum',
  params: [
    { key: 'tune', label: 'Tune', default: 0.30 },
    { key: 'decay', label: 'Decay', default: 0.50 },
    { key: 'tone', label: 'Tone', default: 0.35 },
    { key: 'snap', label: 'Snap', default: 0.45 },
    { key: 'drive', label: 'Drive', default: 0.20 },
  ],
  modOutputs: [],
};

export function defaultParams(meta) {
  return meta.params.map((p) => p.default);
}
