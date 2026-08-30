// SPDX-License-Identifier: 0BSD

// Blueberry machine config: space jazz / electronic blues, midnight indigo. Same
// shared app (rack/main.js) via the 'machine-config' alias; its own modal-jazz
// starter and skin.
export { freshPattern, TRACKS } from './blueberry.starter.js';

export const STORE_KEY = 'web-rack:blueberry:v1';

export const brand = {
  name: 'Blueberry',
  model: 'BB-6 &middot; six-track space-jazz synthesizer',
  flavor: 'space<br>jazz',
  logo: `<svg class="brand-logo" viewBox="0 0 64 72" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <radialGradient id="blueBody" cx="36%" cy="30%" r="80%">
        <stop offset="0" stop-color="#bcc6ff"/><stop offset="46%" stop-color="#5566e0"/><stop offset="100%" stop-color="#242c72"/>
      </radialGradient>
      <linearGradient id="blueLeaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8fd85a"/><stop offset="1" stop-color="#3f8f16"/></linearGradient>
    </defs>
    <path d="M32 22 q2 -6 8 -8" fill="none" stroke="#6b4a2a" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M40 12 c6 -3 12 1 10 6 c-4 3 -10 2 -13 -1 c-1 -3 0 -4 3 -5 z" fill="url(#blueLeaf)"/>
    <g stroke="rgba(0,0,0,.2)" stroke-width="1">
      <circle cx="22" cy="38" r="10" fill="url(#blueBody)"/><circle cx="42" cy="36" r="10" fill="url(#blueBody)"/><circle cx="32" cy="50" r="11" fill="url(#blueBody)"/>
    </g>
    <g fill="#1c2360" opacity=".6"><circle cx="22" cy="38" r="1.6"/><circle cx="42" cy="36" r="1.6"/><circle cx="32" cy="50" r="1.6"/></g>
    <g fill="#ffffff" opacity=".35"><ellipse cx="18" cy="33" rx="3.4" ry="2" transform="rotate(-24 18 33)"/><ellipse cx="38" cy="31" rx="3.4" ry="2" transform="rotate(-24 38 31)"/></g>
  </svg>`,
};

// Midnight indigo skin; the shared candy accents (lime/cyan/magenta) glow over
// the deep blue.
export const palette = {
  '--m-1': '#4a5bd0', '--m-2': '#33409c', '--m-3': '#1c2560', '--m-hi': '#7d8cff',
  '--m-edge': '#141a3a', '--m-well': '#10142e', '--m-well-2': '#0a0d20',
  '--m-panel-1': '#3a469c', '--m-panel-2': '#2a3272', '--m-panel-3': '#303a86', '--m-panel-4': '#202860',
  '--m-chip-1': '#2e3878', '--m-chip-2': '#1e2450', '--m-chip-on-1': '#4a5ac0', '--m-chip-on-2': '#333f96',
  '--m-dial-1': '#8f9bf0', '--m-dial-2': '#4a5ac0', '--m-dial-3': '#232c66',
  '--m-btn-1': '#aeb8ff', '--m-btn-2': '#5566e0', '--m-btn-sh': '#2e3878', '--m-btn-ink': '#141a3a',
  '--m-bg-0': '#080a1c', '--m-bg-1': '#1a2050', '--m-bg-2': '#202a66',
  '--m-word-1': '#ccd4ff', '--m-word-2': '#9aa8ff', '--m-word-3': '#6b78ff', '--m-word-4': '#4756c0',
  '--m-ink': '#eef1ff', '--m-ink-dim': '#b8c0e8', '--m-ink-mute': '#7a83b0',
};
