// SPDX-License-Identifier: 0BSD

// Worklet-side engine descriptors, keyed by the same ids as the main-thread
// metadata registry. Each descriptor supplies the sub-voice DSP class, a
// notesFor(note, params) that returns the fractional semitone offsets a single
// trigger should sound (one entry for monophonic engines, several for chords),
// and the default param values.
import { DrumVoice } from './engines/drum.js';
import { FM2Voice } from './engines/fm2.js';
import { ChordVoice, chordNotes } from './engines/chord.js';
import { CsawVoice } from './engines/csaw.js';
import { SupersawVoice } from './engines/supersaw.js';

const mono = () => [0];

export const engines = {
  drum: { Voice: DrumVoice, notesFor: mono, defaults: [0.30, 0.50, 0.35, 0.45, 0.20] },
  fm2: { Voice: FM2Voice, notesFor: mono, defaults: [0.50, 0.40, 0.20, 0.50, 0.20] },
  chord: { Voice: ChordVoice, notesFor: chordNotes, defaults: [0.00, 0.20, 0.30, 0.55, 0.20] },
  csaw: { Voice: CsawVoice, notesFor: mono, defaults: [0.40, 0.60, 0.20, 0.55, 0.20] },
  supersaw: { Voice: SupersawVoice, notesFor: mono, defaults: [0.35, 0.70, 0.70, 0.00, 0.15] },
};
