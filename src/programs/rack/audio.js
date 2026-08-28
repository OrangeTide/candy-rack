// SPDX-License-Identifier: 0BSD

// Main-thread audio wiring for one voice node. Loads the bundled worklet code
// from a Blob URL (embedded base64 in the page, so the whole program stays a
// single HTML file) and creates one AudioWorkletNode per track.

function workletUrlFromPage() {
  const el = document.getElementById('worklet-src');
  const b64 = (el.textContent || '').trim();
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: 'text/javascript' });
  return URL.createObjectURL(blob);
}

export class Voice {
  constructor(ctx, node) {
    this.ctx = ctx;
    this.node = node;
  }

  setParams(values) {
    this.node.port.postMessage({ type: 'params', values });
  }

  setParam(index, value) {
    this.node.port.postMessage({ type: 'param', index, value });
  }

  // The engine's up-to-3 on/off switches. Sent as the full 3-boolean array.
  setToggles(values) {
    this.node.port.postMessage({ type: 'toggles', values });
  }

  // Base values for the output-stage AudioParams. Mod sources connect on top of
  // these and sum, so setting the base here still lets the matrix modulate.
  setOutput(output) {
    if (typeof output.cutoff === 'number') this.node.parameters.get('cutoff').value = output.cutoff;
    if (typeof output.hp === 'number') this.node.parameters.get('hp').value = output.hp;
    if (typeof output.vca === 'number') this.node.parameters.get('vca').value = output.vca;
    if (typeof output.drive === 'number') this.node.parameters.get('drive').value = output.drive;
  }

  param(name) {
    return this.node.parameters.get(name);
  }

  // time is an AudioContext time; the worklet fires on the exact sample.
  // gateSec is the note length; pitched engines release on it, drum ignores it.
  trigger(time, note, velocity, gateSec, slide, accent) {
    this.node.port.postMessage({ type: 'trigger', time, note, velocity, gateSec, slide, accent });
  }

  // Kit tracks: set one part's voice type and drum params, and trigger one part.
  setPartType(part, kind) {
    this.node.port.postMessage({ type: 'kittype', part, kind });
  }

  setPartParams(part, values) {
    this.node.port.postMessage({ type: 'kitparams', part, values });
  }

  triggerPart(time, note, velocity, part) {
    this.node.port.postMessage({ type: 'trigger', time, note, velocity, part });
  }

  dispose() {
    try { this.node.disconnect(); } catch (_) {}
  }
}

export class AudioHost {
  constructor() {
    this.ctx = null;
    this.ready = null;
  }

  async init() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Master chain: the channel panners sum into masterSum, through the DJ
      // sweep filter and the master volume, then a limiter so six loud tracks
      // summing together are caught smoothly instead of hard-clipping.
      //   panners -> masterSum -> djFilter -> masterVol -> limiter -> out
      // sendBus feeds masterSum too, reserved for a future aux FX insert.
      this.master = this.ctx.createGain();     // channel sum bus
      this.master.gain.value = 1;
      this.djFilter = this.ctx.createBiquadFilter();
      this.djFilter.type = 'lowpass';
      this.djFilter.frequency.value = 20000;
      this.djFilter.Q.value = 1.0;
      this.masterVol = this.ctx.createGain();
      this.masterVol.gain.value = 0.8;
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -3;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;
      this.master.connect(this.djFilter);
      this.djFilter.connect(this.masterVol);
      this.masterVol.connect(limiter);
      limiter.connect(this.ctx.destination);
      // Aux send bus: channels tap into it post-pan. Forced mono (channelCount
      // 1, explicit) so the whole pedal chain runs on one send, matching the
      // hardware model. It feeds the effects loop, built once the worklet loads.
      this.sendBus = this.ctx.createGain();
      this.sendBus.gain.value = 1;
      this.sendBus.channelCount = 1;
      this.sendBus.channelCountMode = 'explicit';
      this.sendBus.channelInterpretation = 'speakers';
      // Stereo return: the pedal chain sums into returnBus, through a pan then a
      // level into the master sum. Both live on the master mixer strip.
      //   returnBus -> returnPan -> returnGain -> master
      this.returnBus = this.ctx.createGain();
      this.returnBus.gain.value = 1;
      this.returnPan = this.ctx.createStereoPanner();
      this.returnGain = this.ctx.createGain();
      this.returnGain.gain.value = 1;
      this.returnBus.connect(this.returnPan);
      this.returnPan.connect(this.returnGain);
      this.returnGain.connect(this.master);
      this.channels = [];
      const url = workletUrlFromPage();
      await this.ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      // One fx-processor node per pedal slot (A B C D). Created straight-through;
      // the pattern's pedals set type/params/bypass and buildFxGraph wires them.
      this.fxNodes = [0, 1, 2, 3].map(() => new AudioWorkletNode(this.ctx, 'fx-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: { fx: 'thru' },
      }));
    })();
    return this.ready;
  }

  // Wire the send bus through the four pedals into the return, per the routing
  // algorithm's edges. `in` = sendBus, a letter = a slot's node, `out` collects
  // into returnBus. Torn down and rebuilt cheaply on any routing change; bypass
  // is internal to each node, so it never needs a rebuild.
  buildFxGraph(algorithm) {
    if (!this.fxNodes) return;
    try { this.sendBus.disconnect(); } catch (_) {}
    this.fxNodes.forEach((n) => { try { n.disconnect(); } catch (_) {} });
    const idx = { A: 0, B: 1, C: 2, D: 3 };
    const nodeFor = (key) => (key === 'in' ? this.sendBus : this.fxNodes[idx[key]]);
    const edges = algorithm.edges || {};
    for (const slot of ['A', 'B', 'C', 'D']) {
      for (const from of edges[slot] || []) nodeFor(from).connect(this.fxNodes[idx[slot]]);
    }
    for (const from of edges.out || []) nodeFor(from).connect(this.returnBus);
  }

  setFxType(slot, type) {
    if (this.fxNodes) this.fxNodes[slot].port.postMessage({ type: 'fxtype', fx: type });
  }

  setFxParams(slot, values) {
    if (this.fxNodes) this.fxNodes[slot].port.postMessage({ type: 'fxparams', values });
  }

  setFxBypass(slot, bypass) {
    if (this.fxNodes) this.fxNodes[slot].port.postMessage({ type: 'fxbypass', bypass });
  }

  setFxToggles(slot, values) {
    if (this.fxNodes) this.fxNodes[slot].port.postMessage({ type: 'fxtoggles', values });
  }

  // Secondary footswitch state (momentary or latching, per the pedal type).
  setFxSw2(slot, value) {
    if (this.fxNodes) this.fxNodes[slot].port.postMessage({ type: 'fxsw2', value });
  }

  // Return Level and Return Pan, the mix-side controls for the loop.
  setReturn({ level, pan } = {}) {
    if (typeof level === 'number') this.returnGain.gain.value = Math.max(0, Math.min(2, level));
    if (typeof pan === 'number') this.returnPan.pan.value = Math.max(-1, Math.min(1, pan));
  }

  // Per-track mixer channel strip, created once and reused across engine flips.
  // node -> panner -> masterSum, with a post-pan send tap into the aux bus.
  channel(t) {
    let ch = this.channels[t];
    if (!ch) {
      const panner = this.ctx.createStereoPanner();
      const send = this.ctx.createGain();
      send.gain.value = 0;
      panner.connect(this.master);
      panner.connect(send);
      send.connect(this.sendBus);
      ch = this.channels[t] = { panner, send };
    }
    return ch;
  }

  createVoice(engineId, t = 0) {
    const node = new AudioWorkletNode(this.ctx, 'voice-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: { engine: engineId },
    });
    node.connect(this.channel(t).panner);
    return new Voice(this.ctx, node);
  }

  // Mixer channel controls. Level reuses the voice output-stage vca (set via
  // Voice.setOutput); pan and send are the strip nodes here.
  setChannel(t, { pan, send }) {
    const ch = this.channel(t);
    if (typeof pan === 'number') ch.panner.pan.value = Math.max(-1, Math.min(1, pan));
    if (typeof send === 'number') ch.send.gain.value = Math.max(0, Math.min(1, send));
  }

  // Master volume plus the bipolar DJ sweep filter. filter 0.5 = flat; below,
  // a lowpass sweeps down; above, a highpass sweeps up. resonance toggles Q.
  setMaster({ volume, filter, resonance } = {}) {
    if (typeof volume === 'number') this.masterVol.gain.value = Math.max(0, Math.min(1, volume));
    if (typeof resonance === 'boolean') this.djFilter.Q.value = resonance ? 2.2 : 1.0;
    if (typeof filter === 'number') {
      if (filter >= 0.5) {
        this.djFilter.type = 'highpass';
        const x = (filter - 0.5) * 2;               // 0..1
        this.djFilter.frequency.value = 20 * Math.pow(8000 / 20, x);
      } else {
        this.djFilter.type = 'lowpass';
        const x = filter * 2;                        // 0 at hard-left, 1 at center
        this.djFilter.frequency.value = 120 * Math.pow(20000 / 120, x);
      }
    }
  }

  resume() {
    if (this.ctx && this.ctx.state !== 'running') return this.ctx.resume();
    return Promise.resolve();
  }

  get currentTime() {
    return this.ctx ? this.ctx.currentTime : 0;
  }
}
