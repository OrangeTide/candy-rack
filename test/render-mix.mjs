// PUBLIC DOMAIN (CC0-1.0)
// This script has no copyright. See https://creativecommons.org/publicdomain/zero/1.0/
//
// Render the full 6-track starter pattern, including the mixer and modulation
// matrix, to a stereo WAV so you can hear the whole groove from the command
// line. Uses the shared offline renderer (src/core/offline-render.js) so it
// matches the in-browser WAV recorder exactly.
//
// Run:   MACHINE=grape node test/render-mix.mjs [seconds] [outfile]
//        make mix
// Then:  ffplay -autoexit build/preview-mix.wav

import { writeFileSync, mkdirSync } from 'node:fs';
import { engines } from '../src/core/worklet/registry.js';
import { renderPattern } from '../src/core/offline-render.js';

const SR = 48000;
const machine = process.env.MACHINE || 'grape';
const seconds = Number(process.argv[2]) || 4;
const out = process.argv[3] || `build/preview-${machine}.wav`;
const { freshPattern } = await import(`../src/programs/machines/${machine}.js`);

const pattern = freshPattern();
// One seamless loop, then tiled to fill the requested preview length.
const loop = renderPattern(pattern, { sampleRate: SR, engines, mode: 'loop' });
const total = Math.floor(seconds * SR);
const left = new Float32Array(total);
const right = new Float32Array(total);
for (let i = 0; i < total; i++) {
  const j = i % loop.length;
  left[i] = loop.left[j];
  right[i] = loop.right[j];
}

function writeWavStereo(path, l, r, sr) {
  const n = l.length;
  const b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 4, 4);
  b.write('WAVE', 8);
  b.write('fmt ', 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(2, 22);      // stereo
  b.writeUInt32LE(sr, 24);
  b.writeUInt32LE(sr * 4, 28); // byte rate (2 ch * 2 bytes)
  b.writeUInt16LE(4, 32);      // block align
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    b.writeInt16LE(Math.max(-32768, Math.min(32767, (l[i] * 32767) | 0)), 44 + i * 4);
    b.writeInt16LE(Math.max(-32768, Math.min(32767, (r[i] * 32767) | 0)), 44 + i * 4 + 2);
  }
  writeFileSync(path, b);
}

mkdirSync('build', { recursive: true });
writeWavStereo(out, left, right, SR);
console.log(`wrote ${out} (${seconds}s, 6-track starter + mixer + mod matrix at ${pattern.bpm} bpm)`);
