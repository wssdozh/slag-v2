#!/usr/bin/env node
// Startup JS budget: the uncompressed weight of every chunk the first paint pulls in.
//
// Vite splits the app into chunks and loads a chunk eagerly only if the entry reaches it through
// static `import`/`export ... from`. Everything behind `() => import()` is a lazy boundary and
// costs nothing at boot. This script walks that static closure from `dist/index.html` so a
// regression like "a 600 kB editor chunk snuck onto the startup path" is a number, not a hunch.
//
// Two numbers, because this build boots in two hops:
//   staticClosure — modules `index.html` links or the entry imports statically. What the browser
//                   is told about upfront.
//   startupJs     — staticClosure plus whatever the *entry* chunk pulls with `import()` before it
//                   renders. `src/main.tsx` awaits secret store -> legacy profile -> storage ->
//                   `./App` and only then calls `createRoot().render()`, so those chunks are on
//                   the first frame even though the bundler calls them dynamic. Dynamic imports
//                   from any deeper chunk (App's overlays, the editor) are real lazy boundaries
//                   and are not followed.
// The acceptance number is `startupJs`: it is what the person actually waits for.
//
//   node scripts/perf-startup.mjs            -> test-results/perf/baseline.json
//   node scripts/perf-startup.mjs after      -> test-results/perf/after.json
//
// Uncompressed bytes on purpose: the build ships without a CDN in a Tauri webview, so the number
// that matters first is "how much JS has to be parsed before the shell is interactive".

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'dist');
const label = process.argv[2] || 'baseline';
const outFile = join(root, 'test-results', 'perf', `${label}.json`);

if (!existsSync(join(distDir, 'index.html'))) {
  console.error(`perf-startup: ${relative(root, distDir)}/index.html not found — run \`npm run build\` first.`);
  process.exit(1);
}

const html = readFileSync(join(distDir, 'index.html'), 'utf8');

// Vite's entry is the module <script>; it also emits `<link rel="modulepreload">` for chunks the
// entry statically imports, so those are roots too — a modulepreload lands on the first frame.
const entryScripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+\.js)"[^>]*>/g)].map((m) => m[1]);
const preloads = [...html.matchAll(/<link\b[^>]*\brel="modulepreload"[^>]*\bhref="([^"]+\.js)"[^>]*>/g)].map(
  (m) => m[1],
);

const toAssetPath = (url) => {
  // Both `/assets/x.js` and `./assets/x.js` resolve against dist/.
  const clean = url.replace(/^[./]+/, '');
  return join(distDir, clean);
};

// Static edges only. `import("./x")` is dynamic and must not count; the minifier writes the
// static forms as `import"./x.js"` (side effect) and `from"./x.js"` (binding).
const STATIC_IMPORT = /(?:^|[^\w$])(?:import|from)\s*"(\.{1,2}\/[^"]+\.js)"/g;
// The boot hop: `import(`./x.js`)` inside the entry chunk, resolved through Vite's dep map.
const DYNAMIC_IMPORT = /import\s*\(\s*[`"](\.{1,2}\/[^`"]+?\.js)[`"]\s*\)/g;

const resolveSpecifier = (fromAbs, specifier) => resolve(dirname(fromAbs), specifier);

/**
 * Walk one closure. `dynamicFromEntry` decides whether a chunk may follow its `import()` edges:
 * only the entry chunk does, because every one of its dynamic imports is awaited before render.
 */
function walk(roots, { followDynamicFromEntry }) {
  const chunks = new Map(); // abs path -> { bytes, staticImports, dynamicImports }
  const seen = new Set();
  const pending = [];
  const queue = (abs) => {
    if (seen.has(abs)) return;
    seen.add(abs);
    pending.push(abs);
  };
  for (const abs of roots) queue(abs);

  while (pending.length > 0) {
    const abs = pending.pop();
    if (!existsSync(abs)) {
      console.warn(`perf-startup: missing chunk ${relative(distDir, abs)} (referenced but absent)`);
      chunks.set(abs, { bytes: 0, staticImports: [], dynamicImports: [], missing: true });
      continue;
    }
    const code = readFileSync(abs, 'utf8');
    const staticImports = [];
    for (const match of code.matchAll(STATIC_IMPORT)) {
      // Only relative specifiers are chunk edges; bare specifiers were bundled.
      const importAbs = resolveSpecifier(abs, match[1]);
      staticImports.push(importAbs);
      queue(importAbs);
    }
    const dynamicImports = [];
    for (const match of code.matchAll(DYNAMIC_IMPORT)) {
      const importAbs = resolveSpecifier(abs, match[1]);
      dynamicImports.push(importAbs);
      if (followDynamicFromEntry) queue(importAbs);
    }
    chunks.set(abs, { bytes: statSync(abs).size, staticImports, dynamicImports });
  }

  const entries = [...chunks.keys()].sort();
  let total = 0;
  const files = [];
  for (const abs of entries) {
    const info = chunks.get(abs);
    total += info.bytes;
    files.push({
      file: relative(distDir, abs).replace(/\\/g, '/'),
      bytes: info.bytes,
      staticImports: info.staticImports.length,
      dynamicImports: info.dynamicImports.length,
    });
  }

  // "Does CodeMirror ride the startup bus?" — the chunk is found by its own marker strings, not by
  // a name pattern, so a rename in the bundler cannot silently turn the check into a false negative.
  const editorChunks = [];
  for (const abs of entries) {
    if (chunks.get(abs).missing) continue;
    const code = readFileSync(abs, 'utf8');
    const hasEditorMarkup = code.includes('cm-editor') || code.includes('codemirror');
    if (!hasEditorMarkup) continue;
    editorChunks.push({
      file: relative(distDir, abs).replace(/\\/g, '/'),
      bytes: chunks.get(abs).bytes,
      markers: [
        code.includes('cm-editor') ? 'cm-editor' : null,
        code.includes('codemirror') ? 'codemirror' : null,
      ].filter(Boolean),
    });
  }

  return { chunks: entries.length, bytes: total, kb: Math.round((total / 1024) * 10) / 10, files, editorChunks };
}

const entryRoots = [...entryScripts, ...preloads].map(toAssetPath);
const entryAbs = entryScripts.length > 0 ? toAssetPath(entryScripts[0]) : null;

// Pass A: static only — the browser's own upfront graph.
const staticOnly = walk(entryRoots, { followDynamicFromEntry: false });
// Pass B: the entry's boot hop included. Every deeper `import()` stays lazy.
const startup = entryAbs
  ? walk(entryRoots, { followDynamicFromEntry: true })
  : walk(entryRoots, { followDynamicFromEntry: false });

const report = {
  label,
  measuredAt: new Date().toISOString(),
  distIndex: relative(root, join(distDir, 'index.html')).replace(/\\/g, '/'),
  entryScripts,
  preloads,
  units: 'bytes (uncompressed)',
  /** The number to compare between runs. */
  startupJs: {
    chunks: startup.chunks,
    bytes: startup.bytes,
    kb: startup.kb,
    files: startup.files,
  },
  staticClosure: {
    chunks: staticOnly.chunks,
    bytes: staticOnly.bytes,
    kb: staticOnly.kb,
    files: staticOnly.files,
  },
  editorInStartup: startup.editorChunks.length > 0,
  editorInStaticClosure: staticOnly.editorChunks.length > 0,
  editorChunksInStartup: startup.editorChunks,
  editorChunksInStaticClosure: staticOnly.editorChunks,
};

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

const mb = (total) => (total / 1024 / 1024).toFixed(2);
const editorLine = (list) =>
  list.length === 0 ? 'NO — CodeMirror stays lazy' : list.map((c) => `${c.file} (${c.bytes} B)`).join(', ');

console.log(`perf-startup [${label}]`);
console.log(`  startup js     : ${startup.chunks} chunks, ${startup.bytes} bytes (${mb(startup.bytes)} MB)`);
console.log(`  static closure : ${staticOnly.chunks} chunks, ${staticOnly.bytes} bytes (${mb(staticOnly.bytes)} MB)`);
console.log(`  entry          : ${entryScripts.join(', ') || '(none)'}`);
console.log(`  modulepreload  : ${preloads.length}`);
console.log(`  cm in startup  : ${editorLine(startup.editorChunks)}`);
console.log(`  cm in static   : ${editorLine(staticOnly.editorChunks)}`);
console.log(`  report         : ${relative(root, outFile).replace(/\\/g, '/')}`);

