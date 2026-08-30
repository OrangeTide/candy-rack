// SPDX-License-Identifier: 0BSD

// Orange starter: sunshine breaks. The bright, sunny counterpart to Plum, on the
// same chopped-break engine. A busy full-tempo funk break (SAMPLE 'Break' in Slice
// mode), a bouncy funk bass, warm 6/9 organ stabs, a sunny Rhodes hook, a bright
// supersaw wash, and a layer of live latin percussion over the top. C major, 108
// bpm, a light funk shuffle. DOM-free so the app and offline renderer share it.
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

function holdRange(track, start, count, note, vel) {
  for (let i = 0; i < count; i++) {
    const s = track.main[start + i];
    s.on = true; s.note = note; s.gateLen = 0.98; s.velocity = vel;
    if (i > 0) s.tie = true;
  }
}

export function freshPattern() {
  // --- T0 chopped break (SAMPLE 'Break', Slice mode): note 60 + sliceIndex. A
  // busy, driving full-tempo chop with a stutter kick, ghost snares, and a roll
  // pickup. Bright Tone, light Crush (sunny, not dusty). The break's meaty slices
  // are the even ones: 0/6/10 kick, 4/12 snare, 2/8/14 hat; slice 3 is silent. ---
  const t0 = makeTrack('sample', [0.9, 0.0, 0.25, 0.75, 0.15]); // Break slot, bright, lightly crushed
  t0.toggles = [false, false, true]; // Slice
  const chop = {
    0: [60, 118], 2: [68, 70], 3: [60, 90], 4: [64, 104], 6: [66, 92], 7: [74, 66],
    8: [60, 100], 10: [70, 96], 11: [72, 78], 12: [64, 104], 14: [68, 72], 15: [72, 84],
  };
  for (const [i, nv] of Object.entries(chop)) paint(t0, 'main', [+i], { note: nv[0], vel: nv[1], gate: 0.3 });
  // Silent sidechain markers on the down-beats: an empty slice (3) fires the alt
  // trigger inaudibly, and it lightly pumps the bass (see routes).
  paint(t0, 'alt', [0, 8], { note: 63, gate: 0.1, vel: 1 });
  t0.output.cutoff = 0.9; t0.output.send = 0.25;

  // --- T1 funk bass (FM BASS): a bouncy C-major line, octave jumps and a walk ---
  const t1 = makeTrack('fmbass', [0.10, 0.35, 0.4, 0.35, 0.15]);
  paint(t1, 'main', [0], { note: 36, gate: 0.4, vel: 110 }); // C2
  paint(t1, 'main', [3], { note: 48, gate: 0.3, vel: 82 });  // C3
  paint(t1, 'main', [6], { note: 36, gate: 0.4, vel: 92 });  // C2
  paint(t1, 'main', [8], { note: 41, gate: 0.4, vel: 98 });  // F2
  paint(t1, 'main', [10], { note: 48, gate: 0.3, vel: 80 }); // C3
  paint(t1, 'main', [11], { note: 43, gate: 0.3, vel: 84 }); // G2
  paint(t1, 'main', [14], { note: 36, gate: 0.4, vel: 90 }); // C2
  t1.output.vca = 0.85;

  // --- T2 organ stabs (CHORD 6/9): a bright I -> IV vamp, C6/9 then F6/9 ---
  const t2 = makeTrack('chord', [0.94, 0.2, 0.45, 0.3, 0.15]); // 6/9 (idx 15/16)
  paint(t2, 'main', [2, 6], { note: 48, gate: 0.2, vel: 88 });   // C6/9
  paint(t2, 'main', [10, 14], { note: 53, gate: 0.2, vel: 84 }); // F6/9
  t2.output.cutoff = 0.75; t2.output.pan = 0.2; t2.output.send = 0.5;

  // --- T3 Rhodes hook (E.PIANO): a sunny C-major-pentatonic riff ---
  const t3 = makeTrack('epiano', [0.55, 0.45, 0.15, 0.4, 0.12]);
  paint(t3, 'main', [0], { note: 67, gate: 0.3, vel: 90 });  // G4
  paint(t3, 'main', [4], { note: 72, gate: 0.3, vel: 84 });  // C5
  paint(t3, 'main', [7], { note: 69, gate: 0.3, vel: 78 });  // A4
  paint(t3, 'main', [8], { note: 67, gate: 0.3, vel: 82 });  // G4
  paint(t3, 'main', [11], { note: 64, gate: 0.3, vel: 76 }); // E4
  paint(t3, 'main', [12], { note: 72, gate: 0.4, vel: 86 }); // C5
  t3.output.cutoff = 0.7; t3.output.pan = -0.2; t3.output.send = 0.4;

  // --- T4 pad wash (SUPERSAW): a bright held C, a synced LFO opening its filter ---
  const t4 = makeTrack('supersaw', [0.4, 0.6, 0.55, 0.0, 0.1]);
  holdRange(t4, 0, 16, 60, 44); // C4
  t4.output.cutoff = 0.45; t4.output.vca = 0.4; t4.output.send = 0.5;

  // --- T5 live percussion (KIT): congas, a cowbell clave, and a shaker over the
  // break for latin sunshine bounce ---
  const t5 = makeTrack('kit', [0, 0, 0, 0, 0]);
  t5.parts[0] = { type: 'drum', mute: false, params: [0.6, 0.14, 0.3, 0.3, 0.1], lane: t5.parts[0].lane };    // conga hi
  t5.parts[1] = { type: 'drum', mute: false, params: [0.35, 0.16, 0.3, 0.3, 0.1], lane: t5.parts[1].lane };   // conga lo
  t5.parts[2] = { type: 'cowbell', mute: false, params: [0.62, 0.3, 0.6, 0.5, 0.1], lane: t5.parts[2].lane };  // cowbell
  t5.parts[3] = { type: 'hat', mute: false, params: [0.62, 0.05, 0.7, 0.5, 0.0], lane: t5.parts[3].lane };     // shaker
  paintKit(t5, 0, [3, 7, 11, 15], 66); // conga hi on the "and-a"
  paintKit(t5, 1, [2, 10], 60);        // conga lo
  paintKit(t5, 2, [0, 6, 8, 14], 54);  // cowbell clave
  paintKit(t5, 3, [2, 6, 10, 14], 44); // soft shaker offbeats
  t5.swing = 0.2;                       // a touch more shuffle on the perc
  t5.output.send = 0.2;

  const routes = [
    // A light sidechain pump on the bass, fired by the break's silent down-beat
    // markers (T0 alt): sunny bounce, not a heavy duck.
    { src: { type: 'trig', track: 0, lane: 'alt', rateHz: 2, shape: 'sine' },
      dest: { track: 1, param: 'vca' }, depth: 0.28, polarity: -1, decay: 0.14 },
    // A 2-bar synced LFO breathes the supersaw pad's filter open and shut.
    { src: { type: 'lfo', track: 0, lane: 'main', sync: 8, shape: 'tri' },
      dest: { track: 4, param: 'cutoff' }, depth: 0.3, polarity: 1, decay: 0.16 },
  ];

  const p = makePattern([t0, t1, t2, t3, t4, t5], routes);
  p.bpm = 108;
  p.tracks.forEach((t) => { t.swing = 0.15; }); // light funk shuffle
  t5.swing = 0.2;

  // FX: widen the stabs through Dimension, a bright ping-pong slap, then a short
  // bright room. Signal enters at D (pedals[3]) and leaves at A (pedals[0]).
  p.fx.loops[0].pedals[3] = { type: 'dim', bypass: false, params: [0.45, 0.7], toggles: [false, true, false], sw2: false };
  p.fx.loops[0].pedals[2] = { type: 'echo', bypass: false, params: [0.35, 0.3, 0.15, 0.6, 0.2, 0.35], toggles: [true], sw2: false };
  p.fx.loops[0].pedals[1] = { type: 'reverb', bypass: false, params: [0.5, 0.6, 0.1, 0.2, 0.8, 0.3], toggles: [false], sw2: false };
  p.fx.loops[0].return = { level: 0.8, pan: 0 };
  return p;
}
