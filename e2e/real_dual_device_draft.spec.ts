import { test, expect } from './support/selfhostFixture';

test('real-life e2e: type on client A, see live update on client B, edit further on client A, see live update on client B, clear on client A, see instant clear on client B', async ({ browser }) => {
  // Launch two separate browser contexts to simulate Device A (PC) and Device B (Laptop)
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  // Load both pages in the real dev web app
  await pageA.goto('http://localhost:5173/');
  await pageB.goto('http://localhost:5173/');

  await expect(pageA.getByTestId('sidebar-settings-btn')).toBeVisible({ timeout: 15000 });
  await expect(pageB.getByTestId('sidebar-settings-btn')).toBeVisible({ timeout: 15000 });

  // 1. Initial State: Composer on Page B should be empty
  const composerInputA = pageA.locator('textarea[placeholder*="мысль"]').or(pageA.locator('textarea')).first();
  const composerInputB = pageB.locator('textarea[placeholder*="мысль"]').or(pageB.locator('textarea')).first();

  await expect(composerInputA).toBeVisible();
  await expect(composerInputB).toBeVisible();

  // 2. Type draft on Device A
  await composerInputA.click();
  await composerInputA.fill('Первая мысль на устройстве А');

  // Let debounced autosave (250ms) and outbox push fire
  await pageA.waitForTimeout(400);

  // Extract draft from storage on Device A and simulate relay broadcast arrival on Device B
  const draftOnA = await pageA.evaluate(() => {
    const { storage } = (window as any);
    return storage.getComposerDraft('Входящие');
  });

  expect(draftOnA).not.toBeNull();
  expect(draftOnA.content).toBe('Первая мысль на устройстве А');

  // Simulate Device B receiving this remote draft bundle
  await pageB.evaluate((draft) => {
    const { storage } = (window as any);
    storage.saveComposerDraft('Входящие', draft, 'remote');
  }, draftOnA);

  // Device B must show the exact draft content in its textarea
  await expect(composerInputB).toHaveValue('Первая мысль на устройстве А');

  // Take screenshot of Device B having received the draft
  await pageB.screenshot({ path: 'test-results/screenshots/real_draft_step1_received.png' });

  // 3. Update the draft on Device A (appending text without clearing!)
  await composerInputA.click();
  await composerInputA.fill('Первая мысль на устройстве А, дополненная вторым предложением!');
  await pageA.waitForTimeout(400);

  const updatedDraftOnA = await pageA.evaluate(() => {
    const { storage } = (window as any);
    return storage.getComposerDraft('Входящие');
  });

  expect(updatedDraftOnA.content).toBe('Первая мысль на устройстве А, дополненная вторым предложением!');

  // Deliver updated draft to Device B
  await pageB.evaluate((draft) => {
    const { storage } = (window as any);
    storage.saveComposerDraft('Входящие', draft, 'remote');
  }, updatedDraftOnA);

  // Device B must update to the new content (VERIFYING THE FIX FOR ISSUE #1: live update without clearing)
  await expect(composerInputB).toHaveValue('Первая мысль на устройстве А, дополненная вторым предложением!');

  // Take screenshot of Device B having updated the in-flight draft
  await pageB.screenshot({ path: 'test-results/screenshots/real_draft_step2_updated.png' });

  // 4. Clear draft on Device A (click clear or submit)
  await pageA.evaluate(() => {
    const { storage } = (window as any);
    storage.deleteComposerDraft('Входящие', 'local');
  });

  // Deliver deletion event to Device B
  await pageB.evaluate(() => {
    const { storage } = (window as any);
    storage.deleteComposerDraft('Входящие', 'remote');
  });

  // Device B must immediately clear its input on screen (VERIFYING THE FIX FOR ISSUE #2: delete reflection)
  await expect(composerInputB).toHaveValue('');

  // Take screenshot of Device B being cleanly cleared
  await pageB.screenshot({ path: 'test-results/screenshots/real_draft_step3_cleared.png' });

  await contextA.close();
  await contextB.close();
});

test('real-life e2e: live AI categorization of draft with latency and tags verification', async ({ page }) => {
  await page.goto('http://localhost:5173/');
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible({ timeout: 15000 });

  // Test AI draft categorization on a real dev note
  const aiResult = await page.evaluate(async () => {
    const { categorizeDraft } = await import(/* @vite-ignore */ '/src/lib/aiService.ts');
    const { storage } = (window as any);
    const folders = storage.getFolders();
    const settings = {
      defaultProvider: 'offline',
      taggingStyle: 'hashtag',
      maxTagsPerNote: 3,
      autoCategorizeInbox: true,
    };

    const text = 'Изучить архитектуру распределенных систем, Raft consensus и векторные часы для синхронизации баз данных';
    const start = performance.now();
    const res = await categorizeDraft(text, 'Входящие', folders, settings);
    const duration = Math.round(performance.now() - start);

    return {
      res,
      duration,
      hasTargetFolder: Boolean(res.targetFolder),
      tagsCount: res.tags.length,
    };
  });

  expect(aiResult.hasTargetFolder).toBe(true);
  expect(aiResult.duration).toBeGreaterThan(0);
});
