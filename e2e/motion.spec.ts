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
  const title = 'Тост выход ' + Date.now();
  const card = await createTask(page, title);
  await card.locator('button[aria-label="Изменить статус таски"]').click();

  const toast = page.getByTestId('toast').filter({ hasText: 'Таска выполнена' });
  await expect(toast).toBeVisible();
  // A plain success toast has no controls of its own: it closes on its own timer.
  // Move off the card first, or hovering holds that timer.
  await page.mouse.move(4, 4);
  const state = await toast.evaluate(element => new Promise<{ phase: string; connected: boolean }>(resolve => {
    const observer = new MutationObserver(() => {
      if (element.getAttribute('data-motion-state') === 'exiting') {
        observer.disconnect();
        resolve({ phase: 'exiting', connected: element.isConnected });
      }
    });
    observer.observe(element, { attributes: true });
  }));
  expect(state).toEqual({ phase: 'exiting', connected: true });
  await expect(toast).toHaveCount(0);

  // A real pointer click on a control inside the toast must not be eaten by the
  // drag handler: unknown intent means no pointer capture. The trash toast is the
  // one that carries an action, so its "Вернуть" button is that control.
  await card.click({ button: 'right' });
  await page.locator('.fixed.z-50').getByRole('button', { name: 'Удалить' }).click();

  const trashToast = page.getByTestId('toast').filter({ hasText: 'Запись в корзине' });
  await expect(trashToast).toBeVisible();
  await trashToast.getByRole('button', { name: 'Вернуть' }).click();
  // The action ran: the note is back in the feed, and the toast left on its own.
  await expect(page.locator('.group', { hasText: title })).toBeVisible();
  await expect(trashToast).toHaveCount(0);
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

test('loading older notes keeps a visible card still from the first frame', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    const day = new Date().setHours(12, 0, 0, 0);
    localStorage.setItem('slag_items_default_vault', JSON.stringify(Array.from({ length: 45 }, (_, i) => ({
      id: `prepend-${i}`, type: 'note', folder: 'Входящие', title: '', content: `Запись ${i}\n\nИстория ленты`,
      createdAt: day + i * 60_000, updatedAt: day + i * 60_000, tags: [], attachments: [],
    }))));
  });
  await page.goto('/');
  await page.addStyleTag({ content: ':root { --slag-motion-slow: 1600ms; }' });
  const feed = page.getByTestId('feed-list-container');
  await expect(feed.locator('[data-flip-id]')).toHaveCount(15);

  const firstFrame = await feed.locator('#item-prepend-30').evaluate(async (card) => {
    const list = card.closest<HTMLElement>('[data-testid="feed-list-container"]')!;
    const top = () => card.getBoundingClientRect().top - list.getBoundingClientRect().top;
    list.scrollTop = 0;
    const before = top();
    const olderId = '#item-prepend-15';
    const deadline = performance.now() + 5000;
    while (!list.querySelector(olderId) && performance.now() < deadline) {
      await new Promise(requestAnimationFrame);
      // Initial bottom settling can run before the top sentinel's first notification.
      if (!list.querySelector(olderId) && list.scrollTop > 0) list.scrollTop = 0;
    }
    return {
      count: list.querySelectorAll('[data-flip-id]').length,
      shift: Math.abs(top() - before),
      animated: card.getAnimations().some(({ effect }) =>
        effect instanceof KeyframeEffect && effect.getKeyframes().some(frame => 'transform' in frame)),
    };
  });
  expect(firstFrame.count).toBe(30);
  expect(firstFrame.shift).toBeLessThanOrEqual(2);
  expect(firstFrame.animated).toBe(false);
  await page.screenshot({ path: 'test-results/screenshots/feed_prepend_no_jump.png' });
});

test('a sent note rises from the composer, and the cards above it do not jump', async ({ page }) => {
  await page.goto('/');
  // Long enough to read the start keyframe before the animation ends.
  await page.addStyleTag({ content: ':root { --slag-motion-slow: 1600ms; }' });
  const field = page.locator('.composer-surface textarea').first();
  await expect(field).toBeVisible();

  const before = await page.evaluate(() => {
    const feed = document.querySelector<HTMLElement>('[data-testid="feed-list-container"]')!;
    feed.scrollTop = feed.scrollHeight;
    const cards = Array.from(feed.querySelectorAll<HTMLElement>('[data-flip-id]'));
    const last = cards[cards.length - 1];
    const dock = document.querySelector<HTMLElement>('[data-testid="composer-dock"]')!;
    return {
      id: last.dataset.flipId,
      top: last.getBoundingClientRect().top,
      composerTop: dock.getBoundingClientRect().top,
    };
  });

  // Start keyframe of a card's first running animation, in px down from its slot.
  const startOffset = (id: string) => page.evaluate((flipId) => {
    const animation = document.querySelector<HTMLElement>(`[data-flip-id="${flipId}"]`)?.getAnimations()[0];
    if (!animation || !(animation.effect instanceof KeyframeEffect)) return null;
    const keyframe = animation.effect.getKeyframes()[0];
    const transform = String(keyframe?.transform ?? '');
    const values = transform.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    const translateY = transform.startsWith('translate(') ? values[1] ?? 0 : values[0] ?? 0;
    return { translateY, opacity: String(keyframe?.opacity ?? '') };
  }, id);

  await field.fill('Из композера ' + Date.now());
  await field.press('Enter');
  const lastId = () => page.locator('[data-flip-id]').last().getAttribute('data-flip-id');
  await expect.poll(lastId).not.toBe(before.id);
  const createdId = (await lastId())!;

  await expect.poll(() => startOffset(before.id), { timeout: 5000 }).not.toBeNull();
  const survivor = (await startOffset(before.id))!;
  // The first frame is the old screen position, so the list's own scroll is not motion.
  expect(survivor.translateY).toBeGreaterThan(1);

  await expect.poll(() => startOffset(createdId), { timeout: 5000 }).not.toBeNull();
  const entrance = (await startOffset(createdId))!;
  expect(entrance.opacity).toBe('0');
  expect(entrance.translateY).toBeGreaterThan(0);

  // Compare against the slot the card occupies right now, not after the animation:
  // a later settle must not change where the motion started.
  const slot = (id: string) => page.evaluate((flipId) => {
    const element = document.querySelector<HTMLElement>(`[data-flip-id="${flipId}"]`)!;
    const transform = getComputedStyle(element).transform;
    const offset = transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42;
    return element.getBoundingClientRect().top - offset;
  }, id);
  expect(Math.abs((await slot(before.id)) + survivor.translateY - before.top)).toBeLessThan(2);
  expect((await slot(createdId)) + entrance.translateY).toBeGreaterThanOrEqual(before.composerTop - 2);

  await page.waitForTimeout(1700);
  await page.screenshot({ path: 'test-results/screenshots/motion_note_from_composer.png' });
});

test('reduced motion lands a sent note without rising', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const field = page.locator('.composer-surface textarea').first();
  await expect(field).toBeVisible();

  const previousId = await page.locator('[data-flip-id]').last().getAttribute('data-flip-id');
  await field.fill('Без движения ' + Date.now());
  await field.press('Enter');
  await expect.poll(() => page.locator('[data-flip-id]').last().getAttribute('data-flip-id')).not.toBe(previousId);

  const running = await page.evaluate((id) => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-flip-id]'));
    const survivor = document.querySelector<HTMLElement>(`[data-flip-id="${id}"]`);
    return cards
      .filter((element) => element === survivor || element === cards[cards.length - 1])
      .flatMap((element) => element.getAnimations())
      .length;
  }, previousId);
  expect(running).toBe(0);
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
  await page.getByRole('button', { name: 'В работе', exact: true }).click();

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
  await page.getByRole('button', { name: 'К выполнению', exact: true }).click();
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

test('the inbox in the sidebar has no counter even with records', async ({ page }) => {
  await page.goto('/');
  const inbox = page.locator('aside button').filter({ hasText: 'Входящие' });
  await expect(inbox).toHaveText('Входящие', { timeout: 60_000 });
  const composer = page.locator('main textarea');
  await composer.fill('Заметка без счётчика');
  await page.locator('button[title*="Отправить"]').click();
  await expect(page.locator('[data-flip-id]').filter({ hasText: 'Заметка без счётчика' })).toBeVisible();
  await expect(inbox).toHaveText('Входящие');
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
  // No `data-flip-id` here, so the editor unfolds out of the composer box instead —
  // the same clip grow as from a card, not a plain appearance.
  const travelled = await editor.evaluate(element => element.getAnimations().some(animation =>
    animation.effect instanceof KeyframeEffect &&
    animation.effect.getKeyframes().some(keyframe => String(keyframe.clipPath ?? '').includes('inset'))));
  expect(travelled).toBe(true);
});

test.describe('the composer on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('offers the fullscreen editor button', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('button[aria-label="Раскрыть в полноэкранный редактор"]').first()).toBeVisible();
  });
});
