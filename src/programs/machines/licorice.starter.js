// SPDX-License-Identifier: 0BSD

// Licorice starter: gothic industrial, the showcase for the RINGS modal resonator.
// A driving, distorted C-minor machine with tritone menace: hard industrial drums,
// a squelching overdriven acid bass, a ring-modulated metallic clang lead, a bowed
// resonant drone, a gothic open-fifth choir, and struck-metal percussion, into a
// distorted cathedral. 128 bpm, straight and mechanical. DOM-free so the app and
// offline renderer share it.
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

function paintMap(track, map, gate) {
  for (const [pos, nv] of Object.entries(map)) {
    const s = track.main[+pos];
    s.on = true; s.note = nv[0]; s.velocity = nv[1]; s.gateLen = gate;
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
  // --- T0 industrial drums (KIT, overdriven): a hard four-on-the-floor EBM beat ---
  const t0 = makeTrack('kit', [0, 0, 0, 0, 0]);
  t0.parts[0] = { type: 'kick', mute: false, params: [0.14, 0.5, 0.4, 0.4, 0.55], lane: t0.parts[0].lane };   // hard driven kick
  t0.parts[1] = { type: 'clap', mute: false, params: [0.4, 0.35, 0.55, 0.5, 0.4], lane: t0.parts[1].lane };   // harsh clap
  t0.parts[2] = { type: 'hat', mute: false, params: [0.6, 0.05, 0.6, 0.5, 0.3], lane: t0.parts[2].lane };     // metallic closed hat
  t0.parts[3] = { type: 'hat', mute: false, params: [0.62, 0.3, 0.6, 0.5, 0.3], lane: t0.parts[3].lane };     // open hat
  paintKit(t0, 0, [0, 4, 8, 12], 118);          // four on the floor
  paintKit(t0, 1, [4, 12], 100);                // clap backbeat
  paintKit(t0, 2, [2, 6, 10, 14], 60);          // driving offbeat hats
  paintKit(t0, 3, [7, 15], 70);                 // open hat accents
  t0.output.drive = 0.4;                        // channel grit

  // --- T1 acid bass (ACID, overdriven): a menacing root-heavy C-minor riff with
  // tritone jabs, high resonance, driven at the mixer ---
  const t1 = makeTrack('acid', [0.3, 0.72, 0.6, 0.35, 0.3]); // dark, high reso
  t1.toggles = [true, true]; // square + sub
  paintMap(t1, { 0: [36, 110], 2: [36, 86], 3: [36, 80], 4: [42, 100], 6: [36, 88], 8: [36, 104], 10: [39, 90], 11: [36, 82], 12: [36, 100], 14: [42, 96], 15: [37, 84] }, 0.5);
  [4, 10, 14, 15].forEach((i) => { t1.main[i].slide = true; }); // liquid glides into the jabs
  t1.output.drive = 0.5; t1.output.send = 0.35; t1.output.vca = 0.82;

  // --- T2 clang lead (RINGS, inharmonic + ring-mod): the metallic stab, a
  // dissonant C-minor motif with a tritone (Gb) clang ---
  const t2 = makeTrack('rings', [0.8, 0.6, 0.35, 0.4, 0.7]); // metal structure, hard strike
  t2.toggles = [false, true, false]; // Ring
  paintMap(t2, { 0: [60, 100], 3: [66, 92], 6: [63, 88], 8: [72, 96], 11: [66, 86], 14: [60, 90] }, 0.3);
  t2.output.cutoff = 0.85; t2.output.pan = 0.2; t2.output.send = 0.45; t2.output.vca = 0.5;

  // --- T3 bowed drone (RINGS, Bow + Even): a sustained dark resonant C pedal ---
  const t3 = makeTrack('rings', [0.5, 0.4, 0.7, 0.3, 0.3]);
  t3.toggles = [true, false, true]; // Bow + Even (hollow)
  holdRange(t3, 0, 16, 36, 60); // C2 drone
  t3.output.cutoff = 0.5; t3.output.vca = 0.24; t3.output.pan = -0.2; t3.output.send = 0.45;

  // --- T4 gothic choir (VOWEL): a held open fifth (C + G), dark, the auto-vowel
  // LFO sweeping it slowly ---
  const t4 = makeTrack('vowel', [0.3, 0.5, 0.55, 0.9, 0.1]);
  for (let i = 0; i < 16; i++) {
    const m = t4.main[i]; m.on = true; m.note = 48; m.gateLen = 0.98; m.velocity = 50; if (i > 0) m.tie = true; // C3
    const a = t4.alt[i]; a.on = true; a.note = 55; a.gateLen = 0.98; a.velocity = 46; if (i > 0) a.tie = true;  // G3
  }
  t4.output.cutoff = 0.6; t4.output.vca = 0.45; t4.output.send = 0.6;

  // --- T5 metal percussion (RINGS, full metal + ring-mod): short struck clangs,
  // an anvil/pipe layer over the beat ---
  const t5 = makeTrack('rings', [1.0, 0.7, 0.15, 0.5, 0.9]); // full metal, short, hard
  t5.toggles = [false, true, false]; // Ring
  paintMap(t5, { 2: [72, 88], 5: [79, 80], 7: [67, 84], 10: [74, 86], 13: [72, 82] }, 0.2);
  t5.output.pan = 0.3; t5.output.send = 0.4; t5.output.vca = 0.42;

  const routes = [
    // Kick ducks the bass: the EBM pump.
    { src: { type: 'trig', track: 0, lane: 'part0', rateHz: 2, shape: 'sine' },
      dest: { track: 1, param: 'vca' }, depth: 0.4, polarity: -1, decay: 0.16 },
    // Auto-vowel: a slow LFO sweeps the choir vowel (m0) so it moans.
    { src: { type: 'lfo', track: 0, lane: 'main', rateHz: 0.15, shape: 'sine' },
      dest: { track: 4, param: 'm0' }, depth: 0.5, polarity: 1, decay: 0.16 },
    // A slow 4-bar synced LFO breathes the bowed drone's filter.
    { src: { type: 'lfo', track: 0, lane: 'main', sync: 16, shape: 'tri' },
      dest: { track: 3, param: 'cutoff' }, depth: 0.25, polarity: 1, decay: 0.16 },
  ];

  const p = makePattern([t0, t1, t2, t3, t4, t5], routes);
  p.bpm = 128;
  p.master.volume = 0.82; // pull the dense industrial wall back off the limiter
  p.tracks.forEach((t) => { t.swing = 0; }); // mechanical, straight

  // FX: the sends run through a RAT into a huge dark cathedral, so the metallic
  // rings and choir smear into a distorted reverb. Signal enters at D, leaves at A.
  p.fx.loops[0].pedals[3] = { type: 'rat', bypass: false, params: [0.6, 0.45, 0.5], toggles: [], sw2: false };
  p.fx.loops[0].pedals[2] = { type: 'reverb', bypass: false, params: [0.86, 0.3, 0.2, 0.2, 0.9, 0.55], toggles: [false], sw2: false };
  p.fx.loops[0].return = { level: 0.7, pan: 0 };
  return p;
}
