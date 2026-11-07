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

  // A real pointer click on a control inside the toast must not be eaten by the
  // drag handler: unknown intent means no pointer capture.
  await card.locator('button[aria-label="Изменить статус таски"]').click();
  const second = page.getByTestId('toast').filter({ hasText: 'Таска возобновлена' });
  await expect(second).toBeVisible();
  await second.getByRole('button', { name: 'Закрыть уведомление' }).click();
  await expect(second).toHaveCount(0);
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

test('the editor unfolds out of the card it was opened from', async ({ page }) => {
  await page.goto('/');
  await page.locator('button', { hasText: /Заметка|Таска|Статья/ }).first().click();
  await page.locator('button', { hasText: 'Статья' }).click();
  const title = 'Статья ' + Date.now();
  await page.locator('main textarea').fill(title);
  await page.locator('button[title*="Отправить"]').click();

  const card = page.locator('[data-flip-id]', { hasText: title });
  await expect(card).toBeVisible();
  await card.locator('h3').click();

  const editor = page.getByTestId('fullscreen-editor-modal');
  await expect(editor).toBeVisible();
  await expect.poll(
    () => editor.evaluate(element => element.getAnimations().filter(animation =>
      animation.effect instanceof KeyframeEffect &&
      animation.effect.getKeyframes().some(keyframe => String(keyframe.clipPath ?? '').includes('inset'))
    ).length),
    { intervals: [30, 30, 50, 50, 100], timeout: 4000 },
  ).toBeGreaterThan(0);

  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/screenshots/motion_editor_open.png' });
});

test('a kanban card glides to its new column, and reduced motion skips it', async ({ page }) => {
  await page.goto('/');
  await page.addStyleTag({ content: ':root { --slag-motion-slow: 2000ms; }' });
  await page.locator('header button[aria-label="Вид и фильтры папки"]').first().click();
  const viewModal = page.locator('[role="dialog"][aria-label="Вид и фильтры"]');
  await viewModal.locator('button', { hasText: 'Канбан' }).click();
  await page.keyboard.press('Escape');
  await expect(viewModal).not.toBeVisible();

  await page.locator('[data-testid="kanban-column-todo"] button[title="Добавить таску в К выполнению"]').first().click();
  const input = page.locator('[placeholder*="Название таски"]');
  const title = 'Глайд ' + Date.now();
  await input.fill(title);
  await input.press('Enter');

  const card = page.locator('[data-testid="kanban-card"]', { hasText: title });
  await expect(card).toBeVisible();
  await card.locator('button[title="Сменить статус задачи"]').click();
  await card.getByRole('button', { name: 'В работе', exact: true }).click();

  const glided = () => page.locator('[data-testid="kanban-card"]', { hasText: title }).evaluate(element =>
    element.getAnimations().some(animation =>
      animation.effect instanceof KeyframeEffect &&
      animation.effect.getKeyframes().some(keyframe => String(keyframe.transform ?? '').includes('translate'))
    )
  );
  await expect.poll(glided, { intervals: [30, 30, 50, 100], timeout: 4000 }).toBe(true);

  // With reduced motion the card simply appears in the new column.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await card.locator('button[title="Сменить статус задачи"]').click();
  await card.getByRole('button', { name: 'К выполнению', exact: true }).click();
  await expect(card).toBeVisible();
  const still = await card.evaluate(element => element.getAnimations().length);
  expect(still).toBe(0);
  await page.screenshot({ path: 'test-results/screenshots/motion_kanban.png' });
});

test('search results cascade for the first batch, then stop animating', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });
  await page.keyboard.press('Control+f');
  const input = page.locator('input[placeholder*="Поиск по заметкам"]');
  await expect(input).toBeVisible();
  await input.fill('и');

  const list = page.locator('.motion-stagger');
  const rows = list.locator('> *');
  await expect(rows.first()).toBeVisible();
  await expect(list).toHaveAttribute('data-stagger', 'true');

  const delays = await rows.evaluateAll(elements =>
    elements.slice(0, 7).map(element => getComputedStyle(element).animationDelay),
  );
  expect(delays[0]).toBe('0s');
  expect(delays.length).toBeGreaterThan(1);
  expect(delays[1]).toBe('0.014s');
  expect(delays[delays.length - 1]).toBe(`${Math.min(delays.length - 1, 6) * 0.014}s`);

  await expect(list).not.toHaveAttribute('data-stagger', 'true', { timeout: 3000 });
  await page.screenshot({ path: 'test-results/screenshots/motion_search_stagger.png' });
});

test('switching vaults cross-fades where the browser supports it', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('slag_vaults_v2', JSON.stringify([
      { id: 'default_vault', name: 'main', mode: 'indexeddb' },
      { id: 'vault_two', name: 'второе', mode: 'indexeddb' },
    ]));
    const doc = document as any;
    const original = doc.startViewTransition?.bind(document);
    (window as any).__vt = 0;
    doc.startViewTransition = (callback: () => void) => {
      (window as any).__vt += 1;
      return original?.(callback);
    };
  });
  await page.goto('/');
  await page.locator('aside button', { hasText: 'main' }).first().click();
  await page.getByRole('button', { name: 'второе' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__vt)).toBeGreaterThan(0);
  await expect(page.getByTestId('toast').filter({ hasText: 'Хранилище переключено' })).toBeVisible();
});

test('a browser without view transitions still switches vaults', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('slag_vaults_v2', JSON.stringify([
      { id: 'default_vault', name: 'main', mode: 'indexeddb' },
      { id: 'vault_two', name: 'второе', mode: 'indexeddb' },
    ]));
    delete (Document.prototype as any).startViewTransition;
  });
  await page.goto('/');
  await page.locator('aside button', { hasText: 'main' }).first().click();
  await page.getByRole('button', { name: 'второе' }).click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Хранилище переключено' })).toBeVisible();
  // The switcher now fades instead of vanishing, so the name is briefly in the
  // sidebar and in the menu that is leaving. The overlay must clear on its own.
  await expect(page.locator('[data-motion-state="exiting"]')).toHaveCount(0);
  await expect(page.locator('aside button', { hasText: 'второе' })).toHaveCount(1);
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

test('a closing dialog keeps its whole exit instead of blinking out', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('sidebar-settings-btn').click();
  const modal = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Настройки', exact: true }) });
  await expect(modal).toHaveAttribute('data-motion-state', 'open');

  const exit = modal.evaluate(element => new Promise<{ duration: number; alive: boolean }>(resolve => {
    const observer = new MutationObserver(() => {
      if (element.getAttribute('data-motion-state') !== 'exiting') return;
      observer.disconnect();
      const duration = getComputedStyle(element).transitionDuration;
      window.setTimeout(() => resolve({
        duration: parseFloat(duration) * (duration.trim().endsWith('ms') ? 1 : 1000),
        alive: document.body.contains(element),
      }), 100);
    });
    observer.observe(element, { attributes: true, attributeFilter: ['data-motion-state'] });
  }));

  await modal.getByRole('button', { name: 'Закрыть' }).first().click();
  const result = await exit;
  // The exit is shorter than the entrance, but it is not a blink: 100ms is gone
  // before the eye reads it, so the surface would look pulled out from under.
  expect(result.duration).toBeGreaterThanOrEqual(150);
  expect(result.alive).toBe(true);
});

test('closing the editor collapses it back into the card instead of unmounting', async ({ page }) => {
  await page.goto('/');
  await page.locator('button', { hasText: /Заметка|Таска|Статья/ }).first().click();
  await page.locator('button', { hasText: 'Статья' }).click();
  const title = 'Статья ' + Date.now();
  await page.locator('main textarea').fill(title);
  await page.locator('button[title*="Отправить"]').click();

  const card = page.locator('[data-flip-id]', { hasText: title });
  await expect(card).toBeVisible();
  await card.locator('h3').click();
  const editor = page.getByTestId('fullscreen-editor-modal');
  await expect(editor).toBeVisible();
  await page.waitForTimeout(400);

  const exit = await editor.evaluate(element => new Promise<{ aliveMs: number; collapsed: boolean }>(resolve => {
    // The screen itself has no transition: it only holds the window in which the
    // child can play the collapse, so a missing hold means an instant unmount.
    const host = element.closest('.motion-presence-hold');
    const started = performance.now();
    let collapsed = false;
    const tick = () => {
      collapsed = collapsed || element.getAnimations().some(animation =>
        animation.playState === 'running' &&
        animation.effect instanceof KeyframeEffect &&
        animation.effect.getKeyframes().some(keyframe => String(keyframe.clipPath ?? '').includes('inset')));
      const alive = host?.isConnected ?? false;
      if (!alive) {
        resolve({ aliveMs: Math.round(performance.now() - started), collapsed });
        return;
      }
      if (performance.now() - started > 1200) {
        resolve({ aliveMs: -1, collapsed });
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }));

  expect(exit.collapsed).toBe(true);
  expect(exit.aliveMs).toBeGreaterThanOrEqual(150);
});

test('the editor slides in when it has no card to unfold from', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });
  await page.locator('main textarea').first().fill('Выезд ' + Date.now());
  await page.locator('button[aria-label="Раскрыть в полноэкранный редактор"]').first().click();

  const editor = page.getByTestId('fullscreen-editor-modal');
  await expect(editor).toBeVisible();
  // Opened from the composer there is no `data-flip-id` to unfold out of, and the
  // editor used to appear with no motion at all.
  const travelled = await editor.evaluate(element => element.getAnimations().some(animation =>
    animation.effect instanceof KeyframeEffect &&
    animation.effect.getKeyframes().some(keyframe => String(keyframe.transform ?? '').includes('translateY'))));
  expect(travelled).toBe(true);
});

test.describe('the composer on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('offers the fullscreen editor button', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header').first()).toBeVisible({ timeout: 15000 });
    await page.locator('button', { hasText: 'Входящие' }).first().click();
    await expect(page.locator('button[aria-label="Раскрыть в полноэкранный редактор"]').first()).toBeVisible();
  });
});
