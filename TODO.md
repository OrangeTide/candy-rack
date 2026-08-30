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

Offline WAV export already exists (`record.js` bounces the pattern to a 16-bit
stereo WAV). The new capability is capturing a live take, including the
performance moves the offline render leaves out on purpose: transpose, live
mutes, knob tweaks, and GEN mode switches. Frame it as bounce (Export) versus
jam (Record) so the two WAV paths do not confuse the user.

- [ ] Live recording (master out, 2 channel). Tap the master bus and capture the
      live performance to a downloadable file.
  - Label it "Live" (or "Record") next to the existing Export so the difference
    is obvious: Export bounces the pattern deterministically, Live captures what
    you actually played.
  - Capture is Float32 at the AudioContext rate (48 kHz), so budget the RAM in
    that format, not 16-bit at 44.1 kHz. A stereo minute is about 23 MB held
    live; convert to 16-bit at encode time.
  - Impose a hard time cap with a visible remaining-time readout, and stop
    cleanly before the tab runs out of memory. An unbounded record that OOMs
    loses the whole take.
  - A `MediaStreamDestination` plus `MediaRecorder` is the cheap path for a
    master-only tap. Decide whether the download is WAV (needs a PCM tap and our
    own encoder) or the browser's compressed default.

### Multitrack recording (aspirational)

- [ ] Capture the mixer channels as separate stems (6 mono channels plus the
      stereo FX return), delivered as a ZIP of per-channel WAVs.
  - A different, heavier mechanism than the master tap: per-channel AudioWorklet
    taps writing into growing buffers, then stitching and encoding N files.
  - The RAM cost is real. Eight channels of Float32 at 48 kHz for a 10-minute
    jam is roughly 900 MB held live, about 460 MB if down-converted to 16-bit
    per block during capture. Both are heavy for a browser tab.
  - Deferred until Live recording proves the capture path.

## Sequencing

Per-step micro-timing shipped as a p-lock, not a sequencer rebuild. Each step
carries a `nudge` value (a fraction of a step, -0.5 to 0.5) that shifts the
note's onset off the grid while the sequencer keeps clocking on the grid. It is
edited from the Nudge slider in the step editor, works on every lane including
drum parts, and mirrors in the offline WAV render. Gate length already provides
the duration bump. The grid stays 16-per-page with variable length up to 256
steps, so "256 steps" keeps its existing meaning (pattern length, not timing
resolution).

Still open:

- [ ] QUANTIZE toggle, a lamp beside EDIT, on by default. Off, dragging a placed
      step on the grid edits its nudge and gate directly, so micro-timing gets a
      hands-on editor in addition to the slider. On, steps stay locked to the
      grid and the drag does nothing. This is the one place a drag gesture
      belongs, so it does not collide with tap-to-place or tap-to-select.
- [ ] A visible off-grid marker on nudged steps, so micro-timing is never hidden
      state. Useful with the slider alone, and required before the drag UI.
- [ ] Confirm how nudge composes with per-track swing. They add today; check the
      clamp keeps a nudged off-beat from crossing into the next step.
