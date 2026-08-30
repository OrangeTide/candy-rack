// SPDX-License-Identifier: 0BSD

// Peppermint machine config: chiptune / bitpop, a red-and-white candy skin. An
// oddball candy rather than a fruit. Same shared app (rack/main.js) via the
// 'machine-config' alias; its own all-PULSE NES-style starter.
export { freshPattern, TRACKS } from './peppermint.starter.js';

export const STORE_KEY = 'web-rack:peppermint:v1';

export const brand = {
  name: 'Peppermint',
  model: 'PP-6 &middot; six-track chiptune synthesizer',
  flavor: 'chip<br>tune',
  logo: `<svg class="brand-logo" viewBox="0 0 64 72" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="32" cy="40" r="21" fill="#ffffff" stroke="#e01e2c" stroke-width="2.5"/>
    <g fill="none" stroke="#ff3b47" stroke-width="5.5" stroke-linecap="round">
      <path d="M32 21 Q 46 30 32 40 Q 18 50 32 59"/>
      <path d="M32 21 Q 46 30 32 40 Q 18 50 32 59" transform="rotate(120 32 40)"/>
      <path d="M32 21 Q 46 30 32 40 Q 18 50 32 59" transform="rotate(240 32 40)"/>
    </g>
    <circle cx="32" cy="40" r="3" fill="#ffffff"/>
  </svg>`,
};

// Red-and-white candy-cane skin: a bright light theme, dark red ink on pale
// backgrounds, vivid red accents, white candy dials.
export const palette = {
  '--m-1': '#ff3b47', '--m-2': '#e01e2c', '--m-3': '#b0101c', '--m-hi': '#fff0f0',
  '--m-edge': '#c02028', '--m-well': '#ffdcdf', '--m-well-2': '#f5c8cd',
  '--m-panel-1': '#ffe0e3', '--m-panel-2': '#ffcdd2', '--m-panel-3': '#ffe8ea', '--m-panel-4': '#ffbfc6',
  '--m-chip-1': '#ffcdd2', '--m-chip-2': '#f5b0b8', '--m-chip-on-1': '#ff3b47', '--m-chip-on-2': '#ff6b74',
  '--m-dial-1': '#ffffff', '--m-dial-2': '#ffb0b6', '--m-dial-3': '#b04048',
  '--m-btn-1': '#fff0f0', '--m-btn-2': '#ff5560', '--m-btn-sh': '#c0202a', '--m-btn-ink': '#7a1018',
  '--m-bg-0': '#fff5f5', '--m-bg-1': '#ffe6e8', '--m-bg-2': '#ffd6da',
  '--m-word-1': '#c0101c', '--m-word-2': '#e01e2c', '--m-word-3': '#ff5560', '--m-word-4': '#900810',
  '--m-ink': '#7a1018', '--m-ink-dim': '#b03038', '--m-ink-mute': '#d08a90',
};
