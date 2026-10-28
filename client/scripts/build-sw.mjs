// Runs after the app build: the precache list is read from the files that
// build wrote.
import { build } from 'vite';
import { injectManifest } from 'workbox-build';

const outDir = 'build/client';
const worker = 'sw-push.js';

await build({
  configFile: false,
  publicDir: false,
  logLevel: 'warn',
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir,
    emptyOutDir: false,
    modulePreload: false,
    rolldownOptions: {
      input: `src/${worker}`,
      output: { entryFileNames: worker },
    },
  },
});

const { count, size, warnings } = await injectManifest({
  swSrc: `${outDir}/${worker}`,
  swDest: `${outDir}/${worker}`,
  globDirectory: outDir,
  globPatterns: [
    '**/*.{js,css,ico,png,svg}',
    // Latin covers French, Œ and € included; other subsets load on demand.
    'assets/inter-latin-wght-normal-*.woff2',
  ],
  // The map needs its tiles, which no offline copy has.
  globIgnores: [worker, 'assets/leaflet-*'],
  // Vite already hashes these names.
  dontCacheBustURLsMatching: /^assets\//,
});

if (warnings.length > 0) {
  throw new Error(`Service worker precache:\n${warnings.join('\n')}`);
}
console.log(`Service worker: ${count} files precached (${Math.round(size / 1024)} KiB)`);
