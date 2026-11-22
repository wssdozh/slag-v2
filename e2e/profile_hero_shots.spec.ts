import { test, expect } from './support/selfhostFixture';

test.setTimeout(180_000);

const AVATAR_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

// Throwaway visual capture for the profile hero task: a filled profile must be on screen,
// so the screenshot proves the photo, the name and the plan all read at both widths.
async function seedProfile(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    const { storage } = await import(/* @vite-ignore */ '/src/lib/sync/syncEngine.ts');
    storage.saveWorkspaceState({ profile: { name: 'Мори', avatar: '/mascot-blueberry.svg' } });
    window.dispatchEvent(new CustomEvent('slag-sync-updated', {
      detail: { hasItemsChanged: false, hasFoldersChanged: false, hasWorkspaceChanged: true, hasDraftsChanged: false },
    }));
  });
}

async function openMobileSettings(page: import('@playwright/test').Page) {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.locator('nav[aria-label="Мобильная навигация"] button[aria-label="Настройки"]').click();
  await expect(page.getByTestId('mobile-settings-root')).toBeVisible({ timeout: 120_000 });
  await seedProfile(page);
  await expect(page.getByLabel('Имя профиля')).toHaveValue('Мори');
}

test('profile hero — desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible({ timeout: 120_000 });
  await page.getByTestId('sidebar-settings-btn').click();
  await page.locator('[data-testid="settings-tab-account"]').click();
  await seedProfile(page);
  await expect(page.getByLabel('Имя профиля')).toHaveValue('Мори');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/screenshots/profile-hero-desktop.png' });
});

test('profile hero — mobile 375', async ({ page }) => {
  await openMobileSettings(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/screenshots/profile-hero-mobile.png' });
});

test('avatar is left of the name and the photo opens the picker', async ({ page }) => {
  test.setTimeout(60_000);
  await openMobileSettings(page);

  const avatar = page.getByRole('button', { name: 'Сменить фото профиля' });
  const avatarBox = (await avatar.boundingBox())!;
  const nameBox = (await page.getByLabel('Имя профиля').boundingBox())!;
  expect(avatarBox.width).toBeGreaterThanOrEqual(44);
  expect(nameBox.x).toBeGreaterThan(avatarBox.x + avatarBox.width);
  expect(nameBox.y).toBeLessThan(avatarBox.y + avatarBox.height);
  await expect(page.getByTestId('mobile-settings-account-btn')).toBeVisible();

  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), avatar.click()]);
  expect(chooser).toBeTruthy();
  await chooser.setFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: AVATAR_PNG });
});

test('the pencil opens the menu and its item opens the same picker', async ({ page }) => {
  test.setTimeout(90_000);
  await openMobileSettings(page);

  await page.getByRole('button', { name: 'Изменить фото' }).click();
  const menuItem = page.getByRole('button', { name: 'Сменить фото', exact: true });
  await expect(menuItem).toBeVisible({ timeout: 5000 });

  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), menuItem.click()]);
  expect(chooser).toBeTruthy();
  await chooser.setFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: AVATAR_PNG });
});
