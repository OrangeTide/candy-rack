// SPDX-License-Identifier: 0BSD

// Orange machine config: sunshine breaks, a warm glowing tangerine skin. Same
// shared app (rack/main.js) via the 'machine-config' alias; its own bright
// C-major chopped-break starter on the SAMPLE engine.
export { freshPattern, TRACKS } from './orange.starter.js';

export const STORE_KEY = 'web-rack:orange:v1';

export const brand = {
  name: 'Orange',
  model: 'OR-6 &middot; six-track sunshine-breaks sampler',
  flavor: 'sunshine<br>breaks',
  logo: `<svg class="brand-logo" viewBox="0 0 64 72" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <radialGradient id="orangeBodyLogo" cx="36%" cy="30%" r="78%">
        <stop offset="0" stop-color="#ffd39a"/><stop offset="50%" stop-color="#ff9a2e"/><stop offset="100%" stop-color="#c85a05"/>
      </radialGradient>
      <linearGradient id="orangeLeafLogo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a6e85a"/><stop offset="1" stop-color="#3f8f16"/></linearGradient>
    </defs>
    <ellipse cx="32" cy="41" rx="21" ry="20" fill="url(#orangeBodyLogo)" stroke="rgba(0,0,0,.12)" stroke-width="1"/>
    <circle cx="32" cy="23" r="2.6" fill="#b85405" opacity=".55"/>
    <ellipse cx="24" cy="32" rx="8" ry="4.5" fill="#ffffff" opacity=".4" transform="rotate(-20 24 32)"/>
    <path d="M34 17 c5 -7 15 -6 18 0 c-6 3 -13 3 -18 0 z" fill="url(#orangeLeafLogo)"/>
  </svg>`,
};

// Warm sunset-orange skin: a dark warm theme so the vivid tangerine glows, distinct
// from Peach's pale pastel.
export const palette = {
  '--m-1': '#ff9a2e', '--m-2': '#e8781a', '--m-3': '#b85405', '--m-hi': '#ffd39a',
  '--m-edge': '#3a1c06', '--m-well': '#2a1404', '--m-well-2': '#1c0d02',
  '--m-panel-1': '#7a3f0e', '--m-panel-2': '#5c2f08', '--m-panel-3': '#6b380c', '--m-panel-4': '#472306',
  '--m-chip-1': '#543008', '--m-chip-2': '#331d04', '--m-chip-on-1': '#c46810', '--m-chip-on-2': '#7a4008',
  '--m-dial-1': '#ffe0b0', '--m-dial-2': '#e8901e', '--m-dial-3': '#4a2606',
  '--m-btn-1': '#fff0d6', '--m-btn-2': '#ffb04a', '--m-btn-sh': '#b85405', '--m-btn-ink': '#2a1404',
  '--m-bg-0': '#1f0f03', '--m-bg-1': '#3a1d07', '--m-bg-2': '#4a260c',
  '--m-word-1': '#ffe6c2', '--m-word-2': '#ffb04a', '--m-word-3': '#e8901e', '--m-word-4': '#b85405',
  '--m-ink': '#ffefdb', '--m-ink-dim': '#e8c39a', '--m-ink-mute': '#b08a5e',
};
