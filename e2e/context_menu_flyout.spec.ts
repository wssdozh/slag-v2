import { test, expect } from '@playwright/test';

test.describe('Context Menu Cascading Flyouts & Quick Type Switcher', () => {
  test('Submenus pop out separately on the side and type switching works quickly', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(600);

    const firstCard = page.locator('[id^="item-"]').first();
    await expect(firstCard).toBeVisible();

    // 1. Right click to open Context Menu
    await firstCard.click({ button: 'right' });
    const contextMenu = page.locator('.fixed.z-50', { hasText: 'Ответить' });
    await expect(contextMenu).toBeVisible();

    const mainMenuPanel = contextMenu.locator('> div').first();
    const typeBtn = contextMenu.locator('button', { hasText: 'Сменить тип' });
    await expect(typeBtn).toBeVisible();

    // 2. Hover "Сменить тип" -> verify side flyout appears to the side
    await typeBtn.hover();
    const typeSubmenu = contextMenu.locator('button', { hasText: 'Таска' }).locator('..');
    await expect(typeSubmenu).toBeVisible();
    await expect(typeSubmenu.locator('button', { hasText: 'Заметка' })).toBeVisible();
    await expect(typeSubmenu.locator('button', { hasText: 'Таска' })).toBeVisible();
    await expect(typeSubmenu.locator('button', { hasText: 'Статья' })).toBeVisible();

    // Verify side-by-side positioning (x coordinate of submenu is to the right of the main menu)
    const mainBox = await mainMenuPanel.boundingBox();
    const subBox = await typeSubmenu.boundingBox();
    expect(mainBox).toBeTruthy();
    expect(subBox).toBeTruthy();
    if (mainBox && subBox) {
      expect(subBox.x).toBeGreaterThanOrEqual(mainBox.x + mainBox.width - 2);
    }

    // Capture screenshot of side flyout for types
    await page.screenshot({
      path: 'test-results/screenshots/context_menu_side_flyout_types.png',
      fullPage: false,
    });

    // 3. Click "Таска" in submenu to quickly change type
    await typeSubmenu.locator('button', { hasText: 'Таска' }).click();
    await expect(page.locator('text=Превращено в: таска')).toBeVisible();

    // 4. Verify "Дополнительно" flyout on the side
    await page.waitForTimeout(400);
    await firstCard.click({ button: 'right' });
    await expect(contextMenu).toBeVisible();

    const moreBtn = contextMenu.locator('button', { hasText: 'Дополнительно' });
    await expect(moreBtn).toBeVisible();
    await moreBtn.hover();

    const moreSubmenu = contextMenu.locator('button', { hasText: 'Копировать [[линк]]' }).locator('..');
    await expect(moreSubmenu).toBeVisible();
    await expect(moreSubmenu.locator('button', { hasText: 'Копировать [[линк]]' })).toBeVisible();
    // Duplicate, archive and full link were removed from the menu for good.
    await expect(moreSubmenu.locator('button', { hasText: 'Дублировать' })).toHaveCount(0);
    await expect(moreSubmenu.locator('button', { hasText: 'В архив' })).toHaveCount(0);

    const moreBox = await moreSubmenu.boundingBox();
    if (mainBox && moreBox) {
      expect(moreBox.x).toBeGreaterThanOrEqual(mainBox.x + mainBox.width - 2);
    }

    // Capture screenshot of side flyout for more
    await page.screenshot({
      path: 'test-results/screenshots/context_menu_side_flyout_more.png',
      fullPage: false,
    });

    // 5. Test Quick Keyboard Type Switch: press '3' to turn into Article
    await page.keyboard.press('3');
    await expect(page.locator('text=Превращено в: статья')).toBeVisible();

    // Verify article badge appears on card
    const articleBadge = firstCard.locator('[role="button"]', { hasText: 'Статья' });
    await expect(articleBadge).toBeVisible();

    // 6. Click article badge -> context menu opens directly
    await articleBadge.click();
    await expect(contextMenu).toBeVisible();

    // Press '1' to turn back into Note
    await page.keyboard.press('1');
    await expect(page.locator('text=Превращено в: заметка')).toBeVisible();

    // 7. Verify "Проводник" flyout submenu (Open in Explorer, Copy Full Link, Copy Full Path)
    await page.waitForTimeout(400);
    await firstCard.click({ button: 'right' });
    await expect(contextMenu).toBeVisible();

    const explorerBtn = contextMenu.getByRole('button', { name: 'Проводник', exact: true });
    await expect(explorerBtn).toBeVisible();
    await explorerBtn.hover();

    const explorerSubmenu = contextMenu.locator('button', { hasText: 'Открыть в проводнике' }).locator('..');
    await expect(explorerSubmenu).toBeVisible();
    await expect(explorerSubmenu.locator('button', { hasText: 'Открыть в проводнике' })).toBeVisible();
    await expect(explorerSubmenu.locator('button', { hasText: 'Скопировать фулл ссылку' })).toHaveCount(0);
    await expect(explorerSubmenu.locator('button', { hasText: 'Скопировать полный путь' })).toBeVisible();
    await expect(explorerSubmenu.locator('button', { hasText: 'Относительный путь' })).toBeVisible();

    // Capture screenshot of side flyout for explorer
    await page.screenshot({
      path: 'test-results/screenshots/context_menu_side_flyout_explorer.png',
      fullPage: false,
    });

    // "Скопировать фулл ссылку" is gone: the explorer flyout keeps paths only.
    await expect(explorerSubmenu.locator('button', { hasText: 'Скопировать фулл ссылку' })).toHaveCount(0);
    // 8. Verify Folder Context Menu has Explorer flyout submenu
    const careerFolderNode = page.locator('aside span', { hasText: 'Карьера' }).first();
    await careerFolderNode.click({ button: 'right' });
    const folderContextMenu = page.locator('.fixed.z-50', { hasText: 'Информация и медиа' });
    await expect(folderContextMenu).toBeVisible();

    const folderExplorerBtn = folderContextMenu.getByRole('button', { name: 'Проводник', exact: true });
    await expect(folderExplorerBtn).toBeVisible();
    await folderExplorerBtn.hover();

    const folderExplorerSubmenu = folderContextMenu.locator('button', { hasText: 'Открыть в проводнике' }).locator('..');
    await expect(folderExplorerSubmenu).toBeVisible();
    await expect(folderExplorerSubmenu.locator('button', { hasText: 'Скопировать фулл ссылку' })).toHaveCount(0);
    await expect(folderExplorerSubmenu.locator('button', { hasText: 'Скопировать полный путь' })).toBeVisible();
    await expect(folderExplorerSubmenu.locator('button', { hasText: 'Относительный путь' })).toBeVisible();

    // Capture screenshot of side flyout for folder explorer
    await page.screenshot({
      path: 'test-results/screenshots/folder_context_menu_explorer_flyout.png',
      fullPage: false,
    });

    await folderExplorerSubmenu.locator('button', { hasText: 'Скопировать полный путь' }).click();
    await expect(page.locator('text=Путь к папке скопирован')).toBeVisible();
  });
});

test.describe('Context Menu flyout exit', () => {
  test('a side panel keeps its node while it fades instead of vanishing', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(600);

    await page.locator('[id^="item-"]').first().click({ button: 'right' });
    const typeBtn = page.locator('button', { hasText: 'Сменить тип' }).first();
    await expect(typeBtn).toBeVisible();
    await typeBtn.hover();

    const flyout = page.locator('.motion-popover[data-motion-state="open"]').last();
    await expect(flyout).toBeVisible();

    // Leaving the panel must start an exit, not delete the node: the guard that
    // rendered it must not disappear before the animation does.
    const [exit] = await Promise.all([
      flyout.evaluate(element => new Promise<{ phase: string; alive: boolean }>(resolve => {
        const finish = () => resolve({
          phase: element.getAttribute('data-motion-state') ?? 'gone',
          alive: document.body.contains(element),
        });
        const observer = new MutationObserver(() => {
          if (element.getAttribute('data-motion-state') !== 'exiting') return;
          observer.disconnect();
          window.setTimeout(finish, 60);
        });
        observer.observe(element, { attributes: true, attributeFilter: ['data-motion-state'] });
        window.setTimeout(() => { observer.disconnect(); finish(); }, 3000);
      })),
      (async () => {
        await page.waitForTimeout(80);
        await page.mouse.move(4, 4, { steps: 4 });
      })(),
    ]);

    expect(exit.phase).toBe('exiting');
    expect(exit.alive).toBe(true);
  });
});
