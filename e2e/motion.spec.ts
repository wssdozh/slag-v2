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

test('a toast holds under the cursor, snaps back, then leaves by swipe', async ({ page }) => {
  await page.goto('/');
  const card = await createTask(page, 'Тост ' + Date.now());
  await card.locator('button[aria-label="Изменить статус таски"]').click();

  const toast = page.getByTestId('toast').filter({ hasText: 'Таска выполнена' });
  await expect(toast).toBeVisible();

  await page.screenshot({ path: 'test-results/screenshots/motion_toast.png' });

  // The auto-dismiss timer must wait while the cursor is on the card.
  await toast.hover();
  await page.waitForTimeout(3200);
  await expect(toast).toBeVisible();

  const box = (await toast.boundingBox())!;
  const centreX = box.x + box.width / 2;
  const centreY = box.y + box.height / 2;

  // A short drag is not a decision yet: it has to come back.
  await page.mouse.move(centreX, centreY);
  await page.mouse.down();
  await page.mouse.move(centreX, centreY - 8);
  await page.mouse.up();
  await page.waitForTimeout(300);
  await expect(toast).toBeVisible();

  // A flick upwards is a decision.
  await page.mouse.move(centreX, centreY);
  await page.mouse.down();
  for (let step = 1; step <= 6; step += 1) {
    await page.mouse.move(centreX, centreY - step * 14);
  }
  await page.mouse.up();
  await expect(toast).toHaveCount(0);
});

test('a closed toast leaves through its exit state before unmounting', async ({ page }) => {
  await page.goto('/');
  const card = await createTask(page, 'Тост выход ' + Date.now());
  await card.locator('button[aria-label="Изменить статус таски"]').click();

  const toast = page.getByTestId('toast').filter({ hasText: 'Таска выполнена' });
  await expect(toast).toBeVisible();
  const state = await toast.evaluate(element => new Promise<{ phase: string; connected: boolean }>(resolve => {
    const observer = new MutationObserver(() => {
      if (element.getAttribute('data-motion-state') === 'exiting') {
        observer.disconnect();
        resolve({ phase: 'exiting', connected: element.isConnected });
      }
    });
    observer.observe(element, { attributes: true });
    element.querySelector<HTMLButtonElement>('button[aria-label="Закрыть уведомление"]')!.click();
  }));
  expect(state).toEqual({ phase: 'exiting', connected: true });
  await expect(toast).toHaveCount(0);
});

test('a fresh note lands, and the list settles when one is deleted', async ({ page }) => {
  await page.goto('/');
  await page.addStyleTag({ content: ':root { --slag-motion-slow: 2000ms; }' });

  const text = 'Лента ' + Date.now();
  await page.locator('main textarea').fill(text);
  await page.locator('main textarea').press('Enter');
  const created = page.locator('[data-flip-id]', { hasText: text });
  await expect(created).toBeVisible();
  await expect.poll(() => created.evaluate(el => el.getAnimations().length)).toBeGreaterThan(0);

  const cards = page.locator('[data-flip-id]');
  const count = await cards.count();
  const neighbourId = await cards.nth(1).getAttribute('data-flip-id');
  await cards.first().click({ button: 'right' });
  await page.locator('.fixed.z-50').getByRole('button', { name: 'Удалить' }).click();
  await expect(cards).toHaveCount(count - 1);

  // The neighbour travels from its old spot instead of teleporting.
  const travelled = await page.evaluate(id => {
    const element = document.querySelector(`[data-flip-id="${id}"]`);
    return element?.getAnimations().some(animation =>
      animation.effect instanceof KeyframeEffect &&
      animation.effect.getKeyframes().some(keyframe => String(keyframe.transform ?? '').includes('translate'))
    ) ?? false;
  }, neighbourId);
  expect(travelled).toBe(true);
});

test('the inbox counter pops when its number changes', async ({ page }) => {
  await page.goto('/');
  await page.addStyleTag({ content: ':root { --slag-motion-slow: 2000ms; }' });
  const badge = page.getByTestId('inbox-count');
  await expect(badge).toBeVisible();
  const before = (await badge.innerText()).trim();

  await createTask(page, 'Счётчик ' + Date.now());
  await expect(badge).not.toHaveText(before);
  const running = await badge.evaluate(el => el.getAnimations().filter(animation => animation.playState === 'running').length);
  expect(running).toBeGreaterThan(0);

  await page.locator('aside').first().screenshot({ path: 'test-results/screenshots/motion_count.png' });
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
