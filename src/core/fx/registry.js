// SPDX-License-Identifier: 0BSD

// Main-thread effects registry. Metadata only (labels, colors, knob defs). The
// matching DSP lives in ./voices.js, keyed by the same id. Mirrors the engine
// registry so a pedal slot picks a type the same way a track picks an engine.
import { delayMeta } from './delay-meta.js';
import { fuzzMeta } from './fuzz-meta.js';
import { octaveMeta } from './octave-meta.js';

// The empty slot: no knobs, straight-through. Every fresh pedal starts here.
export const thruMeta = { id: 'thru', label: 'Thru', color: '#7d68ad', stereo: false, knobs: [] };

// Order shown in the pedal type selector. Add reverb/chorus here as their
// meta + voice land; no other wiring changes.
export const fxTypes = [thruMeta, delayMeta, fuzzMeta, octaveMeta];

export function fxById(id) {
  return fxTypes.find((f) => f.id === id) || thruMeta;
}

export function defaultFxParams(id) {
  return fxById(id).knobs.map((k) => k.default);
}
