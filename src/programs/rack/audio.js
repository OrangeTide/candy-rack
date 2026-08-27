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

  // Base values for the output-stage AudioParams. Mod sources connect on top of
  // these and sum, so setting the base here still lets the matrix modulate.
  setOutput(output) {
    if (typeof output.cutoff === 'number') this.node.parameters.get('cutoff').value = output.cutoff;
    if (typeof output.vca === 'number') this.node.parameters.get('vca').value = output.vca;
  }

  param(name) {
    return this.node.parameters.get(name);
  }

  // time is an AudioContext time; the worklet fires on the exact sample.
  // gateSec is the note length; pitched engines release on it, drum ignores it.
  trigger(time, note, velocity, gateSec, slide, accent) {
    this.node.port.postMessage({ type: 'trigger', time, note, velocity, gateSec, slide, accent });
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
      // Reserved aux send bus: channels tap into it post-pan. It is deliberately
      // left unconnected for now, so raising a send is inert (the signal goes
      // nowhere) until a future FX is inserted as sendBus -> FX -> master.
      this.sendBus = this.ctx.createGain();
      this.sendBus.gain.value = 1;
      this.channels = [];
      const url = workletUrlFromPage();
      await this.ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
    })();
    return this.ready;
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
