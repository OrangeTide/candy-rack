// SPDX-License-Identifier: 0BSD

// The default 6-track pattern. Kept free of any DOM or audio dependency so both
// the program UI (main.js) and the offline mix renderer (test/render-mix.mjs)
// can build the same starter groove.
import { engineById } from '../../core/registry.js';
import { defaultParams } from '../../core/engines/drum-meta.js';
import { makeTrack, makePattern } from '../../core/sequencer.js';

export const TRACKS = 6;

function paint(track, lane, positions, opts = {}) {
  for (const pos of positions) {
    const s = track[lane][pos];
    s.on = true;
    if (opts.note != null) s.note = opts.note;
    if (opts.vel != null) s.velocity = opts.vel;
    if (opts.gate != null) s.gateLen = opts.gate;
  }
}

// Paint one kit part's row. Drums are one-shot and tuned by the part's params,
// so only on/velocity matter here.
function paintKit(kit, part, positions, vel) {
  for (const pos of positions) {
    const s = kit.parts[part].lane[pos];
    s.on = true;
    if (vel != null) s.velocity = vel;
  }
}

export function freshPattern() {
  // One kit track frees two tracks the old three drum tracks used up. The kit's
  // four parts default to kick / snare / hat / perc.
  const t0 = makeTrack('kit', [0, 0, 0, 0, 0]); // drum kit
  const t1 = makeTrack('fmbass', [0.10, 0.65, 0.50, 0.35, 0.25]); // synth bass
  const t2 = makeTrack('epiano', [0.55, 0.45, 0.10, 0.35, 0.20]); // funk keys
  const t3 = makeTrack('vowel', [0.30, 0.50, 0.65, 0.45, 0.30]);  // talkbox hook
  const t4 = makeTrack('chord', defaultParams(engineById('chord'))); // synth stabs
  const t5 = makeTrack('supersaw', defaultParams(engineById('supersaw'))); // pad

  // Kit: kick, backbeat snare + clap, straight-8th hats.
  paintKit(t0, 0, [0, 4, 8, 12]);            // kick
  paintKit(t0, 1, [4, 12]);                  // snare
  paintKit(t0, 2, [0, 2, 4, 6, 8, 10, 12, 14]); // hat
  paintKit(t0, 3, [4, 12], 90);              // clap layered on the backbeat

  // Synth bass: syncopated line (sounds an octave down, the fmbass carrier is a
  // sub), accented on the downbeats via the accent lane, one slide.
  paint(t1, 'main', [0, 3, 6, 8, 11, 14], { note: 52, gate: 0.5, vel: 110 });
  paint(t1, 'alt', [0, 8], { note: 52 }); // accent the downbeats
  t1.main[3].slide = true;                // glide into the off-beat note
  t1.main[11].note = 55;                  // a little movement

  // Funk keys: staccato two-note Rhodes stabs on the offbeats (main + alt lane
  // give the second note, since epiano is polyphonic).
  paint(t2, 'main', [2, 6, 10, 14], { note: 55, gate: 0.18, vel: 96 });
  paint(t2, 'alt', [2, 6, 10, 14], { note: 62, gate: 0.18, vel: 96 });

  // Talkbox hook: four held "whole notes", each tied across four steps, so the
  // auto-vowel LFO sweeps a-e-i-o-u across the sustain instead of re-articulating.
  for (const [start, note] of [[0, 55], [4, 57], [8, 60], [12, 58]]) {
    for (let i = 0; i < 4; i++) {
      const s = t3.main[start + i];
      s.on = true; s.note = note; s.gateLen = 0.9; s.velocity = 100;
      if (i > 0) s.tie = true;
    }
  }

  // Synth stabs (chord): short off-beat chord hits.
  paint(t4, 'main', [6, 14], { note: 48, gate: 0.25, vel: 92 });

  // Pad (supersaw, stereo): two held chords, each tied across half a bar.
  for (const [start, note] of [[0, 40], [8, 43]]) {
    for (let i = 0; i < 8; i++) {
      const s = t5.main[start + i];
      s.on = true; s.note = note; s.gateLen = 0.9; s.velocity = 80;
      if (i > 0) s.tie = true;
    }
  }

  // Base output stage: leave room for the demo mod routes to move things.
  t1.output.cutoff = 0.82; // bass, slightly filtered
  t2.output.cutoff = 0.62; // keys, so the auto-wah LFO has room to open
  t5.output.cutoff = 0.55; // pad, so the LFO can open it
  // Spread the voices for a wider mix (kit and bass stay center).
  t2.output.pan = -0.3; // keys slightly left
  t3.output.pan = 0.2;  // vowel hook slightly right
  t4.output.pan = 0.35; // stabs right

  const routes = [
    // Kick (kit part P1) ducks the bass (T2) VCA: the sidechain.
    { src: { type: 'trig', track: 0, lane: 'part0', rateHz: 2, shape: 'sine' },
      dest: { track: 1, param: 'vca' }, depth: 0.7, polarity: -1, decay: 0.18 },
    // Auto-vowel: a slow LFO sweeps the vowel hook (T4) through a-e-i-o-u so it
    // talks across the held notes. Engine-param mod destination (m0 = Vowel).
    { src: { type: 'lfo', track: 0, lane: 'main', rateHz: 0.9, shape: 'sine' },
      dest: { track: 3, param: 'm0' }, depth: 0.9, polarity: 1, decay: 0.16 },
    // Slow LFO auto-wah on the keys (T3) filter for movement.
    { src: { type: 'lfo', track: 0, lane: 'main', rateHz: 0.5, shape: 'sine' },
      dest: { track: 2, param: 'cutoff' }, depth: 0.3, polarity: 1, decay: 0.16 },
  ];

  const p = makePattern([t0, t1, t2, t3, t4, t5], routes);
  p.bpm = 120;
  return p;
}
