// SPDX-License-Identifier: 0BSD

// Master-bus tap for Live recording. The node sits inline just before the
// destination (master -> recorder -> destination) and passes audio straight
// through, so it is harmless when idle. While recording it copies each block's
// stereo frames back to the main thread, which concatenates them and encodes a
// WAV. Capture is Float32 at the AudioContext rate; the main thread owns the
// time cap and stops the take before memory runs out.
class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = false;
    this.port.onmessage = (e) => {
      if (e.data === 'start') this.recording = true;
      else if (e.data === 'stop') this.recording = false;
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    // Pass-through: this node is inline before the destination, so it must copy
    // its input to its output or the master would go silent.
    if (input.length) {
      for (let ch = 0; ch < output.length; ch++) {
        const src = input[ch] || input[0];
        if (src) output[ch].set(src);
      }
    }
    if (this.recording && input.length) {
      const l = input[0];
      const r = input[1] || input[0];
      // slice() copies out of the reused input buffer before posting.
      this.port.postMessage({ l: l.slice(0), r: r.slice(0) });
    }
    return true;
  }
}

registerProcessor('recorder-processor', RecorderProcessor);
