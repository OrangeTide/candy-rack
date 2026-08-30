// SPDX-License-Identifier: 0BSD

// Peppermint starter: chiptune / bitpop, all six channels on the PULSE engine like
// an NES with expansion chips. LFSR noise drums, a quantised triangle bass, an
// arpeggiated pulse chord channel (the fast arp faking a chord), a pentatonic
// pulse melody, a higher sparkle arp, and a soft square pad. An A-minor i-iv-v
// (Am-Dm-Em) vamp, tight and fast at 150 bpm. DOM-free so the app and offline
// renderer share it.
import { makeTrack, makePattern } from '../../core/sequencer.js';

export const TRACKS = 6;

function paintMap(track, map, gate) {
  for (const [pos, nv] of Object.entries(map)) {
    const s = track.main[+pos];
    s.on = true; s.note = nv[0]; s.velocity = nv[1]; s.gateLen = gate;
  }
}

// Hold a note across a run of steps (tied after the first), so the arp keeps
// cycling on a sustained chord root.
function holdRange(track, start, count, note, vel) {
  for (let i = 0; i < count; i++) {
    const s = track.main[start + i];
    s.on = true; s.note = note; s.gateLen = 0.98; s.velocity = vel;
    if (i > 0) s.tie = true;
  }
}

export function freshPattern() {
  // --- T0 drums (PULSE Noise): the LFSR noise channel. Low note = kick, mid =
  // snare, high = hat, all short. ---
  const t0 = makeTrack('pulse', [0.5, 0.0, 0.5, 0.12, 0.0]);
  t0.toggles = [false, true, false]; // Noise
  paintMap(t0, { 0: [45, 110], 2: [90, 55], 4: [74, 92], 6: [90, 50], 8: [45, 105], 10: [90, 55], 11: [45, 78], 12: [74, 92], 14: [90, 58] }, 0.12);
  t0.output.cutoff = 0.9;

  // --- T1 bass (PULSE Tri): the triangle channel, a driving octave-bounce root
  // line following Am -> Dm -> Em -> Am ---
  const t1 = makeTrack('pulse', [0.5, 0.0, 0.5, 0.4, 0.0]);
  t1.toggles = [true, false, false]; // Tri
  paintMap(t1, { 0: [33, 100], 2: [45, 80], 4: [38, 95], 6: [50, 78], 8: [40, 95], 10: [52, 78], 12: [33, 98], 14: [45, 80] }, 0.35);
  t1.output.vca = 0.9;

  // --- T2 chord arp (PULSE, Arp = min): the signature. Each chord root is held
  // while the arpeggiator cycles the minor triad fast, so the mono channel reads
  // as a chord. A thin 12.5%-ish duty for the classic nasal lead. ---
  const t2 = makeTrack('pulse', [0.15, 0.5, 0.85, 0.85, 0.08]); // Arp knob 0.5 -> 'min'
  holdRange(t2, 0, 4, 57, 84);  // Am (A3)
  holdRange(t2, 4, 4, 62, 82);  // Dm (D4)
  holdRange(t2, 8, 4, 64, 82);  // Em (E4)
  holdRange(t2, 12, 4, 57, 84); // Am (A3)
  t2.output.send = 0.3; t2.output.vca = 0.7;

  // --- T3 melody (PULSE): a catchy A-minor-pentatonic lead, 25% duty ---
  const t3 = makeTrack('pulse', [0.25, 0.0, 0.5, 0.5, 0.05]);
  paintMap(t3, { 0: [69, 95], 2: [72, 82], 4: [74, 86], 7: [72, 78], 8: [69, 88], 10: [67, 80], 12: [64, 82], 14: [69, 84] }, 0.4);
  t3.output.pan = -0.15; t3.output.send = 0.4;

  // --- T4 sparkle arp (PULSE, Arp = min): a higher, quieter chord arp, panned
  // right, a very thin duty and a faster rate ---
  const t4 = makeTrack('pulse', [0.1, 0.5, 0.95, 0.7, 0.0]);
  holdRange(t4, 0, 4, 69, 60);  // A4
  holdRange(t4, 4, 4, 74, 58);  // D5
  holdRange(t4, 8, 4, 76, 58);  // E5
  holdRange(t4, 12, 4, 69, 60); // A4
  t4.output.vca = 0.4; t4.output.pan = 0.3; t4.output.send = 0.5;

  // --- T5 pad (PULSE, 50% square): a soft, dark sustained root under it all,
  // panned left for body ---
  const t5 = makeTrack('pulse', [0.5, 0.0, 0.5, 0.7, 0.0]);
  holdRange(t5, 0, 4, 45, 46);  // A2
  holdRange(t5, 4, 4, 50, 44);  // D3
  holdRange(t5, 8, 4, 52, 44);  // E3
  holdRange(t5, 12, 4, 45, 46); // A2
  t5.output.cutoff = 0.6; t5.output.vca = 0.35; t5.output.pan = -0.25; t5.output.send = 0.3;

  const routes = [
    // A fast LFO wobbles the melody's pulse width (PWM), a classic chip shimmer.
    { src: { type: 'lfo', track: 0, lane: 'main', rateHz: 5, shape: 'sine' },
      dest: { track: 3, param: 'm0' }, depth: 0.2, polarity: 1, decay: 0.16 },
    // A slow 2-bar synced LFO opens the pad filter for movement.
    { src: { type: 'lfo', track: 0, lane: 'main', sync: 8, shape: 'tri' },
      dest: { track: 5, param: 'cutoff' }, depth: 0.25, polarity: 1, decay: 0.16 },
  ];

  const p = makePattern([t0, t1, t2, t3, t4, t5], routes);
  p.bpm = 150;
  p.tracks.forEach((t) => { t.swing = 0; }); // tight and straight

  // FX: a little width, a bright chip echo, and a small room. Signal enters at D
  // (pedals[3]) and leaves at A (pedals[0]).
  p.fx.loops[0].pedals[3] = { type: 'dim', bypass: false, params: [0.35, 0.6], toggles: [true, false, false], sw2: false };
  p.fx.loops[0].pedals[2] = { type: 'echo', bypass: false, params: [0.3, 0.4, 0.15, 0.7, 0.15, 0.35], toggles: [true], sw2: false };
  p.fx.loops[0].pedals[1] = { type: 'reverb', bypass: false, params: [0.4, 0.6, 0.1, 0.15, 0.7, 0.2], toggles: [false], sw2: false };
  p.fx.loops[0].return = { level: 0.7, pan: 0 };
  return p;
}
