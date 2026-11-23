import type { Locator, Page } from '@playwright/test';
import { test, expect } from './support/selfhostFixture';

const screenshots = 'test-results/screenshots';
const typeMenu = (page: Page) => page.locator('body > div.z-\\[9999\\]').last();
const taskControls = '[aria-label="Установить срок таски"], [aria-label="Установить длительность таски"], [aria-label="Повторяющаяся таска"], [title^="Приоритет:"]';

async function open(page: Page, width: number, density = 'compact', route = '/') {
  await page.setViewportSize({ width, height: 850 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript((density) => {
    const config = { density, fontScale: 'normal', fontFamily: 'inter' };
    localStorage.setItem('slag_ui_config_v2', JSON.stringify({ desktop: config, mobile: config }));
  }, density);
  await page.goto(route);
  await expect(page.locator('html')).toHaveAttribute('data-density', density);
  if (width < 768 && route === '/') {
  }
  await expect(page.locator('.composer-surface').first()).toBeVisible({ timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
}

// Retry measurements, not sleeps: resize/layout and presence transitions may still be settling.
async function geometry(surface: Locator, mobile: boolean) {
  await expect(surface.locator('textarea')).toBeVisible();
  await expect.poll(() => surface.evaluate((root, mobile) => {
    const bounds = root.getBoundingClientRect();
    const controls = Array.from(root.querySelectorAll<HTMLElement>('.composer-toolbar-control, .composer-top-actions button'))
      .map((el) => ({
        label: el.getAttribute('aria-label') || el.title || el.textContent,
        corner: Boolean(el.closest('.composer-top-actions')),
        send: el.classList.contains('composer-send'),
        square: el.classList.contains('composer-toolbar-icon'),
        rect: el.getBoundingClientRect(),
      }))
      .filter(({ rect }) => rect.width > 0 && rect.height > 0);
    const errors: string[] = [];
    if (root.scrollWidth > root.clientWidth + 1) errors.push('surface overflow');
    // The frame is one inset on all four sides, on every platform.
    const panel = root.querySelector<HTMLElement>('[data-composer-panel]');
    if (panel) {
      const cs = getComputedStyle(panel);
      const pads = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft];
      if (new Set(pads).size > 1) errors.push(`uneven padding: ${pads.join('/')}`);
      const text = panel.querySelector('textarea');
      const leftInset = text
        ? text.getBoundingClientRect().left - panel.getBoundingClientRect().left - parseFloat(cs.borderLeftWidth)
        : parseFloat(cs.paddingLeft);
      if (Math.abs(leftInset - parseFloat(cs.paddingLeft)) > 1.5) errors.push(`text inset: ${Math.round(leftInset)}`);
    }
    for (const [i, { label, rect, corner, send, square }] of controls.entries()) {
      if (rect.left < Math.max(0, bounds.left) - 1 || rect.right > Math.min(innerWidth, bounds.right) + 1
        || rect.top < 0 || rect.bottom > innerHeight + 1) errors.push(`outside: ${label}`);
      // Everything is sized from the density token; corner utilities and the
      // send plate are one step smaller than the main controls.
      const small = parseFloat(getComputedStyle(root).getPropertyValue('--slag-ctrl-sm')) || 28;
      // Corner utilities and the send plate run one step smaller than the row.
      const minHeight = small - 0.5;
      // Only square controls owe us a square; labelled ones may be wider or narrower.
      const minWidth = corner || send || square ? small - 0.5 : 0;
      if (mobile && (rect.height < minHeight || rect.width < minWidth)) errors.push(`touch target: ${label} ${Math.round(rect.width)}x${Math.round(rect.height)}`);
      for (const other of controls.slice(i + 1)) {
        if (Math.min(rect.right, other.rect.right) - Math.max(rect.left, other.rect.left) > 1
          && Math.min(rect.bottom, other.rect.bottom) - Math.max(rect.top, other.rect.top) > 1) {
          errors.push(`overlap: ${label} / ${other.label}`);
        }
      }
    }
    return errors;
  }, mobile)).toEqual([]);
}

// The placeholder has to sit on the expand button's centre.
async function aligned(surface: Locator) {
  return surface.evaluate((root) => {
    const text = root.querySelector('textarea')!.getBoundingClientRect();
    const corner = root.querySelector<HTMLElement>('.composer-top-actions button');
    if (!corner) return { delta: 0, taller: false };
    const button = corner.getBoundingClientRect();
    return {
      delta: Math.abs((text.top + text.bottom) / 2 - (button.top + button.bottom) / 2),
      taller: text.height > button.height + 1,
    };
  });
}

async function types(page: Page, surface: Locator, mobile: boolean) {
  const input = surface.locator('textarea');
  // The menu is portalled to body: scope to the popover or the feed's own type chips match too.
  const menu = typeMenu(page);
  for (const type of ['Заметка', 'Статья', 'Таска']) {
    await surface.getByRole('button', { name: 'Сменить тип записи', exact: true }).click();
    await menu.getByRole('button', { name: type, exact: true }).click();
    await expect(surface.getByRole('button', { name: 'Сменить тип записи', exact: true })).toHaveAttribute('title', type);
    await input.fill('');
    await geometry(surface, mobile); // empty draft uses the recording control instead of send
    const fit = await aligned(surface);
    expect(fit.delta).toBeLessThan(2);
    expect(fit.taller).toBe(false);
    await input.fill('Проверка геометрии композера');
    await expect(surface.getByTitle(mobile ? 'Отправить' : 'Отправить (Enter)', { exact: true })).toBeEnabled();
    await geometry(surface, mobile);
    if (type === 'Таска') {
      await expect(surface.locator(taskControls)).toHaveCount(4);
      // Task properties belong to the toolbar row, under the input, next to the type.
      await expect.poll(() => surface.evaluate((root, selector) => {
        const textarea = root.querySelector('textarea')!.getBoundingClientRect();
        const controls = Array.from(root.querySelectorAll(selector));
        return controls.every((el) => el.getBoundingClientRect().top >= textarea.bottom - 1);
      }, taskControls)).toBe(true);
    } else {
      await expect(surface.locator(taskControls)).toHaveCount(0);
    }
  }
}

for (const width of [360, 390]) {
  for (const density of ['normal', 'compact']) {
    test(`mobile ${width}px / ${density}: all types keep controls separated`, async ({ page }) => {
      await open(page, width, density);
      const surface = page.locator('.composer-surface').first();
      await types(page, surface, true);
      if (width === 390 && density === 'compact') {
        await page.screenshot({ path: `${screenshots}/composer-mobile-unified.png`, animations: 'disabled' });
        // The empty note composer is the shortest state: placeholder, no property row.
        await surface.getByRole('button', { name: 'Сменить тип записи', exact: true }).click();
        await typeMenu(page).getByRole('button', { name: 'Заметка', exact: true }).click();
        await surface.locator('textarea').fill('');
        await page.screenshot({ path: `${screenshots}/composer-mobile-empty.png`, animations: 'disabled' });
        // Folder and tag live in the text as tokens, with no extra chip row.
        await surface.locator('textarea').fill('Посмотреть фильм @Карьера #бы');
        await page.locator('[data-tag-item="быт"]').first().click();
        await expect(surface.locator('textarea')).toHaveValue('Посмотреть фильм @Карьера #быт ');
        // The known folder token is painted by the mirror, so it must stay aligned
        // with the field it sits under.
        const token = surface.locator('div[aria-hidden="true"] .text-mention');
        await expect(token).toHaveText('@Карьера');
        await expect(surface.locator('textarea')).toHaveCSS('color', 'rgba(0, 0, 0, 0)');
        await page.screenshot({ path: `${screenshots}/composer-mobile-tokens.png`, animations: 'disabled' });
      }
    });
  }
}

test('desktop and modal: all types keep properties in the toolbar', async ({ page }) => {
  await open(page, 1440);
  const feed = page.locator('.composer-surface').filter({ has: page.getByRole('button', { name: 'Сменить тип записи', exact: true }) }).first();
  await types(page, feed, false);
  await page.screenshot({ path: `${screenshots}/composer-desktop-unified.png`, animations: 'disabled' });
  await feed.locator('textarea').evaluate((el) => el.blur());
  await page.keyboard.press('c');
  await expect(page.getByText('Новая задача', { exact: true })).toBeVisible();
  const modal = page.locator('.motion-dialog .composer-surface');
  await expect(modal).toBeVisible();
  await types(page, modal, false);
  await page.screenshot({ path: `${screenshots}/composer-modal-unified.png`, animations: 'disabled' });
});

test('quick composer route: all types at narrow width', async ({ page }) => {
  await open(page, 390, 'compact', '/?window=quick-composer');
  await expect(page.getByText('Быстрая мысль', { exact: true })).toBeVisible();
  await types(page, page.locator('.composer-surface'), true);
  await page.screenshot({ path: `${screenshots}/composer-quick-unified.png`, animations: 'disabled' });
});

test('desktop: the recorders stay inside the composer, not over the window', async ({ page }) => {
  await open(page, 1440);
  const dock = page.locator('[data-testid="composer-dock"]');
  const column = await dock.boundingBox();
  expect(column).not.toBeNull();

  await page.locator('button[aria-label="Записать голосовую заметку"]').first().click();
  const audio = page.locator('[data-testid="audio-recorder"]');
  await expect(audio).toBeVisible();
  await expect(audio.getByRole('button', { name: 'Отправить аудио', exact: true })).toBeVisible();
  // The recorder takes the composer's own slot: same column, no full-window takeover.
  expect(await audio.evaluate((el) => Boolean(el.closest('[data-testid="composer-dock"]')))).toBe(true);
  const audioBox = await audio.boundingBox();
  expect(audioBox).not.toBeNull();
  expect(audioBox!.x).toBeGreaterThanOrEqual(column!.x - 1);
  expect(audioBox!.x + audioBox!.width).toBeLessThanOrEqual(column!.x + column!.width + 1);
  await page.screenshot({ path: `${screenshots}/composer-recording-inline.png`, animations: 'disabled' });

  await page.keyboard.press('Escape');
  await expect(audio).toHaveCount(0);

  // `/video` is the way into the circle recorder, and its preview belongs to the composer too.
  await page.locator('.composer-surface textarea').first().fill('/video');
  await page.keyboard.press('Enter');
  const video = page.locator('[data-testid="video-recorder"]');
  await expect(video).toBeVisible();
  expect(await video.evaluate((el) => Boolean(el.closest('[data-testid="composer-dock"]')))).toBe(true);
  await expect.poll(
    () => video.locator('video').evaluate((el: HTMLVideoElement) => el.videoWidth),
    { timeout: 15000 },
  ).toBeGreaterThan(0);
  await page.screenshot({ path: `${screenshots}/composer-video-inline.png`, animations: 'disabled' });

  // A MediaRecorder hands over chunks as it goes: sending before the first one lands gives
  // an empty blob and no note at all.
  await expect.poll(
    async () => Number((await video.locator('span.font-mono').last().textContent())?.replace('s', '')),
    { timeout: 15000 },
  ).toBeGreaterThan(0.5);
  await video.getByRole('button', { name: 'Отправить видео', exact: true }).click();
  // A note with no text is titled by its attachment, and the card shows the circle, not the title.
  const circles = page.locator('[id^="item-"] video');
  await expect(circles).toHaveCount(1, { timeout: 20000 });
  const circle = circles.first();
  await circle.scrollIntoViewIfNeeded();
  // The clip is readable as media, not just present: a data URL carrying the encoder's codec
  // list (`;codecs=vp9,opus`) splits on that comma and never reaches metadata at all.
  await expect.poll(
    () => circle.evaluate((el: HTMLVideoElement) => el.videoWidth),
    { timeout: 20000 },
  ).toBeGreaterThan(0);
  expect(await circle.evaluate((el) => (el.getAttribute('src') || '').split(';')[0])).toBe('data:video/webm');
  // No ring around the circle: the progress arc is drawn only while it plays.
  expect(await circle.evaluate((el) => getComputedStyle(el.parentElement as HTMLElement).borderTopWidth)).toBe('0px');
  expect(await circle.evaluate((el) => (el.parentElement as HTMLElement).querySelectorAll('svg circle').length)).toBe(0);
  await page.screenshot({ path: `${screenshots}/composer-video-circle.png`, animations: 'disabled' });
});

test('assistant: narrow desktop dock and mobile main area', async ({ page }) => {
  await open(page, 1280);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('slag:toggle-assistant')));
  const assistant = page.locator('.composer-surface').filter({ has: page.locator('textarea[placeholder^="Спросите"]') });
  await expect(assistant).toBeVisible();
  await assistant.locator('textarea').fill('Проверка раскладки, без обращения к модели');
  await expect(assistant.getByTitle('Отправить сообщение (Enter)', { exact: true })).toBeEnabled();
  await geometry(assistant, false);
  expect((await assistant.boundingBox())!.width).toBeLessThan(400);
  await page.screenshot({ path: `${screenshots}/composer-assistant-unified.png`, animations: 'disabled' });

  await page.setViewportSize({ width: 390, height: 850 });
  await page.getByRole('navigation', { name: 'Мобильная навигация' }).getByRole('button', { name: 'ИИ', exact: true }).click();
  await expect(page.locator('header h1', { hasText: 'Ассистент' })).toBeVisible();
  await assistant.locator('textarea').fill('Проверка основной области');
  await geometry(assistant, true);
  await page.screenshot({ path: `${screenshots}/composer-assistant-mobile-unified.png`, animations: 'disabled' });
});
