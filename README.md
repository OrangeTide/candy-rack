<!-- PUBLIC DOMAIN (CC0-1.0) -->

# candyRACK

A series of real-time audio programs that run as single self-contained HTML
pages. They share one audio and sequencer core, and each program is assembled
into a standalone `.html` file with no runtime dependencies.

Every program is a candy-colored imaginary groovebox, branded by a fruit flavor.
One shared app is reskinned per machine from a small config (brand, palette,
starter pattern). Twelve machines are built so far:

- **Grape**, funky electro
- **Lemon**, acid squelch (hard techno)
- **Strawberry**, bubblegum rave
- **Blueberry**, space jazz
- **Blackberry**, dungeon synth
- **Coconut**, generative ambient
- **Guinep**, dub techno
- **Peach**, vaporwave
- **Plum**, trip-hop
- **Orange**, sunshine breaks
- **Peppermint**, chiptune
- **Licorice**, gothic industrial

More flavors fill out the rainbow over time as new engines land.

## What it does

- **Six-track groove machines.** Each track plays independently, can be flipped
  to any engine, and has its own mixer channel: level, a band filter (lowpass
  plus highpass), pan, an aux send, and an overdrive.
- **Step sequencer.** Variable length 1 to 256 (16 steps per page), a main and an
  alt lane per track, and per-step note, velocity, and gate, plus slide
  (portamento) and tie (hold a note across steps, seamless across the loop).
  Per-track swing. Step numbers label the grid, and either a long-press or the
  EDIT toggle opens per-step editing.
- **Parameter locks.** Any step can override the engine's knob values just for
  that trigger (Elektron-style p-locks), so one step can hold its own cutoff,
  duty, chord type, or any other engine parameter. Set them on the selected steps
  from the step editor; a locked step is marked in the grid.
- **Polyphonic voice rows.** A single-note poly engine can sequence up to six
  pitched rows, one voice per row, to play a chord per step.
- **Performance transpose.** A live semitone shift of the whole sequence, in the
  spirit of the 303 and SH-101 keyboard perform. Play it from the computer
  keyboard or the on-screen piano; the same keys set a selected step's note while
  editing.
- **Nineteen engine types.** Subtractive (ACID/TB-303, SH-101, CS-SAW, and the
  MS-20 with its screaming Sallen-Key filter), FM (2-operator, a DX7 6-operator
  core behind E.PIANO and FM BASS, and the DX100 "Lately Bass"), a stereo
  SUPERSAW, a CHORD generator, a VOWEL formant/talkbox, DTMF, a PULSE chiptune
  voice, a RINGS modal resonator, drum and percussion voices, and a SAMPLE
  ROMpler. Each engine has the same five normalized controls with per-engine
  labels, plus up to three toggles.
- **RINGS.** A modal resonator in the Mutable Instruments Rings spirit: a bank
  of tuned resonators, excited by a strike or bowed continuously, whose partials
  morph from harmonic (a string) to inharmonic (a bell or metal bar), with a
  ring-mod option for clangorous metallic tones.
- **PULSE.** A chiptune voice in the NES 2A03 spirit: a band-limited
  variable-duty pulse, a quantized triangle, and an LFSR noise mode, plus a
  built-in arpeggiator that cycles a chord shape fast so one channel reads as a
  chord.
- **SAMPLE.** A primitive ROMpler in the SP-404 spirit. Its factory samples are
  synthesized in code at load (a maj9 pad, a choir, a Rhodes, vinyl crackle, and
  a drum break), so they are small, copyright-free, and deterministic, and a
  starter that plays the sampler renders identically offline. The played note
  pitches the sample; in Slice mode the note picks one of 16 slices to chop a
  break. A lo-fi Tone and Crush give the SP-404 grit.
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

## Sidechain and pumping

The modulation matrix has no dedicated sidechain control. The pump is built from
the ordinary parts: a trigger source drives a track's Level with negative
polarity. This note records the two patterns the machines use, since the second
one is not obvious.

Standard pump. Route a trigger to the target track's Level (VCA) with a negative
polarity and a short decay. The trigger fires an offset that dips the level on
each hit and recovers over the decay time. A kick part triggering the bass VCA is
the classic four-on-the-floor duck. In a starter route it looks like this:

```js
{ src: { type: 'trig', track: 0, lane: 'part0' },   // the kit's kick part
  dest: { track: 1, param: 'vca' }, depth: 0.5, polarity: -1, decay: 0.16 }
```

Grape, Guinep, and Coconut pump this way.

Sidechain from a chopped break (the silent-slice trick). When the kick lives
inside a sampled break played by the SAMPLE engine in Slice mode, there is no
separate kick lane to trigger from, and the break's main lane fires on every chop
step, not just the down-beats. The trick: put triggers on the track's ALT lane at
the down-beats, and point them at a slice of the break that is silent (an empty
16th with no drum hit). The alt voice fires that silent slice, so it adds no
audible sound, but it still fires the modulation matrix's trigger source, which
ducks the bass. In the Plum and Orange starters:

```js
// T0 is the SAMPLE engine in Slice mode; note 60 + sliceIndex picks a slice.
// Slice 3 of the factory Break is silent, so note 63 is an inaudible trigger.
paint(t0, 'alt', [0, 8], { note: 63, gate: 0.1, vel: 1 });   // down-beats only
// ...then route the alt lane's trigger to the bass Level:
{ src: { type: 'trig', track: 0, lane: 'alt' },
  dest: { track: 1, param: 'vca' }, depth: 0.3, polarity: -1, decay: 0.16 }
```

One caveat when testing a sidechain headless: a muted source track does not fire
its trigger source in the offline renderer, so isolating the bass by muting the
break turns the duck off and hides it. Compare the full mix with and without the
route instead.

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
