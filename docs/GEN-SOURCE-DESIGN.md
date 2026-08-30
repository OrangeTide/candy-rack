<!-- PUBLIC DOMAIN (CC0-1.0) -->

# GEN: a generative mod-matrix source (Turing Machine + Marbles hybrid)

## Concept

One hybrid generative source for the existing mod matrix that unifies the
**Turing Machine** (looping shift register) and **Marbles** (clocked statistical
random with a deja-vu loop) into a single module with a **real-time-switchable
mode**. It is not a eurorack row and has no patch cables. It is a new source
type next to `trig` / `lfo` / `env`, so it routes to any destination with the
usual depth and polarity, several can run at once, and it is assigned through the
matrix UI you already have.

The headline performance move: **switch the generative algorithm live** while the
source keeps clocking, so the sequence morphs between a locked Turing loop, an
evolving Marbles stream, a drunk walk, and pure sample-and-hold without stopping.

## Why a source, not a modular row

The mod matrix already routes `trig` / `lfo` / `env` to cutoff, vca, hp, drive,
the engine params `m0..m4`, and the master. A patch-cable row would mirror that
same routing (the TODO said as much), so it would be a second UI for modulation
you already have. The genuinely new capability is the generative *algorithms*,
not a patchbay. Delivering them as matrix sources keeps one modulation paradigm,
reuses the route UI, and is a fraction of the work.

## Source type

- New `src.type = 'gen'` in `src/programs/rack/modmatrix.js`, alongside the
  existing types. A route stays `{ src, dest, depth, polarity, ... }`.
- Like `trig`, the source is realized as a `ConstantSource` whose `offset` is
  written by the scheduler at each clock tick (held, or ramped when smoothing).
  The generative math runs on the main thread; the audio graph stays native and
  sample-accurate. `env`/`lfo` remain native nodes; only `gen` is scheduler-driven.

## Modes (real-time switchable -- the point)

`src.mode`, changeable live from the route row (and a candidate mod destination
later, so the mode itself can be modulated):

1. **TURING** -- an N-bit shift register. Each clock the register shifts; the
   fed-back bit flips with a probability set by `lock`; the register reads out as
   a stepped value through a binary DAC. Produces related stepped variations and
   locks into a repeating loop at the `lock` extremes.
2. **MARBLES** -- each clock draws a new value from a distribution shaped by
   `range` (spread/bias), written into a loop buffer of length `length`. `lock`
   is the deja-vu amount: fully random -> evolving -> locked repeat.
3. **WALK** -- a bounded brownian / drunk walk (random increments), for smooth
   wandering modulation.
4. **S&H** -- pure sample-and-hold random each clock, no loop.

TURING and MARBLES are the core; WALK and S&H are cheap once the clock + loop
framework exists. **All modes share one clock, loop position, and loop buffer**,
so switching mode mid-stream is seamless: only the value-generation rule changes,
the length and phase carry over.

## Shared parameters (on `src`)

| param | range | meaning |
|---|---|---|
| `mode` | TURING / MARBLES / WALK / S&H | generator algorithm (live-switchable) |
| `clock` | a `SYNC_DIVS` division, or `'step'` | advance rate: tempo-synced (reuse `lfoHz`/`SYNC_DIVS`) or once per the destination track's step |
| `length` | 1..16 | loop length (deja-vu / Turing loop) |
| `lock` | 0..1 | 0 = new random each clock (no repeat), ~0.5 = evolving loop, 1 = locked repeat. Unifies Turing's chance knob and Marbles' deja-vu |
| `range` | 0..1 | output amount; for MARBLES also distribution spread/bias |
| `quantize` | off / chromatic / major / minor / penta-min / ... | scale-snap for pitch destinations |
| `smooth` | stepped / slew | hold the value (pitch, rhythm) or glide between values (continuous mod) |

## Output and destinations

- Output is a value in `[0,1]` (or bipolar `[-1,1]`), routed through
  `depth * polarity` like any source.
- **Existing destinations** (cutoff / vca / hp / drive / `m0..m4` / master) work
  unchanged: the `ConstantSource` offset is set at each clock (held) or ramped
  (smooth). A Turing loop on a filter cutoff, a Marbles stream on `m4`, etc.
- **NEW destination -- PITCH (note offset), the standout.** `dest.param = 'note'`
  turns the source into a melodic step sequencer for the destination track: at
  the track's trigger time the scheduler samples the current gen value, maps it
  through `quantize` to a semitone offset over `range` octaves, and adds it to the
  played note (the same seam as `xposed()`). This is a scheduler-time read, not an
  `AudioParam` -- a new mechanism the matrix does not have yet. Multiple gen->note
  routes onto one track sum.
- Pitch-routed gen defaults to **`clock:'step'`** (a fresh value per note); other
  destinations default to a tempo-synced division.

## Clocking

- The scheduler (`pump()` in `main.js`) advances each `gen` route's state at its
  clock ticks and writes the new value to the route's `ConstantSource.offset` at
  the exact sample time (`setValueAtTime`, or `linearRampToValueAtTime` when
  `smooth`). Reuses the tempo-sync math already added for LFOs (`lfoHz`/`SYNC_DIVS`).
- `clock:'step'` advances the source when its bound track steps, for tight
  rhythmic lock; pitch destinations read the value at that track's trigger.

## Offline render and determinism

- `offline-render.js` mirrors the per-clock advance so the WAV matches playback.
- Seed each route's RNG deterministically (e.g. from a fixed base seed + route
  index) so an exported WAV is reproducible and the loop-lock behaves identically
  offline and live. A "reseed / mutate" action (later) rerolls the seed on demand.

## UI (matrix route row)

- The source dropdown gains **GEN**. Selecting it shows: `mode` select (live),
  `clock` (division/step), `length`, `lock`, `range`, `quantize`, `smooth`, plus a
  small live value meter so you watch it generate. Everything else (dest picker,
  depth, polarity, remove) is the existing route row.
- Real-time mode switching is the feature: change `mode` while playing and the
  sequence transforms without a gap.

## Phasing

- **v1**: `gen` source; modes TURING + MARBLES; `clock` = tempo-synced division +
  `'step'`; destinations = existing params **and the new PITCH/note offset**;
  `quantize` scales; stepped/slew; deterministic offline seed. Checks: value stays
  in range and bounded, a locked loop repeats, `lock=0` does not repeat, pitch
  quantizes to the scale, offline matches realtime.
- **v2**: WALK / S&H modes; `mode` as a mod destination (modulate the algorithm);
  a gate output for trigger-style destinations; clock-from-track; a reseed/mutate
  perform button; per-route value meter animation.

## Fit with the existing code

- `modmatrix.js`: add the `gen` branch (ConstantSource + per-route state), a
  `genValue(route)` read for pitch, and teardown.
- `sequencer.js`: reuse `SYNC_DIVS`/`lfoHz`; add the scale tables for `quantize`.
- `main.js` `pump()`: advance gen routes on their clock; the note-firing path adds
  the gen->note offset (beside `xposed()`); route-row UI for the gen params.
- `offline-render.js`: mirror the advance + the note offset; seed RNG.
- Schema: `src` gains optional `mode/clock/length/lock/range/quantize/smooth`
  (additive, JSON round-trips like `sync`); `dest.param` gains `'note'`.

Name is open (`gen` in code; display could be GEN, ORACLE, SEER, ...).
