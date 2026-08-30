// SPDX-License-Identifier: 0BSD

// Pattern data model. A pattern holds tracks. Each track has an engine, its 5
// normalized param values, a length (1..256), a tempo ratio, and two trigger
// lanes: main and alt. Steps carry note, velocity, gate length, and a locks bag
// that can override a couple of engine params per step. The locks bag and the
// pattern-level routes list are the seams left open for full parameter locks
// and the modulation matrix later, so growing into them is not a migration.

import { fxById, defaultFxParams, defaultFxToggles, FX_KNOBS, FX_TOGGLES } from './fx/registry.js';

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
    // swing 0..1 delays this track's off-beat 16ths toward a shuffle. Per track
    // so, e.g., the drums can swing while the bass stays straight.
    swing: 0,
    mute: false,
    solo: false,
    main: makeLane(),
    alt: makeLane(),
    // Per-voice output stage plus mixer channel strip, standard on every
    // engine. cutoff (lowpass) and hp (highpass) form the channel band filter;
    // both are real mod destinations. cutoff/vca: 1 = fully open / unity; hp: 0
    // = open (no low cut). vca doubles as the mixer channel Level. pan is -1..1
    // (0 center), send is 0..1 into the aux bus, drive is 0..1 mixer overdrive
    // pushing the output-stage soft clip for grit.
    output: { cutoff: 1, hp: 0, vca: 1, pan: 0, send: 0, drive: 0 },
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
// registry and carries a fixed-size control block: FX_KNOBS knob values,
// FX_TOGGLES on/off switches, a bypass footswitch, and a secondary footswitch
// (sw2, momentary or latching per the type). The block is one size for every
// pedal; a type uses as many slots as it declares. The Return level and pan are
// mix-side controls on the master strip. algorithm names the routing topology.
export function makeFxPedal() {
  return {
    type: 'thru',
    bypass: true,
    params: new Array(FX_KNOBS).fill(0),
    toggles: new Array(FX_TOGGLES).fill(false),
    sw2: false,
  };
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

// LFO tempo-sync divisions: one full LFO cycle spans `beats` quarter notes. The
// UI offers these; a route with src.sync set to one of these `beats` values
// locks its rate to the tempo. Ordered slow to fast.
export const SYNC_DIVS = [
  { beats: 16, label: '4 bar' },
  { beats: 8, label: '2 bar' },
  { beats: 4, label: '1 bar' },
  { beats: 2, label: '1/2' },
  { beats: 1, label: '1/4' },
  { beats: 0.5, label: '1/8' },
  { beats: 0.25, label: '1/16' },
];

// The LFO rate in Hz for a source. When src.sync (beats per cycle) is set the
// rate is tempo-locked: cycle period = beats * (60/bpm) seconds. Otherwise the
// free-running src.rateHz is used. Shared by the realtime matrix and the offline
// renderer so both agree.
export function lfoHz(src, bpm) {
  if (src && src.sync) return bpm / (60 * src.sync);
  return (src && src.rateHz) || 2;
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
    if (typeof t.output.drive !== 'number') t.output.drive = 0;
    if (typeof t.solo !== 'boolean') t.solo = false;
    // Swing became per-track: migrate an old global pattern.swing onto tracks.
    if (typeof t.swing !== 'number') t.swing = (typeof p.swing === 'number' ? p.swing : 0);
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
      // Fixed-size control block (FX_KNOBS params, FX_TOGGLES toggles). Start
      // from the type's defaults, then copy over any saved slot values, so both
      // fresh patterns and the earlier variable-length format migrate cleanly.
      const dp = defaultFxParams(pd.type);
      if (Array.isArray(pd.params)) for (let i = 0; i < FX_KNOBS; i++) if (typeof pd.params[i] === 'number') dp[i] = pd.params[i];
      pd.params = dp;
      const dt = defaultFxToggles(pd.type);
      if (Array.isArray(pd.toggles)) for (let i = 0; i < FX_TOGGLES; i++) if (typeof pd.toggles[i] === 'boolean') dt[i] = pd.toggles[i];
      pd.toggles = dt;
      if (typeof pd.sw2 !== 'boolean') pd.sw2 = false;
    }
  }
  return p;
}
