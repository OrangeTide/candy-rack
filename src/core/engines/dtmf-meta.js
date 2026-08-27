// SPDX-License-Identifier: 0BSD

// Metadata for the DTMF dual-tone generator. Interval picks the second tone's
// ratio above the root (root = step note); Telephone squeezes the summed pair
// through a phone band. DSP in src/core/worklet/engines/dtmf.js.
export const dtmfMeta = {
  id: 'dtmf',
  label: 'DTMF',
  params: [
    { key: 'interval', label: 'Interval', default: 0.50 },
    { key: 'balance', label: 'Balance', default: 0.50 },
    { key: 'grit', label: 'Grit', default: 0.30 },
    { key: 'phone', label: 'Telephone', default: 0.40 },
    { key: 'decay', label: 'Decay', default: 0.35 },
  ],
  // Track: when on, the telephone band follows the played note (centres between
  // the two tones) instead of sitting at the fixed 1700 Hz phone centre, so low
  // notes keep their tone under a high Telephone setting.
  toggles: [
    { key: 'track', label: 'Track', default: false },
  ],
  modOutputs: [],
};
