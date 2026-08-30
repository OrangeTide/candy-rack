// SPDX-License-Identifier: 0BSD

// SAMPLE: a primitive ROMpler in the SP-404 / MC-303 spirit. Rather than ship
// recorded audio (which would carry a licence and bloat the single-file build),
// the factory ROM is synthesised in code at load, once per sample rate and cached,
// so it is small, copyright-free, and deterministic. Because the same Voice class
// runs in the worklet and in the offline renderer, a starter that plays the
// sampler renders identically offline.
//
// Playback: the buffer is read at a variable rate. In normal mode the played note
// sets the rate (so the sampler is a pitchable instrument, and low notes are the
// pitched-down vaporwave sound); in Slice mode the note instead selects one of 16
// equal slices played at native pitch (for chopping a break). A lo-fi Tone lowpass
// and a Crush (sample-rate plus bit reduction) give the SP-404 grit. A small
// gate envelope (attack, sustain while the step gate holds, release) shapes the
// amplitude and, with tie, holds a looped pad across the loop.
//
// Params (0..1) from sample-meta.js: [sample, start, length, tone, crush].
// Toggles: 0 = Loop, 1 = Reverse, 2 = Slice.
import { makeRng } from '../../gen.js';
import { KickVoice, SnareVoice, HatVoice } from './percussion.js';

// The Sample knob picks one of these ROM slots (floor(value * N)). Exported so the
// meta can label the knob with the slot names.
export const SAMPLE_SLOTS = ['Mall', 'Choir', 'Rhodes', 'Crackle', 'Break'];

const BASE_FREQ = 261.6256; // C4: the pitched ROM samples' native frequency (note 60)

const romCache = new Map();
function getRom(sr) {
  let rom = romCache.get(sr);
  if (!rom) { rom = buildRom(sr); romCache.set(sr, rom); }
  return rom;
}

// --- ROM builders (all deterministic) --------------------------------------

function normalize(buf, peak) {
  let m = 0;
  for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > m) m = a; }
  if (m > 1e-6) { const g = peak / m; for (let i = 0; i < buf.length; i++) buf[i] *= g; }
  return buf;
}

// Fade the ends so a one-shot that plays to the buffer end never clicks.
function fadeEnds(buf, sr) {
  const fi = Math.min(buf.length, Math.floor(0.003 * sr));
  const fo = Math.min(buf.length, Math.floor(0.012 * sr));
  for (let i = 0; i < fi; i++) buf[i] *= i / fi;
  for (let i = 0; i < fo; i++) buf[buf.length - 1 - i] *= i / fo;
  return buf;
}

// A soft attack / long body / gentle release amplitude shape for the pads.
function padEnv(buf, sr, atkSec, relSec) {
  const len = buf.length, atk = atkSec * sr, rel = relSec * sr;
  for (let i = 0; i < len; i++) {
    let e = 1;
    if (i < atk) e = i / atk;
    else if (i > len - rel) e = (len - i) / rel;
    buf[i] *= e;
  }
  return buf;
}

// A lush major-9 chord pad: the "mall muzak" sample. Pitched down and crushed it
// becomes the vaporwave hook.
function buildMall(sr) {
  const len = Math.floor(2.6 * sr);
  const buf = new Float32Array(len);
  const semis = [0, 4, 7, 11, 14]; // C E G B D = a Cmaj9
  for (const st of semis) {
    const f = BASE_FREQ * Math.pow(2, st / 12);
    for (const det of [-0.006, 0.006]) { // a chorused detune pair per note
      const inc = (2 * Math.PI * f * (1 + det)) / sr;
      let p1 = 0, p2 = 0, p3 = 0;
      for (let i = 0; i < len; i++) {
        p1 += inc; p2 += inc * 2; p3 += inc * 3;
        buf[i] += Math.sin(p1) + 0.4 * Math.sin(p2) + 0.2 * Math.sin(p3);
      }
    }
  }
  padEnv(buf, sr, 0.35, 0.55);
  return fadeEnds(normalize(buf, 0.85), sr);
}

// A resonant bandpass (RBJ cookbook) as a small closure, for the choir formants.
function bandpass(f0, q, sr) {
  const w0 = (2 * Math.PI * f0) / sr, cw = Math.cos(w0), sw = Math.sin(w0);
  const alpha = sw / (2 * q);
  const a0 = 1 + alpha;
  const b0 = alpha / a0, b2 = -alpha / a0, a1 = (-2 * cw) / a0, a2 = (1 - alpha) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => {
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

// An "aah" choir pad: detuned saws through the three aah formants.
function buildChoir(sr) {
  const len = Math.floor(2.6 * sr);
  const buf = new Float32Array(len);
  const semis = [0, 7, 12]; // an open C-G-C stack
  const forms = [[700, 8], [1220, 10], [2600, 12]];
  for (const st of semis) {
    const f = BASE_FREQ * Math.pow(2, st / 12);
    for (const det of [-0.004, 0.004]) {
      const bps = forms.map(([ff, q]) => bandpass(ff, q, sr));
      const inc = (f * (1 + det)) / sr;
      let ph = 0;
      for (let i = 0; i < len; i++) {
        ph += inc; if (ph >= 1) ph -= 1;
        const saw = 2 * ph - 1;
        let s = 0;
        for (let b = 0; b < bps.length; b++) s += bps[b](saw);
        buf[i] += s;
      }
    }
  }
  padEnv(buf, sr, 0.5, 0.6);
  return fadeEnds(normalize(buf, 0.8), sr);
}

// A soft FM electric-piano tone (a tine bell over a body), for melodic sampling.
function buildRhodes(sr) {
  const len = Math.floor(2.2 * sr);
  const buf = new Float32Array(len);
  const f = BASE_FREQ;
  const cInc = (2 * Math.PI * f) / sr, mInc = (2 * Math.PI * f * 14) / sr; // tine at 14x
  const ampDec = Math.exp(-1 / (0.9 * sr)), idxDec = Math.exp(-1 / (0.16 * sr));
  let cph = 0, mph = 0, amp = 1, idx = 3;
  for (let i = 0; i < len; i++) {
    cph += cInc; mph += mInc;
    buf[i] = Math.sin(cph + Math.sin(mph) * idx) * amp;
    amp *= ampDec; idx *= idxDec;
  }
  return fadeEnds(normalize(buf, 0.85), sr);
}

// A vinyl-crackle texture: low hiss plus sparse pops. Meant to be looped quietly.
function buildCrackle(sr) {
  const len = Math.floor(2.2 * sr);
  const buf = new Float32Array(len);
  const rng = makeRng(0x1337);
  let lp = 0;
  for (let i = 0; i < len; i++) {
    lp += ((rng() * 2 - 1) - lp) * 0.05;
    buf[i] = lp * 0.5;
  }
  const pops = Math.floor((len / sr) * 12);
  for (let p = 0; p < pops; p++) {
    const at = Math.floor(rng() * len);
    const amp = 0.3 + rng() * 0.6;
    for (let i = 0; i < 40 && at + i < len; i++) buf[at + i] += amp * Math.exp(-i / 8) * (rng() * 2 - 1);
  }
  return fadeEnds(normalize(buf, 0.7), sr);
}

// A one-bar funk drum break, rendered from the shared percussion voices, so a
// starter can chop it in Slice mode. Sliced into 16 sixteenth-note slots.
function buildBreak(sr) {
  const bpm = 95, steps = 16;
  const stepSec = 60 / bpm / 4;
  const len = Math.floor(steps * stepSec * sr);
  const buf = new Float32Array(len);
  const kp = [0.16, 0.5, 0.4, 0.4, 0.3], sp = [0.4, 0.35, 0.6, 0.6, 0.2], hp = [0.5, 0.1, 0.6, 0.5, 0.15];
  function addHit(V, params, step, note) {
    const v = new V(sr);
    v.noteOn({ note, vel: 110, params });
    let i = Math.floor(step * stepSec * sr);
    while (i < len && v.active) { buf[i] += v.render(); i++; }
  }
  [0, 6, 10].forEach((s) => addHit(KickVoice, kp, s, 36));
  [4, 12].forEach((s) => addHit(SnareVoice, sp, s, 60));
  [0, 2, 4, 6, 8, 10, 12, 14].forEach((s) => addHit(HatVoice, hp, s, 72));
  return fadeEnds(normalize(buf, 0.9), sr);
}

function buildRom(sr) {
  return [
    { buf: buildMall(sr), slices: 16 },
    { buf: buildChoir(sr), slices: 16 },
    { buf: buildRhodes(sr), slices: 16 },
    { buf: buildCrackle(sr), slices: 16 },
    { buf: buildBreak(sr), slices: 16 },
  ];
}

// --- the playback voice -----------------------------------------------------

export class SampleVoice {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.active = false;
    this.rom = getRom(sampleRate);
    this.p = [0, 0, 0.5, 0.6, 0];
    this.buf = this.rom[0].buf;
    this.pos = 0; this.startS = 0; this.endS = this.buf.length; this.dir = 1; this.rate = 1;
    this.loop = false; this.reverse = false; this.slice = false;
    this.note = 60; this.vel = 1;
    // gate envelope
    this.amp = 0; this.stage = 'idle'; this.t = 0; this.gateSamples = 1; this.released = false;
    this.atkInc = 1; this.relCoef = 0;
    // lo-fi state
    this.lp = 0; this.hv = 0; this.holdCnt = 0;
  }

  noteOn({ freq, note, vel, gateSec, params, toggles, tie }) {
    this.p = params;
    if (toggles) { this.loop = !!toggles[0]; this.reverse = !!toggles[1]; this.slice = !!toggles[2]; }
    this.note = note;
    this.vel = (vel ?? 100) / 127;
    this.gateSamples = Math.max(1, Math.floor((gateSec || 0.1) * this.sr));
    this.atkInc = 1 / (0.003 * this.sr);
    const relSec = 0.02 + (params[2] || 0) * 1.5; // Length sets the release tail
    this.relCoef = Math.exp(-1 / (relSec * this.sr));

    // Cross-loop hold: a tied trigger on a still-sounding voice re-arms the gate
    // without restarting playback, so a looped pad sustains seamlessly.
    if (tie && this.active && this.amp > 2e-3) {
      this.t = 0; this.released = false;
      if (this.stage === 'r') this.stage = 's';
      return;
    }

    const N = this.rom.length;
    const slot = Math.min(N - 1, Math.max(0, Math.floor((params[0] || 0) * N)));
    const def = this.rom[slot];
    this.buf = def.buf;
    const L = this.buf.length;
    if (this.slice) {
      const n = def.slices || 16;
      const idx = (((note - 60) % n) + n) % n;
      this.startS = Math.floor((idx / n) * L);
      this.endS = Math.floor(((idx + 1) / n) * L);
      this.rate = 1; // slices play at native pitch
    } else {
      this.startS = Math.floor((params[1] || 0) * (L - 1));
      this.endS = L;
      this.rate = (freq || BASE_FREQ) / BASE_FREQ; // the note sets the pitch
    }
    this.pos = this.reverse ? this.endS - 1 : this.startS;
    this.dir = this.reverse ? -1 : 1;
    this.amp = 0; this.stage = 'a'; this.t = 0; this.released = false;
    this.lp = 0; this.hv = 0; this.holdCnt = 0;
    this.active = true;
  }

  render() {
    if (!this.active) return 0;

    // gate envelope: attack, sustain while the gate holds, then release
    this.t += 1;
    if (!this.released && this.t >= this.gateSamples) { this.released = true; this.stage = 'r'; }
    if (this.stage === 'a') { this.amp += this.atkInc; if (this.amp >= 1) { this.amp = 1; this.stage = 's'; } }
    else if (this.stage === 'r') { this.amp *= this.relCoef; if (this.amp < 1e-4) { this.active = false; return 0; } }

    const buf = this.buf, L = buf.length;
    let rp = this.pos;
    if (rp < 0) rp = 0; else if (rp > L - 1) rp = L - 1;
    const i0 = rp | 0;
    const i1 = i0 + 1 < L ? i0 + 1 : i0;
    let s = buf[i0] + (buf[i1] - buf[i0]) * (rp - i0);

    // declick the region boundary (matters most for slice ends, which are not
    // faded in the ROM)
    const rem = this.dir > 0 ? this.endS - this.pos : this.pos - this.startS;
    if (rem < 48) s *= Math.max(0, rem / 48);

    // advance and wrap / end
    this.pos += this.dir * this.rate;
    if (this.loop) {
      const span = this.endS - this.startS;
      if (this.pos >= this.endS) this.pos -= span;
      else if (this.pos < this.startS) this.pos += span;
    } else if (this.pos >= this.endS || this.pos < this.startS) {
      // The sample or slice ran out (rather than the gate closing): stop here.
      // The boundary declick above has already faded the last samples to zero, so
      // this does not click, and it does not bleed into the next slice's audio.
      this.active = false;
    }

    // Tone: one-pole lowpass, lower = darker tape warmth
    const a = Math.max(0.02, this.p[3] * this.p[3]);
    this.lp += (s - this.lp) * a;
    s = this.lp;

    // Crush: sample-rate reduction (hold) plus bit reduction
    const crush = this.p[4];
    if (crush > 1e-3) {
      if (this.holdCnt <= 0) { this.hv = s; this.holdCnt = 1 + Math.floor(crush * 12); }
      this.holdCnt -= 1;
      s = this.hv;
      const levels = 2 + Math.round((1 - crush) * 62);
      s = Math.round(s * levels) / levels;
    }

    return s * this.amp * this.vel;
  }
}
