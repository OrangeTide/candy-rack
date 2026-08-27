// PUBLIC DOMAIN (CC0-1.0)
// This build script has no copyright. See https://creativecommons.org/publicdomain/zero/1.0/
//
// Bundles each program into a single self-contained HTML file in build/.
// The AudioWorklet code is bundled separately and embedded base64 so the main
// bundle can load it from a Blob URL. This keeps everything inside one .html.

import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const PROGRAMS = [
  {
    // Landing page. Static: no worklet, no main bundle. Built to build/index.html
    // so opening build/ lands here; it links to the machine pages.
    name: 'index',
    html: 'src/programs/landing/index.html',
  },
  {
    name: 'rack',
    main: 'src/programs/rack/main.js',
    html: 'src/programs/rack/index.html',
    worklet: 'src/core/worklet/worklet-entry.js',
  },
];

async function bundle(entry, { format = 'iife' } = {}) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format,
    write: false,
    logLevel: 'warning',
    legalComments: 'none',
  });
  return result.outputFiles[0].text;
}

mkdirSync('build', { recursive: true });

for (const prog of PROGRAMS) {
  let html = readFileSync(prog.html, 'utf8');

  if (prog.worklet) {
    const workletB64 = Buffer.from(await bundle(prog.worklet), 'utf8').toString('base64');
    html = html.replace('__WORKLET_B64__', () => workletB64);
  }
  if (prog.main) {
    const mainSrc = await bundle(prog.main);
    html = html.replace('__MAIN_SRC__', () => mainSrc);
  }

  const out = `build/${prog.name}.html`;
  writeFileSync(out, html);
  console.log(`built ${out} (${(html.length / 1024).toFixed(1)} kB)`);
}
