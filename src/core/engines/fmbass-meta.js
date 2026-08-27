// SPDX-License-Identifier: 0BSD

// Metadata for the FM BASS engine, a 6-operator FM voice that morphs between
// DX7 algorithms 16 (BASS 1) and 17 (BASS 2) on the Type control. Params
// normalized 0..1; DSP in src/core/worklet/engines/fm6.js. The carriers play a
// sub-octave (ratio 0.5) as the factory patches do. modOutputs reserved for the
// future matrix.
export const fmbassMeta = {
  id: 'fmbass',
  label: 'FM BASS',
  // Monophonic: one voice, so per-step slide glides legato from the last note.
  mono: true,
  // The alt lane is this engine's accent: a trigger under a main step accents
  // it (louder, brighter) instead of sounding a second note.
  altMode: 'accent',
  params: [
    { key: 'type', label: 'Type', default: 0.00 },
    { key: 'punch', label: 'Punch', default: 0.50 },
    { key: 'tone', label: 'Tone', default: 0.45 },
    { key: 'decay', label: 'Decay', default: 0.40 },
    { key: 'drive', label: 'Drive', default: 0.20 },
  ],
  modOutputs: [],
};
