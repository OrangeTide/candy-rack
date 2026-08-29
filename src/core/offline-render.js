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

import { kitPartVoice } from './worklet/registry.js';
import { fxVoice } from './fx/voices.js';
import { algoById, chainOrder } from './fx/algorithms.js';

const POLY = 8;

// Whether an on-step starts a note (triggers) or is absorbed as a tie into the
// note before it. Mirrors startsNote() in src/programs/rack/main.js.
function startsNote(track, lane, pos) {
  const L = track[lane];
  if (!L[pos].on) return false;
  if (!L[pos].tie) return true;
  for (let i = 1; i < track.length; i++) {
    const prev = L[(pos - i + track.length) % track.length];
    if (!prev.on) return true;
    if (!prev.tie) return false;
  }
  let first = 0;
  while (first < track.length && !L[first].on) first += 1;
  return pos === first;
}
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
    const kit = track.engine === 'kit';
    const desc = kit ? engines.drum : (engines[track.engine] || engines.drum);
    const pool = Array.from({ length: POLY }, () => new desc.Voice(SR));
    if (kit) for (let i = 0; i < 4; i++) pool[i] = kitPartVoice(track.parts[i].type, SR);
    return {
      track, desc, kit,
      partParams: kit ? track.parts.map((p) => p.params) : null,
      params: track.params.slice(),
      toggles: (track.toggles || [false, false, false]).slice(),
      pool, rr: 0, lpL: 0, lpR: 0, hpL: 0, hpR: 0,
      envFollow: 0,   // amp-envelope follower, the track's Env mod source
      stereo: typeof pool[0].renderStereo === 'function',
      stepDur: q / track.ratio,
      cursor: { step: 0, nextTime: 0 },
    };
  });
  // Mod-output follower coefficients, matching the worklet runtime.
  const envAtk = 1 - Math.exp(-1 / (0.002 * SR));
  const envRel = 1 - Math.exp(-1 / (0.04 * SR));

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
    // Kit: each of the four part rows drives its own drum voice (fixed pool
    // slot), and each part is its own trigger source (part0..part3).
    if (node.kit) {
      for (let part = 0; part < 4; part++) {
        if (track.parts[part].mute) continue;
        const step = track.parts[part].lane[pos];
        if (!step.on) continue;
        const freq = 440 * Math.pow(2, ((step.note ?? 60) - 69) / 12);
        node.pool[part].noteOn({ freq, note: step.note, vel: step.velocity, gateSec: 0.1, params: node.partParams[part] });
        for (const r of routes) {
          if (r.src.type !== 'trig' || r.src.track !== tIndex) continue;
          if (r.src.lane !== 'both' && r.src.lane !== 'part' + part) continue;
          r._env = 1;
        }
      }
      return;
    }
    // Accent mode: only the main lane sounds, and a coincident alt trigger
    // accents it. Mirrors the runtime and the in-app scheduler.
    const accentMode = node.desc.altMode === 'accent';
    const lanes = accentMode ? ['main'] : ['main', 'alt'];
    for (const lane of lanes) {
      const step = track[lane][pos];
      // Only steps that START a note trigger; tie steps are absorbed into the
      // held note (but an all-tied ring still starts its first step). Mirrors
      // startsNote() in the in-app scheduler.
      if (!startsNote(track, lane, pos)) continue;
      // Extend the gate across any tied steps that follow, so the note holds;
      // and if the next sounding step slides, reach that onset so the mono voice
      // is still alive to glide from.
      let span = 1, p = pos;
      for (let i = 0; i < track.length; i++) {
        p = (p + 1) % track.length;
        const nx = track[lane][p];
        if (nx.on && nx.tie) span += 1; else break;
      }
      let gsteps = span - 1 + step.gateLen;
      const nxt = track[lane][(pos + span) % track.length];
      if (nxt.on && nxt.slide) gsteps = Math.max(gsteps, span + 0.05);
      const gateSec = Math.max(0.01, gsteps * node.stepDur);
      const accent = accentMode ? !!track.alt[pos].on : false;
      const offsets = node.desc.notesFor(step.note, node.params);
      if (node.desc.mono) {
        // One reused voice so slide steps glide legato, mirroring the runtime.
        const off = offsets.length ? offsets[0] : 0;
        const freq = 440 * Math.pow(2, (step.note - 69 + off) / 12);
        node.pool[0].noteOn({ freq, note: step.note, vel: step.velocity, gateSec, params: node.params, toggles: node.toggles, slide: !!step.slide, accent });
      } else {
        for (const off of offsets) {
          const freq = 440 * Math.pow(2, (step.note - 69 + off) / 12);
          alloc(node).noteOn({ freq, note: step.note, vel: step.velocity, gateSec, params: node.params, toggles: node.toggles });
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
  // Mono aux send bus: the post-pan channel signal times each channel's send,
  // summed and downmixed to mono, mirroring the realtime sendBus. Fed through
  // the effects loop after the main pass.
  const sendBuf = new Float32Array(cap);
  // Per-sample master-volume modulation (mod matrix -> master mixer target).
  const modMVol = new Float32Array(cap);
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
        const swing = node.track.swing || 0;
        // Swing delays the off-beat 16ths (odd steps).
        while (t >= node.cursor.nextTime + (node.cursor.step % 2 === 1 ? swing * node.stepDur * 0.4 : 0)) {
          fireStep(node, n, node.cursor.step % node.track.length);
          node.cursor.step += 1;
          node.cursor.nextTime += node.stepDur;
        }
      }
    }

    for (let n = 0; n < nodes.length; n++) { modCut[n] = 0; modVca[n] = 0; modParam[n].fill(0); }
    let mMasterVol = 0;
    for (const r of routes) {
      let val;
      if (r.src.type === 'lfo') {
        val = lfoShape(r.src.shape, r._phase);
        r._phase += (TWO_PI * (r.src.rateHz || 2)) / SR;
      } else if (r.src.type === 'env') {
        const sn = nodes[r.src.track];
        val = sn ? sn.envFollow : 0; // last sample's follower (1-sample delay)
      } else {
        val = r._env;
        r._env *= r._decayCoef;
      }
      const c = r.depth * r.polarity * val;
      const p = r.dest.param;
      if (r.dest.track === -1) {
        if (p === 'volume') mMasterVol += c;   // master mixer target
      } else if (p === 'cutoff') modCut[r.dest.track] += c;
      else if (p === 'vca') modVca[r.dest.track] += c;
      else if (p[0] === 'm') modParam[r.dest.track][+p[1]] += c;
    }
    modMVol[i] = mMasterVol;

    let mixL = 0;
    let mixR = 0;
    let sendMono = 0;
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
      // Update this track's Env mod source from the raw (pre-filter) sum.
      const amp = (Math.abs(sL) + Math.abs(sR)) * 0.5;
      node.envFollow += (amp - node.envFollow) * (amp > node.envFollow ? envAtk : envRel);
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
      // Channel drive: push the soft clip harder with makeup, mirroring the
      // worklet (drive 0 => gain 1.2, makeup 1 = the previous clean behavior).
      const dr = node.track.output.drive || 0;
      const dg = 1.2 + dr * 6;
      const mk = 1 / (1 + dr * 1.5);
      const outCL = Math.tanh(bpL * dg) * mk * vca * gL;
      const outCR = Math.tanh(bpR * dg) * mk * vca * gR;
      mixL += outCL;
      mixR += outCR;
      // Post-pan send tap, downmixed to mono, matching panner -> send -> sendBus.
      const send = node.track.output.send || 0;
      if (send > 0) sendMono += (outCL + outCR) * 0.5 * send;
    }
    rawL[i] = mixL;
    rawR[i] = mixR;
    sendBuf[i] = sendMono;

    if (i >= loopSamples && !anyActive) { rawLen = i + 1; break; }
  }

  // Effects loop: run the mono send through the pedal chain into a stereo
  // return, then mix the return into the raw stream before the master filter,
  // matching returnBus -> returnPan -> returnGain -> master. Pedals are the
  // shared fx voices, so this tracks the realtime graph. Bypassed pedals pass
  // dry; a bypassed delay's tail is not modelled here (it would ring past the
  // send). Delay repeats past rawLen are truncated, as in the realtime cut.
  const fxLoop = pattern.fx && pattern.fx.loops && pattern.fx.loops[0];
  if (fxLoop) {
    let chL = new Float32Array(rawLen);
    let chR = new Float32Array(rawLen);
    for (let i = 0; i < rawLen; i++) { chL[i] = sendBuf[i]; chR[i] = sendBuf[i]; }
    const order = chainOrder(algoById(fxLoop.algorithm));
    for (const si of order) {
      const pd = fxLoop.pedals[si];
      if (!pd || pd.bypass) continue; // bypassed and empty slots pass dry
      const voice = fxVoice(pd.type, SR);
      voice.setParams(pd.params);
      if (voice.setToggles && pd.toggles) voice.setToggles(pd.toggles);
      if (voice.setSecondary && typeof pd.sw2 === 'boolean') voice.setSecondary(pd.sw2);
      const oL = new Float32Array(rawLen);
      const oR = new Float32Array(rawLen);
      voice.process(chL, chR, oL, oR, rawLen);
      chL = oL; chR = oR;
    }
    const ret = fxLoop.return || { level: 1, pan: 0 };
    const level = typeof ret.level === 'number' ? ret.level : 1;
    const pan = typeof ret.pan === 'number' ? ret.pan : 0;
    const rgL = pan > 0 ? 1 - pan : 1;
    const rgR = pan < 0 ? 1 + pan : 1;
    for (let i = 0; i < rawLen; i++) {
      rawL[i] += chL[i] * level * rgL;
      rawR[i] += chR[i] * level * rgR;
    }
  }

  // Master section: DJ sweep filter then volume, matching the realtime chain
  // (channels -> filter -> volume -> limiter). Applied to the raw stream before
  // the loop fold so tails filter consistently.
  const master = pattern.master || { volume: 0.8, filter: 0.5, resonance: false };
  applyMasterFilter(rawL, rawR, rawLen, master, SR);
  for (let i = 0; i < rawLen; i++) {
    const vol = master.volume + modMVol[i];   // mod matrix master-volume target
    const g = vol < 0 ? 0 : vol;
    rawL[i] *= g; rawR[i] *= g;
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
