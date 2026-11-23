import { test, expect } from '@playwright/test';
import { BROKEN_STATE, FIXTURE_REGISTRY, installRecoveryFixture, RECOVERY_ROOT, RECOVERY_RELAY } from '../support/vaultRecoveryFixture';

const root = RECOVERY_ROOT;
const newNote = 'Локальная запись после сбоя';

async function itemCount(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(async () => {
    const url = '/src/lib/storage/index.ts';
    const { storage } = await import(/* @vite-ignore */ url);
    return storage.getItems().length;
  });
}

test('damaged state opens the same 106 notes and saved changes survive two restarts', async ({ page, baseURL }) => {
  const disk = await installRecoveryFixture(page, baseURL!);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByText('Заметка проверки 1', { exact: true }).first()).toBeVisible();
  await expect.poll(() => itemCount(page)).toBe(106);
  await expect(page.getByText('Удалённая не возвращается')).toHaveCount(0);
  expect(disk.firstNoteWrites()).toEqual([]);

  const composer = page.locator('main textarea').first();
  await composer.fill(newNote);
  await composer.press('Enter');
  const created = page.locator('[data-flip-id]').filter({ hasText: newNote }).first();
  await expect(created).toBeVisible();
  await expect(composer).toHaveValue('');
  expect(disk.firstNoteWrites()).toHaveLength(1);

  await page.locator('[id^="item-"]').filter({ hasText: newNote }).first().click({ button: 'right', timeout: 5000 });
  await page.getByRole('button', { name: 'Фокус-редактор' }).click({ timeout: 5000 });
  const editor = page.getByTestId('fullscreen-editor-modal');
  await expect(editor).toBeVisible();
  const tags = editor.getByTestId('editor-tag-input');
  await tags.fill('после-сбоя');
  await tags.press('Enter');
  await expect.poll(() => [...disk.files].some(([path, text]) => path.endsWith('.md') && text.includes(newNote) && text.includes('после-сбоя'))).toBe(true);

  for (let restart = 0; restart < 2; restart++) {
    await page.reload();
    await expect(page.locator('[data-flip-id]').filter({ hasText: newNote }).first()).toBeVisible();
    await expect.poll(() => itemCount(page)).toBe(107);
    await expect.poll(() => page.evaluate(async (text) => {
      const url = '/src/lib/storage/index.ts';
      const { storage } = await import(/* @vite-ignore */ url);
      return storage.getItems().find((item: { content: string }) => item.content.includes(text))?.tags;
    }, newNote)).toContain('после-сбоя');
  }
  expect([...disk.files.entries()].some(([path, text]) => path.startsWith(`${root}/`) && text === BROKEN_STATE)).toBe(true);
  expect(disk.files.get(`${root}/note-registry.json`)).toBe(FIXTURE_REGISTRY);
  expect(disk.attempts).toEqual([]);
  await page.screenshot({ path: 'test-results/screenshots/vault-self-recovery.png' });
});

test('a failed native Markdown write does not clear input or confirm it', async ({ page, baseURL }) => {
  const disk = await installRecoveryFixture(page, baseURL!);
  await page.goto('/');
  await expect(page.getByText('Заметка проверки 1', { exact: true }).first()).toBeVisible();
  disk.rejectWritesTo((path) => path.startsWith(`${root}/notes/`) && path.endsWith('.md'));
  const composer = page.locator('main textarea').first();
  await composer.fill(newNote);
  await composer.press('Enter');
  await expect(page.getByText(/не удалось.*(?:сохранить|записать)/i).first()).toBeVisible();
  await expect(composer).toHaveValue(newNote);
  expect(disk.firstNoteWrites()).toEqual([]);
  expect(disk.attempts).toEqual([]);
});

test('healthy legacy binding migrates once without replacing the device or queue', async ({ page, baseURL }) => {
  const disk = await installRecoveryFixture(page, baseURL!);
  disk.files.delete(`${root}/note-registry.json`);
  const config = { serverUrl: RECOVERY_RELAY, deviceId: 'fixture-device', enabled: false, autoSync: false };
  const outbox = [{ opId: 'fixture-op', id: 'note-archived', kind: 'item', action: 'delete', timestamp: 1000 }];
  disk.files.set(`${root}/state.json`, JSON.stringify({ sync: { config, outbox, tombstones: { 'note-archived': 1000 } } }));
  await page.goto('/');
  await expect.poll(() => disk.files.get(`${root}/sync-ledger.json.fixture-generation`)).toBeDefined();
  await expect.poll(() => disk.files.get(`${root}/state.json`)).toContain('"protectedSync":true');
  const ledger = JSON.parse(disk.files.get(`${root}/sync-ledger.json.fixture-generation`)!);
  const binding = JSON.parse(disk.files.get(`${root}/sync-config.json.fixture-generation`)!);
  expect(ledger).toMatchObject({ vaultId: 'default_vault', value: { outbox, tombstones: { 'note-archived': 1000 } } });
  expect(binding.value).toMatchObject(config);
  expect(binding.value).not.toHaveProperty('seedPhrase');
  expect(JSON.parse(disk.files.get(`${root}/state.json`) ?? '{}')).not.toHaveProperty('sync');
  await page.reload();
  await expect.poll(() => itemCount(page)).toBe(106);
  expect(disk.files.get(`${root}/sync-ledger.json.fixture-generation`)).toBe(JSON.stringify(ledger));
  expect(disk.attempts).toEqual([]);

  // An unrelated settings failure no longer takes the exact delivery state with it.
  disk.files.set(`${root}/state.json`, BROKEN_STATE);
  await page.reload();
  await expect.poll(() => disk.files.get(`${root}/state.json`)).toContain('"protectedSync":true');
  await expect.poll(() => itemCount(page)).toBe(106);
  expect(disk.files.has(`${root}/recovery-local-only.json`)).toBe(false);
  expect(disk.files.get(`${root}/sync-ledger.json.fixture-generation`)).toBe(JSON.stringify(ledger));
});
