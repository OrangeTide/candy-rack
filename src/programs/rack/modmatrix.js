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

const SHAPES = { sine: 'sine', tri: 'triangle', saw: 'sawtooth', square: 'square' };

export class ModMatrix {
  constructor(host) {
    this.host = host;
    this.voices = [];
    this.nodes = []; // per active route: { route, gain, osc?, cs? }
    this.routes = [];
  }

  attach(voices) {
    this.voices = voices;
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
    for (const route of this.routes) this.buildRoute(route, ctx);
  }

  buildRoute(route, ctx) {
    const param = this.destParam(route);
    if (!param) return;
    const gain = ctx.createGain();
    gain.gain.value = (route.polarity < 0 ? -1 : 1) * route.depth;
    gain.connect(param);

    if (route.src.type === 'env') {
      // Engine mod output: tap the source track's voice node output 1 (the
      // amp-envelope follower). A gate-aware, engine-agnostic mod source.
      const src = this.voices[route.src.track];
      if (!src || !src.node) { try { gain.disconnect(); } catch (_) {} return; }
      src.node.connect(gain, 1);
      this.nodes.push({ route, gain, envNode: src.node });
    } else if (route.src.type === 'lfo') {
      const osc = ctx.createOscillator();
      osc.type = SHAPES[route.src.shape] || 'sine';
      osc.frequency.value = route.src.rateHz || 2;
      osc.connect(gain);
      osc.start();
      this.nodes.push({ route, gain, osc });
    } else {
      const cs = ctx.createConstantSource();
      cs.offset.value = 0;
      cs.connect(gain);
      cs.start();
      this.nodes.push({ route, gain, cs });
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

  teardown() {
    for (const n of this.nodes) {
      try { if (n.osc) n.osc.stop(); } catch (_) {}
      try { if (n.cs) n.cs.stop(); } catch (_) {}
      try { if (n.osc) n.osc.disconnect(); } catch (_) {}
      try { if (n.cs) n.cs.disconnect(); } catch (_) {}
      try { if (n.envNode) n.envNode.disconnect(n.gain); } catch (_) {}
      try { n.gain.disconnect(); } catch (_) {}
    }
    this.nodes = [];
  }
}
