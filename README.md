<!-- PUBLIC DOMAIN (CC0-1.0) -->

# candyRACK

A series of real-time audio programs that run as single self-contained HTML
pages. They share one audio and sequencer core, and each program is assembled
into a standalone `.html` file with no runtime dependencies.

Every program is a candy-colored imaginary groovebox, branded by a fruit flavor.
The machine in this repository is **Grape**, a funky electro six-track groove
synthesizer. Future machines get their own flavor to fill out the rainbow, for
example a gothic-industrial machine would be Licorice.

## What it does

- Six tracks that play together, each independently timed.
- An Elektron-style step sequencer: variable length 1 to 256, 16 steps per page,
  a main and an alt trigger lane per track, and per-step note, velocity, and
  gate.
- Any track can be flipped to any engine. Every engine has the same five
  controls with labels that change per engine.
- Engines: an analog drum voice, 2-operator FM, a chord generator, a CS-80 style
  fat saw (CS-SAW), and a stereo supersaw for pads and drones.
- A modulation matrix with pattern-level routes. Trigger-bus and LFO sources can
  drive any track's filter or level, which gives sidechain ducking and filter
  movement locked to the drums.
- Patterns autosave to the browser, with JSON export and import.

The DSP runs in AudioWorklets. The sequencer runs on the main thread with a
lookahead scheduler that hands the worklets sample-accurate trigger times.

## Build and run

Prerequisites:

- Node.js with npm. The first `make` installs esbuild locally through npm. This
  is all you need to build, run, and check the programs.
- ImageMagick (`convert`) and optipng, optional. These are used only by
  `make icons`, which regenerates the favicon set from the icon masters. A normal
  build does not need them.

```sh
make            # builds build/index.html (landing) and build/rack.html
```

Open `build/index.html` for the candyRACK landing page, which lists the
machines, then pick a flavor. The Grape machine is `build/rack.html`. Press Play,
or press the space bar.
Audio starts after the first click, which browsers require. The page pulls two
web fonts from Google Fonts as a progressive enhancement and falls back to
system fonts when offline.

## Command-line audio checks

The engines are plain JavaScript, so they run headless under Node.

```sh
make check              # assertion checks over the engines and the shipped bundle
make wav ENGINE=chord   # render one engine to a listenable WAV in build/
make mix                # render the full six-track groove to build/preview-mix.wav
```

See `docs/TESTING.md` for the details and for ad-hoc probing recipes.

## Layout

```
src/core/          shared audio core, reused across programs
  transport.js     master and per-track tempo
  clock.js         lookahead scheduler
  sequencer.js     pattern data model, main and alt lanes, mod routes
  registry.js      main-thread engine metadata
  engines/         per-engine metadata (labels, defaults)
  worklet/         AudioWorklet DSP: runtime host, envelope, engine voices
src/programs/rack/ the Grape machine: audio wiring, UI, mod matrix, HTML shell
test/              headless checks and WAV renderers
docs/              design notes, wishlist, testing guide
Makefile, build.mjs  esbuild bundles each program into one standalone HTML
```

## Inspiration

The rack format is inspired by ssx360's rack-02. The engines take ideas from the
open source Mutable Instruments algorithms and from classic hardware, including
the Roland JP-8000 supersaw and the bright, toy-like E-MU Command Station
workstations.

## License

Source code is under the BSD Zero Clause License (0BSD). Documentation and other
non-code content are dedicated to the public domain under CC0-1.0. Each file
carries an SPDX header. See [LICENSE](LICENSE).
