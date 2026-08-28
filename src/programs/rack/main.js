// SPDX-License-Identifier: 0BSD

// Rack program: full 6-track shell. Six independent tracks play together, each
// with its own engine, five controls, main and alt trigger lanes, length
// (1..256), and tempo ratio off the master. The UI is Elektron-style: a rail of
// six selectable tracks up top, and a focused editor for the selected track
// below. localStorage autosaves; JSON export/import moves patterns around.
//
// The shared core (src/core) already provides polyphony, gate envelopes, chord
// clustering, and engine hot-swap. This file schedules the six tracks and draws
// the interface.

import { Transport } from '../../core/transport.js';
import { Clock } from '../../core/clock.js';
import { engines, engineById } from '../../core/registry.js';
import { defaultParams, defaultToggles } from '../../core/engines/drum-meta.js';
import { serialize, deserialize, makeRoute, PAGE, MAX_STEPS, isKit, trackLanes, laneSteps, makeKitParts } from '../../core/sequencer.js';
import { fxTypes, fxById, defaultFxParams, defaultFxToggles } from '../../core/fx/registry.js';
import { algoById } from '../../core/fx/algorithms.js';
import { freshPattern, TRACKS } from './starter.js';
import { AudioHost } from './audio.js';
import { recordWav } from './record.js';
import { ModMatrix } from './modmatrix.js';

const STORE_KEY = 'web-rack:rack:v2';

function loadPattern() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const p = deserialize(raw);
      if (Array.isArray(p.tracks) && p.tracks.length === TRACKS) return p;
    }
  } catch (_) { /* fall through */ }
  return freshPattern();
}

function save() {
  try { localStorage.setItem(STORE_KEY, serialize(pattern)); } catch (_) {}
}

let pattern = loadPattern();
const transport = new Transport(pattern.bpm);

// ---- audio -----------------------------------------------------------------

const host = new AudioHost();
const modMatrix = new ModMatrix(host);
let voices = []; // one Voice per track, created on first play
let clock = null;
let playing = false;

// The engine runs in an AudioWorklet, which has no fallback path. Browsers
// without it (notably iOS Safari before 14.5) cannot play back, so detect it
// once and show a message rather than throwing on the first play. Offline WAV
// export is pure JavaScript and still works, so it is not gated on this.
const AUDIO_SUPPORTED = typeof window.AudioWorklet !== 'undefined';

function showUnsupported() {
  if (document.getElementById('audio-unsupported')) return;
  const bar = el('div', 'unsupported');
  bar.id = 'audio-unsupported';
  bar.textContent =
    'Live playback needs AudioWorklet, which this browser does not support. ' +
    'Use an up-to-date Chrome, Firefox, or Safari (iOS 14.5 or newer). ' +
    'WAV export still works.';
  document.body.prepend(bar);
}

// Per-track scheduling cursors and playhead queues.
let cursors = [];
let litByTrack = [];
let curPos = []; // current lit position per track

async function ensureAudio() {
  if (voices.length) return;
  await host.init();
  voices = pattern.tracks.map((t, i) => {
    const v = host.createVoice(t.engine, i);
    if (isKit(t)) t.parts.forEach((p, pi) => { v.setPartType(pi, p.type); v.setPartParams(pi, p.params); });
    else { v.setParams(t.params); v.setToggles(t.toggles); }
    v.setOutput(t.output);
    host.setChannel(i, { pan: t.output.pan, send: t.output.send });
    return v;
  });
  host.setMaster(pattern.master);
  applyFx();
  modMatrix.attach(voices);
  modMatrix.rebuild(pattern.routes);
  clock = new Clock(host.ctx);
}

// Push the whole effects loop to the audio host: each pedal's type, knobs, and
// footswitch, then the routing graph and the return controls. Cheap; also used
// to re-sync after edits.
function applyFx() {
  if (!host.ctx) return;
  const loop = pattern.fx.loops[0];
  loop.pedals.forEach((pd, i) => {
    host.setFxType(i, pd.type);
    host.setFxParams(i, pd.params);
    host.setFxToggles(i, pd.toggles);
    host.setFxBypass(i, pd.bypass);
  });
  host.buildFxGraph(algoById(loop.algorithm));
  host.setReturn(loop.return);
}

// A track is audible if not muted and, when any track is soloed, it is soloed.
function trackAudible(t) {
  const track = pattern.tracks[t];
  if (track.mute) return false;
  return !pattern.tracks.some((x) => x.solo) || track.solo;
}

function scheduleTrackStep(t, absStep, time) {
  const track = pattern.tracks[t];
  if (!trackAudible(t)) return;
  const stepDur = transport.stepDuration(track.ratio);
  const pos = absStep % track.length;
  const v = voices[t];
  let hit = false;

  // Kit: fire each of the four part rows; each part is its own trigger source.
  if (isKit(track)) {
    for (let part = 0; part < 4; part++) {
      if (track.parts[part].mute) continue;
      const step = track.parts[part].lane[pos];
      if (!step.on) continue;
      v.triggerPart(time, step.note, step.velocity, part);
      modMatrix.onSourceTrigger(t, 'part' + part, time);
      hit = true;
    }
    litByTrack[t].push({ pos, time, hit });
    return;
  }

  const m = track.main[pos];
  const a = track.alt[pos];

  // The alt lane's meaning is engine-defined. In accent mode a coincident alt
  // trigger accents the main note (louder, brighter) rather than sounding a
  // second voice, and an alt step with no main step is inert.
  const accent = engineById(track.engine).altMode === 'accent';

  if (m.on && !m.tie) {
    v.trigger(time, m.note, m.velocity, tiedGate(track, 'main', pos, stepDur), m.slide, accent && a.on);
    modMatrix.onSourceTrigger(t, 'main', time);
    hit = true;
  }
  if (!accent && a.on && !a.tie) {
    v.trigger(time, a.note, a.velocity, tiedGate(track, 'alt', pos, stepDur), a.slide, false);
    modMatrix.onSourceTrigger(t, 'alt', time);
    hit = true;
  }
  litByTrack[t].push({ pos, time, hit });
}

// Gate for a step, extended across any tied steps that follow it on the lane so
// the note holds as one sustained note. A tie step does not retrigger; it is
// absorbed here into the preceding note's gate.
function tiedGate(track, lane, pos, stepDur) {
  let span = 1;
  let p = pos;
  for (let i = 0; i < track.length; i++) {
    p = (p + 1) % track.length;
    const nx = track[lane][p];
    if (nx.on && nx.tie) span += 1; else break;
  }
  return Math.max(0.01, (span - 1 + track[lane][pos].gateLen) * stepDur);
}

function pump(horizon) {
  const swing = pattern.swing || 0;
  for (let t = 0; t < TRACKS; t++) {
    const track = pattern.tracks[t];
    const stepDur = transport.stepDuration(track.ratio);
    const c = cursors[t];
    while (c.nextTime < horizon) {
      // Swing delays the off-beat 16ths (odd steps) toward a triplet feel.
      const offset = (c.step % 2 === 1) ? swing * stepDur * 0.4 : 0;
      scheduleTrackStep(t, c.step, c.nextTime + offset);
      c.nextTime += stepDur;
      c.step += 1;
    }
  }
}

async function play() {
  if (!AUDIO_SUPPORTED) { showUnsupported(); return; }
  await ensureAudio();
  await host.resume();
  const start = host.currentTime + 0.1;
  cursors = pattern.tracks.map(() => ({ step: 0, nextTime: start }));
  litByTrack = pattern.tracks.map(() => []);
  curPos = pattern.tracks.map(() => -1);
  playing = true;
  clock.start(pump);
  playBtn.textContent = 'Stop';
  const pl = document.getElementById('power');
  if (pl) pl.classList.add('on');
  requestAnimationFrame(playhead);
}

function stop() {
  playing = false;
  if (clock) clock.stop();
  playBtn.textContent = 'Play';
  const pl = document.getElementById('power');
  if (pl) pl.classList.remove('on');
  clearPlayhead();
}

function togglePlay() { playing ? stop() : play(); }

// ---- playhead --------------------------------------------------------------

function playhead() {
  if (!playing) return;
  const now = host.currentTime;
  for (let t = 0; t < TRACKS; t++) {
    const q = litByTrack[t];
    let changed = false;
    let hit = false;
    while (q.length && q[0].time <= now) {
      const ev = q.shift();
      curPos[t] = ev.pos;
      changed = true;
      if (ev.hit) hit = true;
    }
    if (hit) flashChip(t);
    if (changed && t === selected) paintPlayhead(curPos[t]);
  }
  requestAnimationFrame(playhead);
}

function paintPlayhead(pos) {
  document.querySelectorAll('.cell.play').forEach((el) => el.classList.remove('play'));
  const track = pattern.tracks[selected];
  const page = Math.floor(pos / PAGE);
  if (page === pageOf(selected)) {
    const i = pos % PAGE;
    document.querySelectorAll(`#editor .lane .cell[data-i="${i}"]`).forEach((el) => el.classList.add('play'));
  }
}

function clearPlayhead() {
  document.querySelectorAll('.cell.play').forEach((el) => el.classList.remove('play'));
}

function flashChip(t) {
  const chip = document.querySelector(`.chip[data-t="${t}"]`);
  if (!chip) return;
  chip.classList.add('fire');
  setTimeout(() => chip.classList.remove('fire'), 90);
}

// ---- UI state --------------------------------------------------------------

const app = document.getElementById('app');
let selected = 0;
let selectedPart = 0; // which kit part's sound the editor shows
let pageByTrack = new Array(TRACKS).fill(0);
// Steps selected for editing, keyed `lane:pos` within the current track. A tap
// toggles a step on or off; a long-press adds or removes it from this set, and
// the Note / Velocity / Gate controls set the same value on every member.
// selAnchor is the most recently selected step, used to seed the control values.
let selSteps = new Set();
let selAnchor = null;

function stepKey(lane, pos) { return lane + ':' + pos; }

// After removing steps, keep selAnchor pointing at a still-selected step.
function fixAnchor() {
  if (selAnchor && selSteps.has(stepKey(selAnchor.lane, selAnchor.pos))) return;
  const first = selSteps.values().next().value;
  if (!first) { selAnchor = null; return; }
  const [lane, pos] = first.split(':');
  selAnchor = { lane, pos: Number(pos) };
}

// The step objects currently selected, skipping any past the track length.
function selectedStepObjs() {
  const track = pattern.tracks[selected];
  const out = [];
  for (const k of selSteps) {
    const pos = Number(k.slice(k.indexOf(':') + 1));
    const lane = k.slice(0, k.indexOf(':'));
    if (pos < track.length) out.push(laneSteps(track, lane)[pos]);
  }
  return out;
}
let playBtn, tempoInput;

function pageOf(t) { return pageByTrack[t]; }

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function noteName(n) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return names[n % 12] + (Math.floor(n / 12) - 1);
}

// ---- render ----------------------------------------------------------------

function render() {
  app.innerHTML = '';

  // Transport
  const head = el('div', 'head');
  head.append(el('div', 'panel-tag', 'Transport'));

  // Power lamp: standby amber, lights green while audio is running.
  const power = el('div', 'power' + (playing ? ' on' : ''));
  power.id = 'power';
  power.append(el('span', 'lamp'), el('span', 'power-lbl', 'Power'));
  head.append(power);

  const right = el('div', 'head-right');

  // LCD tempo panel.
  const lcd = el('div', 'lcd');
  const screen = el('div', 'lcd-screen');
  screen.append(el('span', 'lcd-cap', 'Tempo'));
  tempoInput = el('input', 'lcd-val');
  tempoInput.type = 'number'; tempoInput.min = 20; tempoInput.max = 300; tempoInput.value = pattern.bpm;
  tempoInput.oninput = () => {
    pattern.bpm = clampNum(tempoInput.value, 20, 300, 120);
    transport.bpm = pattern.bpm;
    save();
  };
  screen.append(tempoInput, el('span', 'lcd-unit', 'BPM'));
  const steppers = el('div', 'lcd-steppers');
  const up = el('button', 'lcd-btn', '▲');
  const down = el('button', 'lcd-btn', '▼');
  const nudge = (d) => {
    pattern.bpm = clampNum(pattern.bpm + d, 20, 300, 120);
    transport.bpm = pattern.bpm;
    tempoInput.value = pattern.bpm;
    save();
  };
  up.onclick = () => nudge(1);
  down.onclick = () => nudge(-1);
  steppers.append(up, down);
  lcd.append(screen, steppers);

  // Swing control: delays the off-beat 16ths toward a shuffle.
  const swingCtl = el('div', 'swing-ctl');
  swingCtl.append(el('span', 'swing-lbl', 'Swing'));
  const swingIn = el('input', 'swing-slider');
  swingIn.type = 'range'; swingIn.min = 0; swingIn.max = 100; swingIn.value = Math.round((pattern.swing || 0) * 100);
  swingIn.oninput = () => { pattern.swing = Number(swingIn.value) / 100; save(); };
  swingCtl.append(swingIn);

  playBtn = el('button', 'play', playing ? 'Stop' : 'Play');
  playBtn.onclick = togglePlay;

  right.append(lcd, swingCtl, playBtn);
  head.append(right);
  app.append(head);

  // Track rail
  const rail = el('div', 'rail');
  pattern.tracks.forEach((track, t) => {
    const chip = el('div', 'chip' + (t === selected ? ' active' : ''));
    chip.dataset.t = t;
    chip.onclick = () => selectTrack(t);
    chip.append(el('div', 'chip-n', 'T' + (t + 1)));
    chip.append(el('div', 'chip-eng', engineById(track.engine).label));
    const mute = el('button', 'mute' + (track.mute ? ' on' : ''), track.mute ? 'MUTE' : 'on');
    // Toggle on pointerdown so several fingers can mute different tracks at
    // once. Update this one button in place: a full re-render would tear down
    // the buttons other fingers are still pressing. Swallow the trailing click
    // so it neither re-toggles nor selects the track.
    const toggleMute = (e) => {
      e.stopPropagation();
      e.preventDefault();
      track.mute = !track.mute;
      mute.classList.toggle('on', track.mute);
      mute.textContent = track.mute ? 'MUTE' : 'on';
      save();
    };
    mute.addEventListener('pointerdown', toggleMute);
    mute.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); });
    chip.append(mute);
    rail.append(chip);
  });
  rail.id = 'rail';
  app.append(rail);

  // Focused editor
  const ed = el('div', 'editor');
  ed.id = 'editor';
  app.append(ed);
  renderEditor();

  // Mixer (per-track level/pan/send + master)
  const mixer = el('div', 'mixer');
  mixer.id = 'mixer';
  app.append(mixer);
  renderMixer();

  // Mod matrix (pattern-level)
  const matrix = el('div', 'matrix');
  matrix.id = 'matrix';
  app.append(matrix);
  renderMatrix();

  // FX pedal rack (bottom row)
  const pedals = el('div', 'pedals');
  pedals.id = 'pedals';
  app.append(pedals);
  renderPedals();

  // Recorder
  const rec = el('div', 'io');
  rec.append(el('div', 'panel-tag', 'Record WAV'));
  const recMode = el('select', 'sel rec-mode');
  [['loop', 'seamless loop'], ['oneshot', 'one-shot'], ['tails', 'with tails']].forEach(([v, t]) => {
    const o = el('option', null, t); o.value = v;
    recMode.append(o);
  });
  const recBtn = el('button', 'iobtn rec', 'Record ●');
  recBtn.onclick = () => {
    recBtn.textContent = 'Rendering…';
    // Let the label paint before the synchronous render.
    setTimeout(() => {
      try {
        const secs = recordWav(pattern, recMode.value);
        recBtn.textContent = `Saved ${secs.toFixed(1)}s`;
      } catch (err) {
        recBtn.textContent = 'Failed';
      }
      setTimeout(() => { recBtn.textContent = 'Record ●'; }, 1600);
    }, 20);
  };
  rec.append(recMode, recBtn);
  app.append(rec);

  // Persistence
  const io = el('div', 'io');
  const exportBtn = el('button', 'iobtn', 'Export JSON');
  exportBtn.onclick = exportJson;
  const importBtn = el('button', 'iobtn', 'Import JSON');
  const file = el('input'); file.type = 'file'; file.accept = 'application/json'; file.style.display = 'none';
  file.onchange = importJson;
  importBtn.onclick = () => file.click();
  const resetBtn = el('button', 'iobtn', 'Reset');
  resetBtn.onclick = () => { localStorage.removeItem(STORE_KEY); location.reload(); };
  io.append(exportBtn, importBtn, resetBtn, file);
  app.append(io);
}

function renderRail() {
  const rail = document.getElementById('rail');
  if (!rail) return;
  rail.querySelectorAll('.chip').forEach((chip) => {
    const t = Number(chip.dataset.t);
    const track = pattern.tracks[t];
    chip.classList.toggle('active', t === selected);
    chip.querySelector('.chip-eng').textContent = engineById(track.engine).label;
    const mute = chip.querySelector('.mute');
    mute.classList.toggle('on', track.mute);
    mute.textContent = track.mute ? 'MUTE' : 'on';
  });
}

// ---- mixer -----------------------------------------------------------------

function renderMixer() {
  const box = document.getElementById('mixer');
  if (!box) return;
  box.innerHTML = '';
  box.append(el('div', 'panel-tag', 'Mixer'));
  const strips = el('div', 'mix-strips');

  const anySolo = pattern.tracks.some((x) => x.solo);
  pattern.tracks.forEach((track, t) => {
    const strip = el('div', 'mix-strip' + (anySolo && !track.solo ? ' dimmed' : ''));
    const head = el('div', 'mix-head');
    head.append(el('div', 'mix-t', 'T' + (t + 1)));
    const solo = el('button', 'solo' + (track.solo ? ' on' : ''), 'S');
    solo.title = 'Solo';
    solo.onclick = () => { track.solo = !track.solo; save(); renderMixer(); };
    head.append(solo);
    strip.append(head);
    // Level reuses the output-stage vca; Filter/Hi-Pass are the channel band
    // filter; pan and send are the strip nodes.
    strip.append(makeKnob('Level', track.output.vca, (v) => {
      track.output.vca = v;
      if (voices[t]) voices[t].setOutput({ vca: v });
      save();
    }));
    strip.append(makeKnob('Filter', track.output.cutoff, (v) => {
      track.output.cutoff = v;
      if (voices[t]) voices[t].setOutput({ cutoff: v });
      save();
    }));
    strip.append(makeKnob('Hi-Pass', track.output.hp, (v) => {
      track.output.hp = v;
      if (voices[t]) voices[t].setOutput({ hp: v });
      save();
    }));
    strip.append(makeKnob('Pan', (track.output.pan + 1) / 2, (v) => {
      track.output.pan = v * 2 - 1;
      if (host.ctx) host.setChannel(t, { pan: track.output.pan });
      save();
    }));
    strip.append(makeKnob('Send', track.output.send, (v) => {
      track.output.send = v;
      if (host.ctx) host.setChannel(t, { send: v });
      save();
    }));
    strips.append(strip);
  });

  const m = pattern.master;
  const master = el('div', 'mix-strip master');
  master.append(el('div', 'mix-t', 'MASTER'));
  master.append(makeKnob('Volume', m.volume, (v) => {
    m.volume = v; if (host.ctx) host.setMaster({ volume: v }); save();
  }));
  master.append(makeKnob('Filter', m.filter, (v) => {
    m.filter = v; if (host.ctx) host.setMaster({ filter: v }); save();
  }));
  // FX loop return: Level and Pan, the mix side of the effects loop (the send
  // side is the per-channel Send knobs above). Edits loop1's return.
  const loop = pattern.fx.loops[0];
  master.append(makeKnob('Return', loop.return.level, (v) => {
    loop.return.level = v; if (host.ctx) host.setReturn({ level: v }); save();
  }));
  master.append(makeKnob('Ret Pan', (loop.return.pan + 1) / 2, (v) => {
    loop.return.pan = v * 2 - 1; if (host.ctx) host.setReturn({ pan: loop.return.pan }); save();
  }));
  // Resonance toggle: sweep filter Q 1.0 <-> 2.2.
  const resWrap = el('div', 'mix-reso');
  const res = el('button', 'mute' + (m.resonance ? ' on' : ''), m.resonance ? 'RES' : 'res');
  res.onclick = () => {
    m.resonance = !m.resonance;
    res.classList.toggle('on', m.resonance);
    res.textContent = m.resonance ? 'RES' : 'res';
    if (host.ctx) host.setMaster({ resonance: m.resonance });
    save();
  };
  resWrap.append(res, el('div', 'knob-label', 'Reso'));
  master.append(resWrap);
  strips.append(master);

  box.append(strips);
}

// ---- fx pedal rack ---------------------------------------------------------

const FX_LETTERS = ['A', 'B', 'C', 'D'];

// Series routing icon (out1 <- A <- B <- C <- D <- in1), drawn from the same
// FM-algorithm metaphor: boxes and arrows between the in and out terminals.
function seriesIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 96 26');
  svg.setAttribute('class', 'algo-svg');
  svg.innerHTML =
    '<circle class="term" cx="4" cy="13" r="2.4"/>' +
    '<path class="ln" d="M6.4 13 H12 M30 13 H36 M54 13 H60 M78 13 H90"/>' +
    '<circle class="term" cx="92" cy="13" r="2.4"/>' +
    '<rect class="box" x="12" y="6" width="18" height="14" rx="3"/>' +
    '<rect class="box" x="36" y="6" width="18" height="14" rx="3"/>' +
    '<rect class="box" x="60" y="6" width="18" height="14" rx="3"/>' +
    '<text class="bl" x="21" y="16" text-anchor="middle">A</text>' +
    '<text class="bl" x="45" y="16" text-anchor="middle">B</text>' +
    '<text class="bl" x="69" y="16" text-anchor="middle">C</text>';
  return svg;
}

function setPedalType(i, type) {
  const pd = pattern.fx.loops[0].pedals[i];
  pd.type = type;
  pd.params = defaultFxParams(type);
  pd.toggles = defaultFxToggles(type);
  // Engage a real effect when it is loaded; the empty Thru stays bypassed.
  pd.bypass = type === 'thru';
  if (host.ctx) {
    host.setFxType(i, type);
    host.setFxParams(i, pd.params);
    host.setFxToggles(i, pd.toggles);
    host.setFxBypass(i, pd.bypass);
  }
  save();
  renderPedals();
}

function togglePedal(i) {
  const pd = pattern.fx.loops[0].pedals[i];
  pd.bypass = !pd.bypass;
  if (host.ctx) host.setFxBypass(i, pd.bypass);
  save();
  renderPedals();
}

function renderPedals() {
  const box = document.getElementById('pedals');
  if (!box) return;
  box.innerHTML = '';
  const loop = pattern.fx.loops[0];

  const head = el('div', 'fx-head');
  head.append(el('span', 'matrix-title', 'FX Loop'));
  head.append(el('span', 'loop-badge', 'OUT1'));
  const algo = el('div', 'algo-pick');
  algo.append(el('span', 'algo-cap', 'Routing'));
  const chip = el('div', 'algo-chip sel');
  chip.append(seriesIcon(), el('div', 'algo-name', 'Series'));
  chip.title = 'out1 <- A <- B <- C <- D <- in1';
  algo.append(chip);
  head.append(algo);
  box.append(head);

  box.append(el('div', 'fx-flow', 'Signal flows right to left: each channel Send feeds IN1; Return (on the master strip) brings OUT1 back. Send is mono, return is stereo.'));

  const board = el('div', 'fx-board');
  board.append(fxRail('OUT1', false));

  loop.pedals.forEach((pd, i) => {
    const meta = fxById(pd.type);
    const isThru = pd.type === 'thru';
    const engaged = !pd.bypass && !isThru;
    const pedal = el('div', 'pedal' + (engaged ? ' on' : '') + (isThru ? ' empty-slot' : '') + (meta.colors ? ' split' : ''));
    // A split pedal (Dist+/DOD 250) carries two enclosure colors; the live
    // accent follows the first switch. Single-color pedals just set --accent.
    if (meta.colors) {
      pedal.style.setProperty('--accent-a', meta.colors[0]);
      pedal.style.setProperty('--accent-b', meta.colors[1]);
      pedal.style.setProperty('--accent', pd.toggles && pd.toggles[0] ? meta.colors[1] : meta.colors[0]);
    } else {
      pedal.style.setProperty('--accent', meta.color);
    }
    pedal.append(el('span', 'slot-letter', FX_LETTERS[i]));

    const sel = el('select', 'plate' + (isThru ? ' empty' : ''));
    fxTypes.forEach((f) => {
      const o = el('option', null, f.label); o.value = f.id;
      if (f.id === pd.type) o.selected = true;
      sel.append(o);
    });
    sel.onchange = () => setPedalType(i, sel.value);
    pedal.append(sel);

    const knobs = el('div', 'pedal-knobs');
    if (meta.knobs.length) {
      meta.knobs.forEach((k, ki) => knobs.append(makeKnob(k.label, pd.params[ki], (v) => {
        pd.params[ki] = v;
        if (host.ctx) host.setFxParams(i, pd.params);
        save();
      })));
    } else {
      knobs.append(el('div', 'plate-hint', 'pick an effect above'));
    }
    pedal.append(knobs);

    // Pedal on/off switches (e.g. the Dist+ germanium/silicon diode). The first
    // switch also flips the live accent on a split-color pedal.
    const toggleDefs = meta.toggles || [];
    if (toggleDefs.length) {
      const sw = el('div', 'pedal-switches');
      toggleDefs.forEach((def, ti) => {
        sw.append(makeSwitch(def.label, !!pd.toggles[ti], false, (val) => {
          pd.toggles[ti] = val;
          if (host.ctx) host.setFxToggles(i, pd.toggles);
          if (meta.colors && ti === 0) pedal.style.setProperty('--accent', val ? meta.colors[1] : meta.colors[0]);
          save();
        }));
      });
      pedal.append(sw);
    }

    pedal.append(el('div', 'led'));
    const stomp = el('button', 'stomp');
    stomp.title = engaged ? 'Bypass' : 'Engage';
    stomp.onclick = () => togglePedal(i);
    pedal.append(stomp);
    pedal.append(el('div', 'stomp-lbl', isThru ? 'Empty' : (engaged ? 'On' : 'Bypass')));
    board.append(pedal);
  });

  board.append(fxRail('IN1', true));
  box.append(board);
}

// A jack rail at either end of the loop (out1 on the left, in1 on the right).
function fxRail(label, mono) {
  const rail = el('div', 'rail-end');
  rail.append(el('span', 'rail-lbl', label));
  rail.append(el('div', 'jack' + (mono ? ' mono' : '')));
  return rail;
}

function selectTrack(t) {
  selected = t;
  selSteps.clear();
  selAnchor = null;
  renderRail();
  renderEditor();
  if (playing) paintPlayhead(curPos[t]);
}

function renderEditor() {
  const ed = document.getElementById('editor');
  if (!ed) return;
  ed.innerHTML = '';
  const track = pattern.tracks[selected];
  const meta = engineById(track.engine);

  // Row: engine selector, ratio, length
  const top = el('div', 'ed-top');
  const engSel = el('select', 'engine-sel');
  engines.forEach((e) => {
    const o = el('option', null, e.label); o.value = e.id;
    if (e.id === track.engine) o.selected = true;
    engSel.append(o);
  });
  engSel.onchange = () => flipEngine(selected, engSel.value);
  top.append(labeled('Engine', engSel));

  const ratioSel = el('select', 'sel');
  [['0.5', '/2'], ['1', '1x'], ['2', 'x2'], ['4', 'x4']].forEach(([v, t]) => {
    const o = el('option', null, t); o.value = v;
    if (Number(v) === track.ratio) o.selected = true;
    ratioSel.append(o);
  });
  ratioSel.onchange = () => { track.ratio = Number(ratioSel.value); save(); };
  top.append(labeled('Speed', ratioSel));

  const lenInput = el('input', 'num');
  lenInput.type = 'number'; lenInput.min = 1; lenInput.max = MAX_STEPS; lenInput.value = track.length;
  lenInput.oninput = () => {
    track.length = clampNum(lenInput.value, 1, MAX_STEPS, 16);
    if (pageOf(selected) > maxPage(track)) pageByTrack[selected] = maxPage(track);
    save();
    renderGrid();
  };
  top.append(labeled('Length', lenInput));

  // The output-stage channel controls (Filter, HP, Level) live in the mixer.
  ed.append(top);

  // Knobs. A kit edits one part's drum voice at a time; a part selector (P1..P4)
  // chooses which, and the five knobs write that part's params.
  if (isKit(track)) {
    if (selectedPart >= track.parts.length) selectedPart = 0;
    const tabs = el('div', 'part-tabs');
    track.parts.forEach((_, pi) => {
      const tab = el('button', 'part-tab' + (pi === selectedPart ? ' on' : ''), 'P' + (pi + 1));
      tab.onclick = () => { selectedPart = pi; renderEditor(); renderGrid(); };
      tabs.append(tab);
    });
    const part = track.parts[selectedPart];
    // Part selector and its drum model (Drum / 808 Clap / 808 Cowbell) side by
    // side, with room before the knobs.
    const kitHead = el('div', 'kit-head');
    kitHead.append(labeled('Part', tabs));
    kitHead.append(labeled('Type', pick([['drum', 'Drum'], ['clap', '808 Clap'], ['cowbell', '808 Cowbell']], part.type, (v) => {
      part.type = v;
      if (voices[selected]) voices[selected].setPartType(selectedPart, v);
      save();
    })));
    ed.append(kitHead);
    const params = part.params;
    const knobs = el('div', 'knobs');
    meta.params.forEach((p, i) => knobs.append(makeKnob(p.label, params[i], (val) => {
      params[i] = val;
      if (voices[selected]) voices[selected].setPartParams(selectedPart, params);
      save();
    })));
    ed.append(knobs);
  } else {
    const knobs = el('div', 'knobs');
    meta.params.forEach((p, i) => knobs.append(makeKnob(p.label, track.params[i], (val) => {
      track.params[i] = val;
      if (voices[selected]) voices[selected].setParam(i, val);
      save();
    })));
    ed.append(knobs);
  }

  // Engine switches: 3 slots beside the knobs. The engine's meta.toggles says
  // how many it uses; the rest are dimmed. Kit tracks define none (all dimmed).
  const toggleDefs = meta.toggles || [];
  const switches = el('div', 'switches');
  for (let i = 0; i < 3; i++) {
    const def = toggleDefs[i];
    switches.append(makeSwitch(def ? def.label : '', !!track.toggles[i], !def, (val) => {
      track.toggles[i] = val;
      if (voices[selected] && !isKit(track)) voices[selected].setToggles(track.toggles);
      save();
    }));
  }
  ed.append(switches);

  // Pages
  const pageRow = el('div', 'pages');
  const prev = el('button', 'pgbtn', '◀');
  const next = el('button', 'pgbtn', '▶');
  const plbl = el('span', 'pglbl', '');
  plbl.id = 'pglbl';
  prev.onclick = () => { pageByTrack[selected] = Math.max(0, pageOf(selected) - 1); renderGrid(); };
  next.onclick = () => { pageByTrack[selected] = Math.min(maxPage(track), pageOf(selected) + 1); renderGrid(); };
  pageRow.append(prev, plbl, next);
  ed.append(pageRow);

  // Grid + step editor placeholders
  ed.append(el('div', 'hint', 'Tap places or clears steps. Long-press a step to edit it; then tap to move the selection, long-press to select several. The Note / Velocity / Gate below set the same value on every selected step.'));
  const grid = el('div', 'grid'); grid.id = 'grid'; ed.append(grid);
  const stepEd = el('div', 'stepedit'); stepEd.id = 'stepedit'; ed.append(stepEd);

  renderGrid();
}

function maxPage(track) { return Math.floor((track.length - 1) / PAGE); }

function renderGrid() {
  const grid = document.getElementById('grid');
  if (!grid) return;
  const track = pattern.tracks[selected];
  const page = pageOf(selected);
  const plbl = document.getElementById('pglbl');
  if (plbl) plbl.textContent = `page ${page + 1} / ${maxPage(track) + 1}`;
  grid.innerHTML = '';

  const accentMode = engineById(track.engine).altMode === 'accent';
  const kit = isKit(track);
  trackLanes(track).forEach((laneName, li) => {
    const lane = el('div', 'lane'); lane.dataset.lane = laneName;
    // Lane tag: kit shows P1..P4 (clickable to pick the part to edit); a melodic
    // alt lane shows ACCENT in accent mode.
    if (kit) {
      const part = track.parts[li];
      if (part.mute) lane.classList.add('lane-muted');
      const head = el('div', 'kit-lane-head');
      const tagEl = el('div', 'lane-tag' + (li === selectedPart ? ' partsel' : ''), 'P' + (li + 1));
      tagEl.onclick = () => { selectedPart = li; renderEditor(); renderGrid(); };
      const mb = el('button', 'lanemute' + (part.mute ? ' on' : ''), 'M');
      mb.title = 'Mute part';
      mb.onclick = (e) => { e.stopPropagation(); part.mute = !part.mute; save(); renderGrid(); };
      head.append(tagEl, mb);
      lane.append(head);
    } else {
      const isAccent = laneName === 'alt' && accentMode;
      lane.append(el('div', 'lane-tag' + (isAccent ? ' accent' : ''), isAccent ? 'accent' : laneName));
    }
    const steps = laneSteps(track, laneName);
    const cells = el('div', 'cells');
    for (let i = 0; i < PAGE; i++) {
      const pos = page * PAGE + i;
      const cell = el('button', 'cell');
      cell.dataset.i = i; cell.dataset.pos = pos;
      if (i % 4 === 0) cell.classList.add('beat');
      if (pos >= track.length) cell.classList.add('disabled');
      const step = steps[pos];
      if (step && step.on) cell.classList.add('on');
      if (step && step.slide) cell.append(el('span', 'slide-mark'));
      if (step && step.on && step.tie) cell.append(el('span', 'tie-mark'));
      if (selSteps.has(stepKey(laneName, pos))) cell.classList.add('selected');
      attachCellGestures(cell, laneName, pos);
      cells.append(cell);
    }
    lane.append(cells);
    grid.append(lane);
  });
  renderStepEditor();
}

const LONGPRESS_MS = 420;
const MOVE_CANCEL_PX = 12;

// A tap toggles the step; a long-press selects it. Each cell tracks its own
// pointer so two fingers on two cells act independently, and both handlers
// update just their own cell rather than re-rendering the grid, which would
// tear cells out from under other in-progress touches.
function attachCellGestures(cell, laneName, pos) {
  let timer = null;
  let startX = 0;
  let startY = 0;
  let longFired = false;
  let active = false;
  const clearTimer = () => { if (timer) { clearTimeout(timer); timer = null; } };

  cell.addEventListener('pointerdown', (e) => {
    if (cell.classList.contains('disabled')) return;
    active = true;
    longFired = false;
    startX = e.clientX;
    startY = e.clientY;
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      longFired = true;
      // Trigger mode (nothing selected): long-press enters edit mode by
      // selecting this step. Edit mode: long-press toggles its membership so
      // several steps can be selected together.
      if (selSteps.size === 0) selectOnly(laneName, pos);
      else toggleSelect(cell, laneName, pos);
    }, LONGPRESS_MS);
  });
  cell.addEventListener('pointermove', (e) => {
    if (!active) return;
    if (Math.abs(e.clientX - startX) > MOVE_CANCEL_PX ||
        Math.abs(e.clientY - startY) > MOVE_CANCEL_PX) {
      active = false;
      clearTimer();
    }
  });
  cell.addEventListener('pointerup', () => {
    if (!active) return;
    active = false;
    clearTimer();
    if (longFired) return;
    // Trigger mode (nothing selected): tap places or clears the step. Edit mode
    // (a selection exists): tap moves the selection to just this step.
    if (selSteps.size === 0) toggleStep(cell, laneName, pos);
    else selectOnly(laneName, pos);
  });
  cell.addEventListener('pointercancel', () => { active = false; clearTimer(); });
}

// Tap: place or clear the step. Clearing also drops it from the selection.
function toggleStep(cell, laneName, pos) {
  const track = pattern.tracks[selected];
  if (pos >= track.length) return;
  const step = laneSteps(track, laneName)[pos];
  step.on = !step.on;
  cell.classList.toggle('on', step.on);
  if (!step.on) {
    const k = stepKey(laneName, pos);
    if (selSteps.delete(k)) {
      cell.classList.remove('selected');
      fixAnchor();
      renderStepEditor();
    }
  }
  save();
}

// Edit-mode tap, or entering edit mode: make this the only selected step. Only
// the .selected classes are touched (not a grid rebuild), so in-progress touches
// on other cells are not disturbed.
function selectOnly(laneName, pos) {
  const track = pattern.tracks[selected];
  if (pos >= track.length) return;
  selSteps.clear();
  selSteps.add(stepKey(laneName, pos));
  selAnchor = { lane: laneName, pos };
  document.querySelectorAll('#grid .cell.selected').forEach((c) => c.classList.remove('selected'));
  const cell = document.querySelector(`#grid .lane[data-lane="${laneName}"] .cell[data-pos="${pos}"]`);
  if (cell) cell.classList.add('selected');
  renderStepEditor();
}

// Long-press: add or remove the step from the edit selection.
function toggleSelect(cell, laneName, pos) {
  const track = pattern.tracks[selected];
  if (pos >= track.length) return;
  const k = stepKey(laneName, pos);
  if (selSteps.delete(k)) {
    cell.classList.remove('selected');
    fixAnchor();
  } else {
    selSteps.add(k);
    cell.classList.add('selected');
    selAnchor = { lane: laneName, pos };
  }
  renderStepEditor();
}

function renderStepEditor() {
  const box = document.getElementById('stepedit');
  if (!box) return;
  box.innerHTML = '';

  if (selSteps.size === 0 || !selAnchor) {
    box.append(el('div', 'hint', 'Tap a step to place or clear it. Long-press a step to edit it: then tap to move the selection, long-press to add or drop steps. Deselect all to place steps again.'));
    return;
  }

  // The anchor seeds the control positions; edits write to every selected step.
  const anchor = laneSteps(pattern.tracks[selected], selAnchor.lane)[selAnchor.pos];
  const applyAll = (fn) => { for (const s of selectedStepObjs()) fn(s); save(); };

  const title = el('div', 'ed-title');
  const label = selSteps.size === 1
    ? `${selAnchor.lane.toUpperCase()} lane · step ${selAnchor.pos + 1}`
    : `${selSteps.size} steps selected`;
  title.append(el('span', null, label));
  box.append(title);

  // Step on/off, so a step can be placed or cleared without leaving edit mode.
  // (Replaces the old passive PLACED/EMPTY indicator.)
  const stepRow = el('div', 'ed-field');
  stepRow.append(el('span', 'lbl', 'Step'));
  const onBtn = el('button', 'mute' + (anchor.on ? ' on' : ''), anchor.on ? 'PLACED' : 'EMPTY');
  onBtn.onclick = () => { const nv = !anchor.on; applyAll((s) => { s.on = nv; }); renderGrid(); };
  stepRow.append(onBtn);
  box.append(stepRow);

  // Note row: big readout with semitone steppers plus a slider.
  const noteRow = el('div', 'ed-field');
  noteRow.append(el('span', 'lbl', 'Note'));
  const nDown = el('button', 'note-btn', '‹');
  const nName = el('span', 'note-name', noteName(anchor.note));
  const nUp = el('button', 'note-btn', '›');
  const note = el('input', 'range');
  note.type = 'range'; note.min = 24; note.max = 96; note.value = anchor.note;
  const setNote = (v) => {
    const nv = Math.min(96, Math.max(24, v));
    applyAll((s) => { s.note = nv; });
    note.value = nv;
    nName.textContent = noteName(nv);
  };
  note.oninput = () => setNote(Number(note.value));
  nDown.onclick = () => setNote(anchor.note - 1);
  nUp.onclick = () => setNote(anchor.note + 1);
  noteRow.append(nDown, nName, nUp, note);
  box.append(noteRow);

  const vel = el('input', 'range');
  vel.type = 'range'; vel.min = 1; vel.max = 127; vel.value = anchor.velocity;
  const vv = el('span', 'val', String(anchor.velocity));
  vel.oninput = () => { const v = Number(vel.value); applyAll((s) => { s.velocity = v; }); vv.textContent = String(v); };
  box.append(field('Velocity', vel, vv));

  const gate = el('input', 'range');
  gate.type = 'range'; gate.min = 0; gate.max = 100; gate.value = Math.round(anchor.gateLen * 100);
  const gv = el('span', 'val', Math.round(anchor.gateLen * 100) + '%');
  gate.oninput = () => { const g = Number(gate.value); applyAll((s) => { s.gateLen = g / 100; }); gv.textContent = g + '%'; };
  box.append(field('Gate', gate, gv));

  // Slide is only meaningful on a monophonic engine, where it glides legato
  // from the previous note (303 style).
  if (engineById(pattern.tracks[selected].engine).mono) {
    const slideRow = el('div', 'ed-field');
    slideRow.append(el('span', 'lbl', 'Slide'));
    const slideBtn = el('button', 'mute' + (anchor.slide ? ' on' : ''), anchor.slide ? 'ON' : 'OFF');
    slideBtn.onclick = () => { const nv = !anchor.slide; applyAll((s) => { s.slide = nv; }); renderGrid(); };
    slideRow.append(slideBtn);
    box.append(slideRow);
  }

  // Tie merges this step into the previous note (any engine): it holds instead
  // of re-triggering, so adjacent steps become one sustained note.
  const tieRow = el('div', 'ed-field');
  tieRow.append(el('span', 'lbl', 'Tie'));
  const tieBtn = el('button', 'mute' + (anchor.tie ? ' on' : ''), anchor.tie ? 'ON' : 'OFF');
  tieBtn.onclick = () => { const nv = !anchor.tie; applyAll((s) => { s.tie = nv; }); renderGrid(); };
  tieRow.append(tieBtn);
  box.append(tieRow);

  box.append(el('div', 'hint poly', engineById(pattern.tracks[selected].engine).altMode === 'accent'
    ? 'Accent: a trigger on the ACCENT (alt) lane under a main step accents that note, louder and brighter, 303 style. An accent with no main step does nothing.'
    : 'Polyphony: place a trigger on the ALT lane at the same step for a second simultaneous note. For full chords, switch this track to the CHORD engine (its Type knob picks the chord).'));
}

function labeled(label, control) {
  const w = el('label', 'field');
  w.append(el('span', 'lbl', label), control);
  return w;
}

// ---- mod matrix UI ---------------------------------------------------------

function applyRoutes() {
  if (host.ctx) modMatrix.rebuild(pattern.routes);
  save();
}

function trackSelect(value, onChange) {
  const s = el('select', 'sel sm');
  for (let t = 0; t < TRACKS; t++) {
    const o = el('option', null, 'T' + (t + 1)); o.value = String(t);
    if (t === value) o.selected = true;
    s.append(o);
  }
  s.onchange = () => onChange(Number(s.value));
  return s;
}

function pick(options, value, onChange) {
  const s = el('select', 'sel sm');
  options.forEach(([v, label]) => {
    const o = el('option', null, label); o.value = v;
    if (v === value) o.selected = true;
    s.append(o);
  });
  s.onchange = () => onChange(s.value);
  return s;
}

function renderMatrix() {
  const box = document.getElementById('matrix');
  if (!box) return;
  box.innerHTML = '';

  const head = el('div', 'matrix-head');
  head.append(el('span', 'matrix-title', 'Mod Matrix'));
  const add = el('button', 'iobtn', '+ Route');
  add.onclick = () => { pattern.routes.push(makeRoute()); applyRoutes(); renderMatrix(); };
  head.append(add);
  box.append(head);

  if (!pattern.routes.length) {
    box.append(el('div', 'matrix-empty', 'No routes. Add one to modulate a track filter or level.'));
    return;
  }

  pattern.routes.forEach((r, idx) => {
    const row = el('div', 'route');

    // Source
    row.append(pick([['trig', 'Trig'], ['lfo', 'LFO']], r.src.type, (v) => { r.src.type = v; applyRoutes(); renderMatrix(); }));
    if (r.src.type === 'trig') {
      row.append(trackSelect(r.src.track, (v) => { r.src.track = v; applyRoutes(); renderMatrix(); }));
      // A kit source track taps a part row; a melodic one taps main/alt.
      const laneOpts = isKit(pattern.tracks[r.src.track])
        ? [['part0', 'P1'], ['part1', 'P2'], ['part2', 'P3'], ['part3', 'P4'], ['both', 'all']]
        : [['main', 'main'], ['alt', 'alt'], ['both', 'both']];
      row.append(pick(laneOpts, r.src.lane, (v) => { r.src.lane = v; applyRoutes(); }));
    } else {
      row.append(pick([['sine', 'sine'], ['tri', 'tri'], ['saw', 'saw'], ['square', 'sqr']], r.src.shape, (v) => { r.src.shape = v; applyRoutes(); }));
      const rate = el('input', 'mini');
      rate.type = 'range'; rate.min = 1; rate.max = 200; rate.value = Math.round(r.src.rateHz * 10);
      rate.title = 'LFO rate (Hz)';
      rate.oninput = () => { r.src.rateHz = Number(rate.value) / 10; applyRoutes(); rateVal.textContent = r.src.rateHz.toFixed(1); };
      const rateVal = el('span', 'rv', r.src.rateHz.toFixed(1));
      row.append(rate, rateVal);
    }

    row.append(el('span', 'arrow', '→'));

    // Destination. Options are the output stage plus the destination engine's
    // five controls (m0..m4), labelled by that engine.
    row.append(trackSelect(r.dest.track, (v) => { r.dest.track = v; applyRoutes(); renderMatrix(); }));
    const destEng = engineById(pattern.tracks[r.dest.track].engine);
    const destOpts = [['cutoff', 'Filter'], ['hp', 'Hi-Pass'], ['vca', 'Level']]
      .concat(destEng.params.map((p, i) => ['m' + i, p.label]));
    row.append(pick(destOpts, r.dest.param, (v) => { r.dest.param = v; applyRoutes(); }));

    // Depth
    const depth = el('input', 'mini');
    depth.type = 'range'; depth.min = 0; depth.max = 100; depth.value = Math.round(r.depth * 100);
    depth.title = 'Depth';
    const dv = el('span', 'rv', Math.round(r.depth * 100) + '');
    depth.oninput = () => { r.depth = Number(depth.value) / 100; dv.textContent = depth.value; applyRoutes(); };
    row.append(el('span', 'rlbl', 'amt'), depth, dv);

    // Polarity
    const pol = el('button', 'pol', r.polarity < 0 ? '−' : '+');
    pol.title = 'Polarity';
    pol.onclick = () => { r.polarity = -r.polarity; pol.textContent = r.polarity < 0 ? '−' : '+'; applyRoutes(); };
    row.append(pol);

    // Decay (trigger only)
    if (r.src.type === 'trig') {
      const dec = el('input', 'mini');
      dec.type = 'range'; dec.min = 2; dec.max = 60; dec.value = Math.round(r.decay * 100);
      dec.title = 'Pulse decay (s)';
      dec.oninput = () => { r.decay = Number(dec.value) / 100; applyRoutes(); };
      row.append(el('span', 'rlbl', 'dec'), dec);
    }

    const rm = el('button', 'rm', '✕');
    rm.onclick = () => { pattern.routes.splice(idx, 1); applyRoutes(); renderMatrix(); };
    row.append(rm);

    box.append(row);
  });
}

function field(label, control, valEl) {
  const w = el('label', 'ed-field');
  w.append(el('span', 'lbl', label), control, valEl);
  return w;
}

function flipEngine(t, id) {
  const track = pattern.tracks[t];
  track.engine = id;
  track.params = defaultParams(engineById(id));
  track.toggles = defaultToggles(engineById(id));
  if (id === 'kit' && !Array.isArray(track.parts)) track.parts = makeKitParts();
  selectedPart = 0;
  if (voices[t]) {
    voices[t].dispose();
    voices[t] = host.createVoice(id, t);
    if (isKit(track)) track.parts.forEach((p, pi) => { voices[t].setPartType(pi, p.type); voices[t].setPartParams(pi, p.params); });
    else { voices[t].setParams(track.params); voices[t].setToggles(track.toggles); }
    voices[t].setOutput(track.output);
    // The voice node is new, so its AudioParams changed identity; reconnect.
    modMatrix.attach(voices);
    modMatrix.rebuild(pattern.routes);
  }
  save();
  renderRail();
  renderEditor();
  if (t === selected) renderGrid(); // lane count changes with kit/melodic
}

function makeKnob(label, value, onChange) {
  const wrap = el('div', 'knob');
  const dial = el('div', 'dial');
  const ind = el('div', 'ind');
  dial.append(ind);
  wrap.append(dial, el('div', 'knob-label', label));
  const val = el('div', 'knob-val', pct(value));
  wrap.append(val);

  let v = value;
  const paint = () => { ind.style.transform = `rotate(${-135 + v * 270}deg)`; val.textContent = pct(v); };
  paint();

  let dragging = false, startY = 0, startV = 0;
  dial.addEventListener('pointerdown', (e) => { dragging = true; startY = e.clientY; startV = v; dial.setPointerCapture(e.pointerId); });
  dial.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    v = Math.min(1, Math.max(0, startV + (startY - e.clientY) / 200));
    paint(); onChange(v);
  });
  const end = () => { dragging = false; };
  dial.addEventListener('pointerup', end);
  dial.addEventListener('pointercancel', end);
  dial.addEventListener('dblclick', () => { v = value; paint(); onChange(v); });
  return wrap;
}

// One engine on/off switch. A disabled slot (the engine defines no toggle here)
// is dimmed and inert.
function makeSwitch(label, on, disabled, onChange) {
  const wrap = el('div', 'switch' + (on ? ' on' : '') + (disabled ? ' disabled' : ''));
  const body = el('div', 'sw-body');
  body.append(el('div', 'sw-knob'));
  wrap.append(body, el('div', 'knob-label', label));
  if (!disabled) {
    body.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      on = !on;
      wrap.classList.toggle('on', on);
      onChange(on);
    });
  }
  return wrap;
}

// ---- persistence I/O -------------------------------------------------------

function exportJson() {
  const blob = new Blob([serialize(pattern)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'web-rack-pattern.json';
  document.body.append(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function importJson(e) {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const p = deserialize(String(reader.result));
      if (!Array.isArray(p.tracks) || p.tracks.length !== TRACKS) throw new Error('need 6 tracks');
      pattern = p;
      localStorage.setItem(STORE_KEY, serialize(pattern));
      location.reload();
    } catch (err) {
      alert('Could not load: ' + err.message);
    }
  };
  reader.readAsText(f);
}

// ---- helpers ---------------------------------------------------------------

function clampNum(v, lo, hi, dflt) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

function pct(v) { return Math.round(v * 100) + '%'; }

// ---- boot ------------------------------------------------------------------

render();
if (!AUDIO_SUPPORTED) showUnsupported();
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); togglePlay(); }
  if (e.key >= '1' && e.key <= '6' && e.target === document.body) selectTrack(Number(e.key) - 1);
});
