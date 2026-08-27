// SPDX-License-Identifier: 0BSD

// Polyphonic AudioWorkletProcessor. Hosts a pool of sub-voices for one engine
// plus the standard per-voice output stage (one-pole lowpass + VCA + soft clip).
// One node per track.
//
// Triggers arrive from the main-thread scheduler timestamped in AudioContext
// time and fire on the exact sample. A trigger may sound several notes (chords):
// the engine's notesFor() returns the semitone offsets, and each is assigned a
// sub-voice from the pool. When the pool is full the oldest slot is reused.
// Params are shared across the pool and read live, so knob moves affect held
// notes. Gate length (seconds) rides on the trigger so pitched voices release
// on time without a separate note-off message.
import { engines } from './registry.js';

const POLY = 8;

class VoiceProcessor extends AudioWorkletProcessor {
  // cutoff and vca are the output-stage controls, exposed as a-rate AudioParams
  // so the modulation matrix can drive them by connecting source nodes. Their
  // intrinsic value is the per-track base (set from the main thread); connected
  // mod sources sum on top, and the DSP clamps the result to a sane range.
  static get parameterDescriptors() {
    return [
      { name: 'cutoff', defaultValue: 1, minValue: -8, maxValue: 8, automationRate: 'a-rate' },
      { name: 'hp', defaultValue: 0, minValue: -8, maxValue: 8, automationRate: 'a-rate' },
      { name: 'vca', defaultValue: 1, minValue: -8, maxValue: 8, automationRate: 'a-rate' },
      // Mod offsets for the 5 engine controls. The matrix connects sources here;
      // they sum onto the message-set base per block (k-rate is fine for timbre
      // modulation). Default 0 means an un-modulated param is untouched.
      { name: 'm0', defaultValue: 0, minValue: -8, maxValue: 8, automationRate: 'k-rate' },
      { name: 'm1', defaultValue: 0, minValue: -8, maxValue: 8, automationRate: 'k-rate' },
      { name: 'm2', defaultValue: 0, minValue: -8, maxValue: 8, automationRate: 'k-rate' },
      { name: 'm3', defaultValue: 0, minValue: -8, maxValue: 8, automationRate: 'k-rate' },
      { name: 'm4', defaultValue: 0, minValue: -8, maxValue: 8, automationRate: 'k-rate' },
    ];
  }

  constructor(options) {
    super();
    const id = options.processorOptions && options.processorOptions.engine;
    // A kit hosts four drum parts on fixed pool slots, each with its own params.
    this.kit = id === 'kit';
    this.desc = this.kit ? engines.drum : (engines[id] || engines.drum);
    // base holds the knob values (set by messages); params is the effective
    // array the voices read each block, base plus the m0..m4 mod offsets.
    this.base = (this.desc.defaults || [0, 0, 0, 0, 0]).slice();
    this.params = this.base.slice();
    this.partParams = this.kit ? [0, 1, 2, 3].map(() => this.desc.defaults.slice()) : null;
    this.pool = Array.from({ length: POLY }, () => new this.desc.Voice(sampleRate));
    this.rr = 0;
    // A stereo engine fills outL/outR via renderStereo(); mono engines return a
    // single sample from render() that feeds both channels equally.
    this.stereo = typeof this.pool[0].renderStereo === 'function';

    this.events = [];
    this.lpL = 0;
    this.lpR = 0;
    this.hpL = 0;
    this.hpR = 0;

    this.port.onmessage = (e) => {
      const m = e.data;
      switch (m.type) {
        case 'param':
          this.base[m.index] = m.value;
          break;
        case 'params':
          for (let i = 0; i < m.values.length; i++) this.base[i] = m.values[i];
          break;
        case 'kitparams':
          if (this.partParams) this.partParams[m.part] = m.values.slice();
          break;
        case 'trigger':
          this.events.push(m);
          break;
      }
    };
  }

  alloc() {
    for (const v of this.pool) if (!v.active) return v;
    const v = this.pool[this.rr % this.pool.length];
    this.rr += 1;
    return v;
  }

  fire(ev) {
    if (this.kit) {
      const part = (ev.part | 0) % 4;
      const freq = 440 * Math.pow(2, ((ev.note ?? 60) - 69) / 12);
      this.pool[part].noteOn({ freq, note: ev.note, vel: ev.velocity, gateSec: 0.1, params: this.partParams[part] });
      return;
    }
    const offsets = this.desc.notesFor(ev.note, this.params);
    const gateSec = typeof ev.gateSec === 'number' ? ev.gateSec : 0.1;
    // Monophonic engines reuse one voice so slide steps can glide legato into
    // it; polyphonic engines allocate a fresh voice per note.
    if (this.desc.mono) {
      const off = offsets.length ? offsets[0] : 0;
      const freq = 440 * Math.pow(2, (ev.note - 69 + off) / 12);
      this.pool[0].noteOn({ freq, note: ev.note, vel: ev.velocity, gateSec, params: this.params, slide: !!ev.slide, accent: !!ev.accent });
      return;
    }
    for (const off of offsets) {
      const freq = 440 * Math.pow(2, (ev.note - 69 + off) / 12);
      const v = this.alloc();
      v.noteOn({ freq, note: ev.note, vel: ev.velocity, gateSec, params: this.params });
    }
  }

  process(_inputs, outputs, parameters) {
    const out = outputs[0];
    const ch0 = out[0];
    const chR = out.length > 1 ? out[1] : null;
    const n = ch0.length;
    const blockStart = currentFrame / sampleRate;

    // Effective engine params = base (knobs) + mod offsets, clamped 0..1. Voices
    // read this.params live, so a modulated control sweeps held notes.
    for (let i = 0; i < 5; i++) {
      const off = parameters['m' + i];
      let v = this.base[i] + (off ? off[0] : 0);
      this.params[i] = v < 0 ? 0 : v > 1 ? 1 : v;
    }

    const cutoffArr = parameters.cutoff;
    const hpArr = parameters.hp;
    const vcaArr = parameters.vca;
    const cutConst = cutoffArr.length === 1;
    const hpConst = hpArr.length === 1;
    const vcaConst = vcaArr.length === 1;
    const stereo = this.stereo;

    for (let i = 0; i < n; i++) {
      const t = blockStart + i / sampleRate;
      for (let k = this.events.length - 1; k >= 0; k--) {
        if (this.events[k].time <= t) {
          this.fire(this.events[k]);
          this.events.splice(k, 1);
        }
      }

      let sL = 0;
      let sR = 0;
      for (let v = 0; v < this.pool.length; v++) {
        const voice = this.pool[v];
        if (!voice.active) continue;
        if (stereo) {
          voice.renderStereo();
          sL += voice.outL;
          sR += voice.outR;
        } else {
          const s = voice.render();
          sL += s;
          sR += s;
        }
      }
      sL *= 0.6;
      sR *= 0.6;

      let cut = cutConst ? cutoffArr[0] : cutoffArr[i];
      cut = cut < 0 ? 0 : cut > 1 ? 1 : cut;
      const a = Math.max(0.0006, cut * cut);
      this.lpL += (sL - this.lpL) * a;
      this.lpR += (sR - this.lpR) * a;

      // One-pole high-pass on the channel: hp 0 = open, higher cuts more low
      // end. Together with the lowpass above this makes a band filter.
      let hp = hpConst ? hpArr[0] : hpArr[i];
      hp = hp < 0 ? 0 : hp > 1 ? 1 : hp;
      const ah = hp * hp * 0.45;
      this.hpL += (this.lpL - this.hpL) * ah;
      this.hpR += (this.lpR - this.hpR) * ah;
      const bpL = this.lpL - this.hpL;
      const bpR = this.lpR - this.hpR;

      let vca = vcaConst ? vcaArr[0] : vcaArr[i];
      vca = vca < 0 ? 0 : vca > 4 ? 4 : vca;
      const l = Math.tanh(bpL * 1.2) * vca;
      const r = Math.tanh(bpR * 1.2) * vca;
      ch0[i] = l;
      if (chR) chR[i] = r;
    }

    // Any channels beyond the first two mirror the left channel.
    for (let c = 2; c < out.length; c++) out[c].set(ch0);
    return true;
  }
}

registerProcessor('voice-processor', VoiceProcessor);
