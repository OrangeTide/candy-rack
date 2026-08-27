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
  // slide ties this step to the previous note on a monophonic engine: the pitch
  // glides in and the amplitude envelope does not retrigger (303-style legato).
  // Polyphonic engines ignore it. tie merges this step into the previous note:
  // it does not retrigger, it just extends the held note across this step (a
  // sustained "whole note" instead of re-articulated steps). Both default false,
  // so old patterns read as unset.
  return { on: false, note: 60, velocity: 100, gateLen: 0.5, slide: false, tie: false, locks: {} };
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
    solo: false,
    main: makeLane(),
    alt: makeLane(),
    // Per-voice output stage plus mixer channel strip, standard on every
    // engine. cutoff (lowpass) and hp (highpass) form the channel band filter;
    // both are real mod destinations. cutoff/vca: 1 = fully open / unity; hp: 0
    // = open (no low cut). vca doubles as the mixer channel Level. pan is -1..1
    // (0 center), send is 0..1 into the (reserved) aux bus.
    output: { cutoff: 1, hp: 0, vca: 1, pan: 0, send: 0 },
  };
}

// Master mixer section, one per pattern. volume 0..1 scales the master gain,
// filter is a bipolar DJ sweep (0.5 = flat, <0.5 lowpass down, >0.5 highpass
// up), resonance toggles the sweep filter Q between 1.0 and 2.2.
export function makeMaster() {
  return { volume: 0.8, filter: 0.5, resonance: false };
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
  return { version: 3, bpm: 120, tracks, routes, master: makeMaster() };
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
  // Backfill mixer fields added in version 3 so older saved patterns load.
  if (!p.master) p.master = makeMaster();
  for (const t of p.tracks) {
    if (!t.output) t.output = { cutoff: 1, hp: 0, vca: 1, pan: 0, send: 0 };
    if (typeof t.output.hp !== 'number') t.output.hp = 0;
    if (typeof t.output.pan !== 'number') t.output.pan = 0;
    if (typeof t.output.send !== 'number') t.output.send = 0;
    if (typeof t.solo !== 'boolean') t.solo = false;
    for (const lane of ['main', 'alt']) {
      for (const s of t[lane]) if (typeof s.tie !== 'boolean') s.tie = false;
    }
  }
  return p;
}
