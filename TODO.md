# TODO

## Priority (next up)

Reassessed 2026-08-29. The 80s electro-funk section is COMPLETE (see below), so
the Grape machine is content-complete. Two dependency shifts changed the ranking:
the FX send rack now exists (reverb/delay/chorus pedals verified), which UNGATES
the dub-techno and Coconut/ambient programs; and the poly cross-loop hold gap now
gates the QUALITY of any poly drone/pad (they re-attack every bar), so it matters
more than its backlog position suggests.

1. Richer chord Type sets (min7/dom7/dim/9th). Small. Unblocks Blueberry and
   lifts CHORD everywhere (jazz, dub, ambient). Cheapest high-leverage win.
2. Tempo-synced LFO in the mod matrix. Small-to-medium. Unblocks Blackberry's
   tape-wobble, pairs with VaporCloud for vaporwave, useful in every machine.
3. dub-techno machine. Content-ready now (chord -> Dimension -> Reverb chain
   exists). A new fruit machine is cheap: config + starter + build entry + card.
4. Cross-loop hold for POLY engines (see Sequencer). Medium, high leverage: fixes
   drones/pads re-attacking each loop on ALL poly engines, which gates Coconut and
   any pad-heavy program's quality. Also warms up the offline loop render.
5. MS-20 Sallen-Key filter engine. Medium. Breaks the ladder-filter monoculture;
   industrial/acid/techno leads and timbral variety.
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
- [ ] Polyphonic chord rows on poly engines. The kit's 4-lane machinery
      (laneSteps/trackLanes, N-row grid, per-lane scheduling) generalizes: a poly
      engine could use N note-rows, one voice per row, to play an N-note chord per
      step, each row with its own pitch. The multi-lane plumbing is already there;
      this needs a poly-engine "voice rows" mode (like kit parts, but each row is
      a pitched note into one shared engine rather than a separate drum voice) and
      a row-count control.

## Future engines

- [x] DX100 / 4-op FM: DONE. DX100Voice subclass of FM6Voice (fm6.js), ops 5-6
      idle. Two detuned 2-op stacks with op2 feedback = the "Lately Bass" FM bass.
      Mono with slide + accent; Harmonic/Timbre/Feedback/Decay/Drive + Sub/Bright
      toggles. Inherits the FM 2x oversampling.
- [ ] MS-20 Sallen-Key filter monosynth: a distinct SECOND filter character (a
      2-pole screaming-resonance Sallen-Key). Every subtractive engine (acid,
      sh101, csaw) currently uses the same Moog-style ladder, so this adds real
      timbral variety. Aggressive acid/techno/industrial leads. Could also do
      the miniKORG 700 "Traveler" (series LP+HP sweepable bandpass) variant.
- [ ] PPG Wave / wavetable engine: a wavetable oscillator with a scannable wave
      position (a good mod-matrix destination). Bigger (wavetable data +
      interpolation). Not needed for acid house; good for the pad/lead genres.

## Future genre programs

Each program is a standalone fruit-branded machine. Grouped by build cost. The
machine framework (build/<name>.html from a machine config) makes each new
content-ready program cheap: a config + a starter + a build entry + a landing
card. BUILT: Grape (funky electro), Lemon (acid squelch, Pump Panel "Confusion"
spirit), Strawberry (bubblegum rave). Remaining backlog: sunshine breaks
(gated on sampler), dub techno (chorus->reverb pedals now exist; content-ready),
gothic-industrial / Licorice (has distortion/ringmod now via the FX rack; wants
a Rings-style engine).

Cheapest (content + existing engines):

- [ ] Blueberry: space jazz / electronic blues (midnight blue). EPIANO Rhodes,
      FM BASS walking lines, CHORD 7th/9th voicings. Wants richer chord Type sets
      (min7/dom7/dim). Closest to free.
- [ ] Blackberry: dungeon synth / electronic-folk (deep desaturated indigo).
      Detuned CHORD pads, VOWEL choir/monk drone, EPIANO as bell/harpsichord.
      Wants the tempo-synced tape-wobble LFO.

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
