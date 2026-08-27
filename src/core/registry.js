// SPDX-License-Identifier: 0BSD

// Main-thread engine registry. Metadata only (labels, defaults, mod outputs).
// The matching DSP lives on the worklet side in src/core/worklet/registry.js,
// keyed by the same id.
import { drumMeta } from './engines/drum-meta.js';
import { fm2Meta } from './engines/fm2-meta.js';
import { chordMeta } from './engines/chord-meta.js';
import { csawMeta } from './engines/csaw-meta.js';
import { supersawMeta } from './engines/supersaw-meta.js';
import { epianoMeta } from './engines/epiano-meta.js';
import { fmbassMeta } from './engines/fmbass-meta.js';

export const engines = [drumMeta, fm2Meta, chordMeta, csawMeta, supersawMeta, epianoMeta, fmbassMeta];

export function engineById(id) {
  return engines.find((e) => e.id === id) || engines[0];
}
