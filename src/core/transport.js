// SPDX-License-Identifier: 0BSD

// Master tempo and per-track timing ratios.
// 16 steps per bar, so one step is a 16th note at the master BPM.
export class Transport {
  constructor(bpm = 120) {
    this.bpm = bpm;
  }

  // Seconds per sequencer step for a track running at the given ratio.
  // ratio > 1 runs the track faster, ratio < 1 slower. A per-track absolute
  // BPM can be expressed as ratio = trackBpm / masterBpm by the caller.
  stepDuration(ratio = 1) {
    const sixteenth = 60 / this.bpm / 4;
    return sixteenth / ratio;
  }
}
