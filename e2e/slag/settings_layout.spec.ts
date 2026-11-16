import { test, expect } from '@playwright/test';

/**
 * B10: settings did not fit the dialog and got cut on the right edge.
 *
 * The pane is a column of flex boxes; without `min-w-0` each one refused to shrink below its
 * content, so a long value pushed the pane past the modal frame and the dialog clipped it.
 * The manifest address is the longest string on the screen, so it stands in for any value here:
 * it must end inside the frame with an ellipsis instead of running under the edge.
 *
 * Both tabs from the report are covered: «Обновления» and «Хранилище & Бэкап».
 */

const MANIFEST = 'https://github.com/wssdozh/slag-v2/releases/download/latest/latest.json';

const overflow = (page: import('@playwright/test').Page, tab: string) =>
  page.evaluate((name) => {
    const dialog = document.querySelector('[role="dialog"]');
    const frame = dialog?.firstElementChild as HTMLElement | null;
    const row = frame?.querySelector('.flex.flex-1.min-h-0') as HTMLElement | null;
    const pane = row?.lastElementChild as HTMLElement | null;
    const tabPane = pane?.lastElementChild as HTMLElement | null;
    const frameRight = frame ? frame.getBoundingClientRect().right : 0;
    let widestRight = 0;
    if (frame) {
      for (const el of Array.from(frame.querySelectorAll('*'))) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.right > widestRight) widestRight = rect.right;
      }
    }
    return {
      tab: name,
      doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      row: row ? row.scrollWidth - row.clientWidth : 0,
      pane: pane ? pane.scrollWidth - pane.clientWidth : 0,
      tabPane: tabPane ? tabPane.scrollWidth - tabPane.clientWidth : 0,
      pastFrame: Math.round(widestRight - frameRight),
    };
  }, tab);

for (const width of [900, 1280]) {
  test(`settings fit the dialog at ${width}px: updates and vault`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('sidebar-settings-btn').click();
    const scope = page.locator('.fixed.z-50').filter({ has: page.locator('[data-tab="vault"]') });
    await scope.waitFor({ timeout: 20000 });

    for (const tab of ['updates', 'vault']) {
      await scope.locator(`[data-tab="${tab}"]`).click();
      await page.waitForTimeout(350);
      const report = await overflow(page, tab);
      // Nothing leaves the dialog frame, and no box inside it scrolls sideways.
      expect(report.pastFrame, `${tab}: something sticks out of the dialog`).toBeLessThanOrEqual(1);
      expect(report.doc, `${tab}: the page scrolls sideways`).toBeLessThanOrEqual(0);
      expect(report.row, `${tab}: the settings row overflows`).toBeLessThanOrEqual(1);
      expect(report.pane, `${tab}: the settings pane overflows`).toBeLessThanOrEqual(1);
      expect(report.tabPane, `${tab}: the tab body overflows`).toBeLessThanOrEqual(1);
    }

    // The desktop app shows a real manifest URL; the browser has none. Painting it in proves
    // the longest value the tab can carry still ends inside the card, cut by an ellipsis.
    await scope.locator('[data-tab="updates"]').click();
    const endpoint = page.getByTestId('update-endpoint');
    await endpoint.waitFor({ timeout: 15000 });
    await endpoint.evaluate((el, url) => {
      el.textContent = url;
    }, MANIFEST);
    const shot = await endpoint.evaluate((el) => {
      const frame = document.querySelector('[role="dialog"]')?.firstElementChild as HTMLElement;
      const rect = el.getBoundingClientRect();
      return {
        right: Math.round(rect.right),
        frameRight: Math.round(frame.getBoundingClientRect().right),
        cut: el.scrollWidth > el.clientWidth,
        textOverflow: getComputedStyle(el).textOverflow,
      };
    });
    expect(shot.right).toBeLessThanOrEqual(shot.frameRight);
    expect(shot.cut, 'the manifest address is not clipped').toBe(true);
    expect(shot.textOverflow).toBe('ellipsis');

    await page.screenshot({ path: `test-results/screenshots/settings-updates-${width}.png` });
  });
}
