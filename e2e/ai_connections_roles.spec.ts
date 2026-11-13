import { test, expect, type Locator, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Connections + roles: a custom OpenAI-compatible endpoint (CPA on netcup), the migration of
 * the old flat providers, and the rule that deleting a connection frees its roles.
 */

const AI_SETTINGS_KEY = 'slag_ai_settings_v2';

async function openAiTab(page: Page): Promise<Locator> {
  await page.locator('button[title*="Настройки"]').first().click();
  const settingsModal = page.locator('.fixed.z-50', { hasText: 'Настройки' });
  await expect(settingsModal).toBeVisible();
  await settingsModal.locator('[data-testid="settings-tab-ai"]').click();
  return settingsModal;
}

async function switchToByok(page: Page, settingsModal: Locator): Promise<void> {
  await settingsModal.locator('[data-testid="ai-source-mode"]').click();
  await page.locator('[data-testid="ai-source-byok"]').click();
}

test.describe('AI connections and roles', () => {
  test.beforeEach(async () => {
    const screenshotDir = path.join(process.cwd(), 'test-results', 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
  });

  test('1. legacy flat provider settings migrate into one connection and its roles', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 30_000 });

    await page.evaluate((key) => {
      localStorage.setItem(key, JSON.stringify({
        sourceMode: 'byok',
        provider: 'groq',
        groqApiKey: 'gsk_legacy_key',
        model: 'llama-3.3-70b-versatile',
        reasoningEffort: 'low',
        autoTagging: true,
        autoTriage: true,
        webSearchEnabled: false,
        maxTagsPerNote: 3,
        allowNewTags: true,
        tagCaseStyle: 'lowercase',
      }));
    }, AI_SETTINGS_KEY);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 30_000 });

    const migrated = await page.evaluate(async () => {
      const { loadAiSettings } = await import('/src/lib/ai/connections/settings.ts');
      return loadAiSettings();
    });

    expect(migrated.sourceMode).toBe('byok');
    expect(migrated.connections).toHaveLength(1);
    expect(migrated.connections[0].kind).toBe('groq');
    expect(migrated.connections[0].apiKey).toBe('gsk_legacy_key');
    expect(migrated.connections[0].models.chat).toBe('llama-3.3-70b-versatile');
    expect(migrated.roles.chat).toBe('groq');
    expect(migrated.roles.vision).toBe('groq');
    expect(migrated.roles.stt).toBe('groq');
  });

  test('2. a custom OpenAI-compatible endpoint can serve chat, vision and speech', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 30_000 });
    await page.evaluate((key) => localStorage.removeItem(key), AI_SETTINGS_KEY);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 30_000 });

    const settingsModal = await openAiTab(page);
    await switchToByok(page, settingsModal);

    await settingsModal.locator('[data-testid="ai-connection-add"]').click();
    await page.getByRole('option', { name: 'Custom', exact: true }).click();
    // The dropdown keeps its options mounted through the exit animation; wait it out so the
    // role selectors below see exactly one "Custom" option.
    await expect(page.getByRole('option', { name: 'Custom', exact: true })).toHaveCount(0);

    const customRow = settingsModal.locator('[data-testid="ai-connection-custom"]');
    await expect(customRow).toBeVisible();
    await customRow.click();

    await settingsModal.getByLabel('Base URL').fill('http://127.0.0.1:8317/v1');
    await settingsModal.locator('input[placeholder*="OpenAI-совместимый"]').fill('cpa-client-key');
    await settingsModal.getByLabel('Модель · ответы').fill('gpt-5.2');
    await settingsModal.getByLabel('Модель · картинки').fill('gpt-5.2-vision');
    await settingsModal.getByLabel('Модель · аудио').fill('whisper-1');

    for (const role of ['chat', 'vision', 'stt']) {
      await settingsModal.locator(`[data-testid="ai-role-${role}"]`).click();
      await page.getByRole('option', { name: 'Custom', exact: true }).click();
      await expect(page.getByRole('option', { name: 'Custom', exact: true })).toHaveCount(0);
    }

    // Screenshot 1: the editor of the custom connection with its per-role models.
    await settingsModal.getByLabel('Модель · аудио').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/screenshots/ai_connection_editor.png' });

    // Screenshot 2: the connection list and the three role selectors at a glance.
    await customRow.click();
    await settingsModal.getByText('Подключения').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/screenshots/ai_connections_roles.png' });

    await settingsModal.locator('button', { hasText: 'Сохранить' }).click();
    await expect(settingsModal).not.toBeVisible();

    const resolved = await page.evaluate(async () => {
      const { loadAiSettings } = await import('/src/lib/ai/connections/settings.ts');
      const { resolveChatTarget, resolveMediaTarget } = await import('/src/lib/ai/connections/resolve.ts');
      const settings = loadAiSettings();
      const chat = resolveChatTarget(settings);
      const vision = resolveMediaTarget(settings, 'vision');
      const stt = resolveMediaTarget(settings, 'stt');
      return {
        endpoint: chat?.endpointUrl,
        adapter: chat?.adapter.constructor.name,
        model: chat?.model,
        vision: vision?.transport,
        visionModel: vision && 'model' in vision ? vision.model : null,
        stt: stt?.transport,
      };
    });

    expect(resolved.endpoint).toBe('http://127.0.0.1:8317/v1/chat/completions');
    expect(resolved.adapter).toBe('OpenAiChatAdapter');
    expect(resolved.model).toBe('gpt-5.2');
    expect(resolved.vision).toBe('openai');
    expect(resolved.visionModel).toBe('gpt-5.2-vision');
    expect(resolved.stt).toBe('openai');
  });

  test('3. deleting a connection frees the roles that pointed at it', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 30_000 });

    await page.evaluate((key) => {
      localStorage.setItem(key, JSON.stringify({
        sourceMode: 'byok',
        connections: [
          {
            id: 'groq', kind: 'groq', label: 'Groq', apiKey: '',
            baseUrl: 'https://api.groq.com/openai/v1', protocol: 'chat', models: {},
          },
          {
            id: 'cpa', kind: 'custom', label: 'CPA', apiKey: 'cpa-client-key',
            baseUrl: 'http://127.0.0.1:8317/v1', protocol: 'chat', models: { chat: 'gpt-5.2' },
          },
        ],
        roles: { chat: 'cpa', vision: 'cpa', stt: 'cpa' },
      }));
    }, AI_SETTINGS_KEY);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 30_000 });

    const settingsModal = await openAiTab(page);
    await switchToByok(page, settingsModal);

    await settingsModal.locator('[data-testid="ai-connection-cpa"]').click();
    await settingsModal.locator('button', { hasText: 'Удалить подключение' }).click();

    await expect(settingsModal.locator('[data-testid="ai-role-chat"]')).toContainText('Отключено');

    await settingsModal.locator('button', { hasText: 'Сохранить' }).click();
    await expect(settingsModal).not.toBeVisible();

    const saved = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) || '{}'),
      AI_SETTINGS_KEY
    );
    expect(saved.connections).toHaveLength(1);
    expect(saved.roles.chat).toBeNull();
    expect(saved.roles.vision).toBeNull();
    expect(saved.roles.stt).toBeNull();
  });
});
