// SPDX-License-Identifier: 0BSD

// Small gate-aware AD envelope shared by the pitched engine voices. Fast linear
// attack, exponential decay toward zero, and a fast release when the step's gate
// ends. Percussive engines (drum) run their own amplitude decay and do not use
// this. `done` goes true when the tail has fallen below audibility so the host
// can free the voice.
export class Env {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.v = 0;
    this.stage = 'idle';
    this.done = true;
  }

  // decayNorm 0..1 sets the body length. gateSec is the step gate; when it
  // elapses the envelope releases quickly so short gates give short notes.
  trigger(gateSec, decayNorm) {
    this.done = false;
    this.stage = 'a';
    this.v = 0;
    this.atkInc = 1 / (0.003 * this.sr);
    const decaySec = 0.03 + decayNorm * 1.2;
    this.decCoef = Math.exp(-1 / (decaySec * this.sr));
    this.relCoef = Math.exp(-1 / (0.012 * this.sr));
    this.gateSamples = Math.max(1, Math.floor(gateSec * this.sr));
    this.t = 0;
    this.released = false;
  }

  // Re-arm the gate for a tied continuation without re-attacking: keep the
  // current stage and level, just extend the gate and clear the release so a
  // held/drone note sustains seamlessly across the loop instead of re-plucking.
  hold(gateSec) {
    this.gateSamples = Math.max(1, Math.floor(gateSec * this.sr));
    this.t = 0;
    this.released = false;
    if (this.stage === 'r') this.stage = 'd'; // was releasing; resume the body
    this.done = false;
  }

  process() {
    this.t += 1;
    if (!this.released && this.t >= this.gateSamples) {
      this.released = true;
      this.stage = 'r';
    }
    if (this.stage === 'a') {
      this.v += this.atkInc;
      if (this.v >= 1) { this.v = 1; this.stage = 'd'; }
    } else if (this.stage === 'd') {
      this.v *= this.decCoef;
    } else if (this.stage === 'r') {
      this.v *= this.relCoef;
    }
    if ((this.stage === 'd' || this.stage === 'r') && this.v < 1e-3) {
      this.done = true;
      this.v = 0;
    }
    return this.v;
  }
}
