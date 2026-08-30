// SPDX-License-Identifier: 0BSD

// Peach machine config: vaporwave / mallsoft, a pastel pink-orange skin with
// chrome dials. Same shared app (rack/main.js) via the 'machine-config' alias;
// its own SAMPLE-driven starter. A light theme like Coconut, warmed to peach.
export { freshPattern, TRACKS } from './peach.starter.js';

export const STORE_KEY = 'web-rack:peach:v1';

export const brand = {
  name: 'Peach',
  model: 'PC-6 &middot; six-track vaporwave sampler',
  flavor: 'vapor<br>wave',
  logo: `<svg class="brand-logo" viewBox="0 0 64 72" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <radialGradient id="peachBodyLogo" cx="38%" cy="32%" r="74%">
        <stop offset="0" stop-color="#ffdcc6"/><stop offset="46%" stop-color="#ff9d76"/><stop offset="100%" stop-color="#d95e3c"/>
      </radialGradient>
      <linearGradient id="peachLeafLogo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8fd85a"/><stop offset="1" stop-color="#3f8f16"/></linearGradient>
    </defs>
    <path d="M40 9 c7 -3 13 1 11 6 c-4 3 -11 2 -14 -1 c-1 -3 0 -4 3 -5 z" fill="url(#peachLeafLogo)"/>
    <circle cx="32" cy="43" r="20" fill="url(#peachBodyLogo)" stroke="rgba(0,0,0,.12)" stroke-width="1"/>
    <path d="M32 25 C29 34 29 53 32 62" fill="none" stroke="#c8562f" stroke-width="1.6" opacity=".45"/>
    <ellipse cx="24" cy="35" rx="7" ry="4" fill="#ffffff" opacity=".4" transform="rotate(-22 24 35)"/>
  </svg>`,
};

// Pastel pink-orange skin with chrome (silver) dials: a bright light theme, so
// --m-ink and the wordmark are dark and the backgrounds are pale peach.
export const palette = {
  '--m-1': '#ff9a76', '--m-2': '#ef7a58', '--m-3': '#d15a3f', '--m-hi': '#ff5e9a',
  '--m-edge': '#a85a44', '--m-well': '#e8b39a', '--m-well-2': '#dca083',
  '--m-panel-1': '#ffcfba', '--m-panel-2': '#ffbca2', '--m-panel-3': '#ffd6c4', '--m-panel-4': '#f7b79e',
  '--m-chip-1': '#ffc2ab', '--m-chip-2': '#f2a98f', '--m-chip-on-1': '#ff8f68', '--m-chip-on-2': '#ff6f9c',
  '--m-dial-1': '#f6f2f0', '--m-dial-2': '#c8bcc0', '--m-dial-3': '#8a7a80',
  '--m-btn-1': '#fff0f4', '--m-btn-2': '#ff87b0', '--m-btn-sh': '#c85a82', '--m-btn-ink': '#5a2436',
  '--m-bg-0': '#ffe6da', '--m-bg-1': '#ffd8c6', '--m-bg-2': '#ffc9b2',
  '--m-word-1': '#b5432f', '--m-word-2': '#d1603f', '--m-word-3': '#e07a52', '--m-word-4': '#9a3020',
  '--m-ink': '#5a2e20', '--m-ink-dim': '#93513c', '--m-ink-mute': '#c08f78',
};
