import { test, expect } from '../support/selfhostFixture';

test('canonical draft bypasses the editor clock and focus veto', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  test.setTimeout(300_000);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const composer = page.locator('main textarea').first();
  await expect(composer).toBeVisible({ timeout: 150_000 });
  await composer.fill('Локальная версия черновика');
  await page.evaluate(async () => {
    const { storage } = await import('/src/lib/sync/syncEngine.ts');
    const folder = storage.getFolders().find(({ path }) => path === storage.getWorkspaceState().currentFolder)?.path ?? 'Входящие';
    const event = { kind: 'draft', action: 'upsert', id: `composer:${folder}`, origin: 'remote',
      payload: { content: 'Подтверждённый черновик с другого устройства', updatedAt: 1 } };
    storage.emitChange(event);
    storage.keepComposerDraftAlternative = (_folder, draft) => new Promise((resolve) => {
      window.savedAlternative = draft.content;
      (window.alternativeWrites ??= []).push({ folder: _folder, content: draft.content });
      (window.alternativeResolvers ??= []).push(resolve);
      window.finishSavingAlternative = resolve;
    });
    window.deliverCanonicalDraft = () => storage.emitChange({ ...event, registry: true });
  });
  await expect(composer).toHaveValue('Локальная версия черновика');
  await composer.fill('Новый ввод до автосохранения');
  expect(await page.evaluate(() => { window.deliverCanonicalDraft(); return window.savedAlternative; })).toBe('Новый ввод до автосохранения');
  await expect(composer).toHaveValue('Новый ввод до автосохранения');
  await page.evaluate(() => window.finishSavingAlternative());
  await expect(composer).toHaveValue('Подтверждённый черновик с другого устройства');
  await page.screenshot({ path: 'test-results/screenshots/sync-registry-draft.png' });

  const initialWrites = await page.evaluate(() => window.alternativeWrites.length);
  await composer.fill('Правка перед сменой папки');
  await page.evaluate(() => window.deliverCanonicalDraft());
  await composer.fill('Последний ввод перед уходом');
  const folder = page.locator('aside').getByText('Проекты', { exact: true }).first();
  await folder.click();
  const writes = await page.evaluate((from) => window.alternativeWrites.slice(from), initialWrites);
  expect(writes).toEqual([
    { folder: expect.any(String), content: 'Правка перед сменой папки' },
    { folder: writes[0]?.folder, content: 'Последний ввод перед уходом' },
  ]);
  await page.evaluate(() => window.alternativeResolvers.forEach((finish) => finish()));
  await expect(composer).not.toHaveValue('Последний ввод перед уходом');
  await expect(composer).not.toHaveValue('Подтверждённый черновик с другого устройства');
});

test('fullscreen adopts the accepted draft without echoing it as a note edit', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible({ timeout: 240_000 });
  const card = page.locator('[id^="item-"]').first();
  const id = (await card.getAttribute('id'))!.slice('item-'.length);
  await card.hover();
  await card.getByRole('button', { name: 'Открыть в фокус-редакторе' }).click();
  const editor = page.getByTestId('fullscreen-editor-modal');
  const title = editor.locator('textarea[placeholder*="Название"], textarea[placeholder*="Заголовок"]').first();
  await expect(title).toBeVisible();
  const original = await title.inputValue();
  await page.evaluate(async (id) => {
    const { storage } = await import('/src/lib/sync/syncEngine.ts');
    const item = storage.getItemById(id);
    if (!item) throw new Error(`Missing note ${id}`);
    storage.saveNoteEdit = () => { throw new Error('A remote draft must not autosave into the note'); };
    storage.emitChange({ kind: 'draft', action: 'upsert', id: `fullscreen:${id}`, origin: 'remote', registry: true,
      payload: { ...item, itemId: id, title: 'Подтверждённый заголовок другого устройства', updatedAt: 1 } });
    window.deleteCanonicalFullscreen = () => storage.emitChange({ kind: 'draft', action: 'delete', id: `fullscreen:${id}`, origin: 'remote', registry: true });
  }, id);
  await expect(title).toHaveValue('Подтверждённый заголовок другого устройства');
  await editor.screenshot({ path: 'test-results/screenshots/sync-registry-fullscreen.png', animations: 'disabled' });
  await page.evaluate(() => window.deleteCanonicalFullscreen());
  await expect(title).toHaveValue(original);

  await page.evaluate(async (id) => {
    const { storage } = await import('/src/lib/sync/syncEngine.ts');
    const item = storage.getItemById(id);
    storage.saveFullscreenDraft = () => new Promise(() => {});
    storage.keepFullscreenDraftAlternative = () => Promise.reject(new Error('journal unavailable'));
    window.deliverFullscreenAgain = () => storage.emitChange({ kind: 'draft', action: 'upsert', id: `fullscreen:${id}`, origin: 'remote', registry: true,
      payload: { ...item, itemId: id, title: 'Следующая версия релея', updatedAt: 2 } });
  }, id);
  await title.fill('Несохранённый локальный заголовок');
  await page.evaluate(() => window.deliverFullscreenAgain());
  await expect(page.getByText('Не удалось сохранить локальную правку; черновик оставлен в редакторе', { exact: true })).toBeVisible();
  await editor.getByRole('button', { name: /назад|закрыть/i }).first().click();
  await expect(title).toHaveValue('Несохранённый локальный заголовок');
  await page.screenshot({ path: 'test-results/screenshots/sync-registry-fullscreen-retry.png' });
  await page.evaluate(async () => {
    const { storage } = await import('/src/lib/sync/syncEngine.ts');
    storage.keepFullscreenDraftAlternative = async (_id, draft) => { window.recoveredFullscreenTitle = draft.title; };
  });
  await editor.getByRole('button', { name: 'Назад к ленте' }).click();
  await expect(editor).not.toBeVisible();
  expect(await page.evaluate(() => window.recoveredFullscreenTitle)).toBe('Несохранённый локальный заголовок');
});

test('fullscreen keeps the base the user was typing over until the edit is durable', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible({ timeout: 150_000 });
  const card = page.locator('[id^="item-"]').first();
  const id = (await card.getAttribute('id'))!.slice('item-'.length);
  await page.evaluate(async (id) => {
    const { storage } = await import('/src/lib/sync/syncEngine.ts');
    const base = storage.getItemById(id);
    if (!base) throw new Error('Missing note');
    const accepted = { ...base, title: 'Заголовок исходной ревизии' };
    await storage.applyAcceptedNote({ id, item: accepted, revision: 41 });
    if (storage.getItemById(id)?.title !== accepted.title) throw new Error('Canonical fixture was not applied');
    storage.emitChange({ kind: 'item', action: 'upsert', id, origin: 'local' });
    storage.subscribeNoteIntents((changes) => new Promise((resolve) => {
      window.capturedEdits = changes;
      window.finishNoteJournal = resolve;
    }));
    window.acceptRemoteContent = () => storage.applyAcceptedNote({ id, item: { ...base, content: 'Новая версия текста с ноутбука' }, revision: 42 });
  }, id);
  const acceptedCard = page.locator(`[id="item-${id}"]`);
  await expect(acceptedCard.getByText('Заголовок исходной ревизии', { exact: true })).toBeVisible();
  await acceptedCard.hover();
  await acceptedCard.getByRole('button', { name: 'Открыть в фокус-редакторе' }).click();
  const editor = page.getByTestId('fullscreen-editor-modal');
  const title = editor.locator('textarea[placeholder*="Название"], textarea[placeholder*="Заголовок"]').first();
  await expect(title).toHaveValue('Заголовок исходной ревизии');
  const original = await title.inputValue();
  await title.fill('Заголовок с телефона');
  await page.evaluate(() => window.acceptRemoteContent());
  await expect(title).toHaveValue('Заголовок с телефона');
  await expect.poll(() => page.evaluate(() => window.capturedEdits?.[0])).toMatchObject({
    id, kind: 'update', origin: { revision: 41 }, previous: { title: original }, item: { title: 'Заголовок с телефона' },
  });
  await editor.getByRole('button', { name: 'Готово', exact: true }).click();
  await expect(editor).toBeVisible();
  await page.evaluate(() => window.finishNoteJournal());
  await expect(editor).toBeHidden();
});
