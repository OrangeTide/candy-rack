// SPDX-License-Identifier: 0BSD

// Main-thread effects registry. Metadata only (labels, colors, knob defs). The
// matching DSP lives in ./voices.js, keyed by the same id. Mirrors the engine
// registry so a pedal slot picks a type the same way a track picks an engine.
import { delayMeta } from './delay-meta.js';
import { fuzzMeta } from './fuzz-meta.js';
import { octaveMeta } from './octave-meta.js';
import { muffMeta } from './muff-meta.js';
import { ratMeta } from './rat-meta.js';
import { distMeta } from './dist-meta.js';

// The empty slot: no knobs, straight-through. Every fresh pedal starts here.
export const thruMeta = { id: 'thru', label: 'Thru', color: '#7d68ad', stereo: false, knobs: [] };

// Order shown in the pedal type selector. Add reverb/chorus here as their
// meta + voice land; no other wiring changes.
export const fxTypes = [thruMeta, delayMeta, fuzzMeta, octaveMeta, muffMeta, ratMeta, distMeta];

// Every pedal stores a fixed-size control block regardless of how many its type
// actually uses, so the data model, persistence, and worklet messages pass the
// same shape for every pedal (the way engines always store 5 params + 3
// toggles). A type's meta.knobs/meta.toggles label only the slots it uses; the
// rest stay at their idle value and the DSP ignores them.
export const FX_KNOBS = 6;    // 2 rows of 3, the max pedal-face layout
export const FX_TOGGLES = 3;

export function fxById(id) {
  return fxTypes.find((f) => f.id === id) || thruMeta;
}

export function defaultFxParams(id) {
  const knobs = fxById(id).knobs || [];
  const out = new Array(FX_KNOBS).fill(0);
  for (let i = 0; i < knobs.length && i < FX_KNOBS; i++) out[i] = knobs[i].default;
  return out;
}

// A pedal's on/off switches, mirroring the engine meta.toggles scheme. Always
// FX_TOGGLES booleans; a type's meta.toggles labels only the ones it uses.
export function defaultFxToggles(id) {
  const defs = fxById(id).toggles || [];
  const out = new Array(FX_TOGGLES).fill(false);
  for (let i = 0; i < defs.length && i < FX_TOGGLES; i++) out[i] = !!defs[i].default;
  return out;
}
