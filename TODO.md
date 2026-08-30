# TODO

Cleaned 2026-08-30: completed items removed. Every genre on the original board is
built (Grape, Lemon, Strawberry, Blueberry, Blackberry, Coconut, Guinep, Peach,
Plum, Orange, Peppermint, Licorice) and the 80s electro-funk, sequencer, and
early GEN work all landed. What remains is open-ended backlog.

## Future engines

- [ ] PPG Wave / wavetable engine: a wavetable oscillator with a scannable wave
      position (a good mod-matrix destination). Bigger (wavetable data +
      interpolation). Not needed for acid house; good for the pad/lead genres.
- Future variant idea (from MS-20): the miniKORG 700 "Traveler" (series LP+HP
  sweepable bandpass).

## Future genre programs

The machine framework (build/<name>.html from a machine config) makes each new
content-ready program cheap: a config + a starter + a build entry + a landing
card. Every genre on the original board is built. Remaining backlog is open-ended
(new genres/engines).

## Generative modulation source (GEN)

GEN v1 and v2 (partial) are done: Turing/Marbles/WALK/S&H modes, Pitch and Gate
destinations, X/Y outputs, per-route value LED, offline-render parity. Full spec:
docs/GEN-SOURCE-DESIGN.md. Still open:

- [ ] Mode as a mod destination (modulate which algorithm is running).
- [ ] A free-running tempo-synced clock. Currently the gen clocks per X-dest-track
      step; a free clock (SYNC_DIVS division, independent of any track) would let
      it run at its own rate.
- [ ] A value LED for the Y output (X has one; Y does not).
- [ ] Determinism follow-up: a reseed/mutate perform action (per-route RNG seeding
      for offline/WAV parity is already done).
- [ ] (Optional, cosmetic) render matrix routes as little patch-cord graphics for
      the modular LOOK, without making them free-patchable.

## Cross-loop hold (deferred follow-ups)

- [ ] Slide continuity on poly (poly glide is ambiguous; tie/hold is the drone
      win, already done).
- [ ] Offline warm-up pass so an EXPORTED drone WAV does not attack at the tile
      start. Realtime is seamless; only the recorded first loop cold-starts. A
      two-pass render would fix the WAV.

## Sample Engine

- [ ] global transpose can make percussion style sample loops inaudible. potential solution: add a track option to disable participating with transpose.
- [ ] add ability to select from multiple sample slots
- [ ] add ability to upload sample packs.

## Recording

- [ ] add a real-time recording option.
  - recording time limited by RAM size / max allocation in a browser
  - can record the master out only (2 channel) or multitrack
  - 9-10 minutes at 16-bit mono at 44.1 kHz is about 50MB per track (not exactly).
  - For multitrack that is 6 mono channels + the stereo FX return, or about 400 MB needed for a reasonable song or short jam session.

## Sequencing

- [ ] design a sequencer that is not quantized to 16 steps. (it will be 256 instead)
  - imagine a row that can have the same candy button shape triggers placed on it, but more freely. with 16 possible sub-steps for the button. 
  - if clicking on the row normally, the buttons are places in their usual 16 steps per track position
  - in micro timing editing, the buttons can be dragged or stretch. they are actually gate markings that just happened to look like a traditional 16 button interface when the default gate length and size is used.
