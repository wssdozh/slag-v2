// Bottom-follow regressions for the feed. Automatic history loading must yield to the pinned
// bottom; an explicit older-page click must always open history and hand scroll ownership to the
// reader, even when short content fits the viewport and nothing can be scrolled. Real wheel and
// keyboard must still leave the bottom, and the explicit jump must return to it.
import { expect, test } from './support/selfhostFixture';
import type { SlagItem } from '../src/types';

function notes(count: number, prefix: string, short = false): SlagItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`, type: 'note', title: `${prefix} ${index}`,
    content: short ? '' : `Body ${index}\n\nSeed line.`, folder: 'Входящие',
    tags: [], attachments: [], createdAt: 1_700_001_000_000 + index * 60_000,
    updatedAt: 1_700_001_000_000 + index * 60_000,
  }));
}

async function mount(page: import('@playwright/test').Page, items: SlagItem[]) {
  await page.addInitScript((seed) => {
    localStorage.setItem('slag_items_default_vault', JSON.stringify(seed));
  }, items);
  await page.goto('/');
  const feed = page.getByTestId('feed-list-container');
  await expect(feed.locator('[data-flip-id]')).toHaveCount(15);
  return feed;
}

async function pinBottom(page: import('@playwright/test').Page, feed: import('@playwright/test').Locator) {
  await feed.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event('scroll'));
  });
}

const distance = (feed: import('@playwright/test').Locator) =>
  feed.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight);

const bottomButton = (page: import('@playwright/test').Page) => page.locator('button[aria-label="Прокрутить к последним заметкам"]');

test.describe('pinned bottom with overflowing history', () => {
  test.use({ viewport: { width: 1280, height: 880 }, reducedMotion: 'no-preference' });

  test('a real wheel, keyboard and explicit jump keep their meaning', async ({ page }) => {
    const feed = await mount(page, notes(111, 'pin'));
    await pinBottom(page, feed);
    const jump = bottomButton(page);
    const hidden = () => jump.evaluate((element) => element.closest('[aria-hidden]')?.getAttribute('aria-hidden'));

    // Wheel is a reader action: the auto-follow marker must not eat it.
    await feed.hover();
    await page.mouse.wheel(0, -700);
    await expect.poll(() => distance(feed)).toBeGreaterThan(220);
    await expect.poll(hidden).toBe('false');

    await jump.click();
    await expect.poll(() => distance(feed)).toBeLessThanOrEqual(40);
    await expect.poll(hidden).toBe('true');

    // Keyboard scrolling is a reader action too; focusing inside the feed is enough.
    await page.locator('[data-flip-id] button').first().focus();
    await page.keyboard.press('PageUp');
    await expect.poll(() => distance(feed)).toBeGreaterThan(40);

    // Deliberate history reading works after the reader actually left the bottom.
    await feed.evaluate((element) => { element.scrollTop = 0; });
    const older = page.getByRole('button', { name: /Показать более ранние записи/ });
    await expect(older).toBeVisible();
    await older.click();
    await expect.poll(() => feed.locator('[data-flip-id]').count()).toBeGreaterThan(30);
    await jump.click();
    await expect.poll(() => distance(feed)).toBeLessThanOrEqual(40);
  });
});

test.describe('short window with a sentinel that becomes visible', () => {
  test.use({ viewport: { width: 1280, height: 600 }, reducedMotion: 'no-preference' });

  test('the automatic older-page observer yields while a normal send keeps the bottom', async ({ page }) => {
    await page.addInitScript((seed) => {
      localStorage.setItem('slag_items_default_vault', JSON.stringify(seed));
      const host = window as unknown as {
        __autoProbe: { frames: { t: number; now: number; dist: number; scrollTop: number; cards: number; button: boolean }[]; running: boolean };
      };
      host.__autoProbe = { frames: [], running: true };
      const sample = (t: number) => {
        if (!host.__autoProbe.running) return;
        const feed = document.querySelector<HTMLElement>('[data-testid="feed-list-container"]');
        if (feed) {
          const button = document.querySelector('button[aria-label="Прокрутить к последним заметкам"]');
          host.__autoProbe.frames.push({
            t, now: performance.now(), scrollTop: feed.scrollTop,
            dist: feed.scrollHeight - feed.scrollTop - feed.clientHeight,
            cards: feed.querySelectorAll('[data-flip-id]').length,
            button: button?.closest('[aria-hidden]')?.getAttribute('aria-hidden') === 'false',
          });
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }, notes(60, 'auto', true));

    await page.goto('/');
    const feed = page.getByTestId('feed-list-container');
    await expect(feed.locator('[data-flip-id]')).toHaveCount(15);
    await pinBottom(page, feed);
    // The window starts shorter than the pinned content, so the sentinel is offscreen. Growing it
    // to 900 px makes the whole window fit and the sentinel enter the viewport: the observer asks
    // for an older page while the bottom is pinned, and a normal send follows.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForTimeout(350);
    await page.locator('main textarea').first().fill('LOCAL AFTER AUTO OLDER');
    await page.locator('button[title*="Отправить"]').first().click();
    await page.waitForTimeout(450);

    const result = await page.evaluate(() => {
      const host = window as unknown as { __autoProbe: { frames: { now: number; dist: number; cards: number; button: boolean }[]; running: boolean } };
      host.__autoProbe.running = false;
      const frames = host.__autoProbe.frames;
      const steps = frames.slice(1).map((frame, index) => frame.dist - frames[index].dist);
      return {
        frames: frames.length,
        maxDist: Math.max(...frames.map((frame) => frame.dist)),
        maxCards: Math.max(...frames.map((frame) => frame.cards)),
        maxStep: Math.max(...steps.map(Math.abs)),
        buttonVisible: frames.some((frame) => frame.button),
        finalDist: frames.at(-1)?.dist ?? 0,
      };
    });

    console.log(`[pin-auto] ${result.frames} frames, max dist ${result.maxDist.toFixed(0)} px, max cards ${result.maxCards}, ` +
      `max step ${result.maxStep.toFixed(0)} px, button ${result.buttonVisible}, final ${result.finalDist.toFixed(0)} px`);
    expect(result.frames).toBeGreaterThan(10);
    expect(result.maxDist).toBeLessThanOrEqual(40);
    expect(result.buttonVisible).toBe(false);
  });
});

test.describe('tall viewport with short content', () => {
  test.use({ viewport: { width: 1280, height: 1600 }, reducedMotion: 'no-preference' });

  test('an explicit older-page click opens history when nothing can scroll', async ({ page }) => {
    const feed = await mount(page, notes(60, 'short', true));
    await pinBottom(page, feed);
    const older = page.getByRole('button', { name: /Показать более ранние записи/ });
    await expect(older).toBeVisible();

    // The whole window fits, so scrollTop cannot move and the auto sentinel is visible. Automatic
    // loading must yield to the pinned bottom instead of growing it behind the reader.
    const fits = await feed.evaluate((element) => element.scrollHeight <= element.clientHeight + 1);
    expect(fits).toBe(true);
    await page.waitForTimeout(250);
    await expect(feed.locator('[data-flip-id]')).toHaveCount(15);

    // The visible control is not a no-op: one explicit click opens the next page and ownership
    // stays with the reader. Shrinking the viewport now must not snap the list to the bottom.
    await older.click();
    await expect.poll(() => feed.locator('[data-flip-id]').count()).toBeGreaterThan(15);
    const wasAtBottom = await distance(feed);
    expect(wasAtBottom).toBeLessThanOrEqual(40);
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect.poll(() => distance(feed)).toBeGreaterThan(40);
  });
});
