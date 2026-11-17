// Builds the four landing slices from the live app: mounts each fragment in an empty page with
// the app's real stylesheet, serializes the markup and only the CSS that touches it, and writes
// both into the site worktree. Nothing here is hand-drawn: the fragments are React components
// under `src/components/Landing/`, wired to the same primitives the app uses.
//
//   node scripts/landing-blocks.mjs            # build if needed, extract, verify screenshots
//   node scripts/landing-blocks.mjs --build    # force `npm run build` of the app first
//   node scripts/landing-blocks.mjs --no-verify
//   node scripts/landing-blocks.mjs --keep-harness
//
// The harness is a throwaway Vite app: `index.html` + `main.tsx` that imports `src/index.css` and
// one fragment by `?block=`. It is built with the same React + Tailwind plugins as the app, served
// by `vite preview`, and deleted afterwards.
import { build, preview } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const HARNESS = path.join(REPO, '.landing-blocks');
const HARNESS_INDEX = path.join(REPO, '__landing_blocks.html');
const HARNESS_DIST = path.join(REPO, '.landing-blocks-dist');
// The harness HTML has to sit at the repo root: Vite mirrors the input path under outDir, and
// `vite preview` needs `/index.html` to exist at its root.
const HARNESS_MAIN_URL = './.landing-blocks/main.tsx';
const RESULTS = path.join(REPO, 'test-results', 'landing-blocks');
const SITE_DIR = process.env.SLAG_SITE_BLOCKS_DIR
  ? path.resolve(process.env.SLAG_SITE_BLOCKS_DIR)
  : 'D:\\bobis\\interesting\\coding\\slag-site\\.agents\\worktrees\\blocks-real\\src\\components\\illustrations\\real';

const BLOCKS = ['feed', 'palette', 'files', 'sync'];

const args = new Set(process.argv.slice(2));
const shouldBuildApp = args.has('--build') || (!args.has('--no-app-build') && !existsSync(path.join(REPO, 'dist', 'index.html')));
const shouldVerify = !args.has('--no-verify');
const keepHarness = args.has('--keep-harness');

const HARNESS_MAIN = `import React from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { FeedFragment } from '../src/components/Landing/FeedFragment';
import { PaletteFragment } from '../src/components/Landing/PaletteFragment';
import { FilesFragment } from '../src/components/Landing/FilesFragment';
import { SyncFragment } from '../src/components/Landing/SyncFragment';

const BLOCKS = {
  feed: FeedFragment,
  palette: PaletteFragment,
  files: FilesFragment,
  sync: SyncFragment,
};

const name = new URLSearchParams(window.location.search).get('block') || 'feed';
const Block = BLOCKS[name] || BLOCKS.feed;
createRoot(document.getElementById('root')).render(<Block />);
`;

const HARNESS_INDEX_SOURCE = `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SLAG landing blocks</title>
    <style>
      html, body { margin: 0; padding: 0; background: #0f0f0f; }
      #root { display: block; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="${HARNESS_MAIN_URL}"></script>
  </body>
</html>
`;

function run(label, command, commandArgs, options = {}) {
  console.log(`\n▸ ${label}`);
  const result = spawnSync(command, commandArgs, {
    cwd: REPO,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 'null'}`);
  }
}

async function prepareHarness() {
  await rm(HARNESS, { recursive: true, force: true });
  await rm(HARNESS_DIST, { recursive: true, force: true });
  await mkdir(HARNESS, { recursive: true });
  await writeFile(HARNESS_INDEX, HARNESS_INDEX_SOURCE, 'utf8');
  await writeFile(path.join(HARNESS, 'main.tsx'), HARNESS_MAIN, 'utf8');
}

async function buildHarness() {
  console.log('\n▸ vite build (landing harness)');
  await build({
    configFile: false,
    root: REPO,
    base: './',
    cacheDir: path.join(os.tmpdir(), 'slag-landing-vite'),
    logLevel: 'warn',
    plugins: [react(), tailwindcss()],
    build: {
      outDir: HARNESS_DIST,
      emptyOutDir: true,
      sourcemap: false,
      rollupOptions: { input: HARNESS_INDEX },
    },
  });
}

async function startPreview() {
  console.log('\n▸ vite preview');
  const server = await preview({
    configFile: false,
    root: REPO,
    base: './',
    logLevel: 'warn',
    preview: { host: '127.0.0.1', port: 0, strictPort: false },
    build: { outDir: HARNESS_DIST },
  });
  const url = server.resolvedUrls?.local?.[0];
  if (!url) throw new Error('vite preview did not publish a local URL');
  console.log(`  ${url}`);
  return server;
}

/**
 * Runs in the page. Walks every stylesheet and keeps a rule when its selector reaches at least
 * one element inside the fragment. `:root` variable blocks, `@font-face`, `@keyframes` and
 * `@property` are kept whole; width media queries are frozen at the canvas width, so a phone
 * viewport cannot switch the block into its mobile layout.
 */
function extractCssInPage(canvasWidth, canvasHeight) {
  const root = document.querySelector('[data-landing-canvas]');
  if (!root) throw new Error('fragment root not found');

  const splitSelectors = (text) => {
    const parts = [];
    let depth = 0;
    let start = 0;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (char === '(') depth += 1;
      else if (char === ')') depth = Math.max(0, depth - 1);
      else if (char === ',' && depth === 0) {
        parts.push(text.slice(start, index).trim());
        start = index + 1;
      }
    }
    parts.push(text.slice(start).trim());
    return parts.filter(Boolean);
  };

  const stripPseudo = (selector) =>
    selector
      .replace(/::[a-zA-Z-]+(?:\([^)]*\))?/g, '')
      .replace(/:(?:not|is|where|has|nth-child|nth-of-type|nth-last-child|nth-last-of-type|lang|dir)\((?:[^()]|\([^()]*\))*\)/g, '')
      .replace(/:[a-zA-Z-]+/g, '')
      .trim();

  const touches = (selector) => {
    const candidates = [];
    try {
      if (root.matches(selector)) return true;
    } catch {
      // pseudo-elements and host-only selectors throw here
    }
    if (root.querySelector(selector)) return true;
    const stripped = stripPseudo(selector);
    if (stripped) candidates.push(stripped);
    for (const candidate of candidates) {
      try {
        if (root.matches(candidate)) return true;
        if (root.querySelector(candidate)) return true;
      } catch {
        // invalid after stripping, nothing to match
      }
    }
    return false;
  };

  const ruleTouches = (rule) => {
    const selectors = splitSelectors(rule.selectorText || '');
    if (selectors.length === 0) return false;
    return selectors.some(selector => !selector.startsWith(':root') && touches(selector));
  };

  const isRootRule = (rule) => {
    const selectors = splitSelectors(rule.selectorText || '');
    if (selectors.length === 0) return false;
    if (!selectors.every(selector => selector === ':root' || selector === ':host')) return false;
    const text = rule.style?.cssText || '';
    return text.includes('--');
  };

  // The app stylesheet starts with a global reset (`* { margin: 0 }`, `h1 { font-size: inherit }`).
  // Pasted into a site as-is it would restyle the whole page, so every kept selector is pinned to
  // the fragment root. Descendants keep their specificity (`:where` adds none); the root itself
  // matches the second, compound form.
  const SCOPE = '[data-landing-canvas]';
  // The universal selector and a type selector must stay first in a compound (`[data]h1` is
  // invalid CSS and would drop the whole comma list), so the scope attribute is inserted at the
  // end of the first compound, before a combinator or a pseudo-element.
  const compoundWithScope = (selector) => {
    let depth = 0;
    let combinator = selector.length;
    let pseudoElement = selector.length;
    for (let index = 0; index < selector.length; index += 1) {
      const char = selector[index];
      if (char === '(' || char === '[') depth += 1;
      else if (char === ')' || char === ']') depth = Math.max(0, depth - 1);
      else if (depth === 0 && (char === ' ' || char === '>' || char === '+' || char === '~')) {
        combinator = index;
        break;
      } else if (depth === 0 && char === ':' && selector[index + 1] === ':') {
        pseudoElement = index;
        break;
      }
    }
    const cut = Math.min(combinator, pseudoElement);
    return `${selector.slice(0, cut)}${SCOPE}${selector.slice(cut)}`;
  };
  const scopedSelector = (selectorText) => {
    const scoped = new Set();
    for (const selector of splitSelectors(selectorText)) {
      if (selector === ':root' || selector === ':host') {
        scoped.add(SCOPE);
        continue;
      }
      if (selector.includes(':root') || selector.includes(':host')) continue;
      scoped.add(`:where(${SCOPE}) ${selector}`);
      // Only the root's own classes and the universal selector need the compound form; every
      // other utility lives on a descendant and would just double the stylesheet.
      const base = stripPseudo(selector);
      let rootHits = false;
      try {
        rootHits = root.matches(selector) || (base !== '' && root.matches(base));
      } catch {
        rootHits = false;
      }
      if (rootHits) scoped.add(compoundWithScope(selector));
    }
    return Array.from(scoped).join(', ');
  };

  const px = (value, unit) => {
    const number = Number.parseFloat(value);
    if (Number.isNaN(number)) return null;
    return unit === 'rem' || unit === 'em' ? number * 16 : number;
  };

  // `true`/`false` when the condition is a fact about the fixed canvas, `null` when the answer
  // depends on the visitor (reduced motion) and must stay a real media query.
  const evalPart = (raw) => {
    const part = raw.trim();
    if (part === 'all' || part === 'screen' || part === '') return true;
    const conditions = part.match(/\([^)]*\)/g);
    if (!conditions) return null;
    if (conditions.length !== 1) return null;
    const condition = conditions[0].slice(1, -1).trim();

    let match = condition.match(/^(min-width|max-width):\s*([\d.]+)(px|rem|em)$/);
    if (match) {
      const value = px(match[2], match[3]);
      if (value === null) return null;
      return match[1] === 'min-width' ? canvasWidth >= value : canvasWidth <= value;
    }
    match = condition.match(/^(min-height|max-height):\s*([\d.]+)(px|rem|em)$/);
    if (match) {
      const value = px(match[2], match[3]);
      if (value === null) return null;
      return match[1] === 'min-height' ? canvasHeight >= value : canvasHeight <= value;
    }
    match = condition.match(/^width\s*(>=|>|<=|<)\s*([\d.]+)(px|rem|em)$/);
    if (match) {
      const value = px(match[2], match[3]);
      if (value === null) return null;
      if (match[1] === '>=') return canvasWidth >= value;
      if (match[1] === '>') return canvasWidth > value;
      if (match[1] === '<=') return canvasWidth <= value;
      return canvasWidth < value;
    }
    match = condition.match(/^(pointer|any-pointer):\s*(fine|coarse|none)$/);
    if (match) return match[2] === 'fine';
    match = condition.match(/^(hover|any-hover):\s*(hover|none)$/);
    if (match) return match[2] === 'hover';
    match = condition.match(/^orientation:\s*(landscape|portrait)$/);
    if (match) return match[1] === 'landscape';
    match = condition.match(/^prefers-color-scheme:\s*(dark|light)$/);
    if (match) return match[1] === 'dark';
    return null;
  };

  const mediaDecision = (conditionText) => {
    const parts = splitSelectors(conditionText);
    const results = parts.map(evalPart);
    if (results.some(result => result === null)) return 'keep';
    return results.some(Boolean) ? 'unwrap' : 'drop';
  };

  const walk = (rules, indent) => {
    const out = [];
    for (const rule of Array.from(rules)) {
      const kind = rule.constructor?.name;

      if (kind === 'CSSKeyframesRule' || kind === 'CSSFontFaceRule' || kind === 'CSSPropertyRule' || kind === 'CSSLayerStatementRule') {
        out.push(indent + rule.cssText);
        continue;
      }

      if (kind === 'CSSStyleRule') {
        if (isRootRule(rule) || ruleTouches(rule)) {
          out.push(`${indent}${scopedSelector(rule.selectorText)} { ${rule.style.cssText} }`);
        }
        continue;
      }

      if (kind === 'CSSMediaRule') {
        const decision = mediaDecision(rule.conditionText);
        if (decision === 'drop') continue;
        const inner = walk(rule.cssRules, decision === 'keep' ? indent + '  ' : indent);
        if (inner.length === 0) continue;
        if (decision === 'unwrap') out.push(...inner);
        else out.push(`${indent}@media ${rule.conditionText} {`, ...inner, `${indent}}`);
        continue;
      }

      if (kind === 'CSSSupportsRule') {
        const inner = walk(rule.cssRules, indent + '  ');
        if (inner.length === 0) continue;
        out.push(`${indent}@supports ${rule.conditionText} {`, ...inner, `${indent}}`);
        continue;
      }

      if (kind === 'CSSStartingStyleRule') {
        const inner = walk(rule.cssRules, indent + '  ');
        if (inner.length === 0) continue;
        out.push(`${indent}@starting-style {`, ...inner, `${indent}}`);
        continue;
      }

      if (kind === 'CSSLayerBlockRule') {
        const inner = walk(rule.cssRules, indent + '  ');
        if (inner.length === 0) continue;
        out.push(`${indent}@layer ${rule.name} {`, ...inner, `${indent}}`);
        continue;
      }

      if (kind === 'CSSContainerRule' || kind === 'CSSScopeRule') {
        const inner = walk(rule.cssRules, indent + '  ');
        if (inner.length === 0) continue;
        out.push(`${indent}${rule.cssText.slice(0, rule.cssText.indexOf('{'))}{`, ...inner, `${indent}}`);
        continue;
      }

      // Nested declarations and other block rules: keep only what matches inside.
      if (rule.cssRules) {
        const inner = walk(rule.cssRules, indent + '  ');
        if (inner.length === 0) continue;
        const head = rule.cssText.slice(0, rule.cssText.indexOf('{')).trim();
        out.push(`${indent}${head} {`, ...inner, `${indent}}`);
      }
    }
    return out;
  };

  const chunks = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules = null;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    if (!rules) continue;
    chunks.push(...walk(rules, ''));
  }

  return chunks.join('\n');
}

function standalonePage(html, css, canvas) {
  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <title>landing block</title>
    <style>
      html, body { margin: 0; padding: 0; background: #0f0f0f; }
      body { width: ${canvas.width}px; height: ${canvas.height}px; overflow: hidden; }
    </style>
    <style>
${css}
    </style>
  </head>
  <body>
${html}
  </body>
</html>
`;
}

async function main() {
  if (shouldBuildApp) {
    run('npm run build', 'npm', ['run', 'build']);
  } else {
    console.log('▸ app dist found, skipping npm run build (pass --build to force)');
  }

  await prepareHarness();
  await buildHarness();
  const server = await startPreview();

  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-background-networking'],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  page.on('console', message => {
    if (message.type() === 'error') console.log(`  [browser] ${message.text()}`);
  });
  page.on('pageerror', error => console.log(`  [pageerror] ${error.message}`));

  await mkdir(SITE_DIR, { recursive: true });
  if (shouldVerify) await mkdir(RESULTS, { recursive: true });

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: 'SLAG v2 · src/components/Landing',
    viewport: { width: 1440, height: 1000 },
    scopeSelector: '[data-landing-canvas]',
    scoped: true,
    media: 'width media queries were resolved for each canvas, not for the visitor viewport',
    blocks: {},
  };

  try {
    for (const block of BLOCKS) {
      console.log(`\n▸ ${block}`);
      await page.goto(`${server.resolvedUrls.local[0]}__landing_blocks.html?block=${block}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-landing-canvas]', { timeout: 20000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(150);

      // The canvas is the fragment's own box: width is the design width, height is whatever the
      // column needs. No constant 600/320 frames with empty bands under the content.
      const canvas = await page.evaluate(() => {
        const element = document.querySelector('[data-landing-canvas]');
        const box = element.getBoundingClientRect();
        return { width: Math.ceil(box.width), height: Math.ceil(box.height) };
      });

      const html = await page.evaluate(() => {
        const element = document.querySelector('[data-landing-canvas]');
        return element.outerHTML;
      });
      const css = await page.evaluate(
        payload => {
          const extract = new Function(`return (${payload.source})`)();
          return extract(payload.width, payload.height);
        },
        {
          source: extractCssInPage.toString(),
          width: canvas.width,
          height: canvas.height,
        },
      );

      const htmlBytes = Buffer.byteLength(html, 'utf8');
      const cssBytes = Buffer.byteLength(css, 'utf8');

      await writeFile(path.join(SITE_DIR, `${block}.html`), html + '\n', 'utf8');
      await writeFile(path.join(SITE_DIR, `${block}.css`), css + '\n', 'utf8');

      manifest.blocks[block] = {
        canvas,
        html: { file: `${block}.html`, bytes: htmlBytes },
        css: { file: `${block}.css`, bytes: cssBytes },
        totalBytes: htmlBytes + cssBytes,
        elements: await page.evaluate(() => document.querySelectorAll('[data-landing-canvas] *').length),
        hooks: await page.evaluate(() =>
          Array.from(new Set(
            Array.from(document.querySelectorAll('[data-landing-canvas] [data-beat]'))
              .map(element => element.getAttribute('data-beat')),
          )),
        ),
      };

      if (shouldVerify) {
        const pageFile = path.join(RESULTS, `${block}.html`);
        await writeFile(pageFile, standalonePage(html, css, canvas), 'utf8');
        await page.goto(`file:///${pageFile.replace(/\\/g, '/')}`, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready);
        // Let mount-only keyframes (the task tick draws itself) reach their final frame.
        await page.evaluate(() => document.getAnimations().forEach(animation => animation.finish()));
        await page.waitForTimeout(120);
        await page.screenshot({
          path: path.join(RESULTS, `${block}.png`),
          clip: { x: 0, y: 0, ...canvas },
        });
      }

      console.log(`  html ${(htmlBytes / 1024).toFixed(1)} KB · css ${(cssBytes / 1024).toFixed(1)} KB · ${manifest.blocks[block].elements} elements`);
    }

    await writeFile(path.join(SITE_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    console.log(`\n▸ wrote ${path.relative(REPO, SITE_DIR)}`);
  } finally {
    await browser.close();
    await server.close();
    if (!keepHarness) {
      await rm(HARNESS, { recursive: true, force: true });
      await rm(HARNESS_DIST, { recursive: true, force: true });
      await rm(HARNESS_INDEX, { force: true });
    }
  }
}

main().catch(error => {
  console.error(`\nlanding-blocks failed: ${error instanceof Error ? error.stack : String(error)}`);
  process.exitCode = 1;
});
