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
import { defaultParams } from '../../core/engines/drum-meta.js';
import { serialize, deserialize, makeRoute, PAGE, MAX_STEPS } from '../../core/sequencer.js';
import { freshPattern, TRACKS } from './starter.js';
import { AudioHost } from './audio.js';
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

// Per-track scheduling cursors and playhead queues.
let cursors = [];
let litByTrack = [];
let curPos = []; // current lit position per track

async function ensureAudio() {
  if (voices.length) return;
  await host.init();
  voices = pattern.tracks.map((t) => {
    const v = host.createVoice(t.engine);
    v.setParams(t.params);
    v.setOutput(t.output);
    return v;
  });
  modMatrix.attach(voices);
  modMatrix.rebuild(pattern.routes);
  clock = new Clock(host.ctx);
}

function scheduleTrackStep(t, absStep, time) {
  const track = pattern.tracks[t];
  if (track.mute) return;
  const stepDur = transport.stepDuration(track.ratio);
  const pos = absStep % track.length;
  const m = track.main[pos];
  const a = track.alt[pos];
  const v = voices[t];
  if (m.on) {
    v.trigger(time, m.note, m.velocity, gateSecFor(m, stepDur));
    modMatrix.onSourceTrigger(t, 'main', time);
  }
  if (a.on) {
    v.trigger(time, a.note, a.velocity, gateSecFor(a, stepDur));
    modMatrix.onSourceTrigger(t, 'alt', time);
  }
  litByTrack[t].push({ pos, time, hit: m.on || a.on });
}

function gateSecFor(step, stepDur) {
  return Math.max(0.01, step.gateLen * stepDur);
}

function pump(horizon) {
  for (let t = 0; t < TRACKS; t++) {
    const track = pattern.tracks[t];
    const stepDur = transport.stepDuration(track.ratio);
    const c = cursors[t];
    while (c.nextTime < horizon) {
      scheduleTrackStep(t, c.step, c.nextTime);
      c.nextTime += stepDur;
      c.step += 1;
    }
  }
}

async function play() {
  await ensureAudio();
  await host.resume();
  const start = host.currentTime + 0.1;
  cursors = pattern.tracks.map(() => ({ step: 0, nextTime: start }));
  litByTrack = pattern.tracks.map(() => []);
  curPos = pattern.tracks.map(() => -1);
  playing = true;
  clock.start(pump);
  playBtn.textContent = 'Stop';
  requestAnimationFrame(playhead);
}

function stop() {
  playing = false;
  if (clock) clock.stop();
  playBtn.textContent = 'Play';
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
let pageByTrack = new Array(TRACKS).fill(0);
let selStep = { lane: 'main', pos: 0 };
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
  head.append(el('div', 'title', 'web-rack'));
  playBtn = el('button', 'play', playing ? 'Stop' : 'Play');
  playBtn.onclick = togglePlay;
  const tempoWrap = el('label', 'field');
  tempoWrap.append(el('span', 'lbl', 'BPM'));
  tempoInput = el('input', 'num');
  tempoInput.type = 'number'; tempoInput.min = 20; tempoInput.max = 300; tempoInput.value = pattern.bpm;
  tempoInput.oninput = () => {
    pattern.bpm = clampNum(tempoInput.value, 20, 300, 120);
    transport.bpm = pattern.bpm;
    save();
  };
  tempoWrap.append(tempoInput);
  head.append(playBtn, tempoWrap);
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
    mute.onclick = (e) => { e.stopPropagation(); track.mute = !track.mute; save(); renderRail(); };
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

  // Mod matrix (pattern-level)
  const matrix = el('div', 'matrix');
  matrix.id = 'matrix';
  app.append(matrix);
  renderMatrix();

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

function selectTrack(t) {
  selected = t;
  selStep = { lane: 'main', pos: pageOf(t) * PAGE };
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

  // Output stage base controls (mod destinations move around these).
  const filt = el('input', 'mini');
  filt.type = 'range'; filt.min = 0; filt.max = 100; filt.value = Math.round(track.output.cutoff * 100);
  filt.oninput = () => {
    track.output.cutoff = Number(filt.value) / 100;
    if (voices[selected]) voices[selected].setOutput({ cutoff: track.output.cutoff });
    save();
  };
  top.append(labeled('Filter', filt));

  const lvl = el('input', 'mini');
  lvl.type = 'range'; lvl.min = 0; lvl.max = 100; lvl.value = Math.round(track.output.vca * 100);
  lvl.oninput = () => {
    track.output.vca = Number(lvl.value) / 100;
    if (voices[selected]) voices[selected].setOutput({ vca: track.output.vca });
    save();
  };
  top.append(labeled('Level', lvl));
  ed.append(top);

  // Knobs
  const knobs = el('div', 'knobs');
  meta.params.forEach((p, i) => knobs.append(makeKnob(p.label, track.params[i], (val) => {
    track.params[i] = val;
    if (voices[selected]) voices[selected].setParam(i, val);
    save();
  })));
  ed.append(knobs);

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

  ['main', 'alt'].forEach((laneName) => {
    const lane = el('div', 'lane'); lane.dataset.lane = laneName;
    lane.append(el('div', 'lane-tag', laneName));
    const cells = el('div', 'cells');
    for (let i = 0; i < PAGE; i++) {
      const pos = page * PAGE + i;
      const cell = el('button', 'cell');
      cell.dataset.i = i; cell.dataset.pos = pos;
      if (i % 4 === 0) cell.classList.add('beat');
      if (pos >= track.length) cell.classList.add('disabled');
      const step = track[laneName][pos];
      if (step && step.on) cell.classList.add('on');
      if (laneName === selStep.lane && pos === selStep.pos) cell.classList.add('sel');
      cell.onclick = () => onCellClick(laneName, pos);
      cells.append(cell);
    }
    lane.append(cells);
    grid.append(lane);
  });
  renderStepEditor();
}

function onCellClick(laneName, pos) {
  const track = pattern.tracks[selected];
  if (pos >= track.length) return;
  const step = track[laneName][pos];
  step.on = !step.on;
  selStep = { lane: laneName, pos };
  save();
  renderGrid();
}

function renderStepEditor() {
  const box = document.getElementById('stepedit');
  if (!box) return;
  box.innerHTML = '';
  const step = pattern.tracks[selected][selStep.lane][selStep.pos];
  box.append(el('div', 'ed-title', `${selStep.lane} step ${selStep.pos + 1}`));

  const note = el('input', 'range');
  note.type = 'range'; note.min = 24; note.max = 96; note.value = step.note;
  const nv = el('span', 'val', noteName(step.note));
  note.oninput = () => { step.note = Number(note.value); nv.textContent = noteName(step.note); save(); };
  box.append(field('Note', note, nv));

  const vel = el('input', 'range');
  vel.type = 'range'; vel.min = 1; vel.max = 127; vel.value = step.velocity;
  const vv = el('span', 'val', String(step.velocity));
  vel.oninput = () => { step.velocity = Number(vel.value); vv.textContent = String(step.velocity); save(); };
  box.append(field('Velocity', vel, vv));

  const gate = el('input', 'range');
  gate.type = 'range'; gate.min = 0; gate.max = 100; gate.value = Math.round(step.gateLen * 100);
  const gv = el('span', 'val', Math.round(step.gateLen * 100) + '%');
  gate.oninput = () => { step.gateLen = Number(gate.value) / 100; gv.textContent = gate.value + '%'; save(); };
  box.append(field('Gate', gate, gv));
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
      row.append(trackSelect(r.src.track, (v) => { r.src.track = v; applyRoutes(); }));
      row.append(pick([['main', 'main'], ['alt', 'alt'], ['both', 'both']], r.src.lane, (v) => { r.src.lane = v; applyRoutes(); }));
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

    // Destination
    row.append(trackSelect(r.dest.track, (v) => { r.dest.track = v; applyRoutes(); }));
    row.append(pick([['cutoff', 'Filter'], ['vca', 'Level']], r.dest.param, (v) => { r.dest.param = v; applyRoutes(); }));

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
  if (voices[t]) {
    voices[t].dispose();
    voices[t] = host.createVoice(id);
    voices[t].setParams(track.params);
    voices[t].setOutput(track.output);
    // The voice node is new, so its AudioParams changed identity; reconnect.
    modMatrix.attach(voices);
    modMatrix.rebuild(pattern.routes);
  }
  save();
  renderRail();
  renderEditor();
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
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); togglePlay(); }
  if (e.key >= '1' && e.key <= '6' && e.target === document.body) selectTrack(Number(e.key) - 1);
});
