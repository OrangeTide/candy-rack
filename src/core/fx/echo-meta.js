// SPDX-License-Identifier: 0BSD

// Main-thread metadata for the Echo pedal, a lo-fi analog stereo delay after a
// PT2399-based DIY design (the dirty counterpart to the clean digital Delay).
// The DSP (EchoVoice in ../fx/voices.js) models the audible character: an
// asymmetric silicon/Schottky diode overdrive on the input, a dark PT2399 delay
// that loses top end with time, analog warble/width, companding self-
// oscillation, and a dry/wet mix. Ping toggles ping-pong; Osc (secondary
// footswitch) is a momentary self-oscillation.
export const echoMeta = {
  id: 'echo',
  label: 'Echo',
  color: '#ffa94d',
  stereo: true,
  knobs: [
    { key: 'time', label: 'Time', default: 0.40 },
    { key: 'repeats', label: 'Repeats', default: 0.45 },
    { key: 'drive', label: 'Drive', default: 0.30 },
    { key: 'tone', label: 'Tone', default: 0.45 },
    { key: 'mod', label: 'Mod', default: 0.25 },
    { key: 'mix', label: 'Mix', default: 0.50 },
  ],
  toggles: [
    { key: 'ping', label: 'Ping', default: false },
  ],
  sw2: { label: 'Osc', mode: 'momentary' },
};
