import { test, expect } from '@playwright/test';
import { setupSlag } from '../support/slagSetup';

test('same-named attachment embeds retain distinct bytes in feed and editor', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setupSlag(page, testInfo);
  await page.evaluate(async () => {
    const { storage } = await import('/src/lib/storage/index.ts');
    const image = (text: string, color: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="130"><rect width="360" height="130" fill="${color}"/><text x="30" y="70" fill="white" font-size="28">${text}</text></svg>`)}`;
    const sources = [image('first screenshot', '#184060'), image('second screenshot', '#604018')];
    const attachments = sources.map((dataUrl, index) => ({
      id: `identity_${index}`, name: 'image.webp', type: 'image' as const,
      mimeType: 'image/svg+xml', size: 100, relativePath: `.attachments/identity_${index}_image.webp`, dataUrl,
    }));
    const { idbSaveAttachment } = await import('/src/lib/storage/indexedDb.ts');
    await Promise.all(attachments.map(attachment => idbSaveAttachment(attachment)));
    storage.saveItem({ id: 'attachment_identity', type: 'note', title: 'attachment identity',
      content: 'intro\n\n![[image.webp]]\n![[image.webp]]\n\nend', folder: 'Входящие', tags: [],
      attachments, createdAt: Date.now(), updatedAt: Date.now() });
    const { resolveAttachmentByName, resolveAttachmentEmbeds } = await import('/src/lib/text/attachmentEmbed.ts');
    const { serializeItemToMarkdown, parseMarkdownToItem } = await import('/src/lib/vault/markdownSerializer.ts');
    const saved = storage.getItemById('attachment_identity');
    if (!saved) throw new Error('fixture not saved');
    const restored = parseMarkdownToItem(serializeItemToMarkdown(saved), saved.id);
    const legacyIds = resolveAttachmentEmbeds(restored.content, restored.attachments).map(({ attachment }) => attachment?.id);
    if (JSON.stringify(legacyIds) !== JSON.stringify(['identity_0', 'identity_1'])) throw new Error('legacy roundtrip lost attachment identity');
    const ids = resolveAttachmentEmbeds('![[identity_1]] ![[identity_1]] ![[.attachments/identity_0_image.webp]]', attachments).map(({ attachment }) => attachment?.id);
    if (JSON.stringify(ids) !== JSON.stringify(['identity_1', 'identity_1', 'identity_0'])) throw new Error('stable references changed identity');
    if (resolveAttachmentByName([attachments[0]], 'image.webp', 2)?.id !== 'identity_0') throw new Error('unique repeated name changed identity');
    if (resolveAttachmentByName(attachments, 'missing.webp')) throw new Error('missing reference resolved');
    const aliases = resolveAttachmentEmbeds('![[IMAGE.WEBP|first]] ![[IMAGE.WEBP|second]]', attachments);
    if (aliases[1].attachment?.id !== 'identity_1') throw new Error('case-insensitive aliases lost identity');
    return sources;
  });
  await page.reload();
  const expectedColors = ['#184060', '#604018'];
  const imageColors = async (selector: string) => page.locator(selector).evaluateAll(async images => Promise.all(images.map(async image => {
    const response = await fetch((image as HTMLImageElement).src);
    return response.text();
  })));
  const card = page.locator('#item-attachment_identity');
  await expect(card).toBeVisible();
  const images = card.getByTestId('attachment-embed').locator('img');
  await expect(images).toHaveCount(2);
  await expect.poll(async () => (await imageColors('#item-attachment_identity [data-testid="attachment-embed"] img')).map((svg, index) => svg.includes(expectedColors[index]))).toEqual([true, true]);
  await card.scrollIntoViewIfNeeded();
  await card.screenshot({ path: 'test-results/screenshots/attachment-identity-feed.png', style: '[data-composer-root] { visibility: hidden; }' });
  await card.click({ button: 'right' });
  await page.getByText('Фокус-редактор', { exact: true }).click();
  const editor = page.locator('#fullscreen-editor-root');
  await expect(editor).toBeVisible();
  await editor.locator('.cm-content').press('ControlOrMeta+End');
  const widgets = editor.getByTestId('attachment-embed-widget').locator('img');
  await expect(widgets).toHaveCount(2);
  await expect.poll(async () => (await imageColors('#fullscreen-editor-root [data-testid="attachment-embed-widget"] img')).map((svg, index) => svg.includes(expectedColors[index]))).toEqual([true, true]);
  await expect(page.getByTestId('attachment-strip')).toContainText('Медиа и вложения (2)');
  await expect.poll(async () => widgets.evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await page.getByTestId('fullscreen-editor-modal').screenshot({ path: 'test-results/screenshots/attachment-identity-editor.png', animations: 'disabled' });
});
