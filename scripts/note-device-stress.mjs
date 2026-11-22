// Native staging only. Writes through the real composers, never directly to the vault.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  run: { type: 'string' }, room: { type: 'string' }, count: { type: 'string', default: '10' },
  'wait-seconds': { type: 'string', default: '30' },
  'pause-before-write': { type: 'boolean' },
} });
const count = Number(values.count);
const waitSeconds = Number(values['wait-seconds']);
assert.ok(Number.isInteger(waitSeconds) && waitSeconds > 0 && waitSeconds <= 600, '--wait-seconds must be 1–600');
assert.match(values.run ?? '', /^\d+$/, 'pass --run <staging CI run ID>');
assert.match(values.room ?? '', /^room_[a-f0-9]{32}$/, 'pass --room <isolated registry room>');
assert.ok(Number.isInteger(count) && count > 0 && count <= 50, '--count must be 1–50 per device');
assert.ok(positionals.length >= 2, 'pass at least two local CDP endpoints as PORT:VAULT_DIR:FOLDER');
const targets = positionals.map((value) => {
  const match = /^(\d+):(main|vault_[a-f0-9-]{36}):([\p{L}\p{N} _-]+)$/u.exec(value);
  assert.ok(match && Number(match[1]) > 1024 && Number(match[1]) < 65536, 'expected staging PORT:VAULT_DIR:FOLDER');
  return { port: match[1], dir: match[2], folder: match[3] };
});
assert.equal(new Set(targets.map(({ port }) => port)).size, targets.length, 'CDP endpoints must be distinct');
const marker = `stress-${randomUUID().slice(0, 8)}`;
const browsers = [];
try {
  const clients = [];
  // Complete preflight on every device before any test writes.
  for (const { port, dir, folder } of targets) {
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 6000 });
    browsers.push(browser);
    const pages = browser.contexts().flatMap((context) => context.pages()).filter((p) => p.url() === 'http://tauri.localhost/');
    assert.equal(pages.length, 1, `${port}: open the staging app’s main view`);
    const [page] = pages;
    const read = () => page.evaluate(async (dir) => {
      const invoke = window.__TAURI_INTERNALS__.invoke;
      const appData = await invoke('plugin:path|resolve_directory', { directory: 14 });
      const identifier = appData.split(/[\\/]/).find((part) => /^com\.slag\.notes\.staging\.r\d+$/.test(part));
      if (!identifier) return { identifier };
      const bytes = await invoke('plugin:fs|read_text_file', {
        path: `vaults/${dir}/note-registry.json`, options: { baseDir: 14 },
      });
      const { room, folderTree, journal } = JSON.parse(new TextDecoder().decode(
        bytes instanceof ArrayBuffer ? bytes : Uint8Array.from(bytes),
      ));
      return { identifier, room, folderTree, journal };
    }, dir);
    const state = await read();
    assert.equal(state.identifier, `com.slag.notes.staging.r${values.run}`);
    assert.equal(state.room, values.room);
    assert.equal(state.folderTree, true);
    assert.equal(state.journal.pending.length, 0, `${port}: start from a drained journal`);
    const composer = page.locator('.cm-content:visible');
    await page.getByText(folder, { exact: true }).first().click({ timeout: 5000 });
    await composer.waitFor({ timeout: 5000 });
    assert.equal(await composer.evaluate((element) => {
      const copy = element.cloneNode(true);
      copy.querySelectorAll('.cm-placeholder').forEach((placeholder) => placeholder.remove());
      return copy.textContent.trim();
    }), '', `${port}: empty the test composer first`);
    clients.push({ page, composer, read, port, cursor: state.journal.cursor });
  }
  const cursors = new Set(clients.map(({ cursor }) => cursor));
  assert.equal(cursors.size, 1, 'clients must start on the same confirmed cursor');
  const expectedHead = clients[0].cursor + clients.length * count;
  console.log(`${marker} | ${clients.length} devices × ${count}; expected cursor ${expectedHead}`);
  if (values['pause-before-write']) {
    const input = createInterface({ input: process.stdin, output: process.stdout });
    try { await input.question('Cut the staging relay connection now, then press Enter to write offline. '); }
    finally { input.close(); }
  }
  const titles = new Set();
  await Promise.all(clients.map(async ({ composer, page }, device) => {
    const type = page.getByRole('button', { name: 'Сменить тип записи' });
    for (let i = 0; i < count; i++) {
      const kind = i % 2 === 0 ? 'Заметка' : 'Таска';
      if ((await type.getAttribute('title')) !== kind) {
        await type.click({ timeout: 5000 });
        await page.getByText(kind, { exact: true }).last().click({ timeout: 5000 });
      }
      const title = `${marker} d${device + 1} n${i + 1}`;
      titles.add(title);
      await composer.fill(title, { timeout: 5000 });
      await page.getByRole('button', { name: /^Отправить(?: \(Enter\))?$/ }).click({ timeout: 5000 });
      await page.getByText(new RegExp(`^${title}$`, 'i')).filter({ visible: true }).last().waitFor({ timeout: 6000 });
    }
  }));
  if (values['pause-before-write']) console.log('UI writes complete; restore the staging relay now.');
  for (const { read, port } of clients) {
    const deadline = Date.now() + waitSeconds * 1000;
    for (;;) {
      const { journal } = await read();
      assert.ok(journal.cursor <= expectedHead, `${port}: unexpected concurrent write or duplicate revision`);
      if (journal.cursor === expectedHead && journal.pending.length === 0) {
        const received = Object.values(journal.confirmed).map(({ item }) => item?.title?.toLowerCase()).filter((title) => title?.startsWith(marker));
        assert.deepEqual(received.sort(), [...titles].sort(), `${port}: missing or duplicate records`);
        console.log(`${port}: ${received.length} records confirmed, cursor=${journal.cursor}, pending=0`);
        break;
      }
      assert.ok(Date.now() < deadline, `${port}: journal did not converge: cursor=${journal.cursor}, pending=${journal.pending.length}`);
      await new Promise((done) => setTimeout(done, 250));
    }
  }
} finally {
  await Promise.all(browsers.map((browser) => browser.close()));
}
