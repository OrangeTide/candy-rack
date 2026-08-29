// SPDX-License-Identifier: 0BSD

// Lemon starter: acid squelch / hard techno. A driving 909 four-on-the-floor, a
// TB-303 acid bassline (slides + accents) run into the RAT, and a reverberant
// stab, in the spirit of Pump Panel's "Confusion" Reconstruction Mix. DOM-free
// so the app and the offline renderer share it.
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
  // --- drums: a 909 four-on-the-floor with an offbeat open hat ---
  const t0 = makeTrack('kit', [0, 0, 0, 0, 0]);
  t0.parts[0] = { type: 'kick', mute: false, params: [0.22, 0.5, 0.5, 0.5, 0.35], lane: t0.parts[0].lane };
  t0.parts[1] = { type: 'clap', mute: false, params: [0.45, 0.35, 0.55, 0.5, 0.25], lane: t0.parts[1].lane };
  t0.parts[2] = { type: 'hat', mute: false, params: [0.5, 0.06, 0.6, 0.5, 0.2], lane: t0.parts[2].lane };  // closed
  t0.parts[3] = { type: 'hat', mute: false, params: [0.5, 0.5, 0.6, 0.5, 0.2], lane: t0.parts[3].lane };   // open
  paintKit(t0, 0, [0, 4, 8, 12], 112);              // kick 4-on-the-floor
  paintKit(t0, 1, [4, 12], 96);                     // clap on the backbeat
  paintKit(t0, 2, [0, 2, 4, 6, 8, 10, 12, 14], 62); // closed hat every 8th
  paintKit(t0, 3, [2, 6, 10, 14], 84);              // open hat on the offbeats

  // --- acid bass: a rolling 303 line, slides + accents, into the RAT ---
  const t1 = makeTrack('acid', [0.24, 0.72, 0.6, 0.32, 0.18]); // cutoff, reso, env, decay, slide
  const bass = [33, 33, 45, 33, 36, 33, 45, 40, 33, 33, 45, 33, 38, 45, 33, 45];
  for (let i = 0; i < 16; i++) { const s = t1.main[i]; s.on = true; s.note = bass[i]; s.gateLen = 0.55; s.velocity = 100; }
  [2, 5, 10, 13].forEach((i) => { t1.main[i].slide = true; });     // glides
  [0, 4, 8, 12, 6, 14].forEach((i) => { t1.alt[i].on = true; });   // accents (alt lane)
  t1.output.send = 0.6;                                            // into the RAT + reverb

  // --- reconstruction stab: a chord hit drenched in reverb (and a little RAT) ---
  const t2 = makeTrack('chord', [0.30, 0.20, 0.30, 0.30, 0.20]);
  paint(t2, 'main', [0, 8], { note: 45, gate: 0.25, vel: 96 });
  paint(t2, 'main', [12], { note: 48, gate: 0.25, vel: 96 });
  t2.output.cutoff = 0.7;
  t2.output.send = 0.9;

  // --- sh101 pad drone (slow attack), sits under the groove ---
  const t3 = makeTrack('sh101', [0.30, 0.30, 0.35, 0.6, 0.5]);
  t3.toggles = [false, false, true]; // saw + slow attack
  for (const [start, note] of [[0, 33], [8, 40]]) {
    for (let i = 0; i < 8; i++) { const s = t3.main[start + i]; s.on = true; s.note = note; s.gateLen = 0.95; s.velocity = 70; if (i > 0) s.tie = true; }
  }
  t3.output.cutoff = 0.5;
  t3.output.vca = 0.5;

  // --- supersaw drone, quiet, for width; starts muted ---
  const t4 = makeTrack('supersaw', [0.30, 0.55, 0.55, 0.0, 0.10]);
  t4.mute = true;
  t4.length = 32;
  for (const [start, note] of [[0, 45], [16, 47]]) {
    for (let i = 0; i < 16; i++) { const s = t4.main[start + i]; s.on = true; s.note = note; s.gateLen = 0.95; s.velocity = 60; if (i > 0) s.tie = true; }
  }
  t4.output.cutoff = 0.4;
  t4.output.vca = 0.4;

  // --- second acid stab an octave up, sparse; starts muted ---
  const t5 = makeTrack('acid', [0.5, 0.75, 0.55, 0.2, 0.1]);
  t5.mute = true;
  paint(t5, 'main', [7, 15], { note: 57, gate: 0.2, vel: 100 });
  t5.output.send = 0.5;

  const routes = [
    // Kick (kit P1) ducks the acid bass VCA: the four-on-the-floor pump.
    { src: { type: 'trig', track: 0, lane: 'part0', rateHz: 2, shape: 'sine' },
      dest: { track: 1, param: 'vca' }, depth: 0.6, polarity: -1, decay: 0.16 },
    // Slow LFO sweeps the acid cutoff for the classic squelch movement.
    { src: { type: 'lfo', track: 0, lane: 'main', rateHz: 0.13, shape: 'tri' },
      dest: { track: 1, param: 'm0' }, depth: 0.3, polarity: 1, decay: 0.16 },
  ];

  const p = makePattern([t0, t1, t2, t3, t4, t5], routes);
  p.bpm = 132;
  p.tracks.forEach((t) => { t.swing = 0; }); // straight, driving

  // FX loop: acid + stab into RAT then Reverb (grit, then space).
  p.fx.loops[0].pedals[3] = { type: 'rat', bypass: false, params: [0.6, 0.5, 0.5], toggles: [], sw2: false };
  p.fx.loops[0].pedals[2] = { type: 'reverb', bypass: false, params: [0.72, 0.4, 0.15, 0.2, 0.85, 0.5], toggles: [false], sw2: false };
  p.fx.loops[0].return = { level: 0.9, pan: 0 };
  return p;
}
