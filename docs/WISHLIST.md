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
bright and toy-like. We invent imaginary machines to fill out a rainbow, each
named after a fruit flavor tied to its color:

- red = Strawberry
- orange = Orange
- yellow = Lemon
- green = Lime
- purple = Grape

Short-term we build functionality first and accept a plainer look, then layer
the skeuomorphic panel, knobs, and lamps on top once the engine and sequencer
work. Open question for later: whether a flavor skins a whole standalone machine
(program) or maps onto tracks within the rack.

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
