# TODO

## 80s electro-funk (Warp 9: "Nunk", "Light Years Away")

The bass (fmbass + slide), robot vocal (vowel engine), and keys/stabs
(epiano/chord/csaw) are largely there. The percussion and the space are not.
Ranked by impact toward that record.

- [ ] 808 percussion. Kit parts now pick a voice type (Drum / 808 Clap / 808
      Cowbell). Remaining:
  - [x] 808 handclap: multi-burst noise + tail. Done (percussion.js ClapVoice).
  - [x] 808 cowbell: two detuned squares through a bandpass. Done (CowbellVoice).
  - [ ] 808 kick boom: the drum voice decay caps at ~0.3s; needs ~0.5-1s of
        tuned sub with a click attack. Add a 'kick' part type (or extend drum).
  - [ ] 808 snare: two-tone body (~180/330 Hz) + noise, as a 'snare' part type.
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

## Future genre programs

Each program is a standalone fruit-branded machine. Grouped by build cost.
Existing backlog: Bubblegum rave (cheap, next), acid squelch (the ACID/TB-303
engine and the RAT/Dist+ drive pedals now exist, so this is content-ready: a
fruit-branded program with an acid line into the RAT stack), sunshine breaks
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

- [ ] Green Apple: chiptune / bitpop (acid lime). Bit-crushed pulses (SUPERSAW
      Decimate already exists), needs a pulse/duty engine + arpeggiator.

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
