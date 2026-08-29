# TODO

## 80s electro-funk (Warp 9: "Nunk", "Light Years Away")

The bass (fmbass + slide), robot vocal (vowel engine), and keys/stabs
(epiano/chord/csaw) are largely there. The percussion and the space are not.
Ranked by impact toward that record.

- [ ] 808 percussion. Kit parts now pick a voice type (Drum / 808 Clap / 808
      Cowbell). Remaining:
  - [x] 808 handclap: multi-burst noise + tail. Done (percussion.js ClapVoice).
  - [x] 808 cowbell: two detuned squares through a bandpass. Done (CowbellVoice).
  - [x] Kick: 909-style 'kick' part type (percussion.js KickVoice): sine body
        with a deep pitch sweep, a beater click, ~0.2-0.9s decay, saturation.
  - [x] Snare: 909-style 'snare' part type (SnareVoice): two-tone body
        (185/330 Hz) + high-passed noise, Tone = snappy amount.
  - [x] Hats: 909-style 'hat' part type (HatVoice): six inharmonic squares
        through a bandpass; Decay spans closed to open.
- [ ] Reverb + delay send FX on the mixer aux bus. The send bus is built and
      reserved but has no effect wired. Electro is drenched in plate/gated reverb
      (snare/clap) and tape-delay throws. Same FX section dub techno wants.
- [ ] Swing / shuffle in the transport. We run straight 16ths; electro has a
      slight 16th push. Also helps every groove.

## Sequencer

- [ ] Polyphonic chord rows on poly engines. The kit's 4-lane machinery
      (laneSteps/trackLanes, N-row grid, per-lane scheduling) generalizes: a poly
      engine could use N note-rows, one voice per row, to play an N-note chord per
      step, each row with its own pitch. The multi-lane plumbing is already there;
      this needs a poly-engine "voice rows" mode (like kit parts, but each row is
      a pitched note into one shared engine rather than a separate drum voice) and
      a row-count control.

## Future engines

- [ ] DX100 / 4-op FM: a subset of the fm6 core (new FM6Voice subclass + a 4-op
      algorithm table, like epiano/fmbass). The iconic "Lately Bass" FM bass.
      Cheap, on-genre for acid/rave/house. Now inherits the FM 2x oversampling.
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

Gated on FX-send (reverb/delay):

- [ ] Coconut: ambient (pale bone-white). SUPERSAW + CHORD drones, long ties,
      slow filter LFOs.

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
