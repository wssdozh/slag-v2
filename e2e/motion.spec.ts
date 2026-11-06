import { test, expect } from './support/selfhostFixture';

async function openSettings(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByTestId('sidebar-settings-btn').click();
  const modal = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Настройки', exact: true }) });
  await expect(modal).toHaveAttribute('data-motion-state', 'open');
  return modal;
}

test('shared modal exits before unmount and becomes inert immediately', async ({ page }) => {
  const modal = await openSettings(page);
  const result = await modal.evaluate(element => {
    return new Promise<{ inert: boolean; phase: string | undefined }>(resolve => {
      const observer = new MutationObserver(() => {
        if (element.getAttribute('data-motion-state') === 'exiting') {
          observer.disconnect();
          resolve({ inert: (element as HTMLElement).inert, phase: (element as HTMLElement).dataset.motionState });
        }
      });
      observer.observe(element, { attributes: true });
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
  });
  expect(result).toEqual({ inert: true, phase: 'exiting' });
  await expect(page.locator('[data-motion-state="exiting"]')).toHaveCount(0);
});

test('rapid reopen retains the modal and child transitions cannot close it', async ({ page }) => {
  const modal = await openSettings(page);
  await modal.evaluate(element => {
    const observer = new MutationObserver(() => {
      if (element.getAttribute('data-motion-state') === 'exiting') {
        observer.disconnect();
        document.querySelector<HTMLButtonElement>('[data-testid="sidebar-settings-btn"]')!.click();
      }
    });
    observer.observe(element, { attributes: true });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  await expect(modal).toHaveAttribute('data-motion-state', 'open');
  await modal.locator('.motion-dialog').evaluate(child => {
    child.dispatchEvent(new TransitionEvent('transitionend', { bubbles: true, propertyName: 'opacity' }));
  });
  await expect(modal).toBeVisible();
  await expect(modal).not.toHaveAttribute('inert', '');
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
});

test('reduced motion keeps a short fade without spatial movement and cleans up', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const modal = await openSettings(page);
  const style = await modal.locator('.motion-dialog').evaluate(element => {
    const css = getComputedStyle(element);
    return { scale: css.scale, translate: css.translate, duration: css.transitionDuration };
  });
  expect(style).toEqual({ scale: 'none', translate: 'none', duration: '0.1s' });
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
});
