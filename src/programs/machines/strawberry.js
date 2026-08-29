// SPDX-License-Identifier: 0BSD

// Strawberry machine config: bubblegum rave / happy-hardcore, candy pink-red.
// Same shared app (rack/main.js) via the 'machine-config' alias; its own euphoric
// rave starter and skin.
export { freshPattern, TRACKS } from './strawberry.starter.js';

export const STORE_KEY = 'web-rack:strawberry:v1';

export const brand = {
  name: 'Strawberry',
  model: 'SB-6 &middot; six-track rave synthesizer',
  flavor: 'bubblegum<br>rave',
  logo: `<svg class="brand-logo" viewBox="0 0 64 72" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <radialGradient id="strawBody" cx="38%" cy="34%" r="72%">
        <stop offset="0" stop-color="#ff8fa6"/><stop offset="48%" stop-color="#ff3d6a"/><stop offset="100%" stop-color="#c00f3c"/>
      </radialGradient>
      <linearGradient id="strawLeaf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fd23a"/><stop offset="1" stop-color="#3f8f16"/></linearGradient>
    </defs>
    <path d="M32 27 C20 25 12 31 13 41 C14 51 24 60 32 63 C40 60 50 51 51 41 C52 31 44 25 32 27 Z" fill="url(#strawBody)" stroke="rgba(0,0,0,.12)" stroke-width="1"/>
    <g fill="#ffe9a0">
      <ellipse cx="24" cy="36" rx="1.1" ry="1.9" transform="rotate(-20 24 36)"/><ellipse cx="33" cy="34" rx="1.1" ry="1.9" transform="rotate(6 33 34)"/>
      <ellipse cx="41" cy="37" rx="1.1" ry="1.9" transform="rotate(22 41 37)"/><ellipse cx="20" cy="44" rx="1.1" ry="1.9" transform="rotate(-28 20 44)"/>
      <ellipse cx="29" cy="43" rx="1.1" ry="1.9" transform="rotate(-6 29 43)"/><ellipse cx="37" cy="44" rx="1.1" ry="1.9" transform="rotate(14 37 44)"/>
      <ellipse cx="45" cy="45" rx="1.1" ry="1.9" transform="rotate(30 45 45)"/><ellipse cx="26" cy="52" rx="1.1" ry="1.9" transform="rotate(-14 26 52)"/>
      <ellipse cx="34" cy="53" rx="1.1" ry="1.9" transform="rotate(8 34 53)"/><ellipse cx="32" cy="59" rx="1.0" ry="1.7"/>
    </g>
    <ellipse cx="24" cy="33" rx="6" ry="3.2" fill="#ffffff" opacity=".35" transform="rotate(-24 24 33)"/>
    <g fill="url(#strawLeaf)" stroke="#2f7010" stroke-width=".4">
      <g transform="rotate(-48 32 26)"><path d="M32 26 C28 20 29 13 32 9 C35 13 36 20 32 26 Z"/></g>
      <g transform="rotate(-24 32 26)"><path d="M32 26 C28 20 29 13 32 9 C35 13 36 20 32 26 Z"/></g>
      <g transform="rotate(0 32 26)"><path d="M32 26 C28 20 29 13 32 9 C35 13 36 20 32 26 Z"/></g>
      <g transform="rotate(24 32 26)"><path d="M32 26 C28 20 29 13 32 9 C35 13 36 20 32 26 Z"/></g>
      <g transform="rotate(48 32 26)"><path d="M32 26 C28 20 29 13 32 9 C35 13 36 20 32 26 Z"/></g>
    </g>
    <path d="M31.5 10 q.5 -4 1 -6" fill="none" stroke="#6b4a2a" stroke-width="2" stroke-linecap="round"/>
  </svg>`,
};

// Candy pink-red bubblegum skin; the shared candy accents (lime/cyan/magenta)
// pop over the top like sprinkles.
export const palette = {
  '--m-1': '#ff4d7a', '--m-2': '#d81f52', '--m-3': '#8a0f30', '--m-hi': '#ff8fab',
  '--m-edge': '#3a0512', '--m-well': '#2a0410', '--m-well-2': '#1c0209',
  '--m-panel-1': '#e03060', '--m-panel-2': '#a01a42', '--m-panel-3': '#b02048', '--m-panel-4': '#7a1030',
  '--m-chip-1': '#9a1a40', '--m-chip-2': '#6a0e28', '--m-chip-on-1': '#ff4d7a', '--m-chip-on-2': '#c02252',
  '--m-dial-1': '#ff9ab4', '--m-dial-2': '#d63a64', '--m-dial-3': '#7a1030',
  '--m-btn-1': '#ffc2d2', '--m-btn-2': '#ff6a90', '--m-btn-sh': '#9a1a40', '--m-btn-ink': '#3a0512',
  '--m-bg-0': '#14040a', '--m-bg-1': '#4a0a24', '--m-bg-2': '#5a0f30',
  '--m-word-1': '#fff0f4', '--m-word-2': '#ffc2d2', '--m-word-3': '#ff5a86', '--m-word-4': '#d81f52',
  '--m-ink': '#fff0f4', '--m-ink-dim': '#f0b8c8', '--m-ink-mute': '#b06880',
};
