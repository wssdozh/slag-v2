import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers for seeding and inspecting tasks inside the app's own storage layer.
// All interactions go through `page.evaluate` + `storage.*`.  No direct localStorage.
// ---------------------------------------------------------------------------

/** Seeded SlagItem shape — every field the editor reads back into the UI. */
export interface TaskSeed {
  id: string;
  title: string;
  content?: string;
  folder?: string;
  tags?: string[];
  status?: 'backlog' | 'todo' | 'in_progress' | 'done';
  priority?: 'none' | 'low' | 'medium' | 'high';
  dueDate?: string;           // YYYY-MM-DD
  reminder?: string;          // ISO moment or legacy wall-time like '10:00'
  duration?: number;          // minutes
  recurrence?: {
    freq: 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';
    interval?: number;
    weekdays?: number[];      // 1..7 mon..sun
    resetSubtasks?: boolean;
  };
  subtasks?: Array<{ id: string; title: string; completed: boolean }>;
}

/**
 * Seed a task into the running app via its internal `storage.saveItem`.
 * Returns the stored item as saved by the engine (updatedAt, filename etc.).
 *
 * @param page — Playwright page instance
 * @param base — partial seed; defaults fill in sane values
 */
export async function seedTask(page: Page, base: Partial<TaskSeed>): Promise<SlagItem> {
  const now = Date.now();
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const seed: SlagItem = await page.evaluate(async ({ base, todayStr, now }) => {
    const { storage } = await import('/src/lib/storage/index.ts');

    const full: SlagItem = {
      id: base.id ?? `task_${crypto.randomUUID().slice(0, 8)}`,
      type: 'task',
      title: base.title ?? '',
      content: base.content ?? '',
      folder: base.folder ?? 'Входящие',
      tags: base.tags ?? [],
      attachments: [],
      createdAt: now,
      updatedAt: now,
      status: base.status ?? 'todo',
      priority: base.priority ?? 'none',
      dueDate: base.dueDate ?? todayStr,
      ...base.extra ?? {},
    };

    if (base.reminder != null)        full.reminder        = base.reminder;
    if (base.duration != null)         full.duration        = base.duration;
    if (base.recurrence != null)       full.recurrence      = base.recurrence as any;
    if (base.subtasks != null)         full.subtasks        = base.subtasks;
    if (base.streak != null)           (full as any).streak = base.streak;
    if (base.history != null)          (full as any).history = base.history;
    if (base.lastCompletedDate != null)(full as any).lastCompletedDate = base.lastCompletedDate;

    return storage.saveItem(full);
  }, {
    base,
    todayStr: isoDate(today),
    now,
  });

  return seed;
}

/**
 * Read a single stored item from the app's storage layer.
 * Returns `null` when the id is not found.
 */
export async function readStoredItem(page: Page, id: string): Promise<SlagItem | null> {
  return page.evaluate(async (id) => {
    const { storage } = await import('/src/lib/storage/index.ts');
    return storage.getItemById(id) ?? null;
  }, id);
}

/**
 * Open the fullscreen focus-editor for an item.
 * Pattern: right-click `#item-<id>` → context menu → «Фокус-редактор».
 */
export async function openTaskEditor(page: Page, id: string): Promise<void> {
  const card = page.locator(`#item-${id}`);
  await expect(card).toBeVisible({ timeout: 120_000 });

  await card.click({ button: 'right' });
  const editorBtn = page.locator('.fixed.z-50 button', { hasText: 'Фокус-редактор' }).first();
  await expect(editorBtn).toBeVisible({ timeout: 5_000 });
  await editorBtn.click();

  const modal = page.locator('[data-testid="fullscreen-editor-modal"]');
  await expect(modal).toBeVisible({ timeout: 10_000 });
}

/**
 * Wait for the autosave debounce to fire (~1200 ms).
 */
export async function waitForAutosave(page: Page, ms = 1200): Promise<void> {
  await page.waitForTimeout(ms);
}

/**
 * Resize the browser viewport to a typical mobile width/height (390×844).
 */
export async function setMobileViewport(page: Page): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
}

/**
 * Reset viewport to desktop (1280×720). Useful after mobile tests.
 */
export async function resetDesktopViewport(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 720 });
}
