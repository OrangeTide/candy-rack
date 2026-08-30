// PUBLIC DOMAIN (CC0-1.0)
// This build script has no copyright. See https://creativecommons.org/publicdomain/zero/1.0/
//
// Bundles each program into a single self-contained HTML file in build/.
// The AudioWorklet code is bundled separately and embedded base64 so the main
// bundle can load it from a Blob URL. This keeps everything inside one .html.
//
// Every machine (Grape, Lemon, ...) shares one app (src/programs/rack) and one
// HTML template. A machine is just a config module (brand, palette, starter)
// that the app imports as 'machine-config' via an esbuild alias, and that this
// script reads to fill the template's brand and palette placeholders.

import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Static favicon assets copied verbatim into build/ so the pages' relative
// <link rel="icon"> hrefs resolve when the build directory is served.
const FAVICONS = ['favicon.ico', 'favicon-32.png', 'favicon-16.png', 'apple-touch-icon.png'];

// The machines built from the shared rack app + HTML template.
const MACHINES = [
  { name: 'grape', config: 'src/programs/machines/grape.js' },
  { name: 'lemon', config: 'src/programs/machines/lemon.js' },
  { name: 'strawberry', config: 'src/programs/machines/strawberry.js' },
  { name: 'blueberry', config: 'src/programs/machines/blueberry.js' },
  { name: 'blackberry', config: 'src/programs/machines/blackberry.js' },
];

const APP = {
  main: 'src/programs/rack/main.js',
  html: 'src/programs/rack/index.html',
  worklet: 'src/core/worklet/worklet-entry.js',
};

// The landing page: static, no worklet or main bundle. Built to build/index.html
// so opening build/ lands here; it links to the machine pages.
const LANDING = { name: 'index', html: 'src/programs/landing/index.html' };

async function bundle(entry, { alias } = {}) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    write: false,
    logLevel: 'warning',
    legalComments: 'none',
    alias,
  });
  return result.outputFiles[0].text;
}

// Render a machine's palette object as a scoped :root override stylesheet.
function paletteStyle(palette) {
  const decls = Object.entries(palette).map(([k, v]) => `${k}:${v}`).join(';');
  return `<style>:root{${decls}}</style>`;
}

function fillTemplate(html, brand, palette) {
  return html
    .replace('__BRAND_LOGO__', () => brand.logo)
    .replace(/__BRAND_NAME__/g, () => brand.name)
    .replace('__BRAND_MODEL__', () => brand.model)
    .replace('__BRAND_FLAVOR__', () => brand.flavor)
    .replace('__MACHINE_STYLE__', () => paletteStyle(palette));
}

mkdirSync('build', { recursive: true });

// Favicon assets: copy from docs/ into build/ alongside the pages.
for (const f of FAVICONS) copyFileSync(`docs/${f}`, `build/${f}`);

// Landing page: copy through verbatim.
writeFileSync(`build/${LANDING.name}.html`, readFileSync(LANDING.html, 'utf8'));
console.log(`built build/${LANDING.name}.html`);

// The worklet is identical across machines: bundle it once.
const template = readFileSync(APP.html, 'utf8');
const workletB64 = Buffer.from(await bundle(APP.worklet), 'utf8').toString('base64');

for (const machine of MACHINES) {
  const configPath = resolve(machine.config);
  const cfg = await import(pathToFileURL(configPath).href);
  const mainSrc = await bundle(APP.main, { alias: { 'machine-config': configPath } });

  let html = fillTemplate(template, cfg.brand, cfg.palette);
  html = html.replace('__WORKLET_B64__', () => workletB64);
  html = html.replace('__MAIN_SRC__', () => mainSrc);

  const out = `build/${machine.name}.html`;
  writeFileSync(out, html);
  console.log(`built ${out} (${(html.length / 1024).toFixed(1)} kB)`);
}
