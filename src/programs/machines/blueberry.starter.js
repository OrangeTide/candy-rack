// SPDX-License-Identifier: 0BSD

// Blueberry starter: space jazz / electronic blues. A swung, midnight modal vamp
// in D dorian: brushed ride drums, a walking FM upright bass, a soft Dm9 comp on
// the new extended CHORD voicings, a sparse Rhodes melody, and a choir + saw pad
// bed floating in a big hall. DOM-free so the app and offline renderer share it.
import { makeTrack, makePattern } from '../../core/sequencer.js';

export const TRACKS = 6;

function paint(track, lane, positions, opts = {}) {
  for (const pos of positions) {
    const s = track[lane][pos];
    s.on = true;
    if (opts.note != null) s.note = opts.note;
    if (opts.vel != null) s.velocity = opts.vel;
    if (opts.gate != null) s.gateLen = opts.gate;
    if (opts.slide) s.slide = true;
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

export function freshPattern() {
  // --- drums: soft brushed jazz kit, a swung ride carrying the pulse ---
  const t0 = makeTrack('kit', [0, 0, 0, 0, 0]);
  t0.parts[0] = { type: 'kick', mute: false, params: [0.30, 0.50, 0.40, 0.40, 0.08], lane: t0.parts[0].lane };  // soft feathered kick
  t0.parts[1] = { type: 'snare', mute: false, params: [0.42, 0.34, 0.78, 0.40, 0.03], lane: t0.parts[1].lane }; // brushy (noise-forward)
  t0.parts[2] = { type: 'hat', mute: false, params: [0.55, 0.12, 0.60, 0.50, 0.0], lane: t0.parts[2].lane };    // ride ping (short)
  t0.parts[3] = { type: 'hat', mute: false, params: [0.55, 0.34, 0.60, 0.50, 0.0], lane: t0.parts[3].lane };    // ride wash (open)
  paintKit(t0, 0, [0, 8], 76);                      // feathered kick on 1 and 3
  paintKit(t0, 1, [4, 12], 68);                     // brush backbeat on 2 and 4
  paintKit(t0, 2, [0, 4, 8, 12], 54);               // ride on the beats
  paintKit(t0, 2, [6, 14], 46);                     // ...plus the swung skip notes
  paintKit(t0, 3, [6, 14], 40);                     // a little wash on the skips

  // --- walking bass (FM BASS): an ascending D dorian line, quarters + swung
  // passing eighths, a leading C# back to D. Legato glides on a couple. ---
  const t1 = makeTrack('fmbass', [0.10, 0.40, 0.35, 0.55, 0.12]); // round, longer decay
  const walk = { 0: 38, 2: 40, 4: 41, 6: 43, 8: 45, 10: 47, 12: 48, 14: 49 }; // D E F G A B C C#
  for (const [i, note] of Object.entries(walk)) paint(t1, 'main', [+i], { note, gate: 0.55, vel: 92 });
  [2, 10, 14].forEach((i) => { t1.main[i].slide = true; });   // upright glides
  t1.output.vca = 0.85;

  // --- Dm9 comp (CHORD, min9 voicing): soft off-beat jazz stabs, warm and dark,
  // washed into the hall. Root D3; the extended voicing does the colour. ---
  const t2 = makeTrack('chord', [0.906, 0.15, 0.20, 0.50, 0.10]); // min9 (idx 14/16)
  paint(t2, 'main', [2], { note: 50, gate: 0.22, vel: 80 });
  paint(t2, 'main', [6], { note: 50, gate: 0.22, vel: 72 });
  paint(t2, 'main', [11], { note: 50, gate: 0.30, vel: 84 });
  paint(t2, 'main', [14], { note: 50, gate: 0.22, vel: 70 });
  t2.output.cutoff = 0.55;   // mellow
  t2.output.send = 0.6;

  // --- Rhodes melody (E.PIANO): a sparse, dreamy D dorian phrase that leaves
  // space, resolving to a held D. ---
  const t3 = makeTrack('epiano', [0.52, 0.50, 0.15, 0.62, 0.10]);
  paint(t3, 'main', [0], { note: 69, gate: 0.5, vel: 92 });   // A4
  paint(t3, 'main', [3], { note: 71, gate: 0.4, vel: 82 });   // B4
  paint(t3, 'main', [4], { note: 69, gate: 0.4, vel: 80 });   // A4
  paint(t3, 'main', [7], { note: 67, gate: 0.4, vel: 84 });   // G4
  paint(t3, 'main', [8], { note: 65, gate: 0.5, vel: 86 });   // F4
  paint(t3, 'main', [11], { note: 64, gate: 0.4, vel: 78 });  // E4
  paint(t3, 'main', [12], { note: 62, gate: 0.95, vel: 88 }); // D4, held...
  paint(t3, 'main', [13, 14, 15], { tie: true });             // ...through the bar end
  t3.output.send = 0.4;

  // --- choir pad (VOWEL): a held "aah" fifth (A3), the auto-vowel LFO sweeping
  // it slowly; the airy top of the space bed. ---
  const t4 = makeTrack('vowel', [0.30, 0.55, 0.50, 0.9, 0.08]);
  for (let i = 0; i < 16; i++) paint(t4, 'main', [i], { note: 57, gate: 0.98, vel: 52 });
  for (let i = 1; i < 16; i++) t4.main[i].tie = true;   // one continuous held choir
  t4.output.cutoff = 0.7;
  t4.output.send = 0.7;
  t4.output.vca = 0.7;

  // --- deep pad (SUPERSAW): a low D drone under everything, dark and quiet, a
  // slow filter breath opening it; the bottom of the space bed. ---
  const t5 = makeTrack('supersaw', [0.40, 0.60, 0.40, 0.0, 0.10]);
  for (let i = 0; i < 16; i++) paint(t5, 'main', [i], { note: 50, gate: 0.98, vel: 46 });
  for (let i = 1; i < 16; i++) t5.main[i].tie = true;
  t5.output.cutoff = 0.30;
  t5.output.vca = 0.5;
  t5.output.send = 0.5;

  const routes = [
    // Auto-vowel: a slow LFO sweeps the choir vowel (m0) so the "aah" morphs.
    { src: { type: 'lfo', track: 0, lane: 'main', rateHz: 0.13, shape: 'sine' },
      dest: { track: 4, param: 'm0' }, depth: 0.5, polarity: 1, decay: 0.16 },
    // A tempo-synced 4-bar LFO breathes the deep saw pad's filter open and shut,
    // so the swell stays locked to the groove at any tempo.
    { src: { type: 'lfo', track: 0, lane: 'main', sync: 16, shape: 'tri' },
      dest: { track: 5, param: 'cutoff' }, depth: 0.28, polarity: 1, decay: 0.16 },
  ];

  const p = makePattern([t0, t1, t2, t3, t4, t5], routes);
  p.bpm = 100;
  p.tracks.forEach((t) => { t.swing = 0.55; }); // jazz shuffle on the eighths

  // FX: the pads and comp go wide through Dimension, then into a big dark hall.
  p.fx.loops[0].pedals[3] = { type: 'dim', bypass: false, params: [0.5, 0.7], toggles: [false, true, false], sw2: false };
  p.fx.loops[0].pedals[2] = { type: 'reverb', bypass: false, params: [0.82, 0.5, 0.25, 0.2, 0.85, 0.55], toggles: [false], sw2: false };
  p.fx.loops[0].return = { level: 0.85, pan: 0 };
  return p;
}
