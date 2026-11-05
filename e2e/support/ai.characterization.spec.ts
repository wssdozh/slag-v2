import { test, expect } from './selfhostFixture';

test('action formats retain their distinct defaults and batch rules', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { extractActionBlock } = await import(/* @vite-ignore */ '/src/lib/ai/orchestrator.ts');
    const block = (action: string, fields: Record<string, unknown> = {}) =>
      extractActionBlock(`до\n\`\`\`action:${action}\n${JSON.stringify(fields)}\n\`\`\`\nпосле`);
    const batch = { items: [{ id: 'a', priority: 'invalid' }, { targetItemId: 'b', updates: { priority: 'invalid' } }] };
    const pseudo = extractActionBlock(`[Действие ассистента: batch_reschedule_tasks | x | Параметры: ${JSON.stringify({ items: [{ id: 'a', priority: 'invalid' }] })}]`);
    const nestedPseudo = extractActionBlock(`[Действие ассистента: batch_reschedule_tasks | x | Параметры: ${JSON.stringify(batch)}]`);
    const create = block('create_note', { dueDate: '2026-11-05', priority: 'invalid', tags: 'not-an-array' });
    return {
      create,
      createKeys: Object.keys(create.suggestedAction).sort(),
      save: block('save_item', { dueDate: '2026-11-05', appendContent: 'tail', status: 'todo' }),
      schedule: block('schedule_task'),
      saveExisting: block('save_item', { id: 'first', targetItemId: 'second', priority: 'invalid' }),
      update: block('update_item', { id: 'first', targetItemId: 'second', priority: 'invalid' }),
      alias: block('reschedule_task', { id: 'ignored', tags: ['ignored'], dueDate: '', priority: 'invalid', content: 'tail' }),
      batch: block('batch_update', { ...batch, title: 'custom', folder: 'work' }),
      pseudo, nestedPseudo,
      emptyBatch: block('batch_update', { items: [] }),
      emptyPseudo: extractActionBlock('[Действие ассистента: batch_update | x | Параметры: {"items":[]}]'),
      malformed: extractActionBlock('```action:create_note\n{broken}\n```'),
    };
  });
  expect(result.create).toEqual({ cleanText: 'до\n\nпосле', suggestedAction: {
    type: 'create_note', title: 'Новая запись', folder: 'Входящие', content: '', tags: [], itemType: 'note', dueDate: '2026-11-05',
  } });
  expect(result.createKeys).toEqual(['content', 'dueDate', 'folder', 'itemType', 'priority', 'reminder', 'tags', 'title', 'type']);
  expect(result.save.suggestedAction).toMatchObject({ type: 'create_note', itemType: 'task', appendContent: 'tail', status: 'todo' });
  expect(result.schedule.suggestedAction).toMatchObject({ type: 'schedule_task', itemType: 'task' });
  expect(result.saveExisting.suggestedAction).toMatchObject({ targetItemId: 'first', priority: 'invalid' });
  expect(result.update.suggestedAction).toMatchObject({ targetItemId: 'second', updates: { priority: 'invalid' } });
  expect(result.update.suggestedAction).not.toHaveProperty('priority');
  expect(result.alias.suggestedAction).toMatchObject({ tags: [], itemType: 'task', updates: { priority: 'invalid', appendContent: 'tail' } });
  expect(result.alias.suggestedAction.updates).not.toHaveProperty('dueDate');
  expect(result.alias.suggestedAction.targetItemId).toBeUndefined();
  expect(result.batch.suggestedAction).toMatchObject({ title: 'custom', folder: 'work', batchUpdateItems: [
    { targetItemId: 'a', title: 'Задача', updates: {} }, { targetItemId: 'b', updates: { priority: 'invalid' } },
  ] });
  expect(result.pseudo.suggestedAction).toMatchObject({ title: 'Перенос задач (1)', folder: 'Входящие', batchUpdateItems: [
    { updates: { priority: 'invalid' } },
  ] });
  // Nested item objects are balanced-extracted, so the pseudo batch is no longer dropped.
  expect(result.nestedPseudo.suggestedAction).toMatchObject({ title: 'Перенос задач (2)', folder: 'Входящие', batchUpdateItems: [
    { targetItemId: 'a', updates: { priority: 'invalid' } }, { targetItemId: 'b', updates: { priority: 'invalid' } },
  ] });
  expect(result.emptyBatch).not.toHaveProperty('suggestedAction');
  expect(result.emptyPseudo.suggestedAction).toMatchObject({ title: 'Перенос задач (0)', batchUpdateItems: [] });
  expect(result.malformed).toEqual({ cleanText: '```action:create_note\n{broken}\n```' });
});
