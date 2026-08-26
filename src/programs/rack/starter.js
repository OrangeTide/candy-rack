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
  const t3 = makeTrack('fm2', defaultParams(engineById('fm2'))); // bass
  const t4 = makeTrack('csaw', defaultParams(engineById('csaw'))); // lead
  const t5 = makeTrack('supersaw', defaultParams(engineById('supersaw'))); // pad

  paint(t0, 'main', [0, 4, 8, 12], { note: 36, gate: 0.4 });
  paint(t1, 'main', [4, 12], { note: 60, gate: 0.4 });
  paint(t2, 'main', [2, 6, 10, 14], { note: 72, gate: 0.2 });
  paint(t2, 'alt', [0, 4, 8, 12], { note: 72, gate: 0.2 });
  paint(t3, 'main', [0, 3, 6, 8, 11, 14], { note: 40, gate: 0.5, vel: 110 });
  paint(t4, 'main', [8, 10, 13], { note: 64, gate: 0.4 });
  paint(t5, 'main', [0, 8], { note: 48, gate: 0.95, vel: 90 });

  // Base output stage: leave room for the demo mod routes to move things.
  t3.output.cutoff = 0.78; // bass, slightly filtered
  t5.output.cutoff = 0.55; // pad, so the LFO can open it

  const routes = [
    // Kick (T1 main) ducks the bass (T4) VCA: the sidechain.
    { src: { type: 'trig', track: 0, lane: 'main', rateHz: 2, shape: 'sine' },
      dest: { track: 3, param: 'vca' }, depth: 0.7, polarity: -1, decay: 0.18 },
    // Slow LFO opens the pad (T6) filter for movement.
    { src: { type: 'lfo', track: 0, lane: 'main', rateHz: 0.5, shape: 'sine' },
      dest: { track: 5, param: 'cutoff' }, depth: 0.4, polarity: 1, decay: 0.16 },
  ];

  const p = makePattern([t0, t1, t2, t3, t4, t5], routes);
  p.bpm = 120;
  return p;
}
