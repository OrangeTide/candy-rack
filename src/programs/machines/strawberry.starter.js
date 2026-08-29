// SPDX-License-Identifier: 0BSD

// Strawberry starter: bubblegum rave / happy-hardcore. Fast, major, euphoric.
// A pounding four-on-the-floor with a big clap and rave hats, a rubbery octave-
// bouncing bassline, bright major organ stabs, and a wide supersaw lead riff
// swept by the filter. Grown from the Lemon starter's first (melodic) cut, which
// was too cheerful for acid but is exactly right here. DOM-free so the app and
// the offline renderer share it.
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

function paintKit(kit, part, positions, vel) {
  for (const pos of positions) {
    const s = kit.parts[part].lane[pos];
    s.on = true;
    if (vel != null) s.velocity = vel;
  }
}

export function freshPattern() {
  // --- drums: four-on-the-floor, big clap backbeat, driving rave hats ---
  const t0 = makeTrack('kit', [0, 0, 0, 0, 0]);
  t0.parts[0] = { type: 'kick', mute: false, params: [0.24, 0.42, 0.5, 0.5, 0.3], lane: t0.parts[0].lane };
  t0.parts[1] = { type: 'clap', mute: false, params: [0.5, 0.4, 0.6, 0.5, 0.2], lane: t0.parts[1].lane };
  t0.parts[2] = { type: 'hat', mute: false, params: [0.55, 0.05, 0.6, 0.5, 0.2], lane: t0.parts[2].lane };  // closed
  t0.parts[3] = { type: 'hat', mute: false, params: [0.55, 0.5, 0.6, 0.5, 0.2], lane: t0.parts[3].lane };   // open
  paintKit(t0, 0, [0, 4, 8, 12], 116);                          // kick 4-on-the-floor
  paintKit(t0, 1, [4, 12], 100);                                // clap on the backbeat
  paintKit(t0, 2, [0, 2, 4, 6, 8, 10, 12, 14], 60);            // closed hats every 8th
  paintKit(t0, 3, [2, 6, 10, 14], 88);                          // open hats on the offbeats (rave)

  // --- bass: the DX100 "Lately Bass", a rubbery octave-bouncing A line ---
  const t1 = makeTrack('dx100', [0.20, 0.60, 0.35, 0.35, 0.25]); // harmonic, timbre, feedback, decay, drive
  t1.toggles = [false, true, false];                             // Bright on for the house edge
  const bass = [33, 45, 33, 45, 40, 45, 33, 45, 33, 45, 38, 45, 40, 45, 52, 45];
  for (let i = 0; i < 16; i++) { const s = t1.main[i]; s.on = true; s.note = bass[i]; s.gateLen = 0.5; s.velocity = 100; }
  [4, 10, 14].forEach((i) => { t1.main[i].slide = true; });     // rubbery glides
  [0, 4, 8, 12].forEach((i) => { t1.alt[i].on = true; });       // accents on the beat

  // --- bright major organ stabs on the offbeats (the rave hook) ---
  const t2 = makeTrack('chord', [0.05, 0.35, 0.6, 0.22, 0.25]); // major, square-ish, punchy
  paint(t2, 'main', [2, 6, 10], { note: 57, gate: 0.14, vel: 92 });   // A major stab
  paint(t2, 'main', [14], { note: 59, gate: 0.14, vel: 92 });        // lift to B on the turnaround
  t2.output.cutoff = 0.8;
  t2.output.send = 0.6;                                              // into chorus + reverb

  // --- wide supersaw lead riff, euphoric, swept by the filter (LFO -> cutoff) ---
  const t3 = makeTrack('supersaw', [0.55, 0.6, 0.55, 0.30, 0.15]);
  const lead = { 0: 69, 3: 72, 4: 74, 6: 72, 8: 69, 11: 72, 12: 76, 14: 74, 15: 72 };
  for (const [i, note] of Object.entries(lead)) { const s = t3.main[+i]; s.on = true; s.note = note; s.gateLen = 0.45; s.velocity = 96; }
  t3.output.cutoff = 0.5;
  t3.output.vca = 0.7;
  t3.output.send = 0.4;

  // --- wide supersaw pad chord bed, low, for the euphoric wall (A major, held) ---
  const t4 = makeTrack('supersaw', [0.4, 0.7, 0.55, 0.0, 0.1]);
  for (let i = 0; i < 16; i++) {
    const m = t4.main[i]; m.on = true; m.note = 45; m.gateLen = 0.98; m.velocity = 54; if (i > 0) m.tie = true;  // A
    const a = t4.alt[i]; a.on = true; a.note = 52; a.gateLen = 0.98; a.velocity = 54; if (i > 0) a.tie = true;   // E (fifth)
  }
  t4.output.cutoff = 0.42;
  t4.output.vca = 0.4;

  // --- spare slot (muted): a high acid counter-line to bring in ---
  const t5 = makeTrack('acid', [0.55, 0.72, 0.55, 0.2, 0.1]);
  t5.mute = true;
  paint(t5, 'main', [7, 11, 15], { note: 69, gate: 0.2, vel: 100 });
  t5.output.send = 0.5;

  const routes = [
    // Kick (kit P1) ducks the bass VCA: the four-on-the-floor pump.
    { src: { type: 'trig', track: 0, lane: 'part0', rateHz: 2, shape: 'sine' },
      dest: { track: 1, param: 'vca' }, depth: 0.5, polarity: -1, decay: 0.16 },
    // An LFO sweeps the supersaw lead filter open and shut: the euphoric rave "wooo".
    { src: { type: 'lfo', track: 0, lane: 'main', rateHz: 0.25, shape: 'tri' },
      dest: { track: 3, param: 'cutoff' }, depth: 0.4, polarity: 1, decay: 0.16 },
  ];

  const p = makePattern([t0, t1, t2, t3, t4, t5], routes);
  p.bpm = 150;
  p.tracks.forEach((t) => { t.swing = 0; }); // straight, bouncy

  // FX loop: stabs + lead into a wide Dimension chorus then a bright Reverb.
  p.fx.loops[0].pedals[3] = { type: 'dim', bypass: false, params: [0.5, 0.7, 0, 0, 0, 0], toggles: [false, true, false], sw2: false };
  p.fx.loops[0].pedals[2] = { type: 'reverb', bypass: false, params: [0.7, 0.6, 0.1, 0.3, 0.9, 0.4], toggles: [false], sw2: false };
  p.fx.loops[0].return = { level: 0.85, pan: 0 };
  return p;
}
