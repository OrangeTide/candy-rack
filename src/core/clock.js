// SPDX-License-Identifier: 0BSD

// Lookahead scheduler (Chris Wilson pattern). It does not know about steps or
// tracks. It repeatedly calls a pump callback with a horizon time and lets the
// caller schedule whatever audio events fall before that horizon. This keeps
// the clock reusable for one track or many, each with its own phase.
export class Clock {
  constructor(audioCtx, { lookaheadMs = 25, aheadTime = 0.1 } = {}) {
    this.ctx = audioCtx;
    this.lookaheadMs = lookaheadMs;
    this.aheadTime = aheadTime;
    this.timer = null;
    this.running = false;
  }

  // pump(horizonTime) is called on every tick. horizonTime is an AudioContext
  // time; schedule every event with time < horizonTime, advancing your own
  // per-track cursors as you go.
  start(pump) {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      pump(this.ctx.currentTime + this.aheadTime);
      this.timer = setTimeout(loop, this.lookaheadMs);
    };
    loop();
  }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
