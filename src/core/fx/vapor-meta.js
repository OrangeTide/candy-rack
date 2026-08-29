// SPDX-License-Identifier: 0BSD

// Main-thread metadata for the VaporCloud pedal, a one-knob vaporwave tape-wash
// after an RP2040 single-knob ambient-delay design. The DSP (VaporVoice in
// ../fx/voices.js) is a stereo modulated delay whose Wash macro morphs four
// things at once across three zones: dry-dominant slap -> tape wobble cloud ->
// infinite ambient wash. Wash drives the feedback tail, the LFO wow/flutter
// depth, and a 1-pole low-pass INSIDE the feedback so successive repeats darken
// like over-biased tape. The other knobs stay independent so the pedal is
// usable across machines: Time scales the base tap from chorus-smear into
// audible echoes, Tone biases the darkening bright or dark, Mod trims the LFO,
// Width decorrelates the two lines from mono to anti-phase, Mix is dry/wet.
// Dream fades the dry out as Wash rises for a 100% wash; Hold (secondary
// footswitch) freezes the buffer into an infinite drone.
import { fmtMultiplier } from '../format.js';

export const vaporMeta = {
  id: 'vapor',
  label: 'VaporCloud',
  color: '#ff8fd0',
  stereo: true,
  // The hero knob: rendered at ~2x while the rest shrink to micro trim pots, so
  // the one-knob identity reads at a glance even though the trims are there.
  hero: 'wash',
  knobs: [
    { key: 'wash', label: 'Wash', default: 0.50 },
    // Time scales the base tap 1x..8x (VaporVoice timeScale = 1 + time * 7).
    { key: 'time', label: 'Time', default: 0.30, format: (v) => fmtMultiplier(1 + v * 7) },
    { key: 'tone', label: 'Tone', default: 0.50 },
    { key: 'mod', label: 'Mod', default: 0.55 },
    { key: 'width', label: 'Width', default: 0.75 },
    { key: 'mix', label: 'Mix', default: 0.55 },
  ],
  toggles: [
    { key: 'dream', label: 'Dream', default: false },
  ],
  sw2: { label: 'Hold', mode: 'momentary' },
};
