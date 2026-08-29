// SPDX-License-Identifier: 0BSD

// Knob value formatters. A knob stores a normalized 0..1 value; its readout does
// not have to be a percentage. A knob's metadata may carry a `format(v)` that
// turns that normalized value into a display string (a chord name, a delay time
// in milliseconds, a pan position). makeKnob() calls it for the label; when a
// knob declares none it falls back to fmtPercent.
//
// A formatter that maps to a real unit (time, Hz, dB) must mirror the DSP's own
// mapping from the same 0..1 value, so define it next to a comment pointing at
// the voice it tracks. These are pure and UI-only; the audio path never sees them.

// The default: a plain percentage.
export function fmtPercent(v) {
  return Math.round(v * 100) + '%';
}

// A stepped selector: the knob picks one of `names` in equal buckets, the same
// quantization the engine uses (floor(v * count), clamped). Pass the same name
// list the DSP indexes so the readout names the actual selection.
export function fmtEnum(names) {
  const n = names.length;
  return (v) => names[Math.max(0, Math.min(n - 1, Math.floor(v * n)))];
}

// A duration in seconds, shown as milliseconds under a second and seconds above.
export function fmtDuration(sec) {
  if (sec < 1) return Math.round(sec * 1000) + ' ms';
  return sec.toFixed(2) + ' s';
}

// A multiplier, e.g. a time-scale or gain factor: "x2.5".
export function fmtMultiplier(x) {
  return 'x' + x.toFixed(1);
}

// Pan, from a 0..1 knob where 0 is hard left, 0.5 centre, 1 hard right. Reads as
// C, or L/R with the distance from centre in percent.
export function fmtPan(v) {
  const p = Math.round((v * 2 - 1) * 100);
  if (Math.abs(p) < 2) return 'C';
  return (p < 0 ? 'L' : 'R') + Math.abs(p);
}
