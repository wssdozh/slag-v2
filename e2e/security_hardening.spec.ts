import { test, expect } from '@playwright/test';

// Security regressions that must stay fixed: markdown URL schemes, filename
// sanitizing, vault-relative path guards and backup-import rejection.
// Payloads mirror SecLists Fuzzing/File-Names and the XSS cases that matter here.

const NOTE_ID = 'item_security_probe';

function noteWith(content: string, title = 'security probe') {
  const now = Date.now();
  return {
    id: NOTE_ID,
    type: 'note',
    title,
    content,
    folder: 'Входящие',
    tags: [],
    attachments: [],
    createdAt: now,
    updatedAt: now,
  };
}

test.describe('security hardening', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((note) => {
      localStorage.setItem('slag_items_default_vault', JSON.stringify([note]));
    }, noteWith([
      'security probe',
      '[js](javascript:window.__xss=1)',
      '[mixed](JaVaScRiPt:window.__xss=4)',
      '[data](data:text/html,<script>window.__xss=2</script>)',
      '[ok](https://example.com/ok)',
      '[[WikiTarget|wiki label]]',
    ].join('\n\n')));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });
  });

  test('markdown links never carry javascript: or data: schemes', async ({ page }) => {
    const card = page.locator('.group', { hasText: 'security probe' }).first();
    await expect(card).toBeVisible({ timeout: 10000 });

    const hrefs = await card.locator('a').evaluateAll((links) =>
      links.map((link) => link.getAttribute('href')));
    for (const href of hrefs) {
      expect(href === null || !/^\s*(?:javascript|data|vbscript):/i.test(href)).toBeTruthy();
    }

    const jsLink = card.locator('a', { hasText: 'js' }).first();
    if (await jsLink.count()) {
      const href = await jsLink.getAttribute('href');
      expect(href === null || href === '').toBeTruthy();
      await jsLink.click({ noWaitAfter: true }).catch(() => {});
      await page.waitForTimeout(150);
      expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss ?? 0)).toBe(0);
    }

    // The safe link and the wiki link are still there; the fix must not break them.
    await expect(card.locator('a', { hasText: 'ok' })).toHaveAttribute('href', 'https://example.com/ok');
    await expect(card.getByRole('button', { name: 'wiki label' })).toBeVisible();

    await page.screenshot({ path: 'test-results/screenshots/security_markdown_links.png' });
  });

  test('note filenames strip traversal, reserved names and overlong titles', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { getSafeNoteFilename } = await import('/src/lib/vault/noteFilename.ts');
      const { isSafeVaultRelativePath, safeVaultRelativePath } = await import('/src/lib/vault/safePath.ts');
      const rejects = [
        '../x', '..\\x', '/etc/passwd', 'C:\\Windows', 'a/../../b', 'a//b', 'a/', 'CON', 'NUL',
        'a.', 'a ', '\0', '~/.ssh',
      ].map((value) => {
        try {
          safeVaultRelativePath(value);
          return false;
        } catch {
          return true;
        }
      });
      return {
        names: {
          traversal: getSafeNoteFilename('../../evil', 'fallback'),
          reserved: getSafeNoteFilename('CON', 'fallback'),
          trailing: getSafeNoteFilename('a. ', 'fallback'),
          long: getSafeNoteFilename('a'.repeat(300), 'fallback'),
          empty: getSafeNoteFilename('', 'fallback'),
        },
        rejects,
        accepts: ['Проекты/Дизайн', 'Входящие', 'a/b/c'].map((value) => isSafeVaultRelativePath(value)),
      };
    });

    expect(result.names.traversal).not.toMatch(/[\\/]/);
    expect(result.names.reserved).toBe('_CON.md');
    expect(result.names.trailing).toBe('a.md');
    expect(result.names.long.length).toBeLessThanOrEqual(63);
    expect(result.names.empty).toBe('fallback.md');
    expect(result.rejects.every(Boolean)).toBe(true);
    expect(result.accepts.every(Boolean)).toBe(true);
  });

  test('backup import rejects paths outside the vault', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { storage } = await import('/src/lib/storage/index.ts');
      const base = {
        type: 'note', content: 'x', tags: [], attachments: [], createdAt: 1, updatedAt: 1,
      };
      const malicious = JSON.stringify({
        items: [{ ...base, id: 'item_escape', title: 'escape', folder: '../../escape', filename: 'x.md' }],
      });
      const valid = JSON.stringify({
        items: [{ ...base, id: 'item_valid', title: 'valid', folder: 'Входящие', filename: 'valid.md' }],
      });
      return {
        malicious: storage.importVaultFromJson(malicious),
        valid: storage.importVaultFromJson(valid),
      };
    });

    expect(result.malicious).toBe(false);
    expect(result.valid).toBe(true);
  });

  test('dev open-folder endpoint rejects traversal instead of creating a directory', async ({ page }) => {
    const response = await page.request.get('/api/dev/open-folder?target=../../escape');
    expect(response.status()).toBe(500);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(String(body.error)).toContain('unsafe target');
  });
});
