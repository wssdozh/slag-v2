import { test, expect } from '@playwright/test';
import { setupSlag } from '../support/slagSetup';

const NOTE_ID = 'test_file_rendering_note';
const IMAGE_NAME = 'photo-embed.png';
const FILE_NAME = 'ChatExport_2026-11-14.zip';
const MISSING_NAME = 'нет-такого-файла.pdf';
const WIKI_TARGET = 'Другая заметка';

const IMAGE_SVG =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320" viewBox="0 0 480 320">' +
  '<rect width="480" height="320" fill="%2318181b"/>' +
  '<rect x="24" y="24" width="432" height="272" fill="%2309090b" stroke="%2327272a" rx="8"/>' +
  '<text x="48" y="170" fill="%23f4f4f5" font-family="sans-serif" font-size="20">embed preview</text></svg>';

// A real `.zip`-shaped byte string is not needed: the renderer only needs a resolvable `src`.
const ZIP_DATA_URL = 'data:application/zip;base64,UEsDBAoAAAAAAAAAIQAAAAAAAAAAAAAAAAAAAAA=';

const NOTE = {
  id: NOTE_ID,
  type: 'note',
  title: 'Отчёт с вложениями',
  content: [
    '# Отчёт с вложениями',
    '',
    `![[${FILE_NAME}]]`,
    '',
    `![[${IMAGE_NAME}]]`,
    '',
    `![[${MISSING_NAME}]]`,
    '',
    `Смотри также [[${WIKI_TARGET}]].`,
  ].join('\n'),
  folder: 'Входящие',
  tags: ['отчёт'],
  createdAt: Date.now(),
  updatedAt: Date.now(),
  attachments: [
    {
      id: 'att_zip_export',
      name: FILE_NAME,
      type: 'file',
      mimeType: 'application/zip',
      size: 2048,
      relativePath: `.attachments/${FILE_NAME}`,
      dataUrl: ZIP_DATA_URL,
    },
    {
      id: 'att_image_embed',
      name: IMAGE_NAME,
      type: 'image',
      mimeType: 'image/svg+xml',
      size: 4096,
      relativePath: `.attachments/${IMAGE_NAME}`,
      dataUrl: IMAGE_SVG,
    },
  ],
};

test.describe('SLAG v2 — attachment embeds (![[file]])', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await setupSlag(page, testInfo);
  });

  test('feed and fullscreen editor render ![[file]] as an attachment, not as a broken image', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.evaluate((note) => {
      const storageKey = 'slag_items_default_vault';
      const items = JSON.parse(localStorage.getItem(storageKey) || '[]');
      localStorage.setItem(storageKey, JSON.stringify([note, ...items]));
    }, NOTE);
    await page.reload({ waitUntil: 'commit' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 120000 });

    // ---------------------------------------------------------------- feed
    const card = page.locator(`#item-${NOTE_ID}`);
    await expect(card).toBeVisible();
    await card.scrollIntoViewIfNeeded();

    const fileChip = card.locator('[data-testid="attachment-embed"][data-attachment-kind="file"]');
    await expect(fileChip).toBeVisible();
    await expect(fileChip).toContainText(FILE_NAME);
    await expect(fileChip).toHaveAttribute('download', FILE_NAME);

    const imageEmbed = card.locator(
      `[data-testid="attachment-embed"][data-attachment-kind="image"] img[alt="${IMAGE_NAME}"]`,
    );
    await expect(imageEmbed).toBeVisible();
    await expect(imageEmbed).toHaveAttribute('src', /^data:image\/svg\+xml/);

    const missingChip = card.locator('[data-testid="attachment-embed"][data-attachment-kind="unknown"]');
    await expect(missingChip).toBeVisible();
    await expect(missingChip).toContainText(MISSING_NAME);

    // The embed must never become `![name](wiki:name)`: no image may point at the wiki scheme.
    await expect(page.locator('img[src^="wiki:"]')).toHaveCount(0);
    await expect(card).not.toContainText('[[');

    // Ordinary wiki links keep working.
    await expect(card.locator('span[role="button"]', { hasText: WIKI_TARGET })).toBeVisible();

    await page.screenshot({ path: 'test-results/screenshots/file-rendering-feed.png' });

    // -------------------------------------------------------------- editor
    await card.click({ button: 'right' });
    await page.locator('.fixed.z-50 button', { hasText: 'Фокус-редактор' }).click();

    const editorRoot = page.locator('#fullscreen-editor-root');
    await expect(editorRoot).toBeVisible();

    const strip = page.locator('[data-testid="attachment-strip"]');
    await expect(strip).toBeAttached();

    // (a) the rail lives after the editor in the document, not above the text.
    const railPosition = await page.evaluate(() => {
      const editor = document.querySelector('#fullscreen-editor-root');
      const rail = document.querySelector('[data-testid="attachment-strip"]');
      if (!editor || !rail) return 'missing';
      return editor.compareDocumentPosition(rail) & Node.DOCUMENT_POSITION_FOLLOWING
        ? 'after'
        : 'before';
    });
    expect(railPosition).toBe('after');

    // (b) it is folded by default, so only the compact summary row is there.
    await expect(strip).toHaveAttribute('data-collapsed', 'true');
    await expect(strip.getByText('Медиа и вложения (2)')).toBeVisible();
    await expect(strip.getByText('Вставить в текст')).toHaveCount(0);

    // (c) the tokens paint as widgets: the raw `![[` never reaches the editor DOM.
    const cmContent = page.locator('.cm-content');
    await expect(cmContent).toBeVisible();
    const fileWidget = page.locator(
      '[data-testid="attachment-embed-widget"][data-attachment-kind="file"]',
    );
    await expect(fileWidget).toBeVisible();
    await expect(
      page.locator('[data-testid="attachment-embed-widget"][data-attachment-kind="image"]'),
    ).toBeVisible();
    await expect(cmContent).not.toContainText('[[');

    // Bring the rail into the frame: the screenshot is evidence of the placement itself.
    await page.locator('[data-editor-body]').evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.screenshot({ path: 'test-results/screenshots/file-rendering-editor.png' });

    // Clicking the widget puts the caret on the token: the token turns back into markdown so it
    // can be edited. The doc itself never changed, only what the line paints.
    const markdownBefore = await page.evaluate(() => window.__slagGetEditorMarkdown?.() ?? '');
    await fileWidget.click();
    await expect(fileWidget).toHaveCount(0);
    await expect(cmContent).toContainText(FILE_NAME);
    const markdownAfter = await page.evaluate(() => window.__slagGetEditorMarkdown?.() ?? '');
    expect(markdownAfter).toBe(markdownBefore);
    expect(markdownAfter).toContain(`![[${FILE_NAME}]]`);
  });
});
