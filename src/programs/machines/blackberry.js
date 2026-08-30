// SPDX-License-Identifier: 0BSD

// Blackberry machine config: dungeon synth / dark medieval folk, deep bramble
// purple. Same shared app (rack/main.js) via the 'machine-config' alias; its own
// A-minor lament starter and skin.
export { freshPattern, TRACKS } from './blackberry.starter.js';

export const STORE_KEY = 'web-rack:blackberry:v1';

export const brand = {
  name: 'Blackberry',
  model: 'BK-6 &middot; six-track dungeon-synth engine',
  flavor: 'dungeon<br>synth',
  logo: `<svg class="brand-logo" viewBox="0 0 64 72" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <radialGradient id="blackBody" cx="34%" cy="30%" r="82%">
        <stop offset="0" stop-color="#a48fe0"/><stop offset="42%" stop-color="#6a45c4"/><stop offset="100%" stop-color="#241246"/>
      </radialGradient>
      <linearGradient id="blackLeaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8fd85a"/><stop offset="1" stop-color="#3f8f16"/></linearGradient>
    </defs>
    <path d="M32 24 q1 -7 5 -11" fill="none" stroke="#6b4a2a" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M37 13 c6 -3 12 1 10 6 c-4 3 -10 2 -13 -1 c-1 -3 0 -4 3 -5 z" fill="url(#blackLeaf)"/>
    <g fill="url(#blackBody)" stroke="rgba(0,0,0,.28)" stroke-width=".7">
      <circle cx="28" cy="32" r="4.7"/><circle cx="38" cy="33" r="4.7"/>
      <circle cx="23" cy="40" r="4.7"/><circle cx="33" cy="39" r="4.7"/><circle cx="43" cy="40" r="4.7"/>
      <circle cx="26" cy="48" r="4.7"/><circle cx="36" cy="47" r="4.7"/><circle cx="45" cy="47" r="4.7"/>
      <circle cx="31" cy="55" r="4.7"/><circle cx="40" cy="54" r="4.7"/>
    </g>
    <g fill="#c9b8ff" opacity=".5"><circle cx="26.5" cy="30.5" r="1.2"/><circle cx="21.5" cy="38.5" r="1.2"/><circle cx="31.5" cy="37.5" r="1.2"/></g>
  </svg>`,
};

// Deep bramble-purple skin, darker and more desaturated than Blueberry.
export const palette = {
  '--m-1': '#6a45c4', '--m-2': '#472d86', '--m-3': '#241246', '--m-hi': '#a48fe0',
  '--m-edge': '#160c2e', '--m-well': '#120a26', '--m-well-2': '#0b0619',
  '--m-panel-1': '#3d2870', '--m-panel-2': '#2a1c52', '--m-panel-3': '#33235e', '--m-panel-4': '#201640',
  '--m-chip-1': '#2e2058', '--m-chip-2': '#1c123c', '--m-chip-on-1': '#5a3ca0', '--m-chip-on-2': '#3d2876',
  '--m-dial-1': '#b09ae0', '--m-dial-2': '#6a45c4', '--m-dial-3': '#281a4c',
  '--m-btn-1': '#c9b8ff', '--m-btn-2': '#7a52d0', '--m-btn-sh': '#3d2870', '--m-btn-ink': '#160c2e',
  '--m-bg-0': '#0a0518', '--m-bg-1': '#1e1240', '--m-bg-2': '#241650',
  '--m-word-1': '#d8ccff', '--m-word-2': '#b09ae0', '--m-word-3': '#8a6ad8', '--m-word-4': '#5e3fb0',
  '--m-ink': '#ece4ff', '--m-ink-dim': '#c2b0e8', '--m-ink-mute': '#8073aa',
};
