// SPDX-License-Identifier: 0BSD

// Grape machine config: funky electro, purple. The shared app (rack/main.js)
// imports this as 'machine-config' via an esbuild alias; build.mjs also reads it
// for the HTML brand and palette. Starter and TRACKS come from the shared
// grape starter.
export { freshPattern, TRACKS } from '../rack/starter.js';

export const STORE_KEY = 'web-rack:rack:v2';

export const brand = {
  name: 'Grape',
  model: 'GR-6 &middot; six-track groove synthesizer',
  flavor: 'funky<br>electro',
  logo: `<svg class="brand-logo" viewBox="0 0 64 72" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <radialGradient id="berry" cx="36%" cy="30%" r="75%">
        <stop offset="0" stop-color="#d9b8ff"/><stop offset="55%" stop-color="#8a3ff0"/><stop offset="100%" stop-color="#54199f"/>
      </radialGradient>
      <linearGradient id="leaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a6e85a"/><stop offset="1" stop-color="#5fb320"/></linearGradient>
    </defs>
    <path d="M30 14 q3-8 11-9" fill="none" stroke="#6b4a2a" stroke-width="3" stroke-linecap="round"/>
    <path d="M40 5 c8 -4 15 1 13 8 c-1 5 -9 6 -15 2 c-2 -4 -2 -7 2 -10 z" fill="url(#leaf)"/>
    <g stroke="rgba(0,0,0,.18)" stroke-width="1">
      <circle cx="18" cy="30" r="8.5" fill="url(#berry)"/><circle cx="32" cy="27" r="8.5" fill="url(#berry)"/>
      <circle cx="46" cy="30" r="8.5" fill="url(#berry)"/><circle cx="25" cy="42" r="8.5" fill="url(#berry)"/>
      <circle cx="39" cy="42" r="8.5" fill="url(#berry)"/><circle cx="32" cy="55" r="8.5" fill="url(#berry)"/>
    </g>
  </svg>`,
};

// Machine palette: the fruit-colored surfaces (body, panels, chips, knobs,
// buttons, background, wordmark). The shared candy accents (lime/magenta/cyan/
// amber) and neutrals live in the template's :root.
export const palette = {
  '--m-1': '#6a34c8', '--m-2': '#4a2098', '--m-3': '#331466', '--m-hi': '#9a63e6',
  '--m-edge': '#21103f', '--m-well': '#180d33', '--m-well-2': '#120926',
  '--m-panel-1': '#5b2fb0', '--m-panel-2': '#3f1f86', '--m-panel-3': '#46278c', '--m-panel-4': '#341a6e',
  '--m-chip-1': '#4a2a92', '--m-chip-2': '#34196e', '--m-chip-on-1': '#6a3fd0', '--m-chip-on-2': '#4a24a4',
  '--m-dial-1': '#a074e0', '--m-dial-2': '#5a2fb0', '--m-dial-3': '#341a70',
  '--m-btn-1': '#c79bff', '--m-btn-2': '#9a63e6', '--m-btn-sh': '#5b2fb0', '--m-btn-ink': '#23103f',
  '--m-bg-0': '#0e0820', '--m-bg-1': '#3a1f66', '--m-bg-2': '#5a1250',
  '--m-word-1': '#f6ecff', '--m-word-2': '#d9b6ff', '--m-word-3': '#a862ff', '--m-word-4': '#7a34d8',
  '--m-ink': '#f4ebff', '--m-ink-dim': '#b39ee0', '--m-ink-mute': '#7d68ad',
};
