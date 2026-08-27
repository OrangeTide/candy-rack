// SPDX-License-Identifier: 0BSD

// Offline pattern renderer. Renders one pass through the pattern to stereo float
// buffers, deterministically and faster than real time, by reusing the exact
// engine sub-voice DSP and modelling the per-track output stage and the mod
// matrix. Shared by the in-browser WAV recorder and headless tooling.
//
// Three end modes:
//   oneshot: exactly the loop length; tails past the end are cut.
//   tails:   keep rendering past the end until the voices decay.
//   loop:    loop length, but the tail that rings past the end is wrapped and
//            mixed back onto the start, so the WAV repeats seamlessly.

const POLY = 8;
const TWO_PI = Math.PI * 2;

function lfoShape(shape, ph) {
  const x = ph / TWO_PI - Math.floor(ph / TWO_PI);
  switch (shape) {
    case 'tri': return 1 - 4 * Math.abs(x - 0.5);
    case 'saw': return 2 * x - 1;
    case 'square': return x < 0.5 ? 1 : -1;
    default: return Math.sin(ph);
  }
}

// The loop length in seconds: the longest track's loop time. A track loops in
// length * (one step) seconds, where a step is a 16th note scaled by its ratio.
export function loopSeconds(pattern) {
  const q = 60 / pattern.bpm / 4;
  let m = 0;
  for (const t of pattern.tracks) {
    const s = (t.length * q) / t.ratio;
    if (s > m) m = s;
  }
  return m;
}

export function renderPattern(pattern, { sampleRate = 48000, engines, mode = 'loop', maxTailSec = 8 } = {}) {
  const SR = sampleRate;
  const q = 60 / pattern.bpm / 4;
  const loopSamples = Math.max(1, Math.round(loopSeconds(pattern) * SR));
  const cap = loopSamples + Math.floor(maxTailSec * SR);

  const nodes = pattern.tracks.map((track) => {
    const desc = engines[track.engine] || engines.drum;
    const pool = Array.from({ length: POLY }, () => new desc.Voice(SR));
    return {
      track, desc,
      params: track.params.slice(),
      pool, rr: 0, lpL: 0, lpR: 0,
      stereo: typeof pool[0].renderStereo === 'function',
      stepDur: q / track.ratio,
      cursor: { step: 0, nextTime: 0 },
    };
  });

  const routes = (pattern.routes || []).map((r) => ({
    ...r, _phase: 0, _env: 0,
    _decayCoef: Math.exp(-1 / (Math.max(0.02, r.decay || 0.15) * SR)),
  }));

  function alloc(node) {
    for (const v of node.pool) if (!v.active) return v;
    const v = node.pool[node.rr % POLY];
    node.rr += 1;
    return v;
  }
  function fireStep(node, tIndex, pos) {
    const track = node.track;
    // Accent mode: only the main lane sounds, and a coincident alt trigger
    // accents it. Mirrors the runtime and the in-app scheduler.
    const accentMode = node.desc.altMode === 'accent';
    const lanes = accentMode ? ['main'] : ['main', 'alt'];
    for (const lane of lanes) {
      const step = track[lane][pos];
      if (!step.on) continue;
      const gateSec = Math.max(0.01, step.gateLen * node.stepDur);
      const accent = accentMode ? !!track.alt[pos].on : false;
      const offsets = node.desc.notesFor(step.note, node.params);
      if (node.desc.mono) {
        // One reused voice so slide steps glide legato, mirroring the runtime.
        const off = offsets.length ? offsets[0] : 0;
        const freq = 440 * Math.pow(2, (step.note - 69 + off) / 12);
        node.pool[0].noteOn({ freq, note: step.note, vel: step.velocity, gateSec, params: node.params, slide: !!step.slide, accent });
      } else {
        for (const off of offsets) {
          const freq = 440 * Math.pow(2, (step.note - 69 + off) / 12);
          alloc(node).noteOn({ freq, note: step.note, vel: step.velocity, gateSec, params: node.params });
        }
      }
      for (const r of routes) {
        if (r.src.type !== 'trig' || r.src.track !== tIndex) continue;
        if (r.src.lane !== 'both' && r.src.lane !== lane) continue;
        r._env = 1;
      }
    }
  }

  // rawL/rawR hold the linear master mix (pre soft clip) so folding can sum
  // cleanly; the master soft clip is applied once at the end.
  const rawL = new Float32Array(cap);
  const rawR = new Float32Array(cap);
  const modCut = new Array(nodes.length).fill(0);
  const modVca = new Array(nodes.length).fill(0);

  let rawLen = cap;
  for (let i = 0; i < cap; i++) {
    const t = i / SR;
    if (i < loopSamples) {
      for (let n = 0; n < nodes.length; n++) {
        const node = nodes[n];
        if (node.track.mute) continue;
        while (t >= node.cursor.nextTime) {
          fireStep(node, n, node.cursor.step % node.track.length);
          node.cursor.step += 1;
          node.cursor.nextTime += node.stepDur;
        }
      }
    }

    for (let n = 0; n < nodes.length; n++) { modCut[n] = 0; modVca[n] = 0; }
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

    let mixL = 0;
    let mixR = 0;
    let anyActive = false;
    for (let n = 0; n < nodes.length; n++) {
      const node = nodes[n];
      if (node.track.mute) continue;
      let sL = 0;
      let sR = 0;
      for (const v of node.pool) {
        if (!v.active) continue;
        anyActive = true;
        if (node.stereo) { v.renderStereo(); sL += v.outL; sR += v.outR; }
        else { const s = v.render(); sL += s; sR += s; }
      }
      sL *= 0.6;
      sR *= 0.6;
      let cut = node.track.output.cutoff + modCut[n];
      cut = cut < 0 ? 0 : cut > 1 ? 1 : cut;
      const a = Math.max(0.0006, cut * cut);
      node.lpL += (sL - node.lpL) * a;
      node.lpR += (sR - node.lpR) * a;
      let vca = node.track.output.vca + modVca[n];
      vca = vca < 0 ? 0 : vca > 4 ? 4 : vca;
      mixL += Math.tanh(node.lpL * 1.2) * vca;
      mixR += Math.tanh(node.lpR * 1.2) * vca;
    }
    rawL[i] = mixL * 0.5;
    rawR[i] = mixR * 0.5;

    if (i >= loopSamples && !anyActive) { rawLen = i + 1; break; }
  }

  let outLen;
  let fold = false;
  if (mode === 'oneshot') outLen = loopSamples;
  else if (mode === 'tails') outLen = rawLen;
  else { outLen = loopSamples; fold = true; }

  const left = new Float32Array(outLen);
  const right = new Float32Array(outLen);
  const copyN = Math.min(outLen, rawLen);
  for (let i = 0; i < copyN; i++) { left[i] = rawL[i]; right[i] = rawR[i]; }
  if (fold) {
    for (let i = loopSamples; i < rawLen; i++) {
      const j = i % loopSamples;
      left[j] += rawL[i];
      right[j] += rawR[i];
    }
  }
  for (let i = 0; i < outLen; i++) { left[i] = Math.tanh(left[i]); right[i] = Math.tanh(right[i]); }

  return { left, right, sampleRate: SR, loopSamples, length: outLen };
}
