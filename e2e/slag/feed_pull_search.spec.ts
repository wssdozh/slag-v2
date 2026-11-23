import { test, expect, type CDPSession, type Locator, type Page } from '@playwright/test';

// The first navigation of a run pays for the dev server's whole module graph.
test.setTimeout(120_000);

// Pull-to-search: the list moves with the finger past either end, a hint fades in inside the
// exposed gap, and only a release past the threshold opens the existing search. The scroll
// container itself never moves.
type Box = { x: number; y: number; width: number; height: number };

const FEED_SCROLLER = '[data-testid="feed-list-container"]';
const FEED_SURFACE = '[data-testid="feed-pull-surface"]';
const FEED_HINT = '[data-testid="feed-pull-search"]';
const FOLDER_SCROLLER = '[data-testid="mobile-folders-scroll"]';
const FOLDER_SURFACE = '[data-testid="mobile-folders-pull-surface"]';
const FOLDER_HINT = '[data-testid="mobile-folders-pull-search"]';
const SEARCH_INPUT = 'input[placeholder*="Поиск по заметкам"]';

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  expect(box, `no box for ${String(locator)}`).not.toBeNull();
  return box!;
}

function expectSameBox(actual: Box, expected: Box, what: string) {
  expect(actual.x, `${what} x`).toBeCloseTo(expected.x, 0);
  expect(actual.y, `${what} y`).toBeCloseTo(expected.y, 0);
  expect(actual.width, `${what} width`).toBeCloseTo(expected.width, 0);
  expect(actual.height, `${what} height`).toBeCloseTo(expected.height, 0);
}

/** Faintest painted layer inside the hint: whichever node carries the fade, it shows up here. */
async function opacityOf(locator: Locator): Promise<number> {
  return locator.evaluate(el => {
    let faintest = Number(getComputedStyle(el).opacity);
    for (const node of el.querySelectorAll('*')) {
      const opacity = Number(getComputedStyle(node).opacity);
      if (Number.isFinite(opacity) && opacity < faintest) faintest = opacity;
    }
    return faintest;
  });
}

async function touchStart(cdp: CDPSession, x: number, y: number) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
}

async function touchMoveTo(cdp: CDPSession, x: number, y: number) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
  await new Promise(resolve => setTimeout(resolve, 16));
}

async function touchEnd(cdp: CDPSession) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** Drag from `startY` to `startY + travel` (positive travel = finger down). */
async function drag(
  cdp: CDPSession,
  x: number,
  startY: number,
  travel: number,
  steps = 10,
) {
  await touchStart(cdp, x, startY);
  for (let step = 1; step <= steps; step += 1) {
    await touchMoveTo(cdp, x, startY + Math.round((travel * step) / steps));
  }
}

async function openInboxFeed(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  // A phone opens on the folder list; the feed lives behind a folder.
  await page.locator('button', { hasText: 'Входящие' }).first().click();
  const list = page.locator(FEED_SCROLLER);
  await expect(list).toBeVisible({ timeout: 15000 });
  // The feed slides in on the way from the folder list; a box measured mid-flight is not where
  // the finger will land.
  await page.waitForTimeout(600);
  return list;
}

/** Id of a card fully inside the scroller, so its box is a meaningful reading of the surface. */
async function visibleCardId(page: Page, scrollerSelector: string): Promise<string> {
  return page.evaluate((selector) => {
    const scroller = document.querySelector<HTMLElement>(selector);
    if (!scroller) throw new Error(`no scroller ${selector}`);
    const bounds = scroller.getBoundingClientRect();
    const cards = [...scroller.querySelectorAll<HTMLElement>('[data-flip-id]')];
    const card = cards.find(candidate => {
      const rect = candidate.getBoundingClientRect();
      return rect.height > 24 && rect.top > bounds.top + 24 && rect.bottom < bounds.bottom - 24;
    });
    if (!card) throw new Error('no card fully inside the feed viewport');
    return card.dataset.flipId!;
  }, scrollerSelector);
}

async function atBottom(list: Locator) {
  await expect
    .poll(() => list.evaluate(el => el.scrollTop + el.clientHeight >= el.scrollHeight - 2))
    .toBe(true);
}

test('the feed follows the finger at either end and opens search only on release', async ({ page }) => {
  const list = await openInboxFeed(page);
  const surface = page.locator(FEED_SURFACE);
  const hint = page.locator(FEED_HINT);
  const searchInput = page.locator(SEARCH_INPUT);
  const cdp = await page.context().newCDPSession(page);

  await atBottom(list);
  await expect(surface).toBeAttached({ timeout: 15000 });
  const scrollerBox = await boxOf(list);
  const x = Math.round(scrollerBox.x + scrollerBox.width / 2);
  const startY = Math.round(scrollerBox.y + scrollerBox.height * 0.72);

  const cardId = await visibleCardId(page, FEED_SCROLLER);
  const card = page.locator(`[data-flip-id="${cardId}"]`);

  // 1. A short pull stays under the threshold: it cancels, the list glides back, search stays shut.
  const shortCard = await boxOf(card);
  const shortSurface = await boxOf(surface);
  await drag(cdp, x, startY, -90);
  await expect(hint).toBeVisible();
  await expect.poll(async () => Number(await hint.getAttribute('data-pull-px'))).toBeGreaterThan(0);
  expect(await opacityOf(hint)).toBeLessThan(1);
  await touchEnd(cdp);
  await expect(hint).toHaveCount(0, { timeout: 2000 });
  await expect(searchInput).toHaveCount(0);
  await expect.poll(async () => (await boxOf(card)).y).toBeCloseTo(shortCard.y, 0);
  expectSameBox(await boxOf(surface), shortSurface, 'surface after a cancelled pull');
  expectSameBox(await boxOf(list), scrollerBox, 'scroller after a cancelled pull');

  // 2. A real pull: the surface moves the whole way, the hint fades in progressively, and the
  //    search only appears after the finger goes up.
  const cardBefore = await boxOf(card);
  const surfaceBefore = await boxOf(surface);

  await touchStart(cdp, x, startY);
  for (let step = 1; step <= 2; step += 1) {
    await touchMoveTo(cdp, x, startY - Math.round(40 * step / 2));
  }
  await expect(hint).toBeVisible();
  await expect.poll(async () => Number(await hint.getAttribute('data-pull-px'))).toBeGreaterThan(10);
  const earlyOpacity = await opacityOf(hint);
  const earlyCard = await boxOf(card);
  expect(earlyCard.y).toBeLessThan(cardBefore.y - 8);

  for (let step = 3; step <= 10; step += 1) {
    await touchMoveTo(cdp, x, startY - Math.round(160 * step / 10));
  }
  await expect.poll(async () => Number(await hint.getAttribute('data-pull-px'))).toBeGreaterThanOrEqual(64);
  const lateOpacity = await opacityOf(hint);
  const pullPx = Number(await hint.getAttribute('data-pull-px'));
  expect(lateOpacity).toBeGreaterThan(earlyOpacity);
  expect(lateOpacity).toBeGreaterThan(0.9);
  expect(await hint.getAttribute('data-pull-side')).toBe('bottom');

  const cardDuring = await boxOf(card);
  const surfaceDuring = await boxOf(surface);
  expect(cardBefore.y - cardDuring.y).toBeGreaterThan(60);
  expect(surfaceBefore.y - surfaceDuring.y).toBeCloseTo(pullPx, 0);
  expectSameBox(await boxOf(list), scrollerBox, 'scroller during a bottom pull');
  // Nothing opens while the finger is still down, even past the threshold.
  await expect(searchInput).toHaveCount(0);
  await page.screenshot({ path: 'test-results/screenshots/feed-pull-search-bottom.png' });

  await touchEnd(cdp);
  await expect(searchInput).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/screenshots/feed-pull-search-open.png' });
  await page.getByRole('button', { name: 'Закрыть поиск' }).click();
  await expect(searchInput).toHaveCount(0);

  // 3. A cancelled strong pull must not leak into the tap that follows it, and the gesture must
  //    not stay latched: the next pull still opens search.
  await atBottom(list);
  await drag(cdp, x, startY, -160);
  await expect.poll(async () => Number(await hint.getAttribute('data-pull-px'))).toBeGreaterThanOrEqual(64);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  // Tap in the scroller's side padding while it returns, not on a note that opens an editor.
  const tapX = Math.round(scrollerBox.x + 4);
  const tapY = Math.round(scrollerBox.y + scrollerBox.height / 2);
  expect(await list.evaluate((el, point) => document.elementFromPoint(point.x, point.y) === el, { x: tapX, y: tapY })).toBe(true);
  await touchStart(cdp, tapX, tapY);
  await touchEnd(cdp);
  await expect(hint).toHaveCount(0);
  await expect(searchInput).toHaveCount(0);
  await atBottom(list);

  await drag(cdp, x, startY, -160);
  await expect.poll(async () => Number(await hint.getAttribute('data-pull-px'))).toBeGreaterThanOrEqual(64);
  await touchEnd(cdp);
  await expect(searchInput).toBeVisible({ timeout: 5000 });
  await page.getByRole('button', { name: 'Закрыть поиск' }).click();
  await expect(searchInput).toHaveCount(0);

  // 4. Reduced motion: the short pull returns immediately instead of gliding.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(hint).toHaveCount(0);
  await atBottom(list);
  const reducedCard = await boxOf(card);
  await drag(cdp, x, startY, -90);
  await expect(hint).toBeVisible();
  await touchEnd(cdp);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(hint).toHaveCount(0);
  await expect(searchInput).toHaveCount(0);
  await expect.poll(async () => (await boxOf(card)).y).toBeCloseTo(reducedCard.y, 0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  // 5. The oldest end works the same way and moves the list down instead of up.
  await list.evaluate(el => { el.scrollTop = 0; });
  await expect.poll(() => list.evaluate(el => el.scrollTop)).toBeLessThanOrEqual(2);
  await page.waitForTimeout(300);
  const topCardId = await visibleCardId(page, FEED_SCROLLER);
  const topCard = page.locator(`[data-flip-id="${topCardId}"]`);
  const cardAtTop = await boxOf(topCard);
  const surfaceAtTop = await boxOf(surface);
  const topStartY = Math.round(scrollerBox.y + scrollerBox.height * 0.3);

  await drag(cdp, x, topStartY, 160);
  await expect.poll(async () => Number(await hint.getAttribute('data-pull-px'))).toBeGreaterThanOrEqual(64);
  expect(await hint.getAttribute('data-pull-side')).toBe('top');
  const cardAtTopDuring = await boxOf(topCard);
  const surfaceAtTopDuring = await boxOf(surface);
  expect(cardAtTopDuring.y - cardAtTop.y).toBeGreaterThan(60);
  expect(surfaceAtTopDuring.y - surfaceAtTop.y).toBeCloseTo(Number(await hint.getAttribute('data-pull-px')), 0);
  expectSameBox(await boxOf(list), scrollerBox, 'scroller during a top pull');
  await expect(searchInput).toHaveCount(0);
  await page.screenshot({ path: 'test-results/screenshots/feed-pull-search-top.png' });
  await touchEnd(cdp);
  await expect(searchInput).toBeVisible({ timeout: 5000 });
});

test('the root folder list pulls down to search and keeps its header button', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const list = page.locator(FOLDER_SCROLLER);
  await expect(list).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(600);

  const surface = page.locator(FOLDER_SURFACE);
  const hint = page.locator(FOLDER_HINT);
  const searchInput = page.locator(SEARCH_INPUT);
  const searchButton = page.getByRole('button', { name: 'Поиск', exact: true });
  await expect(searchButton).toBeVisible();

  const scrollerBox = await boxOf(list);
  const x = Math.round(scrollerBox.x + scrollerBox.width / 2);
  const startY = Math.round(scrollerBox.y + Math.min(120, scrollerBox.height * 0.3));
  const inbox = page.locator('button', { hasText: 'Входящие' }).first();
  const cdp = await page.context().newCDPSession(page);

  // 1. Short pull: cancel and settle back, no search.
  const inboxBefore = await boxOf(inbox);
  const surfaceBefore = await boxOf(surface);
  await drag(cdp, x, startY, 90);
  await expect(hint).toBeVisible();
  await expect.poll(async () => Number(await hint.getAttribute('data-pull-px'))).toBeGreaterThan(0);
  expect(await opacityOf(hint)).toBeLessThan(1);
  await touchEnd(cdp);
  await expect(hint).toHaveCount(0, { timeout: 2500 });
  await expect(searchInput).toHaveCount(0);
  await expect.poll(async () => (await boxOf(inbox)).y).toBeCloseTo(inboxBefore.y, 0);
  expectSameBox(await boxOf(surface), surfaceBefore, 'folder surface after a cancelled pull');
  expectSameBox(await boxOf(list), scrollerBox, 'folder scroller after a cancelled pull');

  // 2. Full pull: the rows move with the finger, the hint fades in, release opens the search.
  const inboxTop = await boxOf(inbox);
  const folderSurfaceTop = await boxOf(surface);
  await touchStart(cdp, x, startY);
  for (let step = 1; step <= 2; step += 1) {
    await touchMoveTo(cdp, x, startY + Math.round(40 * step / 2));
  }
  await expect(hint).toBeVisible();
  await expect.poll(async () => Number(await hint.getAttribute('data-pull-px'))).toBeGreaterThan(10);
  const earlyOpacity = await opacityOf(hint);
  for (let step = 3; step <= 10; step += 1) {
    await touchMoveTo(cdp, x, startY + Math.round(160 * step / 10));
  }
  await expect.poll(async () => Number(await hint.getAttribute('data-pull-px'))).toBeGreaterThanOrEqual(64);
  const pullPx = Number(await hint.getAttribute('data-pull-px'));
  const lateOpacity = await opacityOf(hint);
  expect(lateOpacity).toBeGreaterThan(earlyOpacity);
  expect(lateOpacity).toBeGreaterThan(0.9);
  expect(await hint.getAttribute('data-pull-side')).toBe('top');
  const inboxDuring = await boxOf(inbox);
  const folderSurfaceDuring = await boxOf(surface);
  expect(inboxDuring.y - inboxTop.y).toBeGreaterThan(60);
  expect(folderSurfaceDuring.y - folderSurfaceTop.y).toBeCloseTo(pullPx, 0);
  expectSameBox(await boxOf(list), scrollerBox, 'folder scroller during a pull');
  await expect(searchInput).toHaveCount(0);
  await page.screenshot({ path: 'test-results/screenshots/folders-pull-search.png' });

  await touchEnd(cdp);
  await expect(searchInput).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole('dialog', { name: 'Поиск' })).toBeVisible(); // the existing search surface
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/screenshots/folders-pull-search-open.png' });
  await page.getByRole('button', { name: 'Закрыть поиск' }).click();
  await expect(searchButton).toBeVisible();

  // 3. A horizontal drag is not a pull.
  const afterSearch = await boxOf(surface);
  await drag(cdp, x, startY, 0, 1);
  await touchMoveTo(cdp, x - 120, startY + 10);
  await touchEnd(cdp);
  await page.waitForTimeout(300);
  await expect(hint).toHaveCount(0);
  await expect(searchInput).toHaveCount(0);
  expectSameBox(await boxOf(surface), afterSearch, 'folder surface after a horizontal drag');
});

test('a scrollable folder root keeps its scroll geometry while pulled', async ({ page }) => {
  // Short screen, same folder set: the root list overflows, so the clip wrapper inside the
  // scroller must keep scrollHeight tied to the content while only the surface translates.
  await page.setViewportSize({ width: 390, height: 360 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const list = page.locator(FOLDER_SCROLLER);
  await expect(list).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(600);
  const surface = page.locator(FOLDER_SURFACE);
  const searchInput = page.locator(SEARCH_INPUT);
  const hint = page.locator(FOLDER_HINT);

  const metrics = () => list.evaluate(el => ({
    scrollTop: el.scrollTop,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  const initial = await metrics();
  expect(initial.scrollHeight).toBeGreaterThan(initial.clientHeight + 40);

  const scrollerBox = await boxOf(list);
  const surfaceBefore = await boxOf(surface);
  const x = Math.round(scrollerBox.x + scrollerBox.width / 2);
  const startY = Math.round(scrollerBox.y + Math.min(100, scrollerBox.height * 0.3));
  const cdp = await page.context().newCDPSession(page);

  await drag(cdp, x, startY, 160);
  await expect.poll(async () => Number(await hint.getAttribute('data-pull-px'))).toBeGreaterThanOrEqual(64);
  const during = await metrics();
  const pullPx = Number(await hint.getAttribute('data-pull-px'));
  expect(during.scrollTop).toBe(0);
  expect(during.scrollHeight).toBe(initial.scrollHeight);
  expect(during.clientHeight).toBe(initial.clientHeight);
  expect((await boxOf(surface)).y - surfaceBefore.y).toBeCloseTo(pullPx, 0);
  expectSameBox(await boxOf(list), scrollerBox, 'folder scroller on a scrollable root');
  await expect(searchInput).toHaveCount(0);

  // This pull intentionally exceeds the threshold; cancel it to check geometry without opening search.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(hint).toHaveCount(0, { timeout: 2500 });
  await expect(searchInput).toHaveCount(0);
  await expect.poll(async () => (await boxOf(surface)).y).toBeCloseTo(surfaceBefore.y, 0);
});
