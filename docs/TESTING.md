<!--
PUBLIC DOMAIN (CC0-1.0)
This document has no copyright. See https://creativecommons.org/publicdomain/zero/1.0/
-->

# Command-line audio checks

The engines are plain JavaScript DSP, so they run under Node without a browser.
These checks verify the sound math, the worklet message handling, polyphonic
voice allocation, and chord clustering. They do not cover the browser-only glue
(AudioContext, `audioWorklet.addModule`, and the DOM); that part is exercised by
opening `build/rack.html`.

Everything below needs the toolchain installed once with `make deps` (or any
`make` target, which installs it on first run).

## Assertion checks

Runs the four engines, checks each is audible without hard clipping, checks the
gate envelope frees pitched voices, checks a chord trigger produces several
notes, decodes the worklet bundle from `build/rack.html` to confirm it registers
and renders (and that the VCA AudioParam at 0 silences it), and builds the mod
matrix graph to confirm routes create the right source nodes and that a source
trigger schedules a pulse only on matching routes. Exits non-zero on any
failure, so it is CI friendly.

```sh
make check
```

Equivalent direct call (does not rebuild first):

```sh
node test/audio-check.mjs
```

Expected tail is `OK: all checks passed`.

## Listen to an engine

Renders one engine playing a short riff to a 16-bit mono WAV in `build/`, so you
can hear it from the shell. `ENGINE` is one of `drum`, `fm2`, `chord`, `csaw`.

```sh
make wav ENGINE=chord
```

Then play it with whatever your system has:

```sh
ffplay -autoexit build/preview-chord.wav   # ffmpeg
aplay build/preview-chord.wav              # ALSA (Linux)
paplay build/preview-chord.wav             # PulseAudio
afplay build/preview-chord.wav             # macOS
```

Direct call with a custom output path:

```sh
node test/render-wav.mjs fm2 build/my-fm.wav
```

To hear the whole 6-track starter pattern rather than one engine:

```sh
make mix                                   # build/preview-mix.wav, 4 seconds
node test/render-mix.mjs 8 build/long.wav  # custom length and path
```

## Ad-hoc probing

To poke a single engine without editing the test files, import its voice class
and measure a hit. Example, peak level and tail length of the drum:

```sh
node --input-type=module -e "
import { DrumVoice } from './src/core/worklet/engines/drum.js';
const sr = 48000, v = new DrumVoice(sr);
v.noteOn({ note: 60, vel: 110, params: [0.3, 0.5, 0.35, 0.45, 0.2] });
let peak = 0, last = 0;
for (let i = 0; i < sr * 2; i++) { const s = v.render(); peak = Math.max(peak, Math.abs(s)); if (Math.abs(s) > 1e-3) last = i; }
console.log('peak', peak.toFixed(3), 'tail', (last / sr * 1000 | 0) + 'ms');
"
```

Pitched engines take `freq` and `gateSec` in `noteOn`, for example
`v.noteOn({ freq: 220, note: 57, vel: 110, gateSec: 0.2, params: [...] })`.

To run the exact worklet code that ships in the page, decode the embedded bundle
from `build/rack.html` and stub the AudioWorklet globals. That full recipe lives
in `test/audio-check.mjs` under the "worklet bundle" section; copy it as a
starting point.

## What the numbers mean

- `peak` is the maximum absolute sample, 0 to 1. Above 1 means hard clipping.
- `rms` is loudness over the whole render. A single chord voice reads low on its
  own because several stack per trigger.
- `tail` is how long the voice stays above audibility. Pitched engines end near
  the step gate plus release; drum runs its own decay and ignores the gate.
