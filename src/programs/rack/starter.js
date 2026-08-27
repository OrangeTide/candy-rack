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

export function freshPattern() {
  const t0 = makeTrack('drum', [0.12, 0.55, 0.10, 0.55, 0.35]); // kick
  const t1 = makeTrack('drum', [0.55, 0.32, 0.70, 0.50, 0.20]); // snare
  const t2 = makeTrack('drum', [0.88, 0.12, 0.95, 0.30, 0.10]); // hat
  // Funky electro voicing: DX synth bass, a talkbox-style vowel hook, and
  // Rhodes-style keys.
  const t3 = makeTrack('fmbass', [0.10, 0.65, 0.50, 0.35, 0.25]); // synth bass
  const t4 = makeTrack('vowel', [0.30, 0.50, 0.65, 0.45, 0.30]); // talkbox hook
  const t5 = makeTrack('epiano', [0.55, 0.45, 0.10, 0.35, 0.20]); // funk keys

  paint(t0, 'main', [0, 4, 8, 12], { note: 36, gate: 0.4 });
  paint(t1, 'main', [4, 12], { note: 60, gate: 0.4 });
  paint(t2, 'main', [2, 6, 10, 14], { note: 72, gate: 0.2 });
  paint(t2, 'alt', [0, 4, 8, 12], { note: 72, gate: 0.2 });

  // Synth bass: syncopated line (sounds an octave down, the fmbass carrier is a
  // sub), accented on the downbeats via the accent lane, one slide.
  paint(t3, 'main', [0, 3, 6, 8, 11, 14], { note: 52, gate: 0.5, vel: 110 });
  paint(t3, 'alt', [0, 8], { note: 52 }); // accent the downbeats
  t3.main[3].slide = true;                // glide into the off-beat note
  t3.main[11].note = 55;                  // a little movement

  // Talkbox hook: four held "whole notes", each tied across four steps, so the
  // auto-vowel LFO sweeps a-e-i-o-u across the sustain (a singer holding a note)
  // instead of re-articulating on every step.
  for (const [start, note] of [[0, 55], [4, 57], [8, 60], [12, 58]]) {
    for (let i = 0; i < 4; i++) {
      const s = t4.main[start + i];
      s.on = true; s.note = note; s.gateLen = 0.9; s.velocity = 100;
      if (i > 0) s.tie = true;
    }
  }

  // Funk keys: staccato two-note Rhodes stabs on the offbeats (main + alt lane
  // give the second note, since epiano is polyphonic).
  paint(t5, 'main', [2, 6, 10, 14], { note: 55, gate: 0.18, vel: 96 });
  paint(t5, 'alt', [2, 6, 10, 14], { note: 62, gate: 0.18, vel: 96 });

  // Base output stage: leave room for the demo mod routes to move things.
  t3.output.cutoff = 0.82; // bass, slightly filtered
  t5.output.cutoff = 0.62; // keys, so the auto-wah LFO has room to open
  // Spread the hook and keys for a wider funk mix (bass and drums stay center).
  t4.output.pan = 0.2;  // vowel hook slightly right
  t5.output.pan = -0.3; // keys slightly left

  const routes = [
    // Kick (T1 main) ducks the bass (T4) VCA: the sidechain.
    { src: { type: 'trig', track: 0, lane: 'main', rateHz: 2, shape: 'sine' },
      dest: { track: 3, param: 'vca' }, depth: 0.7, polarity: -1, decay: 0.18 },
    // Auto-vowel: a slow LFO sweeps the vowel hook (T5) through a-e-i-o-u so it
    // talks across the held notes. Engine-param mod destination (m0 = Vowel).
    { src: { type: 'lfo', track: 0, lane: 'main', rateHz: 0.9, shape: 'sine' },
      dest: { track: 4, param: 'm0' }, depth: 0.9, polarity: 1, decay: 0.16 },
    // Slow LFO auto-wah on the keys (T6) filter for movement.
    { src: { type: 'lfo', track: 0, lane: 'main', rateHz: 0.5, shape: 'sine' },
      dest: { track: 5, param: 'cutoff' }, depth: 0.3, polarity: 1, decay: 0.16 },
  ];

  const p = makePattern([t0, t1, t2, t3, t4, t5], routes);
  p.bpm = 120;
  return p;
}
