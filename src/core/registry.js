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
import { dx100Meta } from './engines/dx100-meta.js';
import { vowelMeta } from './engines/vowel-meta.js';
import { dtmfMeta } from './engines/dtmf-meta.js';
import { acidMeta } from './engines/acid-meta.js';
import { sh101Meta } from './engines/sh101-meta.js';
import { ms20Meta } from './engines/ms20-meta.js';
import { kitMeta } from './engines/kit-meta.js';
import { clapMeta } from './engines/clap-meta.js';
import { cowbellMeta } from './engines/cowbell-meta.js';
import { sampleMeta } from './engines/sample-meta.js';

export const engines = [kitMeta, drumMeta, clapMeta, cowbellMeta, fm2Meta, chordMeta, csawMeta, supersawMeta, epianoMeta, fmbassMeta, dx100Meta, vowelMeta, dtmfMeta, acidMeta, sh101Meta, ms20Meta, sampleMeta];

export function engineById(id) {
  return engines.find((e) => e.id === id) || engines[0];
}
