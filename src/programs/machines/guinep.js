// SPDX-License-Identifier: 0BSD

// Guinep machine config: dub techno, a partially peeled Spanish lime (green rind,
// pale salmon flesh). Same shared app (rack/main.js) via the 'machine-config'
// alias; its own A-minor dub starter and green-and-salmon skin.
export { freshPattern, TRACKS } from './guinep.starter.js';

export const STORE_KEY = 'web-rack:guinep:v1';

export const brand = {
  name: 'Guinep',
  model: 'GU-6 &middot; six-track dub-techno engine',
  flavor: 'dub<br>techno',
  logo: `<svg class="brand-logo" viewBox="0 0 64 72" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <radialGradient id="guiRind" cx="36%" cy="30%" r="80%">
        <stop offset="0" stop-color="#9ccf5e"/><stop offset="52%" stop-color="#5f9e2f"/><stop offset="100%" stop-color="#2f5417"/>
      </radialGradient>
      <radialGradient id="guiFlesh" cx="42%" cy="40%" r="72%">
        <stop offset="0" stop-color="#ffdcc6"/><stop offset="60%" stop-color="#ff9e7a"/><stop offset="100%" stop-color="#e0714a"/>
      </radialGradient>
      <linearGradient id="guiLeaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8fd85a"/><stop offset="1" stop-color="#3f8f16"/></linearGradient>
    </defs>
    <path d="M32 22 q1 -7 5 -10" fill="none" stroke="#6b4a2a" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M37 12 c6 -3 12 1 10 6 c-4 3 -10 2 -13 -1 c-1 -3 0 -4 3 -5 z" fill="url(#guiLeaf)"/>
    <circle cx="32" cy="42" r="20" fill="url(#guiRind)" stroke="rgba(0,0,0,.22)" stroke-width="1"/>
    <ellipse cx="26" cy="38" rx="12.5" ry="13.5" fill="url(#guiFlesh)"/>
    <path d="M13 33 q-4 6 1 12 q3 -2 3 -7 q0 -4 -4 -5 z" fill="url(#guiRind)" stroke="rgba(0,0,0,.2)" stroke-width=".7"/>
    <ellipse cx="27" cy="39" rx="4.5" ry="6" fill="#7a4a2c" opacity=".7"/>
    <ellipse cx="23" cy="33" rx="4" ry="2.4" fill="#ffffff" opacity=".38" transform="rotate(-24 23 33)"/>
  </svg>`,
};

// Green-rind skin with salmon-flesh accents: the peeled guinep. Greens carry the
// body and wells, salmon lights the buttons, dials, and highlights.
export const palette = {
  '--m-1': '#6fae3a', '--m-2': '#4e8526', '--m-3': '#2c4d16', '--m-hi': '#ff9e7a',
  '--m-edge': '#16260c', '--m-well': '#12200a', '--m-well-2': '#0c1707',
  '--m-panel-1': '#3f6524', '--m-panel-2': '#2c4c1a', '--m-panel-3': '#35591f', '--m-panel-4': '#223c14',
  '--m-chip-1': '#2c4718', '--m-chip-2': '#1a2e0f', '--m-chip-on-1': '#4f8329', '--m-chip-on-2': '#38601c',
  '--m-dial-1': '#ffd7be', '--m-dial-2': '#6fae3a', '--m-dial-3': '#24401a',
  '--m-btn-1': '#ffe0cc', '--m-btn-2': '#ff8f66', '--m-btn-sh': '#b5532f', '--m-btn-ink': '#1c2a0f',
  '--m-bg-0': '#0a1405', '--m-bg-1': '#16260c', '--m-bg-2': '#1c3011',
  '--m-word-1': '#eef7dc', '--m-word-2': '#b9e08a', '--m-word-3': '#8fbf5a', '--m-word-4': '#5e9130',
  '--m-ink': '#eef7e2', '--m-ink-dim': '#c2d8a8', '--m-ink-mute': '#7a8f66',
};
