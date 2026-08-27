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
      // Master chain: headroom gain into a limiter so six loud tracks summing
      // together are caught smoothly instead of hard-clipping at the output.
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -3;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;
      this.master.connect(limiter);
      limiter.connect(this.ctx.destination);
      const url = workletUrlFromPage();
      await this.ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
    })();
    return this.ready;
  }

  createVoice(engineId) {
    const node = new AudioWorkletNode(this.ctx, 'voice-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: { engine: engineId },
    });
    node.connect(this.master);
    return new Voice(this.ctx, node);
  }

  resume() {
    if (this.ctx && this.ctx.state !== 'running') return this.ctx.resume();
    return Promise.resolve();
  }

  get currentTime() {
    return this.ctx ? this.ctx.currentTime : 0;
  }
}
