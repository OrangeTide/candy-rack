// SPDX-License-Identifier: 0BSD

// AudioWorkletProcessor for one effects pedal. Hosts a single fx voice (shared
// DSP from ../fx/voices.js) and applies the footswitch as a smoothed dry/wet
// crossfade, so stomping bypass during playback never clicks and the audio
// graph is never rewired. One node per pedal slot.
//
//   input  (mono send, or the previous pedal's stereo output)
//     -> voice.process -> wet
//     -> crossfade(wet, dry=input) by a ramped bypass amount
//   output (stereo)
//
// Messages: 'fxtype' recreates the voice, 'fxparams' sets its knobs, 'fxbypass'
// sets the footswitch target.
import { fxVoice } from '../fx/voices.js';

const QUANTUM = 128;

class FxProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const type = (options.processorOptions && options.processorOptions.fx) || 'thru';
    this.voice = fxVoice(type, sampleRate);
    this.wetL = new Float32Array(QUANTUM);
    this.wetR = new Float32Array(QUANTUM);
    this.silence = new Float32Array(QUANTUM);
    // bypass amount: 0 = fully engaged (wet), 1 = fully bypassed (dry). Ramped
    // toward the target over ~12ms so the footswitch is click-free.
    this.bypass = 1;
    this.bypassTarget = 1;
    this.rampA = 1 - Math.exp(-1 / (0.012 * sampleRate));

    this.port.onmessage = (e) => {
      const m = e.data;
      switch (m.type) {
        case 'fxtype':
          this.voice = fxVoice(m.fx, sampleRate);
          break;
        case 'fxparams':
          this.voice.setParams(m.values);
          break;
        case 'fxbypass':
          this.bypassTarget = m.bypass ? 1 : 0;
          break;
      }
    };
  }

  process(inputs, outputs) {
    const inp = inputs[0];
    const out = outputs[0];
    const outL = out[0];
    const outR = out.length > 1 ? out[1] : out[0];
    const n = outL.length;
    const inL = inp && inp.length > 0 ? inp[0] : this.silence;
    const inR = inp && inp.length > 1 ? inp[1] : inL;

    this.voice.process(inL, inR, this.wetL, this.wetR, n);

    const a = this.rampA;
    const target = this.bypassTarget;
    let b = this.bypass; // dry amount, 0 = wet, 1 = bypassed
    for (let i = 0; i < n; i++) {
      b += (target - b) * a;
      outL[i] = this.wetL[i] * (1 - b) + inL[i] * b;
      outR[i] = this.wetR[i] * (1 - b) + inR[i] * b;
    }
    this.bypass = b;
    // Keep running so delay tails ring out even when the send goes quiet.
    return true;
  }
}

registerProcessor('fx-processor', FxProcessor);
