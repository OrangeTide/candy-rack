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
  // --- drums: a hard, dark 909 four-on-the-floor with a cold backbeat snare ---
  const t0 = makeTrack('kit', [0, 0, 0, 0, 0]);
  t0.parts[0] = { type: 'kick', mute: false, params: [0.18, 0.62, 0.5, 0.5, 0.42], lane: t0.parts[0].lane };  // deep, driven
  t0.parts[1] = { type: 'snare', mute: false, params: [0.4, 0.28, 0.6, 0.5, 0.3], lane: t0.parts[1].lane };   // tight backbeat crack
  t0.parts[2] = { type: 'hat', mute: false, params: [0.5, 0.05, 0.6, 0.5, 0.2], lane: t0.parts[2].lane };     // closed
  t0.parts[3] = { type: 'hat', mute: false, params: [0.5, 0.42, 0.6, 0.5, 0.2], lane: t0.parts[3].lane };     // open
  paintKit(t0, 0, [0, 4, 8, 12], 118);              // kick 4-on-the-floor
  paintKit(t0, 1, [4, 12], 92);                     // snare on the backbeat
  paintKit(t0, 2, [2, 6, 10, 14], 58);              // driving offbeat closed hats
  paintKit(t0, 3, [14], 72);                        // one open hat before the turnaround

  // --- acid bass: a hypnotic, root-heavy E phrygian riff, menacing, into the RAT ---
  // Mostly the low E; a few dark jabs (b2 F, b5 Bb) and octave stabs. High
  // resonance and a deep filter sweep do the work, not the melody.
  const t1 = makeTrack('acid', [0.16, 0.82, 0.72, 0.42, 0.30]); // cutoff, reso, env, decay, slide
  const bass = [40, 40, 40, 52, 40, 40, 43, 40, 40, 40, 46, 40, 41, 40, 52, 47];
  for (let i = 0; i < 16; i++) { const s = t1.main[i]; s.on = true; s.note = bass[i]; s.gateLen = 0.6; s.velocity = 102; }
  [3, 10, 14].forEach((i) => { t1.main[i].slide = true; });      // liquid glides into the jabs
  [0, 4, 8, 12, 3, 10].forEach((i) => { t1.alt[i].on = true; }); // accents (alt lane)
  t1.toggles = [false, true];                                    // saw + sub-octave (weight)
  t1.output.send = 0.7;                                          // into the RAT + reverb

  // --- the reconstruction stab: a big dissonant Em7 hit, ground through the
  // RAT and drowned in dark reverb; sparse and lurching (beat 1 + the & of 3) ---
  const t2 = makeTrack('chord', [0.42, 0.55, 0.35, 0.45, 0.7]); // min7, detuned, driven
  paint(t2, 'main', [0], { note: 40, gate: 0.5, vel: 104 });
  paint(t2, 'main', [10], { note: 40, gate: 0.35, vel: 92 });
  t2.output.cutoff = 0.45;   // dark grind
  t2.output.send = 0.95;

  // --- cold low drone: a single static E (+ sub) under everything, dark filter ---
  const t3 = makeTrack('sh101', [0.22, 0.25, 0.2, 0.7, 0.0]);
  t3.toggles = [false, true, true]; // saw + sub + slow attack
  for (let i = 0; i < 16; i++) { const s = t3.main[i]; s.on = true; s.note = 40; s.gateLen = 0.98; s.velocity = 58; if (i > 0) s.tie = true; }
  t3.output.cutoff = 0.22;
  t3.output.vca = 0.4;

  // --- spare slots (muted): a high acid counter-line, a supersaw riser ---
  const t4 = makeTrack('acid', [0.5, 0.8, 0.6, 0.2, 0.12]);
  t4.mute = true;
  paint(t4, 'main', [7, 11, 15], { note: 64, gate: 0.2, vel: 100 }); // E4 stabs
  t4.output.send = 0.6;

  const t5 = makeTrack('supersaw', [0.3, 0.5, 0.55, 0.0, 0.1]);
  t5.mute = true;
  t5.output.cutoff = 0.35;

  const routes = [
    // Kick (kit P1) ducks the acid bass VCA: the relentless four-on-the-floor pump.
    { src: { type: 'trig', track: 0, lane: 'part0', rateHz: 2, shape: 'sine' },
      dest: { track: 1, param: 'vca' }, depth: 0.55, polarity: -1, decay: 0.16 },
    // A very slow LFO breathes the acid cutoff open and shut over 4 bars: the
    // menacing filter sweep that carries the whole track.
    { src: { type: 'lfo', track: 0, lane: 'main', rateHz: 0.07, shape: 'tri' },
      dest: { track: 1, param: 'm0' }, depth: 0.38, polarity: 1, decay: 0.16 },
  ];

  const p = makePattern([t0, t1, t2, t3, t4, t5], routes);
  p.bpm = 133;
  p.tracks.forEach((t) => { t.swing = 0; }); // straight, driving

  // FX loop: acid + stab into a hard RAT then a big dark Reverb (grind, then dread).
  p.fx.loops[0].pedals[3] = { type: 'rat', bypass: false, params: [0.8, 0.42, 0.5], toggles: [], sw2: false };
  p.fx.loops[0].pedals[2] = { type: 'reverb', bypass: false, params: [0.82, 0.3, 0.15, 0.2, 0.85, 0.5], toggles: [false], sw2: false };
  p.fx.loops[0].return = { level: 0.92, pan: 0 };
  return p;
}
