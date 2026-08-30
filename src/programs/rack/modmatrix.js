// SPDX-License-Identifier: 0BSD

// Modulation matrix, built as a native Web Audio graph so it is sample-accurate
// and crosses tracks. Each route becomes a source node feeding a depth gain into
// a destination track's output-stage AudioParam (cutoff or vca). AudioParams sum
// their connected inputs on top of the intrinsic base value, so several routes
// into one destination stack, and the base still comes through.
//
//   trigger source:  ConstantSource.offset --pulse--> Gain(depth*polarity) --> destParam
//   lfo source:      Oscillator            --------> Gain(depth*polarity) --> destParam
//
// Trigger pulses are scheduled by the sequencer through onSourceTrigger() at the
// exact AudioContext time the source step fires, matching the note it rides on.

import { lfoHz } from '../../core/sequencer.js';
import { makeGen, genAdvance, quantizePitch } from '../../core/gen.js';

const SHAPES = { sine: 'sine', tri: 'triangle', saw: 'sawtooth', square: 'square' };

export class ModMatrix {
  constructor(host) {
    this.host = host;
    this.voices = [];
    this.nodes = []; // per active route: { route, gain, osc?, cs? }
    this.routes = [];
    this.bpm = 120; // for tempo-synced LFO rates
  }

  attach(voices) {
    this.voices = voices;
  }

  // Update the tempo; retune any tempo-synced LFO oscillators live so a sync'd
  // filter wobble tracks the transport without a full graph rebuild.
  setBpm(bpm) {
    this.bpm = bpm;
    const ctx = this.host.ctx;
    for (const n of this.nodes) {
      if (n.osc && n.route.src.sync) {
        try { n.osc.frequency.setValueAtTime(lfoHz(n.route.src, bpm), ctx ? ctx.currentTime : 0); } catch (_) {}
      }
    }
  }

  destParam(route) {
    // Master targets use dest.track === -1. Master Volume is masterVol.gain, an
    // AudioParam the mod sums on top of the base volume, like a track's cutoff.
    if (route.dest.track === -1) {
      if (route.dest.param === 'volume' && this.host.masterVol) return this.host.masterVol.gain;
      return null;
    }
    const v = this.voices[route.dest.track];
    if (!v) return null;
    return v.param(route.dest.param);
  }

  // Rebuild the whole graph from the current route list. Cheap enough to call on
  // any edit or when a voice node is replaced (engine flip).
  rebuild(routes) {
    this.teardown();
    this.routes = routes || [];
    const ctx = this.host.ctx;
    if (!ctx) return;
    // A silent sink the per-route meter analysers connect to, so they are pulled
    // (rendered) even though their reading is never heard. Created once.
    if (!this.meterSink && ctx.createAnalyser && ctx.destination) {
      this.meterSink = ctx.createGain(); this.meterSink.gain.value = 0; this.meterSink.connect(ctx.destination);
    }
    for (const route of this.routes) this.buildRoute(route, ctx);
  }

  // Deterministic per-route seed so a locked loop repeats and the offline WAV
  // matches playback.
  seedFor(route) { return ((this.routes.indexOf(route) + 1) * 0x9E3779B1) >>> 0; }

  // Tap a source node with an analyser (pre-depth, so the meter shows the source
  // regardless of depth) into the silent sink. `out` is the source output index.
  tap(ctx, srcNode, out = 0) {
    if (!ctx.createAnalyser || !this.meterSink) return null; // e.g. the headless test mock
    const an = ctx.createAnalyser();
    an.fftSize = 32;
    try { srcNode.connect(an, out); } catch (_) { srcNode.connect(an); }
    an.connect(this.meterSink);
    return an;
  }

  // The current value of a route for the meter LED, in ~[-1,1], with polarity
  // applied (so green = positive, red = negative). GEN reads its live main-thread
  // value; other sources read their analyser's latest sample.
  routeValue(idx) {
    const route = this.routes[idx];
    if (!route) return 0;
    const n = this.nodes.find((x) => x.route === route);
    if (!n) return 0;
    const sign = route.polarity < 0 ? -1 : 1;
    if (n.gen) return n.gen.value * sign;
    if (n.analyser) {
      const b = this._meterBuf || (this._meterBuf = new Float32Array(32));
      n.analyser.getFloatTimeDomainData(b);
      return b[b.length - 1] * sign;
    }
    return 0;
  }

  buildRoute(route, ctx) {
    // Generative source into the PITCH (note-offset) destination: there is no
    // AudioParam for note pitch, so no audio node -- the scheduler samples the
    // gen value at trigger time via genNoteOffset(). Keep only the gen state.
    if (route.src.type === 'gen' && route.dest.param === 'note') {
      this.nodes.push({ route, gen: makeGen(this.seedFor(route)) });
      return;
    }
    const param = this.destParam(route);
    if (!param) return;
    const gain = ctx.createGain();
    gain.gain.value = (route.polarity < 0 ? -1 : 1) * route.depth;
    gain.connect(param);

    if (route.src.type === 'gen') {
      // Generative source to a param destination: a ConstantSource the scheduler
      // steps at each dest-track step (advanceGen), held between steps.
      const cs = ctx.createConstantSource();
      cs.offset.value = 0;
      cs.connect(gain);
      cs.start();
      this.nodes.push({ route, gain, cs, gen: makeGen(this.seedFor(route)) });
    } else if (route.src.type === 'env') {
      // Engine mod output: tap the source track's voice node output 1 (the
      // amp-envelope follower). A gate-aware, engine-agnostic mod source.
      const src = this.voices[route.src.track];
      if (!src || !src.node) { try { gain.disconnect(); } catch (_) {} return; }
      src.node.connect(gain, 1);
      this.nodes.push({ route, gain, envNode: src.node, analyser: this.tap(ctx, src.node, 1) });
    } else if (route.src.type === 'lfo') {
      const osc = ctx.createOscillator();
      osc.type = SHAPES[route.src.shape] || 'sine';
      osc.frequency.value = lfoHz(route.src, this.bpm);
      osc.connect(gain);
      osc.start();
      this.nodes.push({ route, gain, osc, analyser: this.tap(ctx, osc) });
    } else {
      const cs = ctx.createConstantSource();
      cs.offset.value = 0;
      cs.connect(gain);
      cs.start();
      this.nodes.push({ route, gain, cs, analyser: this.tap(ctx, cs) });
    }
  }

  // Called by the scheduler when a source track lane fires. Schedules the pulse
  // on every trigger route tapping that (track, lane).
  onSourceTrigger(track, lane, time) {
    for (const n of this.nodes) {
      const s = n.route.src;
      if (s.type !== 'trig' || !n.cs) continue;
      if (s.track !== track) continue;
      if (s.lane !== 'both' && s.lane !== lane) continue;
      const off = n.cs.offset;
      const atk = 0.004;
      const dec = Math.max(0.02, n.route.decay || 0.15);
      off.cancelScheduledValues(time);
      off.setValueAtTime(0, time);
      off.linearRampToValueAtTime(1, time + atk);
      off.linearRampToValueAtTime(0, time + atk + dec);
    }
  }

  // Advance every GEN route clocked by this track's step (dest track == track),
  // once per step, and hold the new value on its ConstantSource (param dests).
  // Called from the scheduler at each step, before the notes fire, so a note
  // (pitch dest) reads the freshly generated value.
  advanceGen(track, time) {
    for (const n of this.nodes) {
      if (!n.gen || n.route.src.type !== 'gen' || n.route.dest.track !== track) continue;
      const s = n.route.src;
      const v = genAdvance(n.gen, s.mode || 'turing', s.length || 8, s.lock == null ? 0.5 : s.lock);
      if (n.cs) n.cs.offset.setValueAtTime(v, time);
    }
  }

  // Summed semitone offset from GEN -> note routes targeting this track, read
  // from the values last produced by advanceGen(). 0 when none.
  genNoteOffset(track) {
    let off = 0;
    for (const n of this.nodes) {
      if (!n.gen || n.route.src.type !== 'gen') continue;
      const d = n.route.dest, s = n.route.src;
      if (d.param !== 'note' || d.track !== track) continue;
      const semis = quantizePitch(n.gen.value, s.scale || 'off', s.octaves || 2);
      off += (n.route.polarity < 0 ? -1 : 1) * semis;
    }
    return off;
  }

  teardown() {
    for (const n of this.nodes) {
      try { if (n.osc) n.osc.stop(); } catch (_) {}
      try { if (n.cs) n.cs.stop(); } catch (_) {}
      try { if (n.osc) n.osc.disconnect(); } catch (_) {}
      try { if (n.cs) n.cs.disconnect(); } catch (_) {}
      try { if (n.envNode) n.envNode.disconnect(n.gain); } catch (_) {}
      try { if (n.analyser) n.analyser.disconnect(); } catch (_) {}
      try { n.gain.disconnect(); } catch (_) {}
    }
    this.nodes = [];
  }
}
