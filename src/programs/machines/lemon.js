// SPDX-License-Identifier: 0BSD

// Lemon machine config: acid squelch / hard techno, yellow-gold. Same shared app
// (rack/main.js) via the 'machine-config' alias; its own acid starter and skin.
export { freshPattern, TRACKS } from './lemon.starter.js';

export const STORE_KEY = 'web-rack:lemon:v1';

export const brand = {
  name: 'Lemon',
  model: 'LM-6 &middot; six-track acid synthesizer',
  flavor: 'acid<br>squelch',
  logo: `<svg class="brand-logo" viewBox="0 0 64 72" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <radialGradient id="lemonBody" cx="34%" cy="28%" r="80%">
        <stop offset="0" stop-color="#fff7c4"/><stop offset="55%" stop-color="#ffdc32"/><stop offset="100%" stop-color="#e0a608"/>
      </radialGradient>
      <linearGradient id="lemonLeaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a6e85a"/><stop offset="1" stop-color="#5fb320"/></linearGradient>
    </defs>
    <g transform="rotate(-24 32 40)">
      <path d="M6 40 l4 -3 v6 z" fill="#e6b012"/><path d="M58 40 l-4 -3 v6 z" fill="#e6b012"/>
      <ellipse cx="32" cy="40" rx="23" ry="15.5" fill="url(#lemonBody)" stroke="rgba(0,0,0,.12)" stroke-width="1"/>
      <ellipse cx="24" cy="32" rx="8" ry="4" fill="#ffffff" opacity=".45" transform="rotate(-18 24 32)"/>
    </g>
    <path d="M35 16 c5 -7 14 -6 17 0 c-6 2 -12 3 -17 0 z" fill="url(#lemonLeaf)"/>
  </svg>`,
};

// Gold/amber acid skin; the shared candy accents (lime/cyan/magenta) carry the
// acid green over the top.
export const palette = {
  '--m-1': '#d9a520', '--m-2': '#a67c0e', '--m-3': '#5e4406', '--m-hi': '#ffdc4a',
  '--m-edge': '#332405', '--m-well': '#241a04', '--m-well-2': '#17110a',
  '--m-panel-1': '#b8890f', '--m-panel-2': '#7a5808', '--m-panel-3': '#836008', '--m-panel-4': '#544006',
  '--m-chip-1': '#846410', '--m-chip-2': '#563f07', '--m-chip-on-1': '#d0a020', '--m-chip-on-2': '#9c7410',
  '--m-dial-1': '#f0d266', '--m-dial-2': '#bc9418', '--m-dial-3': '#5e4606',
  '--m-btn-1': '#ffe58a', '--m-btn-2': '#e0b020', '--m-btn-sh': '#846410', '--m-btn-ink': '#332405',
  '--m-bg-0': '#100c02', '--m-bg-1': '#3a2c06', '--m-bg-2': '#4a3405',
  '--m-word-1': '#fff7c4', '--m-word-2': '#ffe98a', '--m-word-3': '#ffcf2e', '--m-word-4': '#d99a08',
  '--m-ink': '#fff6e0', '--m-ink-dim': '#e0cfa0', '--m-ink-mute': '#9c8a5a',
};
