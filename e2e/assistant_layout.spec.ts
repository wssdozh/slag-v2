import { test, expect } from '@playwright/test';

const ASSISTANT_KEY = 'slag_assistant_default_vault';

const LONG_WORD = 'суперкалифраджилистикэкспиалидошиоссуперкалифраджилистикэкспиалидошиос';

const SEEDED_MESSAGES = [
  {
    id: 'layout-1',
    role: 'user',
    content: `покажи заметки про архитектуру и вот это ${LONG_WORD}`,
    createdAt: Date.now() - 60_000,
  },
  {
    id: 'layout-2',
    role: 'assistant',
    content: [
      'Вот сводка по хранилищу.',
      '',
      '| Дата | Тема | Ссылка |',
      '|---|---|---|',
      '| 5 ноября | Orama vs SQLite | https://example.com/very/long/path/that/keeps/going/and/going/forever/index.html |',
      '',
      '```ts',
      'const x = someVeryLongFunctionName(argumentOne, argumentTwo, argumentThree, argumentFour);',
      '```',
      '',
      `Обычный текст и слово ${LONG_WORD}.`,
    ].join('\n'),
    createdAt: Date.now() - 50_000,
  },
];

async function seedAssistantHistory(page: import('@playwright/test').Page) {
  await page.addInitScript(
    ([key, messages]) => {
      localStorage.setItem(key, JSON.stringify(messages));
    },
    [ASSISTANT_KEY, SEEDED_MESSAGES] as const
  );
}

async function openAssistantDock(page: import('@playwright/test').Page) {
  // The event is listened for after mount; dispatching before that silently drops it.
  await expect(page.locator('main').first()).toBeVisible({ timeout: 120000 });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('slag:toggle-assistant')));
  await expect(page.getByTestId('assistant-messages')).toBeVisible();
}

test.describe('Assistant layout', () => {
  test('a narrow assistant keeps all controls on one line and uses borderless bubbles', async ({ page }) => {
    await page.setViewportSize({ width: 280, height: 720 });
    await seedAssistantHistory(page);
    await page.goto('/?panel=assistant&title=Ассистент');
    const stream = page.getByTestId('assistant-messages');
    await expect(stream).toContainText('Вот сводка по хранилищу.', { timeout: 30_000 });
    const bubble = stream.locator('.rounded-xl').filter({ hasText: 'Вот сводка по хранилищу.' });
    await expect(bubble).toHaveCSS('border-top-width', '0px');

    const toolbar = page.locator('.composer-toolbar');
    await page.getByRole('button', { name: 'Поиск в интернете' }).click();
    await expect(page.getByRole('button', { name: 'Поиск в интернете' })).toHaveAttribute('aria-pressed', 'true');
    const geometry = await toolbar.evaluate(el => {
      const row = el.getBoundingClientRect();
      return [...el.querySelectorAll('button')].map(button => {
        const box = button.getBoundingClientRect();
        return {
          center: Math.round(box.top + box.height / 2),
          inside: box.left >= row.left && box.right <= row.right,
        };
      });
    });
    expect(geometry).toHaveLength(4);
    expect(new Set(geometry.map(box => box.center)).size).toBe(1);
    expect(geometry.every(box => box.inside)).toBe(true);
    await page.screenshot({ path: 'test-results/screenshots/assistant-narrow-toolbar.png' });
  });

  test('long unbroken content never scrolls the message stream sideways', async ({ page }) => {
    await seedAssistantHistory(page);
    await page.goto('/');
    await openAssistantDock(page);

    const stream = page.getByTestId('assistant-messages');
    await expect(stream).toContainText('Вот сводка по хранилищу.');

    const overflow = await stream.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      scrollLeft: el.scrollLeft,
      maxScrollLeft: el.scrollWidth - el.clientWidth,
    }));

    expect(overflow.maxScrollLeft).toBeLessThanOrEqual(1);
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

    // Code blocks keep their own horizontal scroll instead of stretching the panel.
    const codeBlockScrollsInternally = await page
      .locator('[data-testid="assistant-messages"] pre')
      .first()
      .evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(codeBlockScrollsInternally).toBe(true);

    await page.screenshot({ path: 'test-results/screenshots/assistant_no_horizontal_scroll.png' });
  });
});
