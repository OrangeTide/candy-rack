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

// Master DJ sweep filter, run in place over the raw stereo buffers. Maps the
// bipolar filter control the same way audio.js does: 0.5 is flat, below that a
// lowpass sweeps down, above a highpass sweeps up; resonance sets the Q. A
// second-order RBJ biquad, one state per channel.
function applyMasterFilter(L, R, len, master, sr) {
  const f = master.filter;
  if (f > 0.49 && f < 0.51) return; // flat, nothing to do
  const Q = master.resonance ? 2.2 : 1.0;
  let type, freq;
  if (f >= 0.5) { type = 'hp'; freq = 20 * Math.pow(8000 / 20, (f - 0.5) * 2); }
  else { type = 'lp'; freq = 120 * Math.pow(20000 / 120, f * 2); }
  const w0 = (2 * Math.PI * freq) / sr, cs = Math.cos(w0), sn = Math.sin(w0), al = sn / (2 * Q);
  let b0, b1, b2;
  const a0 = 1 + al, a1 = -2 * cs, a2 = 1 - al;
  if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; }
  else { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; }
  b0 /= a0; b1 /= a0; b2 /= a0;
  const na1 = a1 / a0, na2 = a2 / a0;
  for (const buf of [L, R]) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < len; i++) {
      const x = buf[i];
      const y = b0 * x + b1 * x1 + b2 * x2 - na1 * y1 - na2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      buf[i] = y;
    }
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
      pool, rr: 0, lpL: 0, lpR: 0, hpL: 0, hpR: 0,
      stereo: typeof pool[0].renderStereo === 'function',
      stepDur: q / track.ratio,
      cursor: { step: 0, nextTime: 0 },
    };
  });

  // A track is audible if it is not muted and, when any track is soloed, it is
  // one of the soloed tracks.
  const anySolo = pattern.tracks.some((t) => t.solo);
  const audible = (track) => !track.mute && (!anySolo || track.solo);

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
      if (!step.on || step.tie) continue; // tie steps are absorbed into the held note
      // Extend the gate across any tied steps that follow, so the note holds.
      let span = 1, p = pos;
      for (let i = 0; i < track.length; i++) {
        p = (p + 1) % track.length;
        const nx = track[lane][p];
        if (nx.on && nx.tie) span += 1; else break;
      }
      const gateSec = Math.max(0.01, (span - 1 + step.gateLen) * node.stepDur);
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
  const modParam = nodes.map(() => [0, 0, 0, 0, 0]);

  let rawLen = cap;
  for (let i = 0; i < cap; i++) {
    const t = i / SR;
    if (i < loopSamples) {
      for (let n = 0; n < nodes.length; n++) {
        const node = nodes[n];
        if (!audible(node.track)) continue;
        while (t >= node.cursor.nextTime) {
          fireStep(node, n, node.cursor.step % node.track.length);
          node.cursor.step += 1;
          node.cursor.nextTime += node.stepDur;
        }
      }
    }

    for (let n = 0; n < nodes.length; n++) { modCut[n] = 0; modVca[n] = 0; modParam[n].fill(0); }
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
      const p = r.dest.param;
      if (p === 'cutoff') modCut[r.dest.track] += c;
      else if (p === 'vca') modVca[r.dest.track] += c;
      else if (p[0] === 'm') modParam[r.dest.track][+p[1]] += c;
    }

    let mixL = 0;
    let mixR = 0;
    let anyActive = false;
    for (let n = 0; n < nodes.length; n++) {
      const node = nodes[n];
      if (!audible(node.track)) continue;
      // Effective engine params = base + mod offsets, clamped. Voices read the
      // node.params array live, mirroring the worklet.
      const mp = modParam[n];
      for (let i = 0; i < 5; i++) {
        const v = node.track.params[i] + mp[i];
        node.params[i] = v < 0 ? 0 : v > 1 ? 1 : v;
      }
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
      // One-pole high-pass, matching the worklet output stage (hp 0 = open).
      const hp = node.track.output.hp || 0;
      const ah = hp * hp * 0.45;
      node.hpL += (node.lpL - node.hpL) * ah;
      node.hpR += (node.lpR - node.hpR) * ah;
      const bpL = node.lpL - node.hpL;
      const bpR = node.lpR - node.hpR;
      let vca = node.track.output.vca + modVca[n];
      vca = vca < 0 ? 0 : vca > 4 ? 4 : vca;
      // Channel pan as a linear balance (center unity), an approximation of the
      // realtime equal-power StereoPanner that preserves stereo content.
      const pan = node.track.output.pan || 0;
      const gL = pan > 0 ? 1 - pan : 1;
      const gR = pan < 0 ? 1 + pan : 1;
      mixL += Math.tanh(bpL * 1.2) * vca * gL;
      mixR += Math.tanh(bpR * 1.2) * vca * gR;
    }
    rawL[i] = mixL;
    rawR[i] = mixR;

    if (i >= loopSamples && !anyActive) { rawLen = i + 1; break; }
  }

  // Master section: DJ sweep filter then volume, matching the realtime chain
  // (channels -> filter -> volume -> limiter). Applied to the raw stream before
  // the loop fold so tails filter consistently.
  const master = pattern.master || { volume: 0.8, filter: 0.5, resonance: false };
  applyMasterFilter(rawL, rawR, rawLen, master, SR);
  for (let i = 0; i < rawLen; i++) { rawL[i] *= master.volume; rawR[i] *= master.volume; }

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
