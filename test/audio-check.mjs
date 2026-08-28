// PUBLIC DOMAIN (CC0-1.0)
// This test script has no copyright. See https://creativecommons.org/publicdomain/zero/1.0/
//
// Headless audio checks for web-rack. Runs the engine DSP directly and also
// exercises the actual worklet bundle decoded from build/rack.html. Browser-only
// glue (AudioContext, addModule, DOM) is not covered here; this verifies the DSP
// math, the message handling, polyphonic allocation, and chord clustering.
//
// Run:  node test/audio-check.mjs        (or: make check)
// Exit code is non-zero if any check fails.

import { readFileSync, existsSync } from 'node:fs';
import { DrumVoice } from '../src/core/worklet/engines/drum.js';
import { FM2Voice } from '../src/core/worklet/engines/fm2.js';
import { ChordVoice, chordNotes } from '../src/core/worklet/engines/chord.js';
import { CsawVoice } from '../src/core/worklet/engines/csaw.js';
import { SupersawVoice } from '../src/core/worklet/engines/supersaw.js';

const SR = 48000;
let fails = 0;

function check(name, cond, info) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + info : ''}`);
  if (!cond) fails += 1;
}

// Play one sub-voice and measure peak, rms, and how long the tail sounds.
function measure(voice, params, { note = 60, freq = 220, gate = 0.2, seconds = 2 } = {}) {
  voice.noteOn({ freq, note, vel: 110, gateSec: gate, params });
  const n = Math.floor(seconds * SR);
  let peak = 0;
  let energy = 0;
  let lastAudible = 0;
  for (let i = 0; i < n; i++) {
    const s = voice.render();
    const a = Math.abs(s);
    if (a > peak) peak = a;
    energy += s * s;
    if (a > 1e-3) lastAudible = i;
  }
  return { peak, rms: Math.sqrt(energy / n), tailMs: Math.round((lastAudible / SR) * 1000), active: voice.active };
}

console.log('== engine DSP ==');
const cases = [
  ['drum', new DrumVoice(SR), [0.30, 0.50, 0.35, 0.45, 0.20]],
  ['fm2', new FM2Voice(SR), [0.50, 0.40, 0.20, 0.50, 0.20]],
  ['chord', new ChordVoice(SR), [0.00, 0.20, 0.30, 0.55, 0.20]],
  ['csaw', new CsawVoice(SR), [0.40, 0.60, 0.20, 0.55, 0.20]],
  ['supersaw', new SupersawVoice(SR), [0.35, 0.70, 0.70, 0.00, 0.15]],
];
for (const [id, voice, params] of cases) {
  const r = measure(voice, params);
  check(`${id} audible and not clipping`, r.peak > 0.1 && r.peak <= 1.001,
    `peak ${r.peak.toFixed(3)} rms ${r.rms.toFixed(3)} tail ${r.tailMs}ms`);
}

console.log('== gate/envelope frees pitched voices ==');
for (const [id, Ctor, params] of [
  ['fm2', FM2Voice, [0.50, 0.40, 0.20, 0.50, 0.20]],
  ['csaw', CsawVoice, [0.40, 0.60, 0.20, 0.55, 0.20]],
  ['chord', ChordVoice, [0.00, 0.20, 0.30, 0.55, 0.20]],
]) {
  const v = new Ctor(SR);
  const r = measure(v, params, { gate: 0.15 });
  check(`${id} releases after gate`, !v.active, `tail ${r.tailMs}ms`);
}

console.log('== chord clustering ==');
const cluster = chordNotes(60, [0.30, 0.20, 0.30, 0.55, 0.20]); // maj7 region
check('chord returns multiple notes', cluster.length > 1, `notes ${cluster.map((x) => x.toFixed(2)).join(', ')}`);

console.log('== supersaw stereo spread ==');
{
  const ss = new SupersawVoice(SR);
  ss.noteOn({ freq: 110, vel: 110, gateSec: 0.3, params: [0.5, 0.85, 0.7, 0.0, 0.15] });
  let width = 0;
  for (let i = 0; i < SR / 4; i++) { ss.renderStereo(); width += Math.abs(ss.outL - ss.outR); }
  check('renderStereo produces a stereo image', width > 1, `L/R diff energy ${width.toFixed(1)}`);
}

console.log('== worklet bundle (build/rack.html) ==');
if (!existsSync('build/rack.html')) {
  console.log('SKIP  build/rack.html missing, run `make` first');
} else {
  const html = readFileSync('build/rack.html', 'utf8');
  const m = html.match(/<script id="worklet-src"[^>]*>([\s\S]*?)<\/script>/);
  const src = Buffer.from(m[1].trim(), 'base64').toString('utf8');

  const registered = {};
  globalThis.registerProcessor = (name, cls) => { registered[name] = cls; };
  globalThis.sampleRate = SR;
  globalThis.currentFrame = 0;
  globalThis.AudioWorkletProcessor = class {
    constructor() { this.port = { postMessage() {}, onmessage: null }; }
  };
  new Function(src)();
  check('bundle registers voice-processor', !!registered['voice-processor']);
  check('bundle registers fx-processor', !!registered['fx-processor']);

  // The delay pedal, driven through the fx-processor: an impulse in, then
  // silence, should come back as a wet echo tail once the footswitch (ramped
  // from bypassed to engaged) has settled.
  {
    const Fx = registered['fx-processor'];
    const fp = new Fx({ processorOptions: { fx: 'delay' } });
    fp.port.onmessage({ data: { type: 'fxparams', values: [0.2, 0.6, 0.7, 1.0] } });
    fp.port.onmessage({ data: { type: 'fxbypass', bypass: false } });
    // inputs are nested [input][channel]; one mono input, one channel.
    const fin = [[new Float32Array(128)]];
    const fout = [new Float32Array(128), new Float32Array(128)];
    let tail = 0;
    let stereo = 0;
    for (let blk = 0; blk < 220; blk++) {
      fin[0][0].fill(0);
      if (blk === 0) fin[0][0][0] = 1; // one impulse, then quiet
      fp.process(fin, [fout]);
      if (blk > 8) for (let i = 0; i < 128; i++) {
        tail = Math.max(tail, Math.abs(fout[0][i]), Math.abs(fout[1][i]));
        stereo += Math.abs(fout[0][i] - fout[1][i]);
      }
    }
    check('fx-processor delay returns a wet tail', tail > 0.01, `tail peak ${tail.toFixed(3)}`);
    check('ping-pong delay tail is stereo', stereo > 0.05, `L/R diff ${stereo.toFixed(3)}`);
  }

  // a-rate AudioParams come in as Float32Arrays. Length 1 means constant.
  const paramsOpen = { cutoff: new Float32Array([1]), hp: new Float32Array([0]), vca: new Float32Array([1]) };
  const paramsMuted = { cutoff: new Float32Array([1]), hp: new Float32Array([0]), vca: new Float32Array([0]) };

  const Proc = registered['voice-processor'];
  const p = new Proc({ processorOptions: { engine: 'fm2' } });
  p.port.onmessage({ data: { type: 'params', values: [0.5, 0.6, 0.2, 0.5, 0.2] } });
  p.port.onmessage({ data: { type: 'trigger', time: 0.0, note: 60, velocity: 110, gateSec: 0.2 } });
  const out = [new Float32Array(128), new Float32Array(128)];
  let peak = 0;
  for (let blk = 0; blk < 40; blk++) {
    globalThis.currentFrame = blk * 128;
    p.process([], [out], paramsOpen);
    for (let i = 0; i < 128; i++) peak = Math.max(peak, Math.abs(out[0][i]));
  }
  const stereo = out[1].every((v, i) => v === out[0][i]);
  check('bundle renders audio to both channels', peak > 0.1 && stereo, `peak ${peak.toFixed(3)}`);

  // VCA AudioParam at 0 must silence the output (mod destination for ducking).
  const p2 = new Proc({ processorOptions: { engine: 'fm2' } });
  p2.port.onmessage({ data: { type: 'params', values: [0.5, 0.6, 0.2, 0.5, 0.2] } });
  p2.port.onmessage({ data: { type: 'trigger', time: 0.0, note: 60, velocity: 110, gateSec: 0.2 } });
  let mutedPeak = 0;
  for (let blk = 0; blk < 20; blk++) {
    globalThis.currentFrame = blk * 128;
    p2.process([], [out], paramsMuted);
    for (let i = 0; i < 128; i++) mutedPeak = Math.max(mutedPeak, Math.abs(out[0][i]));
  }
  check('vca AudioParam at 0 silences output', mutedPeak < 1e-6, `peak ${mutedPeak.toExponential(1)}`);

  const pc = new Proc({ processorOptions: { engine: 'chord' } });
  pc.port.onmessage({ data: { type: 'params', values: [0.30, 0.20, 0.30, 0.55, 0.20] } });
  pc.port.onmessage({ data: { type: 'trigger', time: 0.0, note: 60, velocity: 110, gateSec: 0.3 } });
  globalThis.currentFrame = 0;
  pc.process([], [out], paramsOpen);
  const voicesUp = pc.pool.filter((v) => v.active).length;
  check('one chord trigger allocates several voices', voicesUp > 1, `${voicesUp} voices`);

  // Supersaw drives the two output channels differently (stereo path).
  const ps = new Proc({ processorOptions: { engine: 'supersaw' } });
  ps.port.onmessage({ data: { type: 'params', values: [0.5, 0.85, 0.7, 0.0, 0.15] } });
  ps.port.onmessage({ data: { type: 'trigger', time: 0.0, note: 57, velocity: 110, gateSec: 0.3 } });
  const outS = [new Float32Array(128), new Float32Array(128)];
  let chanDiff = 0;
  for (let blk = 0; blk < 60; blk++) {
    globalThis.currentFrame = blk * 128;
    ps.process([], [outS], paramsOpen);
    for (let i = 0; i < 128; i++) chanDiff += Math.abs(outS[0][i] - outS[1][i]);
  }
  check('supersaw bundle output is stereo (L != R)', chanDiff > 1, `L/R diff ${chanDiff.toFixed(1)}`);
}

console.log('== mod matrix graph ==');
{
  const { ModMatrix } = await import('../src/programs/rack/modmatrix.js');
  const { freshPattern } = await import('../src/programs/rack/starter.js');

  const makeParam = () => ({ value: 0, calls: [],
    cancelScheduledValues(t) { this.calls.push(['cancel', t]); },
    setValueAtTime(v, t) { this.calls.push(['set', v, t]); },
    linearRampToValueAtTime(v, t) { this.calls.push(['ramp', v, t]); } });
  const ctx = {
    createGain: () => ({ gain: makeParam(), connect() {}, disconnect() {} }),
    createOscillator: () => ({ type: '', frequency: makeParam(), connect() {}, start() {}, stop() {}, disconnect() {} }),
    createConstantSource: () => ({ offset: makeParam(), connect() {}, start() {}, stop() {}, disconnect() {} }),
  };
  const voices = Array.from({ length: 6 }, () => ({ _p: {}, param(n) { return (this._p[n] ||= makeParam()); } }));

  const pattern = freshPattern();
  const mm = new ModMatrix({ ctx });
  mm.attach(voices);
  mm.rebuild(pattern.routes);
  check('builds one graph node per route', mm.nodes.length === pattern.routes.length, `${mm.nodes.length} nodes`);

  const trig = mm.nodes.find((n) => n.cs);
  const lfo = mm.nodes.find((n) => n.osc);
  check('trigger route uses a ConstantSource', !!trig);
  check('lfo route uses an Oscillator', !!lfo);
  check('depth*polarity applied to gain', Math.abs(trig.gain.gain.value - (trig.route.depth * trig.route.polarity)) < 1e-9,
    `gain ${trig.gain.gain.value}`);

  // Firing the matching source lane schedules a pulse; a non-matching one does not.
  mm.onSourceTrigger(trig.route.src.track, trig.route.src.lane, 1.0);
  check('matching trigger schedules a pulse', trig.cs.offset.calls.length >= 3, `${trig.cs.offset.calls.length} automations`);
  const before = trig.cs.offset.calls.length;
  mm.onSourceTrigger((trig.route.src.track + 1) % 6, trig.route.src.lane, 2.0);
  check('non-matching source is ignored', trig.cs.offset.calls.length === before);
}

console.log('== offline render (WAV recorder) ==');
{
  const { renderPattern, loopSeconds } = await import('../src/core/offline-render.js');
  const { engines } = await import('../src/core/worklet/registry.js');
  const { freshPattern } = await import('../src/programs/rack/starter.js');
  const pat = freshPattern();
  const loopSamp = Math.round(loopSeconds(pat) * SR);

  const one = renderPattern(pat, { engines, mode: 'oneshot', sampleRate: SR });
  const tails = renderPattern(pat, { engines, mode: 'tails', sampleRate: SR });
  const loop = renderPattern(pat, { engines, mode: 'loop', sampleRate: SR });

  check('one-shot length is exactly the loop length', one.length === loopSamp, `${(one.length / SR).toFixed(2)}s`);
  check('tails mode runs longer than one-shot', tails.length > one.length, `${(tails.length / SR).toFixed(2)}s vs ${(one.length / SR).toFixed(2)}s`);
  check('loop mode keeps the one-shot length', loop.length === one.length);

  let chan = 0;
  for (let i = 0; i < one.length; i++) chan += Math.abs(one.left[i] - one.right[i]);
  check('render is stereo (L != R)', chan > 1, `L/R diff ${chan.toFixed(0)}`);

  // Loop mode folds the overhanging tail back onto the start, so the head of the
  // loop differs from the plain one-shot.
  let head = 0;
  const region = Math.min(loopSamp, Math.floor(0.4 * SR));
  for (let i = 0; i < region; i++) head += Math.abs(loop.left[i] - one.left[i]);
  check('loop folds the tail into the start', head > 0.5, `head diff ${head.toFixed(1)}`);

  let peak = 0;
  for (let i = 0; i < tails.length; i++) peak = Math.max(peak, Math.abs(tails.left[i]), Math.abs(tails.right[i]));
  check('render does not clip', peak <= 1.0, `peak ${peak.toFixed(3)}`);
}

console.log('== fx fuzz (DooomFuzzz port) ==');
{
  const { FuzzVoice } = await import('../src/core/fx/voices.js');
  const v = new FuzzVoice(SR);
  v.setParams([0.7, 0.6, 0.4, 0.6]); // driven, some fuzz
  // A pure 220 Hz sine in; a distortion adds harmonics, so the output must
  // carry energy well above the fundamental, and must not blow up or go NaN.
  const N = 4096;
  const inL = new Float32Array(N), inR = new Float32Array(N);
  const outL = new Float32Array(N), outR = new Float32Array(N);
  for (let i = 0; i < N; i++) inL[i] = inR[i] = 0.5 * Math.sin(2 * Math.PI * 220 * i / SR);
  v.process(inL, inR, outL, outR, N);
  let peak = 0, nan = false, mono = true, energy = 0;
  for (let i = 0; i < N; i++) {
    if (Number.isNaN(outL[i])) nan = true;
    if (outL[i] !== outR[i]) mono = false;
    peak = Math.max(peak, Math.abs(outL[i]));
    energy += outL[i] * outL[i];
  }
  // Goertzel-ish: measure energy at the 3rd harmonic (660 Hz) vs total. A clean
  // sine has ~none there; distortion puts real energy in the odd harmonics.
  let hRe = 0, hIm = 0;
  const w = 2 * Math.PI * 660 / SR;
  for (let i = 0; i < N; i++) { hRe += outL[i] * Math.cos(w * i); hIm += outL[i] * Math.sin(w * i); }
  const h3 = Math.sqrt(hRe * hRe + hIm * hIm) / N;
  check('fuzz output is finite and bounded', !nan && peak > 0.05 && peak <= 1.5, `peak ${peak.toFixed(3)}`);
  check('fuzz is mono (L == R)', mono);
  check('fuzz adds harmonic energy (3rd harmonic present)', h3 > 0.01, `h3 mag ${h3.toFixed(3)}`);

  // Bit-exact reproducibility: a second instance with the same params and input
  // must match, guarding the ported DSP against hidden global state.
  const v2 = new FuzzVoice(SR);
  v2.setParams([0.7, 0.6, 0.4, 0.6]);
  const o2L = new Float32Array(N), o2R = new Float32Array(N);
  v2.process(inL, inR, o2L, o2R, N);
  let same = true;
  for (let i = 0; i < N; i++) if (o2L[i] !== outL[i]) { same = false; break; }
  check('fuzz is deterministic', same);
}

console.log('== fx octave (Green Ringer) ==');
{
  const { OctaveVoice } = await import('../src/core/fx/voices.js');
  const SR = 48000;
  const f0 = 220;
  const N = 8192;
  const inL = new Float32Array(N), inR = new Float32Array(N);
  const outL = new Float32Array(N), outR = new Float32Array(N);
  for (let i = 0; i < N; i++) inL[i] = inR[i] = 0.5 * Math.sin(2 * Math.PI * f0 * i / SR);

  // Full octave up, pure (null 0), some drive: the octave (2*f0) should be the
  // dominant tone, well above the fundamental.
  const v = new OctaveVoice(SR);
  v.setParams([1.0, 0.0, 0.5, 0.6]);
  v.process(inL, inR, outL, outR, N);
  const mag = (buf, f) => {
    let re = 0, im = 0; const w = 2 * Math.PI * f / SR;
    // skip the settling head so the DC blocker and filters have converged
    for (let i = 1024; i < N; i++) { re += buf[i] * Math.cos(w * i); im += buf[i] * Math.sin(w * i); }
    return Math.sqrt(re * re + im * im) / (N - 1024);
  };
  let nan = false, peak = 0, mono = true;
  for (let i = 0; i < N; i++) { if (Number.isNaN(outL[i])) nan = true; if (outL[i] !== outR[i]) mono = false; peak = Math.max(peak, Math.abs(outL[i])); }
  const fund = mag(outL, f0), oct = mag(outL, 2 * f0);
  check('octave output is finite and bounded', !nan && peak > 0.02 && peak <= 1.2, `peak ${peak.toFixed(3)}`);
  check('octave is mono (L == R)', mono);
  check('full octave up dominates the fundamental', oct > fund * 1.5, `oct ${oct.toFixed(3)} vs fund ${fund.toFixed(3)}`);

  // Blend at 0 passes the dry signal: the fundamental should return.
  const dryV = new OctaveVoice(SR);
  dryV.setParams([0.0, 0.0, 0.5, 0.6]);
  dryV.process(inL, inR, outL, outR, N);
  const fund2 = mag(outL, f0), oct2 = mag(outL, 2 * f0);
  check('blend 0 keeps the dry fundamental', fund2 > oct2, `fund ${fund2.toFixed(3)} vs oct ${oct2.toFixed(3)}`);
}

console.log('== fx muff (sustain) ==');
{
  const { MuffVoice } = await import('../src/core/fx/voices.js');
  const SR = 48000;
  const N = 8192, f0 = 220;
  const inL = new Float32Array(N), inR = new Float32Array(N);
  const bright = new Float32Array(N), dark = new Float32Array(N), tmp = new Float32Array(N);
  for (let i = 0; i < N; i++) inL[i] = inR[i] = 0.4 * Math.sin(2 * Math.PI * f0 * i / SR);

  // Heavy sustain: expect strong distortion (odd harmonics), a squashed crest
  // (compression), bounded, finite, mono.
  const v = new MuffVoice(SR);
  v.setParams([0.8, 1.0, 0.0, 0.6]);   // high sustain, bright tone, no sag
  v.process(inL, inR, bright, tmp, N);
  let peak = 0, nan = false, mono = true;
  for (let i = 0; i < N; i++) { if (Number.isNaN(bright[i])) nan = true; if (bright[i] !== tmp[i]) mono = false; peak = Math.max(peak, Math.abs(bright[i])); }
  const mag = (buf, f) => { let re = 0, im = 0; const w = 2 * Math.PI * f / SR; for (let i = 1024; i < N; i++) { re += buf[i] * Math.cos(w * i); im += buf[i] * Math.sin(w * i); } return Math.sqrt(re * re + im * im) / (N - 1024); };
  check('muff output is finite and bounded', !nan && peak > 0.05 && peak <= 1.2, `peak ${peak.toFixed(3)}`);
  check('muff is mono (L == R)', mono);
  check('muff distorts (3rd harmonic present)', mag(bright, 3 * f0) > 0.02, `h3 ${mag(bright, 3 * f0).toFixed(3)}`);

  // Dark (LP) render reflects the clipped waveform: high sustain squares the
  // sine, so its crest drops below a clean sine's sqrt(2) ~= 1.41.
  const vd = new MuffVoice(SR);
  vd.setParams([0.8, 0.0, 0.0, 0.6]);  // dark tone
  vd.process(inL, inR, dark, tmp, N);
  let dpeak = 0, drms = 0;
  for (let i = 1024; i < N; i++) { dpeak = Math.max(dpeak, Math.abs(dark[i])); drms += dark[i] * dark[i]; }
  const crest = dpeak / (Math.sqrt(drms / (N - 1024)) + 1e-9);
  check('muff sustain compresses (crest below a clean sine)', crest < 1.41, `crest ${crest.toFixed(2)}`);
  const hiB = mag(bright, 9 * f0), hiD = mag(dark, 9 * f0);
  check('muff tone shifts brightness (HP > LP up top)', hiB > hiD, `hi bright ${hiB.toFixed(3)} vs dark ${hiD.toFixed(3)}`);
}

console.log('== fx rat (distortion) ==');
{
  const { RatVoice } = await import('../src/core/fx/voices.js');
  const SR = 48000;
  const N = 8192, f0 = 220;
  const inL = new Float32Array(N), inR = new Float32Array(N);
  const outL = new Float32Array(N), outR = new Float32Array(N), tmp = new Float32Array(N);
  for (let i = 0; i < N; i++) inL[i] = inR[i] = 0.4 * Math.sin(2 * Math.PI * f0 * i / SR);
  const mag = (buf, f) => { let re = 0, im = 0; const w = 2 * Math.PI * f / SR; for (let i = 1024; i < N; i++) { re += buf[i] * Math.cos(w * i); im += buf[i] * Math.sin(w * i); } return Math.sqrt(re * re + im * im) / (N - 1024); };

  const v = new RatVoice(SR);
  v.setParams([0.7, 0.6, 0.6]);
  v.process(inL, inR, outL, outR, N);
  let peak = 0, nan = false, mono = true;
  for (let i = 0; i < N; i++) { if (Number.isNaN(outL[i])) nan = true; if (outL[i] !== outR[i]) mono = false; peak = Math.max(peak, Math.abs(outL[i])); }
  check('rat output is finite and bounded', !nan && peak > 0.05 && peak <= 1.2, `peak ${peak.toFixed(3)}`);
  check('rat is mono (L == R)', mono);
  check('rat distorts (3rd harmonic present)', mag(outL, 3 * f0) > 0.02, `h3 ${mag(outL, 3 * f0).toFixed(3)}`);

  // Deterministic (guards the ported DSP against hidden global state).
  const v2 = new RatVoice(SR); v2.setParams([0.7, 0.6, 0.6]);
  v2.process(inL, inR, tmp, new Float32Array(N), N);
  let same = true; for (let i = 0; i < N; i++) if (tmp[i] !== outL[i]) { same = false; break; }
  check('rat is deterministic', same);

  // Stacking: a second RAT after the first (the Hardfloor rig) adds more upper
  // harmonics than one alone. Feed one RAT's output into a second.
  const stage2 = new RatVoice(SR); stage2.setParams([0.7, 0.6, 0.6]);
  const s2 = new Float32Array(N);
  stage2.process(outL, outL, s2, new Float32Array(N), N);
  const oneH5 = mag(outL, 5 * f0), twoH5 = mag(s2, 5 * f0);
  check('stacking two rats adds harmonics', twoH5 > oneH5, `2x h5 ${twoH5.toFixed(3)} vs 1x ${oneH5.toFixed(3)}`);
}

console.log('== offline fx loop (send -> delay -> return) ==');
{
  const { renderPattern } = await import('../src/core/offline-render.js');
  const { engines } = await import('../src/core/worklet/registry.js');
  const { freshPattern } = await import('../src/programs/rack/starter.js');
  const { defaultFxParams } = await import('../src/core/fx/registry.js');

  const dry = freshPattern(); // sends 0, all pedals thru: loop is silent
  const wet = freshPattern();
  wet.tracks[1].output.send = 0.9;                    // bass into the loop
  wet.fx.loops[0].pedals[0] = { type: 'delay', bypass: false, params: defaultFxParams('delay') };
  const byp = freshPattern();
  byp.tracks[1].output.send = 0.9;
  byp.fx.loops[0].pedals[0] = { type: 'delay', bypass: true, params: defaultFxParams('delay') };

  const a = renderPattern(dry, { engines, mode: 'oneshot', sampleRate: SR });
  const b = renderPattern(wet, { engines, mode: 'oneshot', sampleRate: SR });
  const c = renderPattern(byp, { engines, mode: 'oneshot', sampleRate: SR });

  let onDiff = 0;
  for (let i = 0; i < a.length; i++) onDiff += Math.abs(b.left[i] - a.left[i]) + Math.abs(b.right[i] - a.right[i]);
  check('engaged delay changes the mix', onDiff > 1, `sum |Δ| ${onDiff.toFixed(0)}`);

  let echo = 0;
  for (let i = 0; i < b.length; i++) echo += Math.abs(b.left[i] - c.left[i]);
  check('delay echoes only when engaged (not bypassed)', echo > 1, `Δ vs bypass ${echo.toFixed(0)}`);

  let peak = 0;
  for (let i = 0; i < b.length; i++) peak = Math.max(peak, Math.abs(b.left[i]), Math.abs(b.right[i]));
  check('fx render does not clip', peak <= 1.0, `peak ${peak.toFixed(3)}`);
}

console.log(fails === 0 ? '\nOK: all checks passed' : `\nFAILED: ${fails} check(s)`);
process.exit(fails === 0 ? 0 : 1);
