// SPDX-License-Identifier: 0BSD

// Coconut starter: generative ambient. The showcase for the GEN source -- two
// fully generative voices, each with an empty step lane driven by a GEN -> gate
// route (the rhythm) and a GEN -> pitch route (the melody), so they play evolving
// lines that never quite repeat. Under them: a low A drone, an Am chord pad, a
// supersaw pad breathed by a tempo-synced filter LFO, and a choir, all in a big
// hall. Slow and spacious. DOM-free so the app and offline renderer share it.
import { makeTrack, makePattern } from '../../core/sequencer.js';

export const TRACKS = 6;

function hold(track, note, vel, cutoff) {
  for (let i = 0; i < 16; i++) { const s = track.main[i]; s.on = true; s.note = note; s.gateLen = 0.98; s.velocity = vel; if (i > 0) s.tie = true; }
  if (cutoff != null) track.output.cutoff = cutoff;
}
// A generative voice: an empty lane (no steps ON) but every step carries a base
// pitch, so a GEN -> gate route fires it and a GEN -> pitch route transposes it.
function genVoice(track, base, ratio) {
  for (let i = 0; i < 16; i++) { track.main[i].note = base; track.main[i].velocity = 90; }
  track.ratio = ratio;
}

export function freshPattern() {
  // --- T0 EPIANO: the generative lead (bell). Gate + pitch make the melody. ---
  const t0 = makeTrack('epiano', [0.7, 0.35, 0.12, 0.5, 0.08]);
  genVoice(t0, 57, 0.5); // A3 base, half-speed (8th-note pace)
  t0.output.send = 0.5;

  // --- T1 SH-101 sub drone: a low A pedal tone under everything ---
  const t1 = makeTrack('sh101', [0.28, 0.2, 0.15, 0.85, 0.3]);
  t1.toggles = [false, true, true]; // saw + sub + slow attack
  hold(t1, 33, 60, 0.30); // A1
  t1.output.vca = 0.7;

  // --- T2 CHORD pad: a held Am9, washed into the hall ---
  const t2 = makeTrack('chord', [0.906, 0.25, 0.35, 0.95, 0.08]); // min9 (idx 14/16)
  hold(t2, 45, 62, 0.55); // A2
  t2.output.send = 0.7;

  // --- T3 SUPERSAW pad: a held A, its filter breathed by a 4-bar synced LFO ---
  const t3 = makeTrack('supersaw', [0.45, 0.6, 0.4, 0.0, 0.08]);
  hold(t3, 45, 50, 0.30); // A2
  t3.output.vca = 0.5;
  t3.output.send = 0.6;

  // --- T4 SH-101: the second generative voice (a soft plucked counterpoint) ---
  const t4 = makeTrack('sh101', [0.5, 0.3, 0.4, 0.28, 0.4]); // shorter decay = pluck
  t4.toggles = [false, false, false];
  genVoice(t4, 45, 0.5); // A2 base
  t4.output.send = 0.55;

  // --- T5 VOWEL choir: a held "aah" fifth, the airy top ---
  const t5 = makeTrack('vowel', [0.28, 0.55, 0.5, 0.9, 0.06]);
  hold(t5, 64, 48, 0.7); // E4
  t5.output.send = 0.7;
  t5.output.vca = 0.6;

  const routes = [
    // Generative lead (T0): a Turing rhythm gates it, a Marbles melody pitches it.
    { src: { type: 'gen', mode: 'turing', length: 8, lock: 0.6 }, dest: { track: 0, param: 'gate' }, depth: 1, polarity: 1 },
    { src: { type: 'gen', mode: 'marbles', length: 12, lock: 0.5, scale: 'minor', octaves: 2 }, dest: { track: 0, param: 'note' }, depth: 1, polarity: 1 },
    // Generative counterpoint (T4): sparser, more locked rhythm; pentatonic melody.
    { src: { type: 'gen', mode: 'turing', length: 6, lock: 0.78 }, dest: { track: 4, param: 'gate' }, depth: 1, polarity: 1 },
    { src: { type: 'gen', mode: 'marbles', length: 8, lock: 0.6, scale: 'pentaMin', octaves: 2 }, dest: { track: 4, param: 'note' }, depth: 1, polarity: 1 },
    // A slow 4-bar synced LFO breathes the supersaw pad's filter open and shut.
    { src: { type: 'lfo', track: 0, lane: 'main', sync: 16, shape: 'tri' }, dest: { track: 3, param: 'cutoff' }, depth: 0.3, polarity: 1, decay: 0.16 },
  ];

  const p = makePattern([t0, t1, t2, t3, t4, t5], routes);
  p.bpm = 78;
  p.tracks.forEach((t) => { t.swing = 0; });

  // FX: the generative voices and pads go wide through Dimension into a big hall.
  p.fx.loops[0].pedals[3] = { type: 'dim', bypass: false, params: [0.5, 0.7], toggles: [false, true, false], sw2: false };
  p.fx.loops[0].pedals[2] = { type: 'reverb', bypass: false, params: [0.9, 0.45, 0.3, 0.25, 0.85, 0.6], toggles: [false], sw2: false };
  p.fx.loops[0].return = { level: 0.9, pan: 0 };
  return p;
}
