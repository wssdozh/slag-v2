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
      expect(subBox.x).toBeGreaterThanOrEqual(mainBox.x + mainBox.width);
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

    const moreSubmenu = contextMenu.locator('button', { hasText: 'Дублировать' }).locator('..');
    await expect(moreSubmenu).toBeVisible();
    await expect(moreSubmenu.locator('button', { hasText: 'Копировать [[линк]]' })).toBeVisible();
    await expect(moreSubmenu.locator('button', { hasText: 'Дублировать' })).toBeVisible();

    const moreBox = await moreSubmenu.boundingBox();
    if (mainBox && moreBox) {
      expect(moreBox.x).toBeGreaterThanOrEqual(mainBox.x + mainBox.width);
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

    const explorerBtn = contextMenu.locator('button', { hasText: 'Проводник' });
    await expect(explorerBtn).toBeVisible();
    await explorerBtn.hover();

    const explorerSubmenu = contextMenu.locator('button', { hasText: 'Открыть в проводнике' }).locator('..');
    await expect(explorerSubmenu).toBeVisible();
    await expect(explorerSubmenu.locator('button', { hasText: 'Открыть в проводнике' })).toBeVisible();
    await expect(explorerSubmenu.locator('button', { hasText: 'Скопировать фулл ссылку' })).toBeVisible();
    await expect(explorerSubmenu.locator('button', { hasText: 'Скопировать полный путь' })).toBeVisible();
    await expect(explorerSubmenu.locator('button', { hasText: 'Относительный путь' })).toBeVisible();

    // Capture screenshot of side flyout for explorer
    await page.screenshot({
      path: 'test-results/screenshots/context_menu_side_flyout_explorer.png',
      fullPage: false,
    });

    // Click "Скопировать фулл ссылку"
    await explorerSubmenu.locator('button', { hasText: 'Скопировать фулл ссылку' }).click();
    await expect(page.locator('text=Скопирована ссылка: slag://note/')).toBeVisible();

    // 8. Verify Folder Context Menu has Explorer actions
    const careerFolderNode = page.locator('aside span', { hasText: 'Карьера' }).first();
    await careerFolderNode.click({ button: 'right' });
    const folderContextMenu = page.locator('.fixed.z-50', { hasText: 'Информация и медиа' });
    await expect(folderContextMenu).toBeVisible();
    await expect(folderContextMenu.locator('button', { hasText: 'Открыть в проводнике' })).toBeVisible();
    await expect(folderContextMenu.locator('button', { hasText: 'Скопировать путь к папке' })).toBeVisible();

    await folderContextMenu.locator('button', { hasText: 'Скопировать путь к папке' }).click();
    await expect(page.locator('text=Путь к папке скопирован')).toBeVisible();
  });
});
