// PUBLIC DOMAIN (CC0-1.0)
// This script has no copyright. See https://creativecommons.org/publicdomain/zero/1.0/
//
// Render one engine playing a short riff to a 16-bit mono WAV so you can listen
// to it from the command line without a browser. Reuses the real DSP through the
// worklet engine registry.
//
// Run:   node test/render-wav.mjs <engine> [outfile]
//        make wav ENGINE=fm2
// Then:  ffplay -autoexit build/preview-fm2.wav   (or: aplay, afplay, paplay)

import { writeFileSync, mkdirSync } from 'node:fs';
import { engines } from '../src/core/worklet/registry.js';

const id = process.argv[2] || 'fm2';
const desc = engines[id];
if (!desc) {
  console.error(`unknown engine "${id}". known: ${Object.keys(engines).join(', ')}`);
  process.exit(1);
}
const out = process.argv[3] || `build/preview-${id}.wav`;
// Optional engine toggles as a comma list, e.g. "1,0,0" to audition switch 1.
const toggles = (process.argv[4] || '').split(',').map((s) => s.trim() === '1');
while (toggles.length < 3) toggles.push(false);

const SR = 48000;
const POLY = 8;
const params = desc.defaults.slice();

// Minimal offline copy of the worklet host: a voice pool with round-robin steal.
const pool = Array.from({ length: POLY }, () => new desc.Voice(SR));
const stereo = typeof pool[0].renderStereo === 'function';
let rr = 0;
function alloc() {
  for (const v of pool) if (!v.active) return v;
  const v = pool[rr % POLY];
  rr += 1;
  return v;
}
function fire(note, gateSec) {
  for (const off of desc.notesFor(note, params)) {
    const freq = 440 * Math.pow(2, (note - 69 + off) / 12);
    alloc().noteOn({ freq, note, vel: 110, gateSec, params, toggles });
  }
}

const bpm = 120;
const stepDur = 60 / bpm / 4; // 16th note
const riff = [60, 63, 67, 70, 72, 70, 67, 63, 60, 67, 63, 58, 60, 65, 67, 72];
const tailSec = 1.0;
const total = Math.floor((riff.length * stepDur + tailSec) * SR);
const bufL = new Float32Array(total);
const bufR = new Float32Array(total);

let stepIdx = 0;
for (let i = 0; i < total; i++) {
  const t = i / SR;
  while (stepIdx < riff.length && t >= stepIdx * stepDur) {
    fire(riff[stepIdx], stepDur * 0.9);
    stepIdx += 1;
  }
  let l = 0;
  let r = 0;
  for (const v of pool) {
    if (!v.active) continue;
    if (stereo) { v.renderStereo(); l += v.outL; r += v.outR; }
    else { const s = v.render(); l += s; r += s; }
  }
  bufL[i] = Math.tanh(l * 0.6 * 1.2); // matches the runtime output soft clip
  bufR[i] = Math.tanh(r * 0.6 * 1.2);
}

// 16-bit WAV, mono or interleaved stereo.
function writeWav(path, left, right, sr, channels) {
  const n = left.length;
  const dataSize = n * channels * 2;
  const b = Buffer.alloc(44 + dataSize);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + dataSize, 4);
  b.write('WAVE', 8);
  b.write('fmt ', 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(channels, 22);
  b.writeUInt32LE(sr, 24);
  b.writeUInt32LE(sr * channels * 2, 28);
  b.writeUInt16LE(channels * 2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(dataSize, 40);
  let o = 44;
  const clamp = (x) => Math.max(-1, Math.min(1, x));
  for (let i = 0; i < n; i++) {
    b.writeInt16LE((clamp(left[i]) * 32767) | 0, o); o += 2;
    if (channels === 2) { b.writeInt16LE((clamp(right[i]) * 32767) | 0, o); o += 2; }
  }
  writeFileSync(path, b);
}

mkdirSync('build', { recursive: true });
writeWav(out, bufL, bufR, SR, stereo ? 2 : 1);
console.log(`wrote ${out} (${(total / SR).toFixed(1)}s, engine "${id}"${stereo ? ', stereo' : ''})`);
