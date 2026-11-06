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
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('slag:toggle-assistant')));
  await expect(page.getByTestId('assistant-messages')).toBeVisible();
}

test.describe('Assistant layout', () => {
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
