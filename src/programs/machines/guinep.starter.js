// SPDX-License-Identifier: 0BSD

// Guinep starter: dub techno. A deep, minimal four-on-the-floor under the genre's
// signature: an off-beat minor-chord stab drowned in Dimension chorus, tape echo,
// and a long dark reverb (the Basic Channel / Rhythm & Sound chord). A hypnotic
// root sub, a dark warm pad bed, a sparse higher chord answer, and a distant airy
// top. A minor, spacious and slow. DOM-free so the app and offline renderer share
// it.
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

// A held pad: every step carries the note, tied after the first so the voice
// sustains instead of re-attacking (poly cross-loop hold keeps it seamless).
function hold(track, note, vel) {
  for (let i = 0; i < 16; i++) { const s = track.main[i]; s.on = true; s.note = note; s.gateLen = 0.98; s.velocity = vel; if (i > 0) s.tie = true; }
}

export function freshPattern() {
  // --- drums: a deep, minimal 909 four-on-the-floor with a soft off-beat hat ---
  const t0 = makeTrack('kit', [0, 0, 0, 0, 0]);
  t0.parts[0] = { type: 'kick', mute: false, params: [0.16, 0.66, 0.42, 0.4, 0.22], lane: t0.parts[0].lane };  // deep, round
  t0.parts[1] = { type: 'snare', mute: false, params: [0.42, 0.2, 0.55, 0.5, 0.2], lane: t0.parts[1].lane };   // soft rim tick
  t0.parts[2] = { type: 'hat', mute: false, params: [0.5, 0.05, 0.6, 0.5, 0.18], lane: t0.parts[2].lane };     // closed
  t0.parts[3] = { type: 'hat', mute: false, params: [0.5, 0.44, 0.6, 0.5, 0.18], lane: t0.parts[3].lane };     // open
  paintKit(t0, 0, [0, 4, 8, 12], 110);              // kick 4-on-the-floor
  paintKit(t0, 1, [4, 12], 54);                     // faint rim on the backbeat
  paintKit(t0, 2, [2, 6, 10, 14], 48);              // quiet off-beat closed hats
  paintKit(t0, 3, [14], 56);                        // one open hat into the turnaround

  // --- THE dub chord: an Am7 stab on every off-beat 8th, dark and short, sent
  // hard into the Dimension -> Echo -> Reverb chain (the whole genre lives here) ---
  const t1 = makeTrack('chord', [0.59, 0.3, 0.4, 0.28, 0.12]); // min7 (idx 9/16), soft, short
  paint(t1, 'main', [2, 6, 10, 14], { note: 45, gate: 0.26, vel: 96 }); // A2 off-beats
  t1.output.cutoff = 0.5;   // rolled off, the reverb does the rest
  t1.output.send = 0.9;

  // --- sub bass: a hypnotic root A pulse, deep and dry (kept out of the wash) ---
  const t2 = makeTrack('sh101', [0.2, 0.2, 0.15, 0.65, 0.0]);
  t2.toggles = [false, true, false]; // saw + sub-octave
  paint(t2, 'main', [0, 8], { note: 33, gate: 0.6, vel: 96 });  // A1 on 1 and 3
  paint(t2, 'main', [11], { note: 33, gate: 0.4, vel: 80 });    // a ghost push
  t2.output.cutoff = 0.24;
  t2.output.vca = 0.72;

  // --- pad bed: a dark warm supersaw drone on A3, ducked by the kick (breathes) ---
  const t3 = makeTrack('supersaw', [0.5, 0.7, 0.3, 0.0, 0.08]);
  hold(t3, 57, 46); // A3
  t3.output.cutoff = 0.3;
  t3.output.vca = 0.42;
  t3.output.send = 0.4;

  // --- chord answer: a sparse, higher Am9 that replies to the main stab, panned
  // right and drowned even deeper in the hall ---
  const t4 = makeTrack('chord', [0.906, 0.25, 0.35, 0.32, 0.08]); // min9 (idx 14/16)
  paint(t4, 'main', [7, 15], { note: 57, gate: 0.3, vel: 76 });   // A3, the & of 2 and 4
  t4.output.cutoff = 0.55;
  t4.output.pan = 0.3;
  t4.output.send = 0.95;

  // --- airy top: a distant held "aah" fifth, panned left, drifting under an LFO ---
  const t5 = makeTrack('vowel', [0.25, 0.55, 0.5, 0.9, 0.05]);
  hold(t5, 64, 40); // E4
  t5.output.cutoff = 0.7;
  t5.output.vca = 0.32;
  t5.output.pan = -0.2;
  t5.output.send = 0.6;

  const routes = [
    // The kick ducks the pad bed: the gentle dub-techno pump (breath, not slam).
    { src: { type: 'trig', track: 0, lane: 'part0', rateHz: 2, shape: 'sine' },
      dest: { track: 3, param: 'vca' }, depth: 0.4, polarity: -1, decay: 0.18 },
    // A slow 4-bar synced LFO opens and closes the dub chord's filter: the wash
    // swells and pulls back over the loop.
    { src: { type: 'lfo', track: 0, lane: 'main', sync: 16, shape: 'tri' },
      dest: { track: 1, param: 'cutoff' }, depth: 0.28, polarity: 1, decay: 0.16 },
    // A second slow LFO drifts the airy top so it never sits still.
    { src: { type: 'lfo', track: 0, lane: 'main', sync: 16, shape: 'sin', phase: 0.5 },
      dest: { track: 5, param: 'cutoff' }, depth: 0.2, polarity: 1, decay: 0.16 },
  ];

  const p = makePattern([t0, t1, t2, t3, t4, t5], routes);
  p.bpm = 124;
  p.tracks.forEach((t) => { t.swing = 0; }); // straight, hypnotic

  // FX: the chords go into Dimension (widen) -> Echo (dub tape delay) -> a long
  // dark Reverb. Signal enters at D (pedals[3]) and leaves at A (pedals[0]).
  p.fx.loops[0].pedals[3] = { type: 'dim', bypass: false, params: [0.5, 0.7], toggles: [false, true, false], sw2: false };
  p.fx.loops[0].pedals[2] = { type: 'echo', bypass: false, params: [0.42, 0.5, 0.25, 0.4, 0.32, 0.5], toggles: [true], sw2: false };
  p.fx.loops[0].pedals[1] = { type: 'reverb', bypass: false, params: [0.82, 0.35, 0.22, 0.25, 0.85, 0.5], toggles: [false], sw2: false };
  p.fx.loops[0].return = { level: 0.9, pan: 0 };
  return p;
}
