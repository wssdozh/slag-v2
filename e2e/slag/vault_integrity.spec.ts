import { test, expect } from '../support/selfhostFixture';

const SHOT_DIR = 'test-results/screenshots';

/**
 * «состояние» — the fourth block of the vault tab. Two blocks: what the relay knows and what the
 * disk holds. The body is rows and nothing else: the short answer is the question mark's tooltip,
 * the long one is its dialog. A block that writes a paragraph under its own title is a block that
 * will be rewritten by whoever reads it next.
 */
test('the vault tab opens the storage state block and it refuses a web sweep', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.locator('main').first()).toBeVisible({ timeout: 120000 });

  await page.getByTestId('sidebar-settings-btn').click();
  const scope = page.locator('.fixed.z-50').filter({ has: page.locator('[data-tab="vault"]') });
  await scope.locator('[data-tab="vault"]').click();

  await scope.getByTestId('vault-subtab-integrity').click();
  const section = scope.getByTestId('vault-section-integrity');
  const panel = section.getByTestId('integrity-panel');
  await expect(panel).toBeVisible();

  await expect(panel).toContainText('Сверка с сервером');
  await expect(panel).toContainText('Это устройство');
  await expect(panel.getByTestId('integrity-server')).toContainText('нет данных');
  await expect(panel.getByTestId('integrity-server-last')).toContainText('ни разу');
  await expect(panel.getByTestId('integrity-autocheck')).toHaveAttribute('aria-checked', 'true');
  await expect(panel.getByTestId('integrity-dryrun')).toHaveAttribute('aria-checked', 'true');

  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOT_DIR}/vault-integrity.png` });

  // The short answer on hover, the long one on click: one shared component, two depths.
  const info = panel.getByTestId('integrity-server-info');
  const bubble = panel.getByTestId('integrity-server-info-hint');
  await expect(bubble).toBeAttached();
  await expect(bubble).toContainText('при запуске и после отправки');
  await info.hover();
  await info.click();
  // By name, not `.last()`: the settings dialog is a dialog too, and after this one closes it
  // becomes the last one on the page.
  const dialog = page.getByRole('dialog', { name: 'Сверка с сервером' });
  await expect(dialog).toContainText('Комната хранит один корень');
  // Off the icon, then one beat for the entrance: otherwise the shot catches the bubble over the
  // block and the dialog at zero opacity.
  await page.mouse.move(700, 900);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOT_DIR}/vault-integrity-help.png` });
  await page.keyboard.press('Escape');
  // Escape closes the explanation, not the settings behind it.
  await expect(dialog).toHaveCount(0);
  await expect(panel).toBeVisible();

  await panel.getByTestId('integrity-verify').click();
  await expect(section.getByRole('status')).toContainText('доступна в приложении', { timeout: 15000 });
});

/**
 * A divergence the room can name: the peer sent its leaves, so the panel says which side is short
 * instead of shrugging, and offers the one repair sync is allowed to make — the trash.
 */
test('a named divergence offers the trash instead of «нужен разбор»', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.locator('main').first()).toBeVisible({ timeout: 120000 });

  await page.getByTestId('sidebar-settings-btn').click();
  const scope = page.locator('.fixed.z-50').filter({ has: page.locator('[data-tab="vault"]') });
  await scope.locator('[data-tab="vault"]').click();
  await scope.getByTestId('vault-subtab-integrity').click();
  const panel = scope.getByTestId('vault-section-integrity').getByTestId('integrity-panel');

  // The engine keeps the last comparison; a check needs a disk and a relay, so the state is
  // planted the way a real pass would leave it.
  await page.evaluate(async () => {
    const { syncEngine } = await import('/src/lib/sync/syncEngine.ts');
    syncEngine.status.manifest = {
      at: new Date().toISOString(),
      root: 'aaaa1111',
      remoteRoot: 'bbbb2222',
      inSync: false,
      folders: [],
      extra: ['item_left_behind', 'item_left_behind_too'],
      missing: [],
      action: 'report',
      trigger: 'push',
    };
    syncEngine.notify();
  });

  await expect(panel.getByTestId('integrity-server')).toContainText('у соседа нет 2 заметок');
  await expect(panel.getByTestId('integrity-drop-extra')).toContainText('Убрать 2 лишние в корзину');

  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOT_DIR}/vault-integrity-diverged.png` });

  // Unknown ids: the click has to be harmless, not a crash.
  await panel.getByTestId('integrity-drop-extra').click();
  await expect(panel).toBeVisible();
});
