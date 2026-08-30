// SPDX-License-Identifier: 0BSD

// Plum machine config: trip-hop / downtempo, a bruised purple-red skin. Same
// shared app (rack/main.js) via the 'machine-config' alias; its own D-minor
// chopped-break starter built on the SAMPLE engine.
export { freshPattern, TRACKS } from './plum.starter.js';

export const STORE_KEY = 'web-rack:plum:v1';

export const brand = {
  name: 'Plum',
  model: 'PL-6 &middot; six-track trip-hop sampler',
  flavor: 'trip<br>hop',
  logo: `<svg class="brand-logo" viewBox="0 0 64 72" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <radialGradient id="plumBodyLogo" cx="36%" cy="30%" r="76%">
        <stop offset="0" stop-color="#d59bbd"/><stop offset="46%" stop-color="#b1466b"/><stop offset="100%" stop-color="#591a38"/>
      </radialGradient>
      <linearGradient id="plumLeafLogo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8fd85a"/><stop offset="1" stop-color="#3f8f16"/></linearGradient>
    </defs>
    <path d="M33 22 q0 -7 4 -11" fill="none" stroke="#6b4a2a" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M37 11 c6 -3 12 1 10 6 c-4 3 -10 2 -13 -1 c-1 -3 0 -4 3 -5 z" fill="url(#plumLeafLogo)"/>
    <ellipse cx="32" cy="44" rx="18" ry="21" fill="url(#plumBodyLogo)" stroke="rgba(0,0,0,.2)" stroke-width="1"/>
    <path d="M32 25 C29 35 29 55 32 64" fill="none" stroke="#3f1028" stroke-width="1.4" opacity=".5"/>
    <ellipse cx="25" cy="35" rx="6" ry="3.4" fill="#ffffff" opacity=".3" transform="rotate(-24 25 35)"/>
  </svg>`,
};

// Bruised purple-red skin: a dark, moody theme (darker and redder than Blackberry).
export const palette = {
  '--m-1': '#b1466b', '--m-2': '#8a2f52', '--m-3': '#591a38', '--m-hi': '#d59bbd',
  '--m-edge': '#2e0e20', '--m-well': '#24091a', '--m-well-2': '#180512',
  '--m-panel-1': '#6e2547', '--m-panel-2': '#4f1a33', '--m-panel-3': '#5c1f3d', '--m-panel-4': '#3d1428',
  '--m-chip-1': '#45182e', '--m-chip-2': '#2c0f1e', '--m-chip-on-1': '#7a2c50', '--m-chip-on-2': '#55203a',
  '--m-dial-1': '#d9a8c2', '--m-dial-2': '#a84670', '--m-dial-3': '#3a1526',
  '--m-btn-1': '#f0c8db', '--m-btn-2': '#c25580', '--m-btn-sh': '#6e2547', '--m-btn-ink': '#24091a',
  '--m-bg-0': '#150410', '--m-bg-1': '#2a0c1e', '--m-bg-2': '#340f24',
  '--m-word-1': '#e8b8cf', '--m-word-2': '#c87ba0', '--m-word-3': '#a85278', '--m-word-4': '#7a2c50',
  '--m-ink': '#f2dbe8', '--m-ink-dim': '#d0a8bc', '--m-ink-mute': '#9a7086',
};
