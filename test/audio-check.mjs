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

console.log('== acid (TB-303) engine ==');
{
  const { Acid303Voice } = await import('../src/core/worklet/engines/acid.js');
  const P = [0.4, 0.6, 0.6, 0.4, 0.5];

  const r = measure(new Acid303Voice(SR), P, { freq: 110, gate: 0.25, seconds: 1 });
  check('acid audible and not clipping', r.peak > 0.05 && r.peak <= 1.001, `peak ${r.peak.toFixed(3)} rms ${r.rms.toFixed(3)}`);
  const rv = new Acid303Voice(SR);
  measure(rv, P, { freq: 110, gate: 0.1, seconds: 0.6 });
  check('acid releases after gate (mono AR)', !rv.active);

  const capture = (opts) => {
    const v = new Acid303Voice(SR);
    v.noteOn({ freq: opts.freq, note: 45, vel: 100, gateSec: opts.gate ?? 0.3, params: P, slide: opts.slide, accent: opts.accent, toggles: [opts.wave ?? false] });
    const n = Math.floor(0.3 * SR);
    let peak = 0, energy = 0; const buf = new Float32Array(n);
    for (let i = 0; i < n; i++) { const s = v.render(); buf[i] = s; peak = Math.max(peak, Math.abs(s)); energy += s * s; }
    return { v, buf, peak, rms: Math.sqrt(energy / n) };
  };

  const plain = capture({ freq: 110 }), acc = capture({ freq: 110, accent: true });
  check('acid accent boosts level', acc.rms > plain.rms * 1.1, `acc ${acc.rms.toFixed(3)} vs ${plain.rms.toFixed(3)}`);

  const saw = capture({ freq: 110, wave: false }), sqr = capture({ freq: 110, wave: true });
  let wdiff = 0; for (let i = 0; i < saw.buf.length; i++) wdiff += Math.abs(saw.buf[i] - sqr.buf[i]);
  check('acid waveform toggle changes the sound', wdiff > 1, `saw/sqr Δ ${wdiff.toFixed(0)}`);

  // Slide glides the pitch (no retrigger); a normal note jumps.
  const vs = new Acid303Voice(SR);
  vs.noteOn({ freq: 110, note: 45, vel: 100, gateSec: 0.4, params: P, toggles: [false] });
  for (let i = 0; i < 1000; i++) vs.render();
  vs.noteOn({ freq: 220, note: 57, vel: 100, gateSec: 0.4, params: P, slide: true, toggles: [false] });
  vs.render();
  const f1 = vs.freq;
  for (let i = 0; i < SR * 0.03; i++) vs.render();
  const f2 = vs.freq;
  check('acid slide glides pitch', f1 < 130 && f2 > f1 + 20 && vs.freqTarget === 220, `f1 ${f1.toFixed(0)} f2 ${f2.toFixed(0)}`);
  const vj = new Acid303Voice(SR);
  vj.noteOn({ freq: 110, note: 45, vel: 100, gateSec: 0.4, params: P, toggles: [false] });
  for (let i = 0; i < 1000; i++) vj.render();
  vj.noteOn({ freq: 220, note: 57, vel: 100, gateSec: 0.4, params: P, slide: false, toggles: [false] });
  vj.render();
  check('acid non-slide jumps pitch', Math.abs(vj.freq - 220) < 2, `freq ${vj.freq.toFixed(0)}`);
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

  // The dist pedal's Ge/Si toggle must reach the voice through the worklet
  // message path (fxtoggles). Drive an engaged dist and compare loudness.
  {
    const Fx = registered['fx-processor'];
    const drive = (silicon) => {
      const fp = new Fx({ processorOptions: { fx: 'dist' } });
      fp.port.onmessage({ data: { type: 'fxparams', values: [0.7, 0.7] } });
      fp.port.onmessage({ data: { type: 'fxtoggles', values: [silicon] } });
      fp.port.onmessage({ data: { type: 'fxbypass', bypass: false } });
      const fin = [[new Float32Array(128)]];
      const fout = [new Float32Array(128), new Float32Array(128)];
      let e = 0, cnt = 0;
      for (let blk = 0; blk < 200; blk++) {
        for (let i = 0; i < 128; i++) fin[0][0][i] = 0.4 * Math.sin(2 * Math.PI * 220 * (blk * 128 + i) / SR);
        fp.process(fin, [fout]);
        if (blk > 20) for (let i = 0; i < 128; i++) { e += fout[0][i] * fout[0][i]; cnt++; }
      }
      return Math.sqrt(e / cnt);
    };
    const geRms = drive(false), siRms = drive(true);
    check('bundle applies the dist Ge/Si toggle (Si louder)', siRms > geRms * 1.2, `si ${siRms.toFixed(3)} vs ge ${geRms.toFixed(3)}`);
  }

  // The delay Freeze reaches the voice through the worklet 'fxsw2' path.
  {
    const Fx = registered['fx-processor'];
    const freeze = (hold) => {
      const fp = new Fx({ processorOptions: { fx: 'delay' } });
      fp.port.onmessage({ data: { type: 'fxparams', values: [0.3, 0.45, 0.7, 1.0] } });
      fp.port.onmessage({ data: { type: 'fxbypass', bypass: false } });
      const fin = [[new Float32Array(128)]];
      const fout = [new Float32Array(128), new Float32Array(128)];
      for (let blk = 0; blk < 400; blk++) {
        for (let i = 0; i < 128; i++) fin[0][0][i] = blk < 40 ? (Math.random() * 2 - 1) * 0.5 : 0;
        if (blk === 60) fp.port.onmessage({ data: { type: 'fxsw2', value: hold } });
        fp.process(fin, [fout]);
      }
      let e = 0, c = 0;
      for (let blk = 0; blk < 150; blk++) { fin[0][0].fill(0); fp.process(fin, [fout]); for (let i = 0; i < 128; i++) { e += fout[0][i] * fout[0][i]; c++; } }
      return Math.sqrt(e / c);
    };
    check('bundle applies delay Freeze via fxsw2', freeze(true) > freeze(false) * 3, `hold ${freeze(true).toFixed(3)}`);
  }

  // a-rate AudioParams come in as Float32Arrays. Length 1 means constant.
  const paramsOpen = { cutoff: new Float32Array([1]), hp: new Float32Array([0]), vca: new Float32Array([1]), drive: new Float32Array([0]) };
  const paramsMuted = { cutoff: new Float32Array([1]), hp: new Float32Array([0]), vca: new Float32Array([0]), drive: new Float32Array([0]) };

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

  // Acid (TB-303) engine through the bundle: mono voice, params + toggle +
  // trigger, produces audio.
  const pacid = new Proc({ processorOptions: { engine: 'acid' } });
  pacid.port.onmessage({ data: { type: 'params', values: [0.4, 0.6, 0.6, 0.4, 0.5] } });
  pacid.port.onmessage({ data: { type: 'toggles', values: [false, false, false] } });
  pacid.port.onmessage({ data: { type: 'trigger', time: 0, note: 45, velocity: 110, gateSec: 0.3 } });
  let acidPeak = 0;
  for (let blk = 0; blk < 80; blk++) {
    globalThis.currentFrame = blk * 128;
    pacid.process([], [out], paramsOpen);
    for (let i = 0; i < 128; i++) acidPeak = Math.max(acidPeak, Math.abs(out[0][i]));
  }
  check('bundle renders the acid engine', acidPeak > 0.05 && acidPeak <= 1.001, `peak ${acidPeak.toFixed(3)}`);

  // Channel drive (mixer overdrive) is read as an a-rate param and changes the
  // output-stage clip; drive 0 is the clean baseline. Deterministic engine.
  const renderNote = (drive) => {
    const p = new Proc({ processorOptions: { engine: 'fm2' } });
    p.port.onmessage({ data: { type: 'params', values: [0.5, 0.6, 0.2, 0.5, 0.2] } });
    p.port.onmessage({ data: { type: 'trigger', time: 0, note: 57, velocity: 110, gateSec: 0.4 } });
    const o = [new Float32Array(128), new Float32Array(128)];
    const params = { cutoff: new Float32Array([1]), hp: new Float32Array([0]), vca: new Float32Array([1]), drive: new Float32Array([drive]) };
    const buf = [];
    for (let blk = 0; blk < 60; blk++) { globalThis.currentFrame = blk * 128; p.process([], [o], params); for (let i = 0; i < 128; i++) buf.push(o[0][i]); }
    return buf;
  };
  const dclean = renderNote(0), ddirty = renderNote(0.85);
  let ddiff = 0, dpeak = 0, dnan = false;
  for (let i = 0; i < dclean.length; i++) { if (Number.isNaN(ddirty[i])) dnan = true; ddiff += Math.abs(ddirty[i] - dclean[i]); dpeak = Math.max(dpeak, Math.abs(ddirty[i])); }
  check('bundle channel drive changes output, bounded', !dnan && ddiff > 1 && dpeak <= 1.0, `diff ${ddiff.toFixed(1)} peak ${dpeak.toFixed(3)}`);
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

  // Channel drive grits a track: the kit (T0) render changes and stays bounded.
  const gritty = freshPattern();
  gritty.tracks[0].output.drive = 0.8;
  const gr = renderPattern(gritty, { engines, mode: 'oneshot', sampleRate: SR });
  let gdiff = 0, gpeak = 0;
  const gN = Math.min(gr.length, one.length);
  for (let i = 0; i < gN; i++) { gdiff += Math.abs(gr.left[i] - one.left[i]); gpeak = Math.max(gpeak, Math.abs(gr.left[i]), Math.abs(gr.right[i])); }
  check('offline channel drive changes the mix (grit)', gdiff > 1, `Δ ${gdiff.toFixed(0)}`);
  check('offline channel drive stays bounded', gpeak <= 1.0, `peak ${gpeak.toFixed(3)}`);
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

console.log('== fx delay freeze (sw2 hold) ==');
{
  const { DelayVoice } = await import('../src/core/fx/voices.js');
  const SR = 48000;
  const N = 128;
  // Prime the delay with a burst, then run silence: held it should keep looping
  // near its primed level; not held it decays with the knob feedback.
  const run = (hold) => {
    const v = new DelayVoice(SR);
    v.setParams([0.3, 0.45, 0.7, 1.0]); // 100% wet so we measure the buffer
    const inL = new Float32Array(N), inR = new Float32Array(N);
    const oL = new Float32Array(N), oR = new Float32Array(N);
    for (let blk = 0; blk < 400; blk++) {
      // 40 blocks of noise to fill the line, then silence
      for (let i = 0; i < N; i++) { const s = blk < 40 ? (Math.random() * 2 - 1) * 0.5 : 0; inL[i] = inR[i] = s; }
      if (blk === 60) v.setSecondary(hold); // engage after the burst, before decay
      v.process(inL, inR, oL, oR, N);
    }
    // measure sustained level over the next stretch of silence
    let e = 0, c = 0;
    for (let blk = 0; blk < 200; blk++) {
      for (let i = 0; i < N; i++) inL[i] = inR[i] = 0;
      v.process(inL, inR, oL, oR, N);
      for (let i = 0; i < N; i++) { e += oL[i] * oL[i]; c++; }
    }
    return Math.sqrt(e / c);
  };
  const frozen = run(true), free = run(false);
  check('delay hold sustains the loop', frozen > 0.02, `frozen rms ${frozen.toFixed(3)}`);
  check('delay hold sustains longer than free feedback', frozen > free * 3, `frozen ${frozen.toFixed(3)} vs free ${free.toFixed(4)}`);
}

console.log('== fx echo (analog PT2399 delay) ==');
{
  const { EchoVoice } = await import('../src/core/fx/voices.js');
  const SR = 48000, N = 16384, f0 = 220;
  // Short delay time so several echoes return inside the window; measure after
  // the first echo has come back.
  const S0 = 4096;
  const inL = new Float32Array(N), inR = new Float32Array(N), oL = new Float32Array(N), oR = new Float32Array(N);
  for (let i = 0; i < N; i++) inL[i] = inR[i] = 0.5 * Math.sin(2 * Math.PI * f0 * i / SR);
  const mag = (buf, f) => { let re = 0, im = 0; const w = 2 * Math.PI * f / SR; for (let i = S0; i < N; i++) { re += buf[i] * Math.cos(w * i); im += buf[i] * Math.sin(w * i); } return Math.sqrt(re * re + im * im) / (N - S0); };

  const v = new EchoVoice(SR);
  v.setParams([0.06, 0.35, 0.8, 0.6, 0.5, 1.0]); // short time, driven, wet, mod on
  v.process(inL, inR, oL, oR, N);
  let peak = 0, nan = false, stereo = 0;
  for (let i = S0; i < N; i++) { if (Number.isNaN(oL[i])) nan = true; peak = Math.max(peak, Math.abs(oL[i])); stereo += Math.abs(oL[i] - oR[i]); }
  check('echo output is finite and bounded', !nan && peak > 0.02 && peak <= 1.2, `peak ${peak.toFixed(3)}`);
  check('echo asymmetric drive adds even harmonics', mag(oL, 2 * f0) > 0.01, `h2 ${mag(oL, 2 * f0).toFixed(3)}`);
  check('echo is stereo (mod decorrelates L/R)', stereo > 1, `L/R diff ${stereo.toFixed(1)}`);

  const v2 = new EchoVoice(SR); v2.setParams([0.06, 0.35, 0.8, 0.6, 0.5, 1.0]);
  const o2 = new Float32Array(N); v2.process(inL, inR, o2, new Float32Array(N), N);
  let same = true; for (let i = 0; i < N; i++) if (o2[i] !== oL[i]) { same = false; break; }
  check('echo is deterministic', same);

  // Osc (sw2): prime with a burst, then run silence. Engaged it self-oscillates
  // and sustains; released the feedback decays.
  const run = (osc) => {
    const e = new EchoVoice(SR); e.setParams([0.25, 0.6, 0.3, 0.6, 0.0, 1.0]);
    const a = new Float32Array(N), b = new Float32Array(N), il = new Float32Array(N);
    for (let blk = 0; blk < 30; blk++) { for (let i = 0; i < N; i++) il[i] = blk < 6 ? 0.5 * Math.sin(2 * Math.PI * f0 * i / SR) : 0; if (blk === 8) e.setSecondary(osc); e.process(il, il, a, b, N); }
    const sil = new Float32Array(N); let en = 0;
    for (let blk = 0; blk < 20; blk++) { e.process(sil, sil, a, b, N); for (let i = 0; i < N; i++) en += a[i] * a[i]; }
    return Math.sqrt(en / (20 * N));
  };
  check('echo Osc self-oscillates (sustains vs decays)', run(true) > run(false) * 2, `osc ${run(true).toFixed(3)} vs ${run(false).toFixed(4)}`);
}

console.log('== fx reverb ==');
{
  const { ReverbVoice } = await import('../src/core/fx/voices.js');
  const SR = 48000, N = 1024;
  const burst = (il, blk, on) => { for (let i = 0; i < N; i++) il[i] = blk < on ? Math.sin(2 * Math.PI * 220 * (blk * N + i) / SR) * 0.5 : 0; };

  // Prime with a short burst, then silence: the reverb rings a decaying stereo
  // tail, bounded and finite.
  {
    const v = new ReverbVoice(SR); v.setParams([0.7, 0.5, 0.1, 0.2, 0.8, 1.0]);
    const il = new Float32Array(N), oL = new Float32Array(N), oR = new Float32Array(N);
    let tail = 0, peak = 0, stereo = 0, nan = false;
    for (let blk = 0; blk < 200; blk++) {
      burst(il, blk, 10);
      v.process(il, il, oL, oR, N);
      for (let i = 0; i < N; i++) { if (Number.isNaN(oL[i])) nan = true; peak = Math.max(peak, Math.abs(oL[i])); if (blk >= 40) { tail += oL[i] * oL[i]; stereo += Math.abs(oL[i] - oR[i]); } }
    }
    check('reverb rings a tail after input stops', Math.sqrt(tail) > 0.1, `tail ${Math.sqrt(tail).toFixed(2)}`);
    check('reverb is stereo (L != R)', stereo > 1, `L/R diff ${stereo.toFixed(0)}`);
    check('reverb is finite and bounded', !nan && peak <= 1.0, `peak ${peak.toFixed(3)}`);
  }

  // Deterministic.
  const once = () => { const v = new ReverbVoice(SR); v.setParams([0.6, 0.5, 0.1, 0.2, 0.8, 1.0]); const il = new Float32Array(N), oL = new Float32Array(N), oR = new Float32Array(N); for (let blk = 0; blk < 60; blk++) { burst(il, blk, 8); v.process(il, il, oL, oR, N); } return oL.slice(); };
  const a = once(), b = once(); let same = true; for (let i = 0; i < N; i++) if (a[i] !== b[i]) { same = false; break; }
  check('reverb is deterministic', same);

  // Hold: engage during the tail; it sustains near-infinitely vs decaying.
  const runHold = (hold) => {
    const v = new ReverbVoice(SR); v.setParams([0.6, 0.5, 0.1, 0.2, 0.8, 1.0]);
    const il = new Float32Array(N), oL = new Float32Array(N), oR = new Float32Array(N);
    for (let blk = 0; blk < 20; blk++) { burst(il, blk, 10); if (blk === 12) v.setSecondary(hold); v.process(il, il, oL, oR, N); }
    const sil = new Float32Array(N); let e = 0;
    for (let blk = 0; blk < 300; blk++) { v.process(sil, sil, oL, oR, N); for (let i = 0; i < N; i++) e += oL[i] * oL[i]; }
    return Math.sqrt(e / (300 * N));
  };
  check('reverb Hold sustains vs decays', runHold(true) > runHold(false) * 3, `hold ${runHold(true).toFixed(3)} vs ${runHold(false).toFixed(4)}`);

  // Gate: after the input stops the tail is chopped short.
  const runGate = (gate) => {
    const v = new ReverbVoice(SR); v.setParams([0.7, 0.5, 0.1, 0.2, 0.8, 1.0]); v.setToggles([gate]);
    const il = new Float32Array(N), oL = new Float32Array(N), oR = new Float32Array(N); let e = 0;
    for (let blk = 0; blk < 120; blk++) { burst(il, blk, 8); v.process(il, il, oL, oR, N); if (blk >= 20) for (let i = 0; i < N; i++) e += oL[i] * oL[i]; }
    return Math.sqrt(e);
  };
  check('reverb Gate chops the tail', runGate(true) < runGate(false) * 0.7, `gated ${runGate(true).toFixed(2)} vs open ${runGate(false).toFixed(2)}`);
}

console.log('== fx dimension (chorus) ==');
{
  const { DimVoice } = await import('../src/core/fx/voices.js');
  const SR = 48000, N = 8192, f0 = 330;
  const inL = new Float32Array(N), inR = new Float32Array(N);
  for (let i = 0; i < N; i++) inL[i] = inR[i] = 0.5 * Math.sin(2 * Math.PI * f0 * i / SR);
  const proc = (mix, width, toggles) => {
    const v = new DimVoice(SR); v.setParams([mix, width]); v.setToggles(toggles);
    const oL = new Float32Array(N), oR = new Float32Array(N); v.process(inL, inR, oL, oR, N); return { oL, oR };
  };
  const stereo = (r) => { let s = 0; for (let i = 0; i < N; i++) s += Math.abs(r.oL[i] - r.oR[i]); return s; };

  const on = proc(0.7, 0.8, [true, false, false]);
  let peak = 0, nan = false;
  for (let i = 0; i < N; i++) { if (Number.isNaN(on.oL[i])) nan = true; peak = Math.max(peak, Math.abs(on.oL[i]), Math.abs(on.oR[i])); }
  check('dimension output is finite and bounded', !nan && peak > 0.05 && peak <= 1.2, `peak ${peak.toFixed(3)}`);
  check('dimension widens the stereo image', stereo(on) > 1, `L/R diff ${stereo(on).toFixed(0)}`);

  // No mode button = dry passthrough (the effect idles).
  const dry = proc(0.7, 0.8, [false, false, false]);
  let diffDry = 0; for (let i = 0; i < N; i++) diffDry += Math.abs(dry.oL[i] - inL[i]);
  check('dimension with no mode passes dry', diffDry < 1e-4, `Δ ${diffDry.toExponential(1)}`);

  // Width 0 collapses toward mono; higher mode widens more than a low one.
  const mono = proc(0.7, 0.0, [true, false, false]);
  check('width 0 collapses toward mono', stereo(mono) < stereo(on) * 0.5, `mono ${stereo(mono).toFixed(0)} vs ${stereo(on).toFixed(0)}`);
  // The mode buttons change the chorus (different rate/depth per mode).
  const m1 = proc(0.7, 0.8, [true, false, false]);
  const m3 = proc(0.7, 0.8, [false, false, true]);
  let modeDiff = 0; for (let i = 0; i < N; i++) modeDiff += Math.abs(m1.oL[i] - m3.oL[i]);
  check('mode buttons change the chorus', modeDiff > 1, `I vs III Δ ${modeDiff.toFixed(0)}`);

  let same = true; const a = proc(0.7, 0.8, [true, false, false]);
  for (let i = 0; i < N; i++) if (a.oL[i] !== on.oL[i]) { same = false; break; }
  check('dimension is deterministic', same);
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

console.log('== fx pedal control block (fixed size) ==');
{
  const { makeFxPedal } = await import('../src/core/sequencer.js');
  const { FX_KNOBS, FX_TOGGLES, defaultFxParams } = await import('../src/core/fx/registry.js');
  const { deserialize, serialize, makePattern, makeTrack } = await import('../src/core/sequencer.js');

  const pd = makeFxPedal();
  check('fresh pedal has FX_KNOBS params', Array.isArray(pd.params) && pd.params.length === FX_KNOBS, `${pd.params.length}`);
  check('fresh pedal has FX_TOGGLES toggles', Array.isArray(pd.toggles) && pd.toggles.length === FX_TOGGLES, `${pd.toggles.length}`);
  check('fresh pedal has a secondary switch field', typeof pd.sw2 === 'boolean');
  check('defaultFxParams returns a full block', defaultFxParams('delay').length === FX_KNOBS);

  // An old variable-length pedal (2 params, 1 toggle, no sw2) migrates: the
  // saved slots are preserved and the block is padded to the fixed size.
  const t = makeTrack('fmbass', [0, 0, 0, 0, 0]);
  const p = makePattern([t, t, t, t, t, t]);
  p.fx.loops[0].pedals[0] = { type: 'dist', bypass: false, params: [0.8, 0.6], toggles: [true] };
  const back = deserialize(serialize(p));
  const mp = back.fx.loops[0].pedals[0];
  check('migrated pedal params padded to FX_KNOBS', mp.params.length === FX_KNOBS, `${mp.params.length}`);
  check('migrated pedal keeps its saved knob values', mp.params[0] === 0.8 && mp.params[1] === 0.6);
  check('migrated pedal toggles padded to FX_TOGGLES', mp.toggles.length === FX_TOGGLES && mp.toggles[0] === true);
  check('migrated pedal gains sw2 = false', mp.sw2 === false);
}

console.log('== fx dist (Distortion+ / DOD 250) ==');
{
  const { DistVoice } = await import('../src/core/fx/voices.js');
  const SR = 48000;
  const N = 8192, f0 = 220;
  const inL = new Float32Array(N), inR = new Float32Array(N);
  const ge = new Float32Array(N), si = new Float32Array(N), tmp = new Float32Array(N);
  for (let i = 0; i < N; i++) inL[i] = inR[i] = 0.4 * Math.sin(2 * Math.PI * f0 * i / SR);
  const rms = (buf) => { let e = 0; for (let i = 1024; i < N; i++) e += buf[i] * buf[i]; return Math.sqrt(e / (N - 1024)); };
  const mag = (buf, f) => { let re = 0, im = 0; const w = 2 * Math.PI * f / SR; for (let i = 1024; i < N; i++) { re += buf[i] * Math.cos(w * i); im += buf[i] * Math.sin(w * i); } return Math.sqrt(re * re + im * im) / (N - 1024); };

  const g = new DistVoice(SR); g.setParams([0.7, 0.7]); g.setToggles([false]); // germanium
  g.process(inL, inR, ge, tmp, N);
  const s = new DistVoice(SR); s.setParams([0.7, 0.7]); s.setToggles([true]);  // silicon
  s.process(inL, inR, si, tmp, N);

  let peak = 0, nan = false, mono = true;
  for (let i = 0; i < N; i++) { if (Number.isNaN(si[i])) nan = true; if (si[i] !== tmp[i]) mono = false; peak = Math.max(peak, Math.abs(si[i]), Math.abs(ge[i])); }
  check('dist output is finite and bounded', !nan && peak > 0.02 && peak <= 1.2, `peak ${peak.toFixed(3)}`);
  check('dist is mono (L == R)', mono);
  check('dist distorts (3rd harmonic present)', mag(si, 3 * f0) > 0.02, `h3 ${mag(si, 3 * f0).toFixed(3)}`);
  check('silicon is louder/harder than germanium', rms(si) > rms(ge) * 1.3, `si rms ${rms(si).toFixed(3)} vs ge ${rms(ge).toFixed(3)}`);

  // The toggle must survive a voice re-creation (type flip re-applies it).
  const { fxVoice } = await import('../src/core/fx/voices.js');
  void fxVoice;
  const held = new DistVoice(SR); held.setToggles([true]); held.setParams([0.7, 0.7]);
  const after = new Float32Array(N);
  held.process(inL, inR, after, tmp, N);
  let matchSi = true; for (let i = 0; i < N; i++) if (after[i] !== si[i]) { matchSi = false; break; }
  check('dist toggle set before params still applies', matchSi);
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
