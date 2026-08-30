// SPDX-License-Identifier: 0BSD

// Coconut machine config: generative ambient, pale bone-white. Same shared app
// (rack/main.js) via the 'machine-config' alias; its own generative starter and
// a light cream skin -- the one pale machine among the dark ones.
export { freshPattern, TRACKS } from './coconut.starter.js';

export const STORE_KEY = 'web-rack:coconut:v1';

export const brand = {
  name: 'Coconut',
  model: 'CN-6 &middot; six-track generative ambient engine',
  flavor: 'generative<br>ambient',
  logo: `<svg class="brand-logo" viewBox="0 0 64 72" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <radialGradient id="cocoHusk" cx="36%" cy="30%" r="80%">
        <stop offset="0" stop-color="#8a6a44"/><stop offset="60%" stop-color="#6b4e30"/><stop offset="100%" stop-color="#3e2c18"/>
      </radialGradient>
      <radialGradient id="cocoFlesh" cx="42%" cy="38%" r="70%">
        <stop offset="0" stop-color="#fffaf0"/><stop offset="100%" stop-color="#e6d8c0"/>
      </radialGradient>
    </defs>
    <circle cx="32" cy="40" r="24" fill="url(#cocoHusk)" stroke="rgba(0,0,0,.2)" stroke-width="1"/>
    <ellipse cx="30" cy="40" rx="15" ry="17" fill="url(#cocoFlesh)"/>
    <g fill="#4e3620"><circle cx="41" cy="30" r="2"/><circle cx="46" cy="37" r="2"/><circle cx="43" cy="45" r="2"/></g>
    <path d="M20 22 q4 -6 11 -7" fill="none" stroke="#6b4e30" stroke-width="2" stroke-linecap="round" opacity=".5"/>
  </svg>`,
};

// Pale bone-white / cream skin with warm brown accents. A light theme: light
// panels and dials, dark-brown ink. The shared candy accents (lime/cyan/magenta)
// still pop over the cream.
export const palette = {
  '--m-1': '#e2d6bd', '--m-2': '#c7b795', '--m-3': '#9d8c6c', '--m-hi': '#fff9ee',
  '--m-edge': '#7a6a4e', '--m-well': '#cabd9f', '--m-well-2': '#b8aa88',
  '--m-panel-1': '#ddd0b2', '--m-panel-2': '#c6b691', '--m-panel-3': '#d3c5a2', '--m-panel-4': '#bdae8b',
  '--m-chip-1': '#c9b997', '--m-chip-2': '#b2a27f', '--m-chip-on-1': '#a58b5e', '--m-chip-on-2': '#836b46',
  '--m-dial-1': '#f2e9d0', '--m-dial-2': '#cabb98', '--m-dial-3': '#8b7a5a',
  '--m-btn-1': '#fff4da', '--m-btn-2': '#d9c69c', '--m-btn-sh': '#a8987a', '--m-btn-ink': '#3e321d',
  '--m-bg-0': '#efe8d6', '--m-bg-1': '#e6ddc8', '--m-bg-2': '#ded3ba',
  '--m-word-1': '#6b4e30', '--m-word-2': '#8a6a44', '--m-word-3': '#a5895c', '--m-word-4': '#5a4028',
  '--m-ink': '#4a3d26', '--m-ink-dim': '#6d5e42', '--m-ink-mute': '#998a6c',
};
