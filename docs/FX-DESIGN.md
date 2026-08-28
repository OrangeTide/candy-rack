<!-- PUBLIC DOMAIN (CC0-1.0) -->

# Effects pedal rack design

A new bottom row on the Grape machine: four guitar-style effects pedals wired
into one aux effects loop. This document is the design. It is not yet built.

Decisions locked with the user (2026-08-28):

- Each pedal slot picks its effect TYPE from an FX registry, the same way a
  track picks an engine. Any slot can become Delay, Reverb, Drive, Chorus, and
  so on.
- The four pedals are labelled A B C D left to right. Signal enters the row at
  the right (in1, next to D) and leaves at the left (out1, next to A), so the
  visible row reads right to left. This matches the algorithm notation
  `out1 <- A <- B <- C <- D <- in1`.
- First build ships one real effect type, Delay, plus an empty `thru` type.
  Reverb, Drive, and Chorus are later registry entries, not new plumbing.
- DSP stays custom AudioWorklet code, consistent with the locked engine
  decision. No native DelayNode or ConvolverNode.

## 1. Signal flow and the send/return loop

The mixer already has the seam. Every channel strip taps post-pan into a `send`
gain (0..1) that feeds `host.sendBus`, a gain node deliberately left
unconnected and reserved for exactly this. See `audio.js` `channel()` and the
comment on `sendBus`.

The loop closes like this:

```
channel.panner --send(0..1)--> sendBus (MONO)
    sendBus -> [ D -> C -> B -> A ]  (the algorithm) -> returnBus (STEREO)
    returnBus --pan--> returnPanner --level--> master (channel sum bus)
```

- The send bus is mono. Channel sends carry the panned stereo signal, so the
  send bus input downmixes to one channel: configure `sendBus` with
  `channelCount = 1`, `channelCountMode = 'explicit'`. One mono send feeds the
  whole pedal chain.
- The return bus is stereo. Most pedals are mono in and mono out (they write
  the same sample to both output channels), but a stereo pedal (ping-pong
  delay, stereo reverb, chorus) writes L and R separately. The bus is stereo so
  those widen correctly, and so the infrastructure does not need a rewrite when
  the first stereo effect lands.
- The return has a Return Level and a Return Pan, and both live on the master
  mixer strip, not on the pedal rack (the per-channel Sends already own the send
  side; Return Level and Return Pan complete the mix side). The graph is
  `returnBus -> returnPanner (StereoPanner, pan) -> returnGain (level) ->
  master`. It mixes into `master` (the channel sum bus), so the master DJ filter
  and limiter act on the wet signal too. There is no feedback path: the send is
  tapped from channel panners, never from `master`, so `returnBus -> master`
  cannot loop back into `sendBus`.

Only one loop exists now. It is `out1`. Later loops become `out2`, `out3`, and
each adds its own send bus, its own pedal row, and a per-channel send to that
loop. The data model (section 5) is already a list of loops so this is additive.

## 2. The pedal contract

Mirrors the engine contract so the registry, the flip UI, and the offline
renderer all reuse existing shapes.

Main-thread meta (one per effect type, in `src/core/fx/<id>-meta.js`):

```js
export const delayMeta = {
  id: 'delay',
  label: 'Delay',
  color: '#35e8ff',                 // pedal enclosure accent
  knobs: [                          // up to 4 normalized 0..1 controls
    { key: 'time',     label: 'Time',     default: 0.4 },
    { key: 'feedback', label: 'Repeats',  default: 0.45 },
    { key: 'tone',     label: 'Tone',     default: 0.6 },
    { key: 'mix',      label: 'Mix',      default: 0.5 },
  ],
  stereo: true,                     // writes outL/outR separately
  Voice: DelayVoice,                // the DSP class (shared, section 4)
};
```

Worklet/offline DSP class (in `src/core/fx/voice/<id>.js`, shared code):

```js
class DelayVoice {
  constructor(sr) { ... }
  setParams(values) { ... }         // full 0..1 array, read live
  setBypass(on) { ... }             // footswitch, ramped internally
  // Block process. inL/inR are the (mono) input; a mono effect ignores inR.
  // Writes outL/outR. Bypass is a smoothed dry/wet inside here so a stomp
  // during playback does not click and the graph is never rewired.
  process(inL, inR, outL, outR, n) { ... }
}
```

The `thru` type is the empty slot: `process` copies input to both outputs, no
knobs. A fresh loop is four `thru` pedals, so raising a send with nothing loaded
passes a clean mono copy to the return.

Bypass lives inside the voice as a dry/wet crossfade ramped over about 10 ms.
The footswitch sends one `bypass` message. The audio graph topology is rebuilt
only when the algorithm changes or a pedal type changes, never on a stomp.

## 3. Routing algorithms (the FM-style picker)

Routing is data, like a DX7 algorithm. Each algorithm lists, for every slot and
for `out`, which sources feed it. `in` is the send bus; a letter is a slot.

```js
// series (default): out1 <- A <- B <- C <- D <- in1
{ id: 'series', label: 'Series',
  edges: { D: ['in'], C: ['D'], B: ['C'], A: ['B'], out: ['A'] } }

// parallel pairs (later): two chains sum at out1
{ id: 'par2', label: 'Dual',
  edges: { B: ['in'], A: ['B'], D: ['in'], C: ['D'], out: ['A', 'C'] } }

// four in parallel (later)
{ id: 'par4', label: 'Split',
  edges: { A: ['in'], B: ['in'], C: ['in'], D: ['in'], out: ['A','B','C','D'] } }
```

The host `buildFxGraph()` connects `node[src] -> node[dst]` for each edge, with
`in` = sendBus and `out` collecting into returnBus. Audio param and gain-node
summing handle merge points for free (several inputs into one node add). This is
the same teardown-and-rebuild pattern as `ModMatrix.rebuild`, so it is cheap to
call on any routing edit or pedal-type flip.

The picker draws each algorithm as a small SVG diagram from its `edges`: four
labelled boxes A B C D, arrows between them, and IN/OUT terminals, exactly like
an FM synth algorithm chart. Clicking an icon selects that topology. Only
`series` ships first; the parallel icons render but are marked "later" until
their build lands.

## 4. Where the code lives

New:

- `src/core/fx/registry.js` reserved main-thread FX registry (meta objects),
  mirroring `src/core/registry.js`.
- `src/core/fx/<id>-meta.js` per-effect meta.
- `src/core/fx/voice/<id>.js` per-effect DSP class, plain ES module. Shared,
  imported by both the worklet and the offline renderer, the way engine
  sub-voices and `kitPartVoice` already are (see `offline-render.js` importing
  from `worklet/registry.js`).
- `src/core/fx/algorithms.js` the routing algorithm table.
- `src/programs/rack/fxchain.js` the main-thread graph builder
  (`buildFxGraph`), analogous to `modmatrix.js`.

Changed:

- `worklet-entry.js` / worklet `registry.js` register a second processor,
  `fx-processor`, that hosts one FX voice and does the block process plus the
  bypass ramp. One node per pedal slot.
- `audio.js` `AudioHost` gains: connect `sendBus` as mono, create the four
  `fx-processor` nodes, a stereo `returnBus -> returnPanner -> returnGain ->
  master`, `setReturn({ level, pan })`, `setFxType`, `setFxParams`,
  `setFxBypass`, and `buildFxGraph(algorithm)`.
- `sequencer.js` schema and backfill (section 5).
- `offline-render.js` FX parity (section 6).
- `main.js` the new pedal rack UI (section 7).
- `starter.js` optional demo: one delay on slot A for the electro throws the
  TODO asks for.

## 5. Data model and persistence

Add one field to the pattern and bump the schema to version 5.

```js
pattern.fx = {
  loops: [
    {
      id: 'loop1',                    // out1
      algorithm: 'series',
      return: { level: 1.0, pan: 0 }, // returnBus level 0..1, pan -1..1
      pedals: [                       // exactly 4, index 0..3 = A B C D
        { type: 'thru', bypass: true,  params: [] },   // A
        { type: 'thru', bypass: true,  params: [] },   // B
        { type: 'thru', bypass: true,  params: [] },   // C
        { type: 'thru', bypass: true,  params: [] },   // D
      ],
    },
  ],
};
```

- Per-channel send stays where it is (`track.output.send`, one value). It feeds
  loop1. When a second loop lands, `output.send` becomes a short array, one send
  per loop, backfilled from the scalar.
- Return Level and Return Pan are stored per loop (`loop.return`), so each future
  loop keeps its own. The master mixer strip edits loop1's `return` for now; when
  a second loop lands, the strip shows one Return pair per loop.
- `bypass: true` means the effect is bypassed (footswitch up, effect off).
  Loading a real effect type sets `bypass: false` so it is audible at once.

`deserialize` backfill (after the existing version 4 block):

```js
if (!p.fx) p.fx = { loops: [ defaultLoop() ] };
for (const loop of p.fx.loops) {
  if (typeof loop.algorithm !== 'string') loop.algorithm = 'series';
  if (!loop.return || typeof loop.return !== 'object') loop.return = { level: 1.0, pan: 0 };
  if (typeof loop.return.level !== 'number') loop.return.level = 1.0;
  if (typeof loop.return.pan !== 'number') loop.return.pan = 0;
  if (!Array.isArray(loop.pedals)) loop.pedals = defaultPedals();
  while (loop.pedals.length < 4) loop.pedals.push({ type: 'thru', bypass: true, params: [] });
  loop.pedals.length = 4;
  for (const pd of loop.pedals) {
    if (typeof pd.type !== 'string') pd.type = 'thru';
    if (typeof pd.bypass !== 'boolean') pd.bypass = pd.type === 'thru';
    if (!Array.isArray(pd.params)) pd.params = defaultFxParams(pd.type);
  }
}
```

Bump the localStorage key to v3 so a stale v2 autosave does not shadow the new
default, matching the earlier bumps.

## 6. Offline render parity

`offline-render.js` is not a Web Audio graph. It is hand-written buffer DSP.
Parity is required (the project mirrors every audio path so `make mix` and the
WAV recorder match the browser).

Because the FX voice classes are plain shared modules (section 4), the offline
path reuses them directly:

1. While summing tracks, also accumulate each track's post-pan signal times its
   send into a mono `sendBuf`.
2. After the track sum, run `sendBuf` through the four FX voices in the order
   the loop's algorithm dictates, into stereo `retL`/`retR`. Merge points sum
   buffers, the same as the graph.
3. Apply Return Pan to `retL`/`retR` with the same equal-power pan law the
   per-track `output.pan` already uses offline, then add `retL * level` and
   `retR * level` into `rawL`/`rawR` before the master filter, so the DJ filter
   and master volume act on the wet signal, matching
   `returnBus -> returnPanner -> returnGain -> master`.

The bypass ramp and stereo handling come from the shared voice, so browser and
offline output stay identical. Add a `make wav` style check that a delay in the
loop produces the expected repeat, alongside the existing mod-matrix asserts.

## 7. UI: the bottom row rack

A new `.pedals` section after the mod matrix, before the `.io` row (the bottom
of the machine). Structure:

```
+-- FX LOOP 1 --------------------------------------------------------+
| [algorithm icon picker: series | dual | split ...]        OUT1      |
|                                                                    |
| OUT1 <-  [ A ]   [ B ]   [ C ]   [ D ]  <- IN1                      |
+--------------------------------------------------------------------+
```

- Header: the algorithm picker (small SVG diagrams, click to select, the same
  metaphor as an FM algorithm chart) plus the IN1/OUT1 terminal labels. No
  return knob here; the return controls live on the master mixer strip.
- The four pedals, A B C D left to right. Signal flows right to left as the
  labels and the `out1 <- A <- ... <- D <- in1` notation say.

Return controls sit on the master mixer strip in `main.js`, next to Master
Volume, Filter, and Resonance: a Return Level knob and a Return Pan knob,
reusing the existing `makeKnob` helper and the `.mix-strip.master` styling. They
edit `pattern.fx.loops[0].return` and call `host.setReturn({ level, pan })`. The
per-channel Sends already on each channel strip are the send side; these two
complete the mix side of the loop.

Each pedal is a tall die-cast enclosure, 2.5 by 4.5 inch proportions (a narrow
upright rounded rectangle, roughly 1 : 1.8):

- A type nameplate at the top that opens the FX registry list (like the engine
  selector). Empty slots read `thru`.
- Up to four small knobs, reusing the existing `.dial` knob style at a reduced
  size.
- A silver footswitch near the bottom: a brushed-metal circle with a status LED
  above it. The LED is lit when the effect is engaged (`bypass: false`) and dark
  when bypassed. Clicking the footswitch toggles bypass and sends one message.
- The enclosure accent color comes from the effect meta `color`, so the row is
  visually its own band and each loaded pedal is recognizable at a glance.

The pedal knob style, footswitch, and algorithm icon set are the main new CSS.
Everything else reuses the panel, knob, and selector styles already in
`index.html`.

## 8. Deferred, noted so the seams are left open

- More loops: out2, out3. `pattern.fx.loops` is already a list; `output.send`
  becomes per-loop.
- Parallel algorithms (`dual`, `split`, and mixed topologies). The `edges` data
  model and `buildFxGraph` already support arbitrary adjacency; only the icons
  and the extra worklet wiring need finishing.
- Mod matrix into FX params. The matrix could target a pedal knob (delay time,
  drive amount) as a new destination class. Out of scope for v1.
- Tempo-synced delay time, so Time snaps to note divisions off the transport.
- More effect types: Reverb and Chorus. Each is one meta file plus one shared
  voice class, no new plumbing (Delay and Fuzz already follow this shape).
- More of DooomFuzzz. The Fuzz pedal ports only the "dooom" heart (2x clip core
  + Green Ringer octave + RAT tone). The full LV2 is 2-3 pedals' worth and can
  be split: an octave / ring-mod pedal (the Green Ringer plus null/blend), a
  Muff-style sustain pedal (two-stage cubic + Muff parallel tone stack + sag),
  and an amp / cab sim (the SVF cascade with the cab low-pass). Each reuses the
  shared voice pattern; the slew limiter, supply sag, and the other clip curves
  from clip.h are drop-in additions to the existing Fuzz voice.
