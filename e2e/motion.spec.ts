import { test, expect } from './support/selfhostFixture';

async function openSettings(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByTestId('sidebar-settings-btn').click();
  const modal = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Настройки', exact: true }) });
  await expect(modal).toHaveAttribute('data-motion-state', 'open');
  return modal;
}

async function createTask(page: import('@playwright/test').Page, title: string) {
  const typeDropdownButton = page.locator('button', { hasText: /Заметка|Таска|Статья/ }).first();
  await typeDropdownButton.click();
  await page.locator('button', { hasText: 'Таска' }).click();
  await page.locator('main textarea').fill(title);
  await page.locator('button[title*="Отправить"]').click();
  const card = page.locator('.group', { hasText: title });
  await expect(card).toBeVisible();
  return card;
}

test('task completion draws the check, and reduced motion paints it at once', async ({ page }) => {
  await page.goto('/');
  // Slow the shared scale down so the draw can be measured instead of raced.
  await page.addStyleTag({ content: ':root { --slag-motion-slow: 2000ms; }' });
  const card = await createTask(page, 'Проверка галочки ' + Date.now());
  const toggle = card.locator('button[aria-label="Изменить статус таски"]');

  await toggle.click();
  const path = card.locator('path.motion-check');
  await expect(path).toHaveAttribute('pathLength', '1');
  const before = await path.evaluate(el => parseFloat(getComputedStyle(el).strokeDashoffset));
  await page.waitForTimeout(400);
  const after = await path.evaluate(el => parseFloat(getComputedStyle(el).strokeDashoffset));
  expect(after).toBeLessThan(before);

  // Back to todo, then complete again with reduced motion: nothing to interpolate.
  await toggle.click();
  await expect(card.locator('h3')).not.toHaveClass(/line-through/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await toggle.click();
  const still = await card.locator('svg.text-success').evaluate(el => {
    const drawn = el.querySelector('path.motion-check');
    const ring = el.querySelector('.motion-check-ring');
    return {
      animations: el.getAnimations().length + (drawn?.getAnimations().length ?? 0) + (ring?.getAnimations().length ?? 0),
      dash: getComputedStyle(drawn!).strokeDasharray,
      offset: getComputedStyle(drawn!).strokeDashoffset,
    };
  });
  expect(still).toEqual({ animations: 0, dash: 'none', offset: '0px' });
  await card.screenshot({ path: 'test-results/screenshots/motion_check_draw.png' });
});

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
