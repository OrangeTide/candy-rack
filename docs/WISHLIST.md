<!--
PUBLIC DOMAIN (CC0-1.0)
This document has no copyright. See https://creativecommons.org/publicdomain/zero/1.0/
-->

# Wishlist

Running list of instruments, engines, and features to build after the vertical
slice proves the core. Nothing here is committed to a milestone yet.

## Drum and percussion voices

Target: a decent electro kit. Model the classic character rather than clone it.

- Clap, BOSS DR-110 style
- CR-78 family:
  - Drum (bass / tom voice)
  - Snare
  - Rimshot
  - Congas
  - Guiro
  - Tambourine

These share the 5-control engine contract. Labels change per voice. Group them
under a single "analog percussion" engine family so a track can pick a voice,
or keep them as separate engines in the registry. Decide when we build them.

## Synth and texture engines

We cherry-pick specific synthesis models as standalone engines rather than
porting the whole Plaits or Braids macro-oscillator with its mode-switch
packaging. Each model is just an engine in our registry.

Building now:

- 2-OP FM (from the FM family): Ratio, Index, Feedback, Decay, Drive
- Chord generator: Type, Detune, Wave, Decay, Drive. Root from the step note,
  Type selects the interval set.
- CS-SAW: a fat CS-80 style sawtooth in the spirit of the Braids CSAW model.
  Timbre, Color, Detune, Decay, Drive. Approximation, not a literal port.

SUPERSAW (built): a JP-8000 / Acid Rain Chainsaw style detuned saw stack for
pads and drones, from the notes in ~/Documents/supersaw-algo.pdf. Controls:
Detune, Waves (1-9 per cluster), Color, Decimate (sample-rate reduction), Drive.
PolyBLEP anti-aliasing, non-linear detune spread, random phases, pad-style
slow-attack / long-release envelope. Deferred pieces from the notes: true stereo
interleaved spread, saw-to-square morphing, AKWF wavetable oscillators, and
oversampling. These fit the future per-engine extras pop-up.

Later:

- Rings resonator
- Beads / Clouds granular
- Sampler, primitive AKAI / SP-404 subset

## UI direction

Long-term target is a skeuomorphic groovebox panel, but not ReBirth RB-338. The
look is candy-colored hardware in the spirit of the E-MU Command Station series,
bright and toy-like.

Each standalone machine (program) is branded by a single fruit flavor tied to a
color. We invent imaginary machines to fill out a rainbow:

- red = Strawberry
- orange = Orange
- yellow = Lemon
- green = Lime
- purple = Grape

The palette is not limited to the rainbow. A machine's flavor follows its genre,
for example a gothic-industrial machine would be Licorice (black).

The machine we are building now is the **Grape** machine: funky electro, purple.
Its current palette already leans purple, so the skin builds on that.

Short-term we build functionality first and accept a plainer look, then layer
the skeuomorphic panel, knobs, and lamps on top once the engine and sequencer
work.

### Future genre programs

Ideas for later machines, each a fruit brand tied to a genre and color, grouped
by build cost. Current backlog: Bubblegum rave (cheap, planned next), acid
squelch (needs a 303-style mono engine), sunshine breaks (gated on the sampler),
dub techno (gated on the FX-send section), gothic-industrial / Licorice (needs
distortion, ring-mod, and a Rings-style engine).

Cheapest, content plus existing engines:

- **Blueberry**, space jazz / electronic blues, midnight blue. EPIANO Rhodes,
  FM BASS walking lines, CHORD 7th and 9th voicings. Wants richer chord Type
  sets (min7, dom7, dim). The closest one to free.
- **Blackberry**, dungeon synth / electronic-folk, deep desaturated indigo.
  Detuned CHORD pads, VOWEL as a choir or monk drone, EPIANO retuned to a bell
  or harpsichord. Wants the tempo-synced tape-wobble LFO.

One small engine:

- **Green Apple**, chiptune / bitpop, acid lime. Bit-crushed pulses (SUPERSAW
  Decimate already reduces sample rate); needs a pulse or duty-cycle engine and
  an arpeggiator.

Gated on the sampler:

- **Peach**, vaporwave / mallsoft, pastel pink-orange with chrome. Pitched-down
  EPIANO, heavy swing, slow tempo.
- **Plum**, trip-hop / downtempo, bruised purple-red. FM BASS, dusty EPIANO,
  swing, sidechain; wants chopped breaks.

Gated on the FX-send section (reverb and delay):

- **Coconut**, ambient, pale bone-white. SUPERSAW and CHORD drones, long ties,
  slow filter LFOs.

## Features

### Modulation matrix (routable triggers and mod)

A mod matrix in the style of the Arturia MicroFreak. Routes are pattern-level,
not per-step. Primary use: sync a bass line to the kick, sidechain style.

Sources:

- Trigger bus: any track's triggers (main or alt lane) as a mod pulse.
- Standard sequencer sources: envelope(s) and LFO(s) per track.
- Engine mod outputs: each engine may expose 1 or 2 of its own mod outputs
  beyond the usual sources, whatever is musically interesting for that voice.

Destinations:

- Per-voice output stage: filter cutoff, VCA (amplitude).
- Any of the 5 engine controls.

Per route: source to destination, depth, polarity (positive or inverted for
ducking), and a shape so a trigger becomes a pulse, not just a gate.

Data model impact: routes are a separate pattern-level list, plus each engine
declares its mod outputs in its registry metadata. Keep the matrix out of the
vertical slice, but leave room in the pattern schema and the engine contract so
adding it later is not a migration.

The matrix, trigger bus, and LFO sources are built. The engine mod outputs and
engine-control destinations are still open.

### MIDI support (low priority)

Play the current instrument with MIDI note events from external gear. A MIDI DIN
icon opens the MIDI setup. It is disabled by default because browser Web MIDI
support is not always available, so it must fail gracefully when absent. First
version is just live play of the selected track's engine from incoming note on
and off. More sophisticated editing (recording to the sequencer, mapping
controls) can come later.

### WAV recorder

Record the current song as a single pass through the pattern into a downloadable
WAV. Three modes control how the end is handled:

- One-shot: the naive version. Record from the pattern start to its end, so the
  file is exactly N seconds, the length of the pattern at the current BPM and
  step count. Tails that ring past the last step are cut off.
- Tails: keep recording past the pattern length until the voices decay, so
  envelopes and long releases are not cut off abruptly. The file is longer than
  one N-second pass.
- Loop: same predictable N-second length as one-shot, but the tail that would
  ring past the end is wrapped around and mixed into the start of the pattern, as
  if the pattern had already been looping. This makes a WAV that repeats
  seamlessly with no gap or cut tail at the loop point.

Implementation note: render offline (an OfflineAudioContext, or the same headless
render path used by test/render-mix.mjs) so timing is exact and independent of
real-time playback.
