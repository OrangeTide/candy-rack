// SPDX-License-Identifier: 0BSD

// The default 6-track pattern: 1980s electro-funk in the Afrika Bambaataa
// "Planet Rock" / Cybotron "Clear" mold. A mechanical 808/909 backbone (kick,
// snare, clap straight; hats and percussion lightly swung) under a syncopated
// 303 square bass, a staccato DX-style solid-bass double, offset FM sci-fi
// stabs, and a muted vocoder hook to bring in. The 16-step drums loop twice under the
// 32-step synths, so the synth phrases shift against the beat. Kept free of any
// DOM or audio dependency so both the UI (main.js) and the offline mix renderer
// build the same groove.
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

// Paint one kit part's row. Drums are one-shot and tuned by the part's params,
// so only on/velocity matter here.
function paintKit(kit, part, positions, vel) {
  for (const pos of positions) {
    const s = kit.parts[part].lane[pos];
    s.on = true;
    if (vel != null) s.velocity = vel;
  }
}

export function freshPattern() {
  // --- T0 DRUMS (KIT, straight): the mechanical Planet Rock backbone. Kick on
  // 1/4/7/9/12 (the 9 and 12 double-hit is the signature syncopation), snare on
  // the 2 and 4, an 808 clap layered over the snare plus a sneaky pull on the &
  // of 3. All dead straight, no swing. ---
  const t0 = makeTrack('kit', [0, 0, 0, 0, 0]);
  t0.parts[0] = { type: 'kick', mute: false, params: [0.12, 0.72, 0.4, 0.3, 0.35], lane: t0.parts[0].lane };   // 808 boom, pitched down, long tail
  t0.parts[1] = { type: 'snare', mute: false, params: [0.4, 0.35, 0.55, 0.6, 0.25], lane: t0.parts[1].lane };
  t0.parts[2] = { type: 'clap', mute: false, params: [0.5, 0.4, 0.5, 0.5, 0.2], lane: t0.parts[2].lane };
  // parts[3] left unused: the straight group is only kick/snare/clap.
  paintKit(t0, 0, [0, 3, 6, 8, 11], 108);   // kick 1,4,7,9,12
  t0.parts[0].lane[0].velocity = 127;        // downbeat: max velocity and tail
  paintKit(t0, 1, [4, 12], 100);             // snare on 2 and 4
  paintKit(t0, 2, [4, 11, 12], 96);          // clap layered on 2/4 + a pull on the & of 3

  // --- T1 PERC (KIT, light swing): continuous 16th closed hats, open hats on the
  // off-beats, a syncopated cowbell (pitched up to cut), and a conga/tom. Swung
  // ~56% for human bounce against the straight drums. ---
  const t1 = makeTrack('kit', [0, 0, 0, 0, 0]);
  t1.parts[0] = { type: 'hat', mute: false, params: [0.5, 0.06, 0.6, 0.5, 0.15], lane: t1.parts[0].lane };     // closed
  t1.parts[1] = { type: 'hat', mute: false, params: [0.5, 0.5, 0.6, 0.5, 0.15], lane: t1.parts[1].lane };      // open
  t1.parts[2] = { type: 'cowbell', mute: false, params: [0.72, 0.35, 0.6, 0.5, 0.2], lane: t1.parts[2].lane }; // pitched up
  t1.parts[3] = { type: 'drum', mute: false, params: [0.42, 0.28, 0.5, 0.4, 0.2], lane: t1.parts[3].lane };    // conga/tom
  paintKit(t1, 0, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 56); // steady 16th closed hats
  paintKit(t1, 1, [2, 6, 10, 14], 70);       // open hats on the off-beats
  paintKit(t1, 2, [0, 3, 5, 8, 11, 13], 80); // driving cowbell
  paintKit(t1, 3, [1, 7, 9, 14], 76);        // conga/tom accents

  // --- T2 303 BASS (ACID, 32 steps): the driving square bassline. Low reso, a
  // punchy filter env, accents on the down-beats, and liquid slides for the
  // Cybotron feel. Notes are the blueprint line raised one octave so the synth
  // sings instead of rumbling sub-audio (C2 register). Key is C minor pentatonic
  // (C, Eb, F, G, Bb). ---
  const t2 = makeTrack('acid', [0.42, 0.24, 0.55, 0.4, 0.32]); // cutoff, reso(low), env, decay, slide
  t2.toggles = [true, true]; // square + sub-octave for weight
  t2.length = 32;
  const bass = {
    0: 36, 2: 36, 4: 39, 6: 36, 8: 41, 10: 41, 12: 39, 14: 34, 15: 36,       // bar 1-2
    16: 36, 18: 36, 20: 39, 22: 43, 24: 41, 26: 39, 28: 34, 29: 36, 30: 38, 31: 39, // bar 3-4
  };
  for (const [pos, note] of Object.entries(bass)) {
    const s = t2.main[+pos]; s.on = true; s.note = note; s.gateLen = 0.5; s.velocity = 98;
  }
  [0, 4, 8, 12, 16, 20, 26].forEach((i) => { t2.alt[i].on = true; });   // accents (alt lane)
  [8, 22, 28, 29].forEach((i) => { t2.main[i].slide = true; });         // liquid glides

  // --- T3 SOLID BASS (DX100, 32 steps): a tight metallic FM double of the 303
  // root on the key accents, ultra-staccato so the digital transient snaps and
  // then goes dead silent (the electro bounce). ---
  const t3 = makeTrack('dx100', [0.28, 0.5, 0.35, 0.18, 0.2]);
  t3.toggles = [false, true]; // Bright: extra FM bite
  t3.length = 32;
  paint(t3, 'main', [0, 4, 11, 16, 20, 27], { note: 36, gate: 0.1, vel: 96 }); // root C2, staccato
  t3.main[0].velocity = 110;

  // --- T4 SCI-FI STABS (2-OP FM, 32 steps): bright FM bell/marimba hits on an
  // offset grid, so the 9-note phrase drifts against the 16-step drums across the
  // 4-bar cycle. A C-minor-pentatonic arp up and back down. ---
  const t4 = makeTrack('fm2', [0.5, 0.55, 0.2, 0.25, 0.15]);
  t4.length = 32;
  const arp = { 2: 60, 5: 63, 7: 67, 10: 70, 13: 72, 18: 70, 21: 67, 26: 63, 29: 60 };
  for (const [pos, note] of Object.entries(arp)) {
    const s = t4.main[+pos]; s.on = true; s.note = note; s.gateLen = 0.2; s.velocity = 90;
  }

  // --- T6 VOCODER HOOK (VOWEL, starts MUTED): the electro-funk talkbox, kept as
  // a variation to bring in. Four held notes tied across four steps each; the
  // auto-vowel LFO sweeps the formant a-e-i-o-u so it "sings" a robotic hook over
  // the sustain. Unmute T6 to bring in the vocoder. ---
  const t5 = makeTrack('vowel', [0.3, 0.5, 0.65, 0.45, 0.3]);
  t5.mute = true;
  for (const [start, note] of [[0, 60], [4, 63], [8, 67], [12, 65]]) { // C4 Eb4 G4 F4
    for (let i = 0; i < 4; i++) {
      const s = t5.main[start + i];
      s.on = true; s.note = note; s.gateLen = 0.9; s.velocity = 96;
      if (i > 0) s.tie = true;
    }
  }

  // Output stage. Bass and drums punchy and dry; stabs pushed into the space.
  t0.output.send = 0;
  t1.output.send = 0.12;                       // a little air on the hats/claps
  t2.output.hp = 0.05; t2.output.send = 0.05;  // high-pass the 303 out of the kick's way
  t3.output.send = 0;  t3.output.vca = 0.85;   // solid bass tight and dry
  t4.output.cutoff = 0.7; t4.output.pan = 0.25; t4.output.send = 0.55; // FM stabs right, echoed
  t5.output.cutoff = 0.62; t5.output.pan = -0.2; t5.output.send = 0.4; // vocoder left, some space

  const routes = [
    // The kick ducks the 303 bass (T2) VCA: the four-on-the-floor sidechain pump.
    { src: { type: 'trig', track: 0, lane: 'part0', rateHz: 2, shape: 'sine' },
      dest: { track: 2, param: 'vca' }, depth: 0.45, polarity: -1, decay: 0.16 },
    // A slow 2-bar synced LFO sweeps the FM stab filter for a futuristic shimmer.
    { src: { type: 'lfo', track: 0, lane: 'main', sync: 8, shape: 'tri' },
      dest: { track: 4, param: 'cutoff' }, depth: 0.25, polarity: 1, decay: 0.16 },
    // Auto-vowel: a 1-bar synced LFO sweeps the muted vocoder hook (T6) through
    // a-e-i-o-u so it talks across the held notes. m0 is the Vowel knob.
    { src: { type: 'lfo', track: 0, lane: 'main', sync: 4, shape: 'sine' },
      dest: { track: 5, param: 'm0' }, depth: 0.9, polarity: 1, decay: 0.16 },
  ];

  const p = makePattern([t0, t1, t2, t3, t4, t5], routes);
  p.bpm = 128;
  p.tracks.forEach((t) => { t.swing = 0; });
  t1.swing = 0.16; // hats and percussion get the light electro swing; the rest stays straight

  // FX: the stabs and the orchestra hit go wide through Dimension, into a ping-pong
  // Echo for the sci-fi delay, then a bright plate. Signal enters at D, leaves at A.
  p.fx.loops[0].pedals[3] = { type: 'dim', bypass: false, params: [0.45, 0.65], toggles: [false, true, false], sw2: false };
  p.fx.loops[0].pedals[2] = { type: 'echo', bypass: false, params: [0.4, 0.4, 0.2, 0.45, 0.25, 0.45], toggles: [true], sw2: false };
  p.fx.loops[0].pedals[1] = { type: 'reverb', bypass: false, params: [0.55, 0.45, 0.1, 0.2, 0.8, 0.35], toggles: [false], sw2: false };
  p.fx.loops[0].return = { level: 0.85, pan: 0 };
  return p;
}
