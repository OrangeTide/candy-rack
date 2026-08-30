<!-- PUBLIC DOMAIN (CC0-1.0) -->

# candyRACK

A series of real-time audio programs that run as single self-contained HTML
pages. They share one audio and sequencer core, and each program is assembled
into a standalone `.html` file with no runtime dependencies.

Every program is a candy-colored imaginary groovebox, branded by a fruit flavor.
One shared app is reskinned per machine from a small config (brand, palette,
starter pattern). Six machines are built so far:

- **Grape**, funky electro
- **Lemon**, acid squelch (hard techno)
- **Strawberry**, bubblegum rave
- **Blueberry**, space jazz
- **Blackberry**, dungeon synth
- **Coconut**, generative ambient

More flavors fill out the rainbow over time, for example a gothic-industrial
machine would be Licorice.

## What it does

- **Six-track groove machines.** Each track plays independently, can be flipped
  to any engine, and has its own mixer channel: level, a band filter (lowpass
  plus highpass), pan, an aux send, and an overdrive.
- **Step sequencer.** Variable length 1 to 256 (16 steps per page), a main and an
  alt lane per track, and per-step note, velocity, and gate, plus slide
  (portamento) and tie (hold a note across steps, seamless across the loop).
  Per-track swing. Step numbers label the grid, and either a long-press or the
  EDIT toggle opens per-step editing.
- **Polyphonic voice rows.** A single-note poly engine can sequence up to six
  pitched rows, one voice per row, to play a chord per step.
- **Performance transpose.** A live semitone shift of the whole sequence, in the
  spirit of the 303 and SH-101 keyboard perform. Play it from the computer
  keyboard or the on-screen piano; the same keys set a selected step's note while
  editing.
- **Sixteen engine types.** Subtractive (ACID/TB-303, SH-101, CS-SAW, and the
  MS-20 with its screaming Sallen-Key filter), FM (2-operator, a DX7 6-operator
  core behind E.PIANO and FM BASS, and the DX100 "Lately Bass"), a stereo
  SUPERSAW, a CHORD generator, a VOWEL formant/talkbox, DTMF, and drum and
  percussion voices. Each engine has the same five normalized controls with
  per-engine labels, plus up to three toggles.
- **KIT.** A four-part drum machine on one track (freely assigned kick, snare,
  hat, clap, cowbell voices in 808 and 909 flavors), so a whole kit stays one
  mixer channel.
- **Modulation matrix.** Pattern-level routes from four source types (a trigger
  bus, an LFO that can free-run or lock to the tempo, an engine envelope
  follower, and the GEN generative source) to any track's filter, hi-pass, level,
  or overdrive, its engine parameters, the master volume, a note pitch, or a
  gate.
- **GEN generative source.** A hybrid of a Turing Machine, Marbles, a random
  walk, and sample-and-hold, with a mode you can switch live. It can sequence a
  track's pitch (each generator with its own root key and scale), gate its rhythm
  (pair the two for a fully generative voice), and modulate parameters, with X and
  Y outputs and a live value LED. See `docs/GEN-SOURCE-DESIGN.md`.
- **FX pedal rack.** A four-pedal aux loop (A, B, C, D chained into a stereo
  return) fed by the channel sends. Each pedal picks a type the way a track picks
  an engine: delay, analog echo, a dimension chorus, reverb, a vaporwave tape
  wash, an octave, and drive pedals (fuzz, a Big Muff, a RAT, and a distortion).
- **Persistence.** Patterns autosave to the browser per machine, with JSON export
  and import, and an offline renderer records the full mix to a WAV.

The DSP runs in AudioWorklets, reimplemented rather than ported. The sequencer
runs on the main thread with a lookahead scheduler that hands the worklets
sample-accurate trigger times.

## Build and run

Prerequisites:

- Node.js with npm. The first `make` installs esbuild locally through npm. This
  is all you need to build, run, and check the programs.
- ImageMagick (`convert`) and optipng, optional. These are used only by
  `make icons`, which regenerates the favicon set from the icon masters. A normal
  build does not need them.

```sh
make            # builds build/index.html plus one build/<machine>.html each
```

Open `build/index.html` for the landing page, which lists the machines, then pick
a flavor. Each machine is its own file, for example `build/grape.html` or
`build/coconut.html`. Press Play, or press the space bar. Audio starts after the
first click, which browsers require. The page pulls two web fonts from Google
Fonts as a progressive enhancement and falls back to system fonts when offline.

## Command-line audio checks

The engines and the mod matrix are plain JavaScript, so they run headless under
Node.

```sh
make check                  # assertion checks over the DSP, the shipped bundle, and the sequencer
make wav ENGINE=chord       # render one engine to a listenable WAV in build/
make mix MACHINE=coconut    # render a machine's full six-track groove to build/preview-<machine>.wav
```

See `docs/TESTING.md` for the details and ad-hoc probing recipes.

## Layout

```
src/core/            shared audio core, reused across programs
  transport.js       master and per-track tempo
  clock.js           lookahead scheduler
  sequencer.js       pattern data model, lanes, mod routes, tempo-sync
  gen.js             generative source (Turing / Marbles / walk / S&H)
  format.js          knob value formatters (Hz, dB, ms, chord names, ...)
  registry.js        main-thread engine metadata
  engines/           per-engine metadata (labels, defaults, toggles)
  worklet/           AudioWorklet DSP: runtime host, envelope, engine voices
  fx/                FX pedal registry and voices (shared with offline)
  offline-render.js  headless renderer that mirrors the live signal path
src/programs/rack/     the shared app: audio wiring, UI, mod matrix, HTML shell
src/programs/machines/ per-machine config + starter pattern
src/programs/landing/  the landing page
test/                headless checks and WAV renderers
docs/                design notes, wishlist, testing guide
Makefile, build.mjs  esbuild bundles each machine into one standalone HTML
```

A machine is a config module in `src/programs/machines/<name>.js` that exports its
brand, palette, and starter pattern. `build.mjs` bundles the one shared app once
and reskins it per machine through an esbuild alias, so adding a machine is a
config plus a starter plus a build entry plus a landing card.

## Inspiration

The rack format is inspired by ssx360's rack-02. The engines and the modulation
take ideas from the open source Mutable Instruments algorithms (Marbles, and the
Turing Machine), classic hardware such as the Roland JP-8000 supersaw, the TB-303
and SH-101, the Korg MS-20 filter, and Yamaha FM, and the bright, toy-like E-MU
Command Station workstations.

## License

Source code is under the BSD Zero Clause License (0BSD). Documentation and other
non-code content are dedicated to the public domain under CC0-1.0. Each file
carries an SPDX header. See [LICENSE](LICENSE).
