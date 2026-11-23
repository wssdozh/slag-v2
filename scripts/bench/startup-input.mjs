#!/usr/bin/env node
// Production startup bench: seeds synthetic articles into localStorage before the built app boots,
// serves a built dist on loopback, measures cold boot, cold click -> CodeMirror mount, warm re-open.
// Ready time is a 5 ms-polled DOM marker, not first paint; no rAF is used.
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import net from 'node:net';
import { chromium } from '@playwright/test';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { values, positionals } = parseArgs({
  allowPositionals: true, options: { dist: { type: 'string', default: 'dist' }, channel: { type: 'string' }, touch: { type: 'boolean' } },
});
const DIST = resolve(ROOT, values.dist);
const PORT = 18841;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const KEY = 'slag_items_default_vault'; // storage.ts ITEMS_PREFIX + default vault id
const INBOX = 'Входящие'; // DEFAULT_INBOX_FOLDER
const SIZES = (positionals[0] ?? '100,1000,5000').split(',').map(Number);
if (SIZES.some((n) => !Number.isInteger(n) || n <= 0)) throw new Error('sizes must be positive integers');
const isLocal = (url) => { try { return new URL(url).origin === ORIGIN; } catch { return /^(data|blob):/.test(url); } };
const VIEWPORTS = [{ name: 'desktop', width: 1440, height: 900, interactive: true },
  { name: 'narrow', width: 390, height: 844, interactive: false }];
const seed = (n) => {
  const base = Date.UTC(2025, 0, 1); // fixed, modern, ascending milliseconds
  return Array.from({ length: n }, (_, i) => ({
    id: `bench-${n}-${i}`, type: 'article', title: `Bench note ${i}`, content: `Synthetic row ${i}.`, folder: INBOX,
    tags: [], attachments: [], createdAt: base + i * 60_000, updatedAt: base + i * 60_000 }));
};
const portFree = () => new Promise((resolvePort) => {
  const socket = net.connect(PORT, '127.0.0.1');
  socket.setTimeout(300).on('connect', () => { socket.destroy(); resolvePort(false); })
    .on('error', () => resolvePort(true)).on('timeout', () => { socket.destroy(); resolvePort(true); });
});
const startPreview = async () => {
  if (!existsSync(join(DIST, 'index.html'))) throw new Error(`no built app at ${DIST}`);
  if (!(await portFree())) throw new Error(`port ${PORT} is already taken`);
  const vite = resolve(ROOT, 'node_modules/vite/bin/vite.js');
  const child = spawn(process.execPath, [vite, 'preview', '--outDir', DIST, '--host', '127.0.0.1',
    '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] });
  return new Promise((resolveChild, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('preview did not listen in 15s')); }, 15_000);
    child.stdout.on('data', (chunk) => {
      if (!String(chunk).includes(`127.0.0.1:${PORT}`)) return;
      clearTimeout(timer);
      resolveChild(child);
    });
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`preview exited (${code})`)); });
  });
};
const collect = (page) => page.evaluate(() => {
  const nav = performance.getEntriesByType('navigation')[0];
  const res = performance.getEntriesByType('resource');
  return { count: res.length, decoded: res.reduce((s, e) => s + (e.decodedBodySize || 0), 0),
    nodes: document.getElementsByTagName('*').length, loadEnd: nav ? Math.round(nav.loadEventEnd) : null };
});
const editorReady = (page) => page.waitForFunction(() => {
  const cm = document.querySelector('[data-testid="fullscreen-editor-modal"] .cm-content');
  if (!cm || cm.getBoundingClientRect().height === 0) return null;
  const b = window.__bench;
  b.editorAt = performance.now();
  return +(b.editorAt - b.clickAt).toFixed(1);
}, null, { polling: 5, timeout: 60_000 }).then((h) => h.jsonValue());
async function scenario(browser, size, vp) {
  const items = seed(size);
  const newest = items[items.length - 1].id;
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
  let blocked = 0;
  try {
    await context.route('**/*', (route) => {
      const url = route.request().url();
      if (isLocal(url)) return route.continue();
      blocked += 1;
      return route.abort();
    });
    const page = await context.newPage();
    await page.addInitScript(({ key, json }) => {
      const t0 = performance.now();
      localStorage.setItem(key, json);
      const b = window.__bench = { seedEndAt: performance.now() };
      b.seedMs = +(b.seedEndAt - t0).toFixed(1);
    }, { key: KEY, json: JSON.stringify(items) });
    await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    const readyHandle = await page.waitForFunction(({ id, mobile }) => {
      const anchor = mobile
        ? document.querySelector('[data-testid="mobile-vault-switcher-btn"]')
        : document.querySelector(`[data-flip-id="${id}"]`);
      if (!anchor) return null;
      const b = window.__bench;
      if (!b.readyAt) b.readyAt = performance.now();
      return b;
    }, { id: newest, mobile: !vp.interactive }, { polling: 5, timeout: 120_000 });
    const bench = await readyHandle.jsonValue();
    const boot = await collect(page);
    const row = { scenario: `${vp.name}/${size}`, readyFromNavMs: Math.round(bench.readyAt),
      readyFromSeedEndMs: Math.round(bench.readyAt - bench.seedEndAt), seedMs: bench.seedMs,
      resources: boot.count, decodedKB: Math.round(boot.decoded / 1024), nodes: boot.nodes, loadEndMs: boot.loadEnd, blocked: 0, clicks: null };
    if (!vp.interactive) { row.blocked = blocked; return row; }
    await page.evaluate((id) => {
      document.addEventListener('click', (event) => {
        if (event.target instanceof Element && event.target.closest(`[data-flip-id="${id}"]`)) {
          window.__bench.clickAt = performance.now();
        }
      }, true);
    }, newest);
    const title = `[data-flip-id="${newest}"] h3 span`;
    // The hover action bar overlays the title's right edge, so aim at the text start.
    const aim = { position: { x: 6, y: 10 }, timeout: 60_000 };
    await page.click(title, aim);
    const firstMs = await editorReady(page);
    const afterEditor = await collect(page);
    const editorKB = Math.max(0, Math.round((afterEditor.decoded - boot.decoded) / 1024));
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-testid="fullscreen-editor-modal"]', { state: 'detached', timeout: 60_000 });
    await page.evaluate(() => { window.__bench.clickAt = undefined; });
    await page.click(title, aim);
    const warmMs = await editorReady(page);
    row.clicks = { firstMs, warmMs, editorLoadKB: editorKB, editorRequests: afterEditor.count - boot.count };
    row.blocked = blocked;
    return row;
  } finally {
    await context.close();
  }
}
// One note in one viewport: isolate the gesture, not scrolling or folder size.
async function touchSample(browser, sample) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  try {
    await context.route('**/*', (route) => isLocal(route.request().url()) ? route.continue() : route.abort());
    const page = await context.newPage();
    const [article] = seed(1);
    await page.addInitScript(({ key, note }) => {
      localStorage.setItem(key, JSON.stringify([note]));
      window.__bench = {};
      document.addEventListener('click', (event) => {
        if (event.isTrusted && event.target instanceof Element && event.target.closest(`[data-flip-id="${note.id}"]`)) {
          window.__bench.clickAt = performance.now();
        }
      }, true);
    }, { key: KEY, note: { ...article, type: 'note' } });
    await page.goto(ORIGIN);
    await page.getByRole('button', { name: /^Входящие/ }).first().tap();
    const card = page.locator(`[data-flip-id="${article.id}"]`);
    const open = () => card.tap({ timeout: 10_000 });
    await open();
    const coldMs = await editorReady(page);
    await page.touchscreen.tap(10, 24); // Dismiss via the scrim above the half-sheet.
    await page.getByTestId('fullscreen-editor-modal').waitFor({ state: 'detached' });
    await open();
    const warmMs = await editorReady(page);
    return { sample, coldMs, warmMs };
  } finally {
    await context.close();
  }
}

const rows = [];
const server = await startPreview();
try {
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: values.channel });
    console.log(`startup-input  dist=${DIST}  ${values.channel ?? 'chromium'}=${browser.version()}`);
    if (values.touch) {
      for (let i = 0; i < 5; i++) rows.push(await touchSample(browser, i));
      console.log(JSON.stringify(rows));
      console.log('touch: trusted click generated by an emulated tap → ready editor DOM; not Android or first paint.');
    } else {
      for (const vp of VIEWPORTS) {
        for (const size of SIZES) {
          try { rows.push(await scenario(browser, size, vp)); }
          catch (error) { rows.push({ scenario: `${vp.name}/${size}`, error: String(error).split('\n')[0] }); }
        }
      }
      console.log('scenario       nav→rdy seed→rdy seed  res  KB    nodes  load  click→cm  warm   editorKB  blocked');
      const pad = (v, n) => String(v).padEnd(n);
      for (const r of rows) {
        if (r.error) { console.log(`${pad(r.scenario, 15)}ERROR ${r.error}`); continue; }
        console.log(`${pad(r.scenario, 15)}${pad(r.readyFromNavMs, 7)}${pad(r.readyFromSeedEndMs, 6)}${pad(r.seedMs, 7)}${pad(r.resources, 5)}${pad(r.decodedKB, 5)}${pad(r.nodes, 7)}${pad(r.loadEndMs, 6)}${pad(r.clicks?.firstMs ?? '-', 10)}${pad(r.clicks?.warmMs ?? '-', 7)}${pad(r.clicks?.editorLoadKB ?? '-', 9)}${r.blocked}`);
      }
      console.log(JSON.stringify(rows));
      console.log('notes: ready = performance.now() at a 5ms-polled DOM marker; seed→rdy starts after setItem returns;');
      console.log('       narrow proves mobile-shell readiness only; decodedKB = cold resource bytes at ready.');
      process.exitCode = rows.some((r) => r.error) ? 1 : 0;
    }
  } finally {
    if (browser) await browser.close();
  }
} finally {
  server.kill();
}
