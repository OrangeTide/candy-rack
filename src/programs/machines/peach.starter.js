// SPDX-License-Identifier: 0BSD

// Peach starter: vaporwave / mallsoft, the showcase for the SAMPLE ROMpler. A
// slow, heavily swung, pitched-down haze: the "mall" maj9 chord sample and an
// "aah" choir sample looped and dropped two octaves, a sparse Rhodes-sample
// melody, a warm sub, a lazy beat, and a vinyl-crackle bed, all washed through
// Dimension, a tape wobble, and a big hall. DOM-free so the app and offline
// renderer share it.
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

// Hold one note across a run of steps (tied after the first), so a looped sample
// sustains without re-attacking.
function holdRange(track, start, count, note, vel) {
  for (let i = 0; i < count; i++) {
    const s = track.main[start + i];
    s.on = true; s.note = note; s.gateLen = 0.98; s.velocity = vel;
    if (i > 0) s.tie = true;
  }
}

export function freshPattern() {
  // --- T0 drums: a slow, lazy halftime beat, heavily swung ---
  const t0 = makeTrack('kit', [0, 0, 0, 0, 0]);
  t0.parts[0] = { type: 'kick', mute: false, params: [0.14, 0.55, 0.4, 0.35, 0.08], lane: t0.parts[0].lane };  // soft deep kick
  t0.parts[1] = { type: 'snare', mute: false, params: [0.36, 0.4, 0.7, 0.45, 0.05], lane: t0.parts[1].lane };  // dusty backbeat
  t0.parts[2] = { type: 'hat', mute: false, params: [0.5, 0.08, 0.55, 0.5, 0.0], lane: t0.parts[2].lane };     // soft closed
  t0.parts[3] = { type: 'hat', mute: false, params: [0.5, 0.4, 0.55, 0.5, 0.0], lane: t0.parts[3].lane };      // open
  paintKit(t0, 0, [0, 10], 96);        // lazy syncopated kick
  paintKit(t0, 1, [8], 78);            // halftime snare on 3
  paintKit(t0, 2, [2, 6, 10, 14], 42); // soft off-beat hats
  paintKit(t0, 3, [14], 46);           // one open hat
  t0.output.send = 0.2;

  // --- T1 mall chord (SAMPLE 'Mall'): the maj9 sample looped and dropped two
  // octaves, a slow C -> A vamp, crushed and drenched: the vaporwave hook ---
  const t1 = makeTrack('sample', [0.0, 0.0, 0.95, 0.5, 0.25]); // Mall slot, long, soft, lo-fi
  t1.toggles = [true, false, false]; // Loop
  holdRange(t1, 0, 8, 36, 88);  // C2
  holdRange(t1, 8, 8, 33, 84);  // A1
  t1.output.cutoff = 0.7; t1.output.send = 0.8; t1.output.vca = 0.7;

  // --- T2 choir (SAMPLE 'Choir'): the "aah" pad, dropped an octave, moving with
  // the chords, airy and panned right ---
  const t2 = makeTrack('sample', [0.25, 0.0, 0.9, 0.55, 0.15]); // Choir slot
  t2.toggles = [true, false, false]; // Loop
  holdRange(t2, 0, 8, 48, 60);  // C3
  holdRange(t2, 8, 8, 45, 58);  // A2
  t2.output.cutoff = 0.75; t2.output.pan = 0.25; t2.output.send = 0.7; t2.output.vca = 0.5;

  // --- T3 sub (FM BASS): a slow warm root under the chords ---
  const t3 = makeTrack('fmbass', [0.10, 0.5, 0.35, 0.6, 0.10]);
  paint(t3, 'main', [0], { note: 36, gate: 0.9, vel: 92 }); // C2
  paint(t3, 'main', [8], { note: 33, gate: 0.9, vel: 88 }); // A1
  t3.main[8].slide = true; // glide between the roots
  t3.output.vca = 0.8;

  // --- T4 melody (SAMPLE 'Rhodes'): a sparse, dreamy line, the sample pitched by
  // the note, leaving space; sits over both chords (C / A pentatonic) ---
  const t4 = makeTrack('sample', [0.5, 0.0, 0.5, 0.7, 0.2]); // Rhodes slot
  paint(t4, 'main', [2], { note: 64, gate: 0.5, vel: 82 });  // E4
  paint(t4, 'main', [7], { note: 67, gate: 0.5, vel: 76 });  // G4
  paint(t4, 'main', [10], { note: 72, gate: 0.5, vel: 84 }); // C5
  paint(t4, 'main', [13], { note: 69, gate: 0.5, vel: 74 }); // A4
  t4.output.cutoff = 0.8; t4.output.pan = -0.2; t4.output.send = 0.6;

  // --- T5 vinyl bed (SAMPLE 'Crackle'): a quiet, continuous looped crackle ---
  const t5 = makeTrack('sample', [0.65, 0.0, 0.9, 0.45, 0.1]); // Crackle slot
  t5.toggles = [true, false, false]; // Loop
  holdRange(t5, 0, 16, 60, 70);
  t5.output.cutoff = 0.5; t5.output.vca = 0.28; t5.output.send = 0.2;

  const routes = [
    // A slow 4-bar synced LFO breathes the mall chord's filter, so the wash drifts.
    { src: { type: 'lfo', track: 0, lane: 'main', sync: 16, shape: 'tri' },
      dest: { track: 1, param: 'cutoff' }, depth: 0.25, polarity: 1, decay: 0.16 },
    // A second slow LFO drifts the choir the other way for a shifting haze.
    { src: { type: 'lfo', track: 0, lane: 'main', sync: 16, shape: 'sin', phase: 0.5 },
      dest: { track: 2, param: 'cutoff' }, depth: 0.2, polarity: 1, decay: 0.16 },
  ];

  const p = makePattern([t0, t1, t2, t3, t4, t5], routes);
  p.bpm = 65;
  p.tracks.forEach((t) => { t.swing = 0.58; }); // heavy, laid-back swing

  // FX: everything goes wide through Dimension, into a VaporCloud tape wobble,
  // then a big hall. Signal enters at D (pedals[3]) and leaves at A (pedals[0]).
  p.fx.loops[0].pedals[3] = { type: 'dim', bypass: false, params: [0.5, 0.7], toggles: [false, true, false], sw2: false };
  p.fx.loops[0].pedals[2] = { type: 'vapor', bypass: false, params: [0.55, 0.35, 0.4, 0.6, 0.8, 0.5], toggles: [false], sw2: false };
  p.fx.loops[0].pedals[1] = { type: 'reverb', bypass: false, params: [0.85, 0.4, 0.3, 0.25, 0.9, 0.5], toggles: [false], sw2: false };
  p.fx.loops[0].return = { level: 0.85, pan: 0 };
  return p;
}
