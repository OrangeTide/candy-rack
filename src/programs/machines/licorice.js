// SPDX-License-Identifier: 0BSD

// Licorice machine config: gothic industrial, a black-and-violet skin. The outlier
// candy (black licorice, not a fruit). Same shared app (rack/main.js) via the
// 'machine-config' alias; its own RINGS-driven C-minor starter.
export { freshPattern, TRACKS } from './licorice.starter.js';

export const STORE_KEY = 'web-rack:licorice:v1';

export const brand = {
  name: 'Licorice',
  model: 'LC-6 &middot; six-track gothic-industrial engine',
  flavor: 'gothic<br>industrial',
  logo: `<svg class="brand-logo" viewBox="0 0 64 72" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="32" cy="40" r="21" fill="#1a1526" stroke="#0e0b16" stroke-width="1.5"/>
    <g fill="none" stroke="#463c5e" stroke-width="2.6">
      <circle cx="32" cy="40" r="16.5"/><circle cx="32" cy="40" r="12"/><circle cx="32" cy="40" r="7.5"/>
    </g>
    <circle cx="32" cy="40" r="3" fill="#6a5a86"/>
    <path d="M20 30 a17 17 0 0 1 10 -8" fill="none" stroke="#7a6aa8" stroke-width="1.6" opacity=".5" stroke-linecap="round"/>
  </svg>`,
};

// Gothic black-and-violet skin: a very dark, cold, desaturated theme.
export const palette = {
  '--m-1': '#6a5a86', '--m-2': '#463c5e', '--m-3': '#2a2436', '--m-hi': '#b0a2c8',
  '--m-edge': '#0e0b16', '--m-well': '#100c1a', '--m-well-2': '#08060f',
  '--m-panel-1': '#2a2440', '--m-panel-2': '#1e1930', '--m-panel-3': '#241f38', '--m-panel-4': '#16121f',
  '--m-chip-1': '#221d34', '--m-chip-2': '#14101f', '--m-chip-on-1': '#4a3f6e', '--m-chip-on-2': '#2e2748',
  '--m-dial-1': '#9a8cc0', '--m-dial-2': '#55496e', '--m-dial-3': '#1a1526',
  '--m-btn-1': '#c8bce0', '--m-btn-2': '#7a6aa8', '--m-btn-sh': '#3a3054', '--m-btn-ink': '#0e0b16',
  '--m-bg-0': '#08060f', '--m-bg-1': '#16121f', '--m-bg-2': '#1c1728',
  '--m-word-1': '#c8bce0', '--m-word-2': '#9a8cc0', '--m-word-3': '#6a5a86', '--m-word-4': '#463c5e',
  '--m-ink': '#ded6ee', '--m-ink-dim': '#a89cc4', '--m-ink-mute': '#6e6288',
};
