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

- [x] Performance transpose. DONE 2026-08-29. A live semitone shift of the whole
      playing sequence (pitched tracks only; drums never transpose), like the
      303/SH-101 keyboard perform. An Xpose LCD in the transport (steppers latch
      +/-24, click to reset, glows amber when shifted); holding the A-row piano
      keys (A W S E D F T G Y H U J K = 0..+12) transposes momentarily and
      releasing returns to the latched shift. Applied in scheduleTrackStep via
      xposed(); NOT stored in the pattern and NOT applied to the offline/WAV
      render (a realtime jam control). A one-octave transpose PIANO sits beneath
      the step area (makePiano): press/hold a key to transpose momentarily (touch
      + mouse), the current shift lights its key amber, and the desktop shortcut
      letters are printed on the keys (shown only on hover/fine-pointer devices).
- [x] Cross-loop hold (tie continuity) for POLY engines. DONE 2026-08-29. The
      poly path (runtime.fire + offline allocFor) now finds the voice already
      sounding a tied note (by voice.note) and regates it (hold, no re-attack)
      instead of allocating fresh; every poly voice stores this.note and its
      noteOn takes tie (sh101/supersaw hold inline, the shared Env got a hold()
      method for chord/csaw/fm2/vowel/dtmf, epiano/FM6 already held). Verified:
      a supersaw tie holds at 92% of sustain across the loop vs 10% on re-attack.
      Voice rows benefit too (they fire with tie). REMAINING (deferred): slide
      continuity on poly (poly glide is ambiguous; tie/hold is the drone win),
      and the offline warm-up pass so an EXPORTED drone WAV does not attack at
      the tile start (realtime is seamless; only the recorded first loop cold-
      starts). A two-pass render would fix the WAV.
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

## Generative modulation source (GEN)

Reframed 2026-08-29 (was "Modulation Rack Row"). A full eurorack row with patch
cables was dropped: its ports would only mirror routing the mod matrix already
does, and it adds a second modulation paradigm + a heavy patchbay UI against the
groovebox's simplicity. Maths/Tides largely duplicate the existing LFO/env
sources. The genuinely new value is the GENERATIVE algorithms, delivered as a
mod-matrix source instead of a module row. Full spec: docs/GEN-SOURCE-DESIGN.md.

- [x] GEN v1 DONE 2026-08-29. src/core/gen.js (deterministic Turing + Marbles +
      quantize), src.type='gen' in modmatrix (ConstantSource for param dests,
      advanceGen/genNoteOffset), scheduler advances per dest-track step + offsets
      pitched notes, offline-render mirrors it (seeded to match), matrix route row
      UI (mode live-switch / length / lock / scale / octaves) + Pitch dest.
      Verified: locked loops repeat, lock=0 random, deterministic, offline bounded,
      and the full UI + live mode switch in-browser (CDP). Remaining v1 polish:
      route row is wide (may wrap); a per-route value meter is v2.
- [ ] GEN source (Turing Machine + Marbles hybrid). A new `src.type='gen'` next
      to trig/lfo/env, with a REAL-TIME-SWITCHABLE mode (TURING shift-register /
      MARBLES statistical random+deja-vu / WALK / S&H) sharing one clock + loop, so
      switching algorithm live morphs the sequence. Shared params mode/clock(tempo
      -synced via SYNC_DIVS or per-step)/length/lock(deja-vu)/range/quantize/smooth.
      Routed through the existing matrix (dest + depth + polarity), several at once.
- [ ] NEW mod destination: PITCH (note offset). dest.param='note' makes GEN a
      melodic step sequencer -- the scheduler samples the gen value at the track's
      trigger, quantizes to semitones, and offsets the note (beside xposed()). This
      is the standout feature and the one new mechanism (scheduler-time read, not an
      AudioParam). Also usable by any source (an LFO -> pitch vibrato, etc.).
- [ ] Determinism: seed each route's RNG so the offline/WAV render matches live;
      a reseed/mutate perform action later.
- [x] v2 (partial) DONE 2026-08-29: WALK + S&H modes (gen.js, in the mode picker);
      per-route value LED (green/red meter); Marbles X/Y outputs -- a GEN drives an
      X output (route.dest) and an optional half-rate Y companion (route.y) with its
      own dest/param/depth (+Y on the gen line), both to params or Pitch, mirrored
      offline. Also a GATE output (Marbles t): a 'gate' dest thresholds a GEN
      output (X or Y > 0.5) and fires the track's voice at its programmed pitch
      when the lane didn't -- a generative rhythm; pair with GEN -> pitch for a
      full generative voice. Verified in-browser + checks. STILL OPEN: mode as a
      mod destination, a free-running tempo-synced clock (currently clocks per
      X-dest-track step), a Y value LED.
- [ ] (Optional, cosmetic) render matrix routes as little patch-cord graphics for
      the modular LOOK, without making them free-patchable -- flavor over the same
      matrix, if the eurorack aesthetic is wanted.

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
- [x] add step labels over each step 01-16,17-32,... DONE 2026-08-29: a step-number
      header row over the grid (renderGrid), absolute positions per page, beats
      brighter, disabled steps dimmed.
- [x] use the 4 step track for polyphonic instruments. DONE 2026-08-29 via the
      voice-rows feature (track.rowMode + N rows, one poly voice per row = a
      sequenced chord). Implemented as N dedicated pitched rows rather than the
      ALT-emphasis sketch here. The separate "ALT lane = per-step emphasis/mod-
      wheel" idea is NOT done; accent-mode engines already use ALT as accent, so a
      general per-step mod on ALT would be its own small feature if wanted.
- [x] for the step mode, add an EDIT button that shortcuts the long-press state
      machine. DONE 2026-08-29: a sticky EDIT toggle in the seq-bar; when on, a
      tap selects a step for editing instead of placing/clearing it (off = back to
      trigger mode, deselects).
