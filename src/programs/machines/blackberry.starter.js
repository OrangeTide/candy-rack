// SPDX-License-Identifier: 0BSD

// Blackberry starter: dungeon synth / dark medieval folk. A slow, brooding
// 2-bar (32-step) loop in A minor over the descending A-G-F-E lament: a soft
// processional frame-drum, an SH-101 sub drone, medieval open-fifth CHORD pads,
// a VOWEL monk-choir pedal tone, and a plaintive E.PIANO bell melody, all run
// through tape wash into a cavernous hall. Tempo-synced LFOs breathe the pads.
// DOM-free so the app and offline renderer share it.
import { makeTrack, makePattern } from '../../core/sequencer.js';

export const TRACKS = 6;

const LEN = 32; // two bars

function paint(track, lane, positions, opts = {}) {
  for (const pos of positions) {
    const s = track[lane][pos];
    s.on = true;
    if (opts.note != null) s.note = opts.note;
    if (opts.vel != null) s.velocity = opts.vel;
    if (opts.gate != null) s.gateLen = opts.gate;
    if (opts.tie) s.tie = true;
  }
}

function paintKit(kit, part, positions, vel) {
  for (const pos of positions) {
    const s = kit.parts[part].lane[pos];
    s.on = true;
    if (vel != null) s.velocity = vel;
  }
}

// Hold one note across `span` steps from `start`: a struck note that rings on
// (tie on the following steps, no re-articulation).
function hold(track, lane, start, span, note, vel, gate) {
  paint(track, lane, [start], { note, vel, gate: gate ?? 0.98 });
  for (let i = 1; i < span; i++) paint(track, lane, [start + i], { note, tie: true });
}

export function freshPattern() {
  // --- soft processional frame drum: a muffled, limping heartbeat ---
  const t0 = makeTrack('kit', [0, 0, 0, 0, 0]);
  t0.length = LEN;
  t0.parts[0] = { type: 'kick', mute: false, params: [0.16, 0.60, 0.35, 0.35, 0.05], lane: t0.parts[0].lane }; // deep, muffled
  t0.parts[1] = { type: 'hat', mute: false, params: [0.45, 0.10, 0.5, 0.5, 0.0], lane: t0.parts[1].lane };     // distant tick
  paintKit(t0, 0, [0, 10, 16, 26], 74);   // a slow, limping medieval pulse
  paintKit(t0, 1, [7, 23], 34);           // faint ticks between
  t0.output.vca = 0.7;

  // --- SH-101 sub drone: the roots of the descent, warm and slow ---
  const t1 = makeTrack('sh101', [0.30, 0.20, 0.20, 0.80, 0.30]);
  t1.length = LEN;
  t1.toggles = [false, true, true]; // saw + sub + slow attack
  hold(t1, 'main', 0, 8, 33, 66);   // A1
  hold(t1, 'main', 8, 8, 31, 66);   // G1
  hold(t1, 'main', 16, 8, 29, 66);  // F1
  hold(t1, 'main', 24, 8, 28, 66);  // E1
  t1.output.cutoff = 0.32;
  t1.output.vca = 0.8;

  // --- medieval open-fifth pad (CHORD '5' = root+fifth+octave), the A-G-F-E
  // descent, wide and lo-fi, washed into the hall ---
  const t2 = makeTrack('chord', [0.281, 0.30, 0.35, 0.90, 0.10]); // '5' (idx 4/16)
  t2.length = LEN;
  hold(t2, 'main', 0, 8, 57, 78);   // A3
  hold(t2, 'main', 8, 8, 55, 74);   // G3
  hold(t2, 'main', 16, 8, 53, 74);  // F3
  hold(t2, 'main', 24, 8, 52, 72);  // E3
  t2.output.cutoff = 0.5;
  t2.output.send = 0.7;

  // --- monk choir (VOWEL): a held A pedal tone under the descent, the auto-vowel
  // LFO morphing the "aah" slowly ---
  const t3 = makeTrack('vowel', [0.25, 0.50, 0.55, 0.9, 0.06]);
  t3.length = LEN;
  hold(t3, 'main', 0, LEN, 45, 52);  // A2 drone, whole loop
  t3.output.cutoff = 0.65;
  t3.output.send = 0.7;
  t3.output.vca = 0.7;

  // --- bell melody (E.PIANO, bright tine + short decay): a plaintive minor
  // lament tracing the descent ---
  const t4 = makeTrack('epiano', [0.72, 0.30, 0.10, 0.42, 0.08]);
  t4.length = LEN;
  paint(t4, 'main', [0], { note: 69, gate: 0.5, vel: 82 });   // A4
  paint(t4, 'main', [6], { note: 67, gate: 0.4, vel: 74 });   // G4
  paint(t4, 'main', [8], { note: 64, gate: 0.5, vel: 80 });   // E4
  paint(t4, 'main', [12], { note: 65, gate: 0.4, vel: 72 });  // F4
  paint(t4, 'main', [16], { note: 65, gate: 0.5, vel: 78 });  // F4
  paint(t4, 'main', [20], { note: 64, gate: 0.4, vel: 72 });  // E4
  paint(t4, 'main', [24], { note: 62, gate: 0.5, vel: 76 });  // D4
  paint(t4, 'main', [28], { note: 64, gate: 0.95, vel: 80 }); // E4, ringing
  paint(t4, 'main', [29, 30, 31], { tie: true });
  t4.output.send = 0.45;

  // --- high atmosphere (SUPERSAW): a faint E5 drone for air, quiet, dark ---
  const t5 = makeTrack('supersaw', [0.45, 0.55, 0.35, 0.0, 0.08]);
  t5.length = LEN;
  hold(t5, 'main', 0, LEN, 64, 40); // E4 shimmer bed
  t5.output.cutoff = 0.4;
  t5.output.vca = 0.4;
  t5.output.send = 0.5;

  const routes = [
    // Auto-vowel: a synced 2-bar LFO morphs the monk choir vowel (m0).
    { src: { type: 'lfo', track: 0, lane: 'main', sync: 8, shape: 'sine' },
      dest: { track: 3, param: 'm0' }, depth: 0.5, polarity: 1, decay: 0.16 },
    // A synced 4-bar LFO breathes the open-fifth pad's filter open and shut.
    { src: { type: 'lfo', track: 0, lane: 'main', sync: 16, shape: 'tri' },
      dest: { track: 2, param: 'cutoff' }, depth: 0.30, polarity: 1, decay: 0.16 },
  ];

  const p = makePattern([t0, t1, t2, t3, t4, t5], routes);
  p.bpm = 76;
  p.tracks.forEach((t) => { t.swing = 0; }); // slow and even, processional

  // FX: the pads go through tape wash (wow/flutter) then a big dark cavern.
  p.fx.loops[0].pedals[3] = { type: 'vapor', bypass: false, params: [0.42, 0.30, 0.40, 0.6, 0.6, 0.35], toggles: [false], sw2: false };
  p.fx.loops[0].pedals[2] = { type: 'reverb', bypass: false, params: [0.88, 0.32, 0.30, 0.25, 0.85, 0.55], toggles: [false], sw2: false };
  p.fx.loops[0].return = { level: 0.9, pan: 0 };
  return p;
}
