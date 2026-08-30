# TODO

## Priority (next up)

Reassessed 2026-08-29. The 80s electro-funk section is COMPLETE (see below), so
the Grape machine is content-complete. Two dependency shifts changed the ranking:
the FX send rack now exists (reverb/delay/chorus pedals verified), which UNGATES
the dub-techno and Coconut/ambient programs; and the poly cross-loop hold gap now
gates the QUALITY of any poly drone/pad (they re-attack every bar), so it matters
more than its backlog position suggests.

1. [DONE 2026-08-29] Richer chord Type sets (min7/dom7/dim/9th). 8->16 voicings,
   named Type readout. Unblocked Blueberry; lifts CHORD everywhere.
2. [DONE 2026-08-29] Tempo-synced LFO in the mod matrix. A route src can carry
   `sync` (beats/cycle); Hz/sync toggle + division picker (4 bar..1/16); lfoHz()
   shared by realtime + offline; retunes live with tempo. Unblocked Blackberry.
3. dub-techno machine. Content-ready now (chord -> Dimension -> Reverb chain
   exists). A new fruit machine is cheap: config + starter + build entry + card.
   FRUIT (user-assigned 2026-08-29): GUINEP (Spanish lime / mamoncillo) -- a
   partially peeled guinep: green rind, pale orange-salmon lychee-like flesh.
   Palette leans green rind + salmon flesh; distinct from Lime.
4. Cross-loop hold for POLY engines (see Sequencer). Medium, high leverage: fixes
   drones/pads re-attacking each loop on ALL poly engines, which gates Coconut and
   any pad-heavy program's quality. Also warms up the offline loop render.
5. [DONE 2026-08-29] MS-20 Sallen-Key filter engine. Mono lead (slide+accent) on
   the acid/sh101 platform with a 2-pole self-oscillating SVF whose loud resonant
   peak overdrives the output stage = the MS-20 scream. Params Cutoff/Peak/Env
   Mod/Decay/Drive; toggles Pulse/Sub/Scream. Roster now 16.
6. Sampler (SP-404 / MC-303 style). Big, but the single largest unlock: gates
   Peach, Plum, and sunshine-breaks all at once.

Everything else (PPG wavetable, Peppermint's pulse/arp engine, poly chord rows,
the remaining genre content) trails these; details in the sections below.

## 80s electro-funk (Warp 9: "Nunk", "Light Years Away") -- COMPLETE

The bass (fmbass + slide), robot vocal (vowel engine), and keys/stabs
(epiano/chord/csaw) were already there. Percussion, space, and swing now landed,
so this record's palette is fully covered by the Grape machine.

- [x] 808 percussion. Kit parts now pick a voice type (Drum / 808 Clap / 808
      Cowbell / 909 Kick / 909 Snare / 909 Hat). All parts done:
  - [x] 808 handclap: multi-burst noise + tail. Done (percussion.js ClapVoice).
  - [x] 808 cowbell: two detuned squares through a bandpass. Done (CowbellVoice).
  - [x] Kick: 909-style 'kick' part type (percussion.js KickVoice): sine body
        with a deep pitch sweep, a beater click, ~0.2-0.9s decay, saturation.
  - [x] Snare: 909-style 'snare' part type (SnareVoice): two-tone body
        (185/330 Hz) + high-passed noise, Tone = snappy amount.
  - [x] Hats: 909-style 'hat' part type (HatVoice): six inharmonic squares
        through a bandpass; Decay spans closed to open.
- [x] Reverb + delay send FX on the mixer aux bus. DONE: the full FX pedal rack
      landed (4-pedal aux loop, send bus -> pedal chain -> stereo return -> master;
      10 pedal types incl. Delay, Echo, Reverb, Dimension, VaporCloud). This is
      also the FX section dub techno and Coconut wanted.
- [x] Swing / shuffle in the transport. DONE, and made PER-TRACK (sequencer.js
      track.swing + a groove slider with a percent readout), so the drums can
      swing while the bass stays straight.

## Sequencer

- [ ] Cross-loop hold (tie/slide continuity) for POLY engines. tie=gate /
      slide=pitch and the wrap-around drone now work for the MONO engines
      (acid, dx100, fmbass): the voice regates instead of re-attacking across
      the loop. Poly engines (sh101, supersaw, chord, epiano) still allocate a
      fresh voice per trigger, so a held/drone note re-attacks every bar. Needs
      the poly path (runtime.fire + offline-render) to find the voice already
      playing a tied note and regate it (hold), and glide it on slide, rather
      than allocating a new one. Also: the offline 'loop' render is one cold
      pass, so a recorded drone still attacks at the tile start even for mono;
      a warm-up pass would fix the WAV.
- [x] Polyphonic chord rows on poly engines. DONE 2026-08-29. A single-note poly
      track can enable voice-rows mode (track.rowMode + track.rows[N] lanes, 2..6
      via setRowCount): trackLanes/laneSteps return row0..rowN-1, the scheduler
      fires each active row as its own note into the poly pool (an N-note chord),
      mirrored in offline-render; startsNote/tiedGate made lane-agnostic so ties
      work per row. UI: a ROWS toggle + VOICES count in the editor (hidden for kit,
      mono, and CHORD), grid rows labeled V1..VN. Engine flip to mono/kit/CHORD
      disables it. Verified: 3 rows render a real C-E-G triad offline. Note: rows
      are poly voices, so they still re-attack each loop until poly cross-loop hold.

## Future engines

- [x] DX100 / 4-op FM: DONE. DX100Voice subclass of FM6Voice (fm6.js), ops 5-6
      idle. Two detuned 2-op stacks with op2 feedback = the "Lately Bass" FM bass.
      Mono with slide + accent; Harmonic/Timbre/Feedback/Decay/Drive + Sub/Bright
      toggles. Inherits the FM 2x oversampling.
- [x] MS-20 Sallen-Key filter monosynth: DONE 2026-08-29 (ms20.js / MS20Voice +
      ms20-meta.js). A distinct SECOND filter character: a 2-pole self-oscillating
      SVF whose loud resonant peak overdrives the output tanh = the MS-20 scream,
      vs the roster's 4-pole ladder. Mono lead, slide+accent. Future variant idea:
      the miniKORG 700 "Traveler" (series LP+HP sweepable bandpass).
- [ ] PPG Wave / wavetable engine: a wavetable oscillator with a scannable wave
      position (a good mod-matrix destination). Bigger (wavetable data +
      interpolation). Not needed for acid house; good for the pad/lead genres.

## Future genre programs

Each program is a standalone fruit-branded machine. Grouped by build cost. The
machine framework (build/<name>.html from a machine config) makes each new
content-ready program cheap: a config + a starter + a build entry + a landing
card. BUILT: Grape (funky electro), Lemon (acid squelch, Pump Panel "Confusion"
spirit), Strawberry (bubblegum rave), Blueberry (space jazz), Blackberry (dungeon
synth). Remaining backlog: sunshine breaks
(gated on sampler), dub techno (chorus->reverb pedals now exist; content-ready),
gothic-industrial / Licorice (has distortion/ringmod now via the FX rack; wants
a Rings-style engine).

Cheapest (content + existing engines):

- [x] Blueberry: space jazz / electronic blues (midnight indigo). BUILT
      2026-08-29: D-dorian modal vamp, brushed jazz kit + swing, walking FM BASS,
      Dm9 CHORD comp (new min9 voicing), sparse E.PIANO Rhodes, VOWEL choir +
      SUPERSAW pad bed into Dimension->Reverb. blueberry.js + blueberry.starter.js.
- [x] Blackberry: dungeon synth / dark medieval folk (deep bramble purple). BUILT
      2026-08-29: a slow 2-bar (32-step) A-minor lament over the A-G-F-E descent;
      soft frame drum, SH-101 sub drone, medieval open-fifth CHORD pads, VOWEL
      monk-choir pedal tone, E.PIANO bell melody, into VaporCloud tape wash ->
      cavern Reverb, with tempo-synced 2-bar/4-bar pad LFOs. blackberry.js +
      blackberry.starter.js.

One small engine:

- [ ] Peppermint: chiptune / bitpop (red/white, an oddball candy not a
      fruit). Bit-crushed pulses (SUPERSAW Decimate already exists), needs a
      pulse/duty engine + arpeggiator.

Gated on the sampler:

- [ ] Peach: vaporwave / mallsoft (pastel pink-orange, chrome). Pitched-down
      EPIANO, heavy swing, slow.
- [ ] Plum: trip-hop / downtempo (bruised purple-red). FM BASS, dusty EPIANO,
      swing, sidechain; needs chopped breaks.

Ungated (FX-send now exists), quality-gated on poly cross-loop hold:

- [ ] Coconut: ambient (pale bone-white). SUPERSAW + CHORD drones, long ties,
      slow filter LFOs. The FX send rack now exists, so this is content-ready,
      but SUPERSAW/CHORD are poly, so the long-tie drones re-attack every loop
      until the poly cross-loop hold lands. Best built after item 4.

## Modulation Rack Row

- [ ] create a 3U x 40 HP eurorack row. the goal is to hold Maths, Tides, Turing Machine, or Marbles
- [ ] TODO: how to assign inputs/outputs. Obvious is to draw cables, with a top row of jacks for outputs and a bottom row of inputs. The available ports would mirror what the mod-matrix already supports.

## Other

- [x] add MOD Matrix targets for master mixer (master Volume; filter deferred)
- [x] oversample the FM core to fix the high-note aliasing
- [x] the FX Loop section's "Routing" icon spills over the area made for it, cutting off as "C". widen the space for this icon by at least 50%
- [x] there are nearly identical instructions above and below the step sequencer on how to use it. update the usage instructions, keeping only the bottom position for instructions. that way the area immediately about the step strip has useful controls like page prev/next. 
- [x] Swing should be per track, not global. It's not really that useful global
  - [x] current Swing slider does not have a slot/groove in the UI, or percentage indicator, so it's not clear to user what it is set to. 
  - [x] put the swing control next to the page next/prev control above the step sequencer.
- [x] move the speed and length controls to be above the step sequencer as well.
- [x] peppermint should be red+white, not green+white
- [ ] add step labels over each step 01-16,17-32,...
- [ ] use the 4 step track for polyphonic instruments. with the ALT track offering an emphasis / mod-wheel impact on the step.
- [ ] for the step mode, add an EDIT button that shortcuts the same trigger/edit state modes that are currently handled by the long press state machine.
