// SPDX-License-Identifier: 0BSD

// Pattern data model. A pattern holds tracks. Each track has an engine, its 5
// normalized param values, a length (1..256), a tempo ratio, and two trigger
// lanes: main and alt. Steps carry note, velocity, gate length, and a locks bag
// that can override a couple of engine params per step. The locks bag and the
// pattern-level routes list are the seams left open for full parameter locks
// and the modulation matrix later, so growing into them is not a migration.

export const MAX_STEPS = 256;
export const PAGE = 16;

export function makeStep() {
  return { on: false, note: 60, velocity: 100, gateLen: 0.5, locks: {} };
}

export function makeLane() {
  return Array.from({ length: MAX_STEPS }, makeStep);
}

export function makeTrack(engineId, params) {
  return {
    engine: engineId,
    params: params.slice(),
    length: 16,
    ratio: 1,
    mute: false,
    main: makeLane(),
    alt: makeLane(),
    // Per-voice output stage, standard on every engine. These are real mod
    // destinations for the future matrix; 1 = fully open / unity.
    output: { cutoff: 1, vca: 1 },
  };
}

// A modulation route (pattern-level). src is either a trigger-bus tap on a
// track lane, or an LFO. dest is a track's output-stage parameter. depth is
// 0..1, polarity +1 or -1 (invert for ducking), decay is the trigger pulse
// length in seconds. Destinations are cutoff and vca for now; the shape leaves
// room for engine-param targets later.
export function makeRoute() {
  return {
    src: { type: 'trig', track: 0, lane: 'main', rateHz: 2, shape: 'sine' },
    dest: { track: 3, param: 'vca' },
    depth: 0.6,
    polarity: -1,
    decay: 0.16,
  };
}

export function makePattern(tracks, routes = []) {
  return { version: 2, bpm: 120, tracks, routes };
}

export function serialize(pattern) {
  return JSON.stringify(pattern);
}

export function deserialize(text) {
  const p = JSON.parse(text);
  if (!p || typeof p !== 'object' || !Array.isArray(p.tracks)) {
    throw new Error('not a web-rack pattern');
  }
  if (!Array.isArray(p.routes)) p.routes = [];
  return p;
}
