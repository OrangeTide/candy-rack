// PUBLIC DOMAIN (CC0-1.0)
// This script has no copyright. See https://creativecommons.org/publicdomain/zero/1.0/
//
// Render the full 6-track starter pattern, including the modulation matrix, to a
// WAV so you can hear the whole groove and the sidechain from the command line.
// Uses the same starter pattern the UI loads and the same engine DSP, with a
// small offline model of the per-track voice host and the mod matrix.
//
// Run:   node test/render-mix.mjs [seconds] [outfile]
//        make mix
// Then:  ffplay -autoexit build/preview-mix.wav

import { writeFileSync, mkdirSync } from 'node:fs';
import { engines } from '../src/core/worklet/registry.js';
import { freshPattern } from '../src/programs/rack/starter.js';

const SR = 48000;
const POLY = 8;
const TWO_PI = Math.PI * 2;
const seconds = Number(process.argv[2]) || 4;
const out = process.argv[3] || 'build/preview-mix.wav';

const pattern = freshPattern();
const sixteenth = 60 / pattern.bpm / 4;

const nodes = pattern.tracks.map((track) => {
  const desc = engines[track.engine];
  return {
    track,
    desc,
    params: track.params.slice(),
    pool: Array.from({ length: POLY }, () => new desc.Voice(SR)),
    rr: 0,
    lp: 0,
    stepDur: sixteenth / track.ratio,
    cursor: { step: 0, nextTime: 0 },
  };
});

// Offline mod matrix: each route carries an LFO phase or a decaying trigger env.
const routes = pattern.routes.map((r) => ({
  ...r,
  _phase: 0,
  _env: 0,
  _decayCoef: Math.exp(-1 / (Math.max(0.02, r.decay || 0.15) * SR)),
}));

function lfoShape(shape, ph) {
  const x = ph / TWO_PI - Math.floor(ph / TWO_PI); // 0..1
  switch (shape) {
    case 'tri': return 1 - 4 * Math.abs(x - 0.5);
    case 'saw': return 2 * x - 1;
    case 'square': return x < 0.5 ? 1 : -1;
    default: return Math.sin(ph);
  }
}

function alloc(node) {
  for (const v of node.pool) if (!v.active) return v;
  const v = node.pool[node.rr % POLY];
  node.rr += 1;
  return v;
}

function fireStep(node, tIndex, pos) {
  const track = node.track;
  for (const lane of ['main', 'alt']) {
    const step = track[lane][pos];
    if (!step.on) continue;
    const gateSec = Math.max(0.01, step.gateLen * node.stepDur);
    for (const off of node.desc.notesFor(step.note, node.params)) {
      const freq = 440 * Math.pow(2, (step.note - 69 + off) / 12);
      alloc(node).noteOn({ freq, note: step.note, vel: step.velocity, gateSec, params: node.params });
    }
    // Fire matching trigger-bus routes.
    for (const r of routes) {
      if (r.src.type !== 'trig') continue;
      if (r.src.track !== tIndex) continue;
      if (r.src.lane !== 'both' && r.src.lane !== lane) continue;
      r._env = 1;
    }
  }
}

const total = Math.floor(seconds * SR);
const buf = new Float32Array(total);

for (let i = 0; i < total; i++) {
  const t = i / SR;

  // Advance sequencers.
  for (let n = 0; n < nodes.length; n++) {
    const node = nodes[n];
    if (node.track.mute) continue;
    while (t >= node.cursor.nextTime) {
      fireStep(node, n, node.cursor.step % node.track.length);
      node.cursor.step += 1;
      node.cursor.nextTime += node.stepDur;
    }
  }

  // Compute per-track modulation offsets for this sample.
  const modCut = new Array(nodes.length).fill(0);
  const modVca = new Array(nodes.length).fill(0);
  for (const r of routes) {
    let val;
    if (r.src.type === 'lfo') {
      val = lfoShape(r.src.shape, r._phase);
      r._phase += (TWO_PI * (r.src.rateHz || 2)) / SR;
    } else {
      val = r._env;
      r._env *= r._decayCoef;
    }
    const c = r.depth * r.polarity * val;
    if (r.dest.param === 'cutoff') modCut[r.dest.track] += c;
    else modVca[r.dest.track] += c;
  }

  // Render and mix.
  let mix = 0;
  for (let n = 0; n < nodes.length; n++) {
    const node = nodes[n];
    if (node.track.mute) continue;
    let s = 0;
    for (const v of node.pool) if (v.active) s += v.render();
    s *= 0.6;
    let cut = node.track.output.cutoff + modCut[n];
    cut = cut < 0 ? 0 : cut > 1 ? 1 : cut;
    const a = Math.max(0.0006, cut * cut);
    node.lp += (s - node.lp) * a;
    let vca = node.track.output.vca + modVca[n];
    vca = vca < 0 ? 0 : vca > 4 ? 4 : vca;
    mix += Math.tanh(node.lp * 1.2) * vca;
  }
  buf[i] = Math.tanh(mix * 0.5);
}

function writeWav(path, samples, sr) {
  const n = samples.length;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write('WAVE', 8);
  b.write('fmt ', 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24);
  b.writeUInt32LE(sr * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE((samples[i] * 32767) | 0, 44 + i * 2);
  writeFileSync(path, b);
}

mkdirSync('build', { recursive: true });
writeWav(out, buf, SR);
console.log(`wrote ${out} (${seconds}s, 6-track starter + mod matrix at ${pattern.bpm} bpm)`);
