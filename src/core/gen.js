// SPDX-License-Identifier: 0BSD

// Generative modulation source core, shared by the realtime mod matrix and the
// offline renderer so both produce the identical sequence. A GEN source hybridizes
// a Turing Machine (looping shift register) and Marbles (clocked statistical
// random with a deja-vu loop) under one switchable mode, sharing a clock and loop.
// The RNG is seeded and deterministic, so an exported WAV matches playback and a
// locked loop repeats exactly. See docs/GEN-SOURCE-DESIGN.md.

// mulberry32: a small, fast, seeded PRNG. Deterministic per seed.
export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fresh generative state for one route. `value` holds the last generated value.
export function makeGen(seed) {
  return { rng: makeRng(seed), bits: ((seed >>> 0) & 0xFFFF) | 1, buf: [], len: 0, pos: 0, value: 0 };
}

// Advance one clock; returns the new value in [0,1] (also stored in g.value).
// mode: 'turing' | 'marbles'. length 1..16 = loop length. lock 0..1 = deja-vu:
// 1 = locked repeat, 0 = fully random, in between = evolving.
export function genAdvance(g, mode, length, lock) {
  const L = Math.max(1, Math.min(16, length | 0));
  const lk = lock < 0 ? 0 : lock > 1 ? 1 : lock;
  if (mode === 'marbles') {
    // A loop buffer of length L; each clock either replays the stored slot
    // (deja-vu) or overwrites it with a new random draw, then steps the position.
    if (g.len !== L) { g.buf = Array.from({ length: L }, () => g.rng()); g.len = L; g.pos = 0; }
    if (g.rng() >= lk) g.buf[g.pos] = g.rng(); // not replaying -> new value
    g.value = g.buf[g.pos];
    g.pos = (g.pos + 1) % L;
    return g.value;
  }
  // turing: an L-bit shift register. The bit shifted out is fed back, flipped
  // with a chance that falls to 0 as lock -> 1 (locked loop) and rises to 0.5 as
  // lock -> 0 (fully random). The low bits read out as a stepped value.
  const outBit = (g.bits >>> (L - 1)) & 1;
  const inBit = g.rng() < (1 - lk) * 0.5 ? outBit ^ 1 : outBit;
  g.bits = ((g.bits << 1) | inBit) & 0xFFFF;
  const rb = Math.min(8, L);
  g.value = (g.bits & ((1 << rb) - 1)) / ((1 << rb) - 1);
  return g.value;
}

// Scale tables (semitone offsets within an octave) for the pitch destination.
const SCALES = {
  off: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentaMin: [0, 3, 5, 7, 10],
};
export const GEN_MODES = ['turing', 'marbles'];
export const GEN_SCALES = ['off', 'major', 'minor', 'pentaMin'];

// Map a 0..1 value to a semitone offset, quantized to `scale` over `octaves`.
export function quantizePitch(value, scale, octaves) {
  const sc = SCALES[scale] || SCALES.off;
  const oct = octaves < 1 ? 1 : octaves > 4 ? 4 : (octaves | 0) || 2;
  const total = sc.length * oct;
  let idx = Math.floor((value < 0 ? 0 : value > 1 ? 1 : value) * total);
  if (idx >= total) idx = total - 1;
  return Math.floor(idx / sc.length) * 12 + sc[idx % sc.length];
}
