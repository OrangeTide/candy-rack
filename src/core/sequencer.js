// SPDX-License-Identifier: 0BSD

// Pattern data model. A pattern holds tracks. Each track has an engine, its 5
// normalized param values, a length (1..256), a tempo ratio, and two trigger
// lanes: main and alt. Steps carry note, velocity, gate length, and a locks bag
// that can override a couple of engine params per step. The locks bag and the
// pattern-level routes list are the seams left open for full parameter locks
// and the modulation matrix later, so growing into them is not a migration.

import { fxById, defaultFxParams } from './fx/registry.js';

export const MAX_STEPS = 256;
export const PAGE = 16;
export const FX_SLOTS = 4;

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

export const KIT_PARTS = 4;

// The 'kit' engine turns a track into a 4-part drum kit: four freely-assignable
// drum voices, each with its own 5 controls and its own step row. Sensible
// starting sounds: kick, snare, hat, perc.
export function makeKitParts() {
  const defs = [
    { type: 'drum', params: [0.12, 0.55, 0.10, 0.55, 0.35] }, // kick
    { type: 'drum', params: [0.55, 0.32, 0.70, 0.50, 0.20] }, // snare
    { type: 'drum', params: [0.88, 0.12, 0.95, 0.30, 0.10] }, // hat
    { type: 'clap', params: [0.45, 0.35, 0.55, 0.50, 0.25] }, // 808 clap
  ];
  return defs.map((d) => ({ type: d.type, mute: false, params: d.params.slice(), lane: makeLane() }));
}

export function makeTrack(engineId, params, toggles) {
  const t = {
    engine: engineId,
    params: params.slice(),
    // Up to 3 engine-defined on/off switches, beside the 5 knobs. Always 3
    // booleans (unused slots stay false; the engine's meta.toggles says how many
    // it actually uses). Callers pass the engine's default toggles; the plain
    // [false,false,false] fallback suits every engine whose defaults are all off.
    toggles: (toggles || [false, false, false]).slice(),
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
  if (engineId === 'kit') t.parts = makeKitParts();
  return t;
}

// A track is a drum kit when its engine is 'kit'. Kit tracks sequence four part
// rows (part0..part3); melodic tracks sequence main and alt.
export function isKit(track) {
  return track.engine === 'kit';
}
export function trackLanes(track) {
  return isKit(track) ? ['part0', 'part1', 'part2', 'part3'] : ['main', 'alt'];
}
// The step array for a lane name, unifying melodic lanes and kit part rows.
export function laneSteps(track, name) {
  if (name.charCodeAt(0) === 112 /* 'p' */ && name.startsWith('part')) {
    return track.parts[+name.slice(4)].lane;
  }
  return track[name];
}

// Master mixer section, one per pattern. volume 0..1 scales the master gain,
// filter is a bipolar DJ sweep (0.5 = flat, <0.5 lowpass down, >0.5 highpass
// up), resonance toggles the sweep filter Q between 1.0 and 2.2.
export function makeMaster() {
  return { volume: 0.8, filter: 0.5, resonance: false };
}

// Effects section, one per pattern. loops[] holds the aux effects loops; there
// is one now (out1), later out2/out3. A loop is a mono send bus through four
// pedals (A B C D) into a stereo return. Each pedal picks a type from the FX
// registry, carries its normalized knob values, and a bypass (footswitch)
// flag. The Return level and pan are the mix-side controls, surfaced on the
// master mixer strip. algorithm names the routing topology (see fx/algorithms).
export function makeFxPedal() {
  return { type: 'thru', bypass: true, params: [] };
}

export function makeFxLoop(id = 'loop1') {
  return {
    id,
    algorithm: 'series',
    return: { level: 1.0, pan: 0 },
    pedals: Array.from({ length: FX_SLOTS }, makeFxPedal),
  };
}

export function makeFx() {
  return { loops: [makeFxLoop()] };
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
  // swing 0..1 delays the off-beat 16ths toward a triplet shuffle (0 = straight).
  return { version: 5, bpm: 120, swing: 0, tracks, routes, master: makeMaster(), fx: makeFx() };
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
  if (typeof p.swing !== 'number') p.swing = 0;
  for (const t of p.tracks) {
    if (!t.output) t.output = { cutoff: 1, hp: 0, vca: 1, pan: 0, send: 0 };
    if (typeof t.output.hp !== 'number') t.output.hp = 0;
    if (typeof t.output.pan !== 'number') t.output.pan = 0;
    if (typeof t.output.send !== 'number') t.output.send = 0;
    if (typeof t.solo !== 'boolean') t.solo = false;
    // Engine toggles added in version 4: ensure exactly 3 booleans.
    if (!Array.isArray(t.toggles)) t.toggles = [false, false, false];
    while (t.toggles.length < 3) t.toggles.push(false);
    t.toggles = t.toggles.slice(0, 3).map((b) => !!b);
    if (t.engine === 'kit' && !Array.isArray(t.parts)) t.parts = makeKitParts();
    if (t.engine === 'kit') for (const pt of t.parts) {
      if (typeof pt.type !== 'string') pt.type = 'drum';
      if (typeof pt.mute !== 'boolean') pt.mute = false;
    }
    for (const lane of trackLanes(t)) {
      for (const s of laneSteps(t, lane)) if (typeof s.tie !== 'boolean') s.tie = false;
    }
  }
  // Backfill the effects section added in version 5 so older saved patterns load.
  if (!p.fx || typeof p.fx !== 'object') p.fx = makeFx();
  if (!Array.isArray(p.fx.loops) || !p.fx.loops.length) p.fx.loops = [makeFxLoop()];
  for (const loop of p.fx.loops) {
    if (typeof loop.algorithm !== 'string') loop.algorithm = 'series';
    if (!loop.return || typeof loop.return !== 'object') loop.return = { level: 1.0, pan: 0 };
    if (typeof loop.return.level !== 'number') loop.return.level = 1.0;
    if (typeof loop.return.pan !== 'number') loop.return.pan = 0;
    if (!Array.isArray(loop.pedals)) loop.pedals = Array.from({ length: FX_SLOTS }, makeFxPedal);
    while (loop.pedals.length < FX_SLOTS) loop.pedals.push(makeFxPedal());
    loop.pedals.length = FX_SLOTS;
    for (const pd of loop.pedals) {
      if (typeof pd.type !== 'string') pd.type = 'thru';
      if (typeof pd.bypass !== 'boolean') pd.bypass = pd.type === 'thru';
      const want = fxById(pd.type).knobs.length;
      if (!Array.isArray(pd.params) || pd.params.length !== want) pd.params = defaultFxParams(pd.type);
    }
  }
  return p;
}
