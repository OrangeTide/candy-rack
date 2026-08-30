// SPDX-License-Identifier: 0BSD

// Plum starter: trip-hop / downtempo. A slow, dusty, minor-key haze in the
// Portishead / Massive Attack mold. The SAMPLE 'Break' is CHOPPED in Slice mode
// (each step's note picks one of the break's 16 slices, re-sequenced with a
// stutter and ghost snares), over a deep sub, dusty Rhodes stabs, a ghostly
// pitched-down choir, a haunting wordless vocal, and a vinyl bed. The break's
// kick sidechains the bass. D minor, 86 bpm, heavily swung. DOM-free so the app
// and offline renderer share it.
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

// Hold one note across a run of steps (tied after the first), for a sustained pad.
function holdRange(track, start, count, note, vel) {
  for (let i = 0; i < count; i++) {
    const s = track.main[start + i];
    s.on = true; s.note = note; s.gateLen = 0.98; s.velocity = vel;
    if (i > 0) s.tie = true;
  }
}

export function freshPattern() {
  // --- T0 chopped break (SAMPLE 'Break', Slice mode): note 60 + sliceIndex picks
  // a slice of the one-bar break. Re-sequenced into a chopped halftime beat: kick
  // slices (0/6/10) drive it, snare slices (4/12) hit the backbeat, a stutter
  // repeats a kick, and ghost snares/hats fill. Slices in the break: 0/6/10 = kick,
  // 4/12 = snare, 2/8/14 = hat, 3/5 = silent (used for the sidechain). ---
  const t0 = makeTrack('sample', [0.9, 0.0, 0.25, 0.5, 0.3]); // Break slot, short, dusty, crushed
  t0.toggles = [false, false, true]; // Slice
  const chop = {
    0: [60, 118], 2: [68, 62], 4: [64, 100], 6: [66, 92], 7: [66, 70], // stutter on the 7
    8: [60, 110], 10: [62, 60], 11: [72, 66], 12: [64, 98], 14: [70, 86], 15: [74, 58],
  };
  for (const [i, nv] of Object.entries(chop)) paint(t0, 'main', [+i], { note: nv[0], vel: nv[1], gate: 0.3 });
  // Silent sidechain markers on the down-beats: an empty slice (3) fires the alt
  // voice inaudibly, and its trigger ducks the bass (see routes).
  paint(t0, 'alt', [0, 8], { note: 63, gate: 0.1, vel: 1 });
  t0.output.cutoff = 0.9; t0.output.send = 0.25; t0.output.drive = 0.15;

  // --- T1 sub (FM BASS): a deep, dusty D-minor riff, sparse and heavy ---
  const t1 = makeTrack('fmbass', [0.08, 0.55, 0.4, 0.6, 0.12]);
  paint(t1, 'main', [0], { note: 38, gate: 0.85, vel: 108 }); // D2
  paint(t1, 'main', [6], { note: 38, gate: 0.4, vel: 84 });   // D2 push
  paint(t1, 'main', [8], { note: 33, gate: 0.7, vel: 100 });  // A1
  paint(t1, 'main', [11], { note: 36, gate: 0.5, vel: 88 });  // C2
  t1.main[8].slide = true; t1.main[11].slide = true;          // dusty glides
  t1.output.vca = 0.9;

  // --- T2 Rhodes (E.PIANO): dusty, dark two-note minor stabs on the off-beats ---
  const t2 = makeTrack('epiano', [0.5, 0.45, 0.2, 0.6, 0.15]);
  paint(t2, 'main', [2], { note: 53, gate: 0.5, vel: 82 });  paint(t2, 'alt', [2], { note: 60, gate: 0.5, vel: 78 }); // F3+C4 (Dm7 upper)
  paint(t2, 'main', [10], { note: 50, gate: 0.5, vel: 78 }); paint(t2, 'alt', [10], { note: 58, gate: 0.5, vel: 74 }); // D3+Bb3
  t2.output.cutoff = 0.5; t2.output.pan = -0.2; t2.output.send = 0.5;

  // --- T3 vinyl bed (SAMPLE 'Crackle', looped): the dusty backdrop ---
  const t3 = makeTrack('sample', [0.65, 0.0, 0.9, 0.45, 0.1]);
  t3.toggles = [true, false, false]; // Loop
  holdRange(t3, 0, 16, 60, 70);
  t3.output.cutoff = 0.5; t3.output.vca = 0.3; t3.output.send = 0.15;

  // --- T4 ghost pad (SAMPLE 'Choir', looped): a held, pitched choir floating high ---
  const t4 = makeTrack('sample', [0.25, 0.0, 0.9, 0.5, 0.15]);
  t4.toggles = [true, false, false]; // Loop
  holdRange(t4, 0, 16, 57, 44); // A3, a floating fifth
  t4.output.cutoff = 0.7; t4.output.pan = 0.3; t4.output.vca = 0.4; t4.output.send = 0.6;

  // --- T5 wordless vocal (VOWEL): a haunting A -> F lead, the auto-vowel LFO
  // sweeping it so it "sings" without words ---
  const t5 = makeTrack('vowel', [0.3, 0.5, 0.55, 0.9, 0.1]);
  holdRange(t5, 0, 8, 57, 54);  // A3
  holdRange(t5, 8, 8, 53, 52);  // F3
  t5.output.cutoff = 0.65; t5.output.pan = 0.15; t5.output.vca = 0.5; t5.output.send = 0.6;

  const routes = [
    // Sidechain: the break's down-beat (T0 alt, a silent slice) ducks the sub for
    // the trip-hop breathe.
    { src: { type: 'trig', track: 0, lane: 'alt', rateHz: 2, shape: 'sine' },
      dest: { track: 1, param: 'vca' }, depth: 0.4, polarity: -1, decay: 0.16 },
    // Auto-vowel: a slow LFO sweeps the wordless vocal (T6, m0 = Vowel).
    { src: { type: 'lfo', track: 0, lane: 'main', rateHz: 0.12, shape: 'sine' },
      dest: { track: 5, param: 'm0' }, depth: 0.6, polarity: 1, decay: 0.16 },
    // A slow auto-wah on the dusty Rhodes for movement.
    { src: { type: 'lfo', track: 0, lane: 'main', sync: 16, shape: 'tri' },
      dest: { track: 2, param: 'cutoff' }, depth: 0.22, polarity: 1, decay: 0.16 },
  ];

  const p = makePattern([t0, t1, t2, t3, t4, t5], routes);
  p.bpm = 86;
  p.tracks.forEach((t) => { t.swing = 0.5; }); // heavy trip-hop swing

  // FX: a little width, a dubby ping-pong echo, and a dark room. Signal enters at
  // D (pedals[3]) and leaves at A (pedals[0]).
  p.fx.loops[0].pedals[3] = { type: 'dim', bypass: false, params: [0.4, 0.6], toggles: [true, false, false], sw2: false };
  p.fx.loops[0].pedals[2] = { type: 'echo', bypass: false, params: [0.42, 0.35, 0.3, 0.35, 0.3, 0.4], toggles: [true], sw2: false };
  p.fx.loops[0].pedals[1] = { type: 'reverb', bypass: false, params: [0.6, 0.35, 0.15, 0.2, 0.8, 0.4], toggles: [false], sw2: false };
  p.fx.loops[0].return = { level: 0.8, pan: 0 };
  return p;
}
