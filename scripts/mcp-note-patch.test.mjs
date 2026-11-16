// Regression for a live data-loss bug: `save_note` with an id and one changed field used to
// rebuild the record from defaults — the task became a note in «Входящие», status, priority and
// due date vanished from the frontmatter. A patch must stay a patch.
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyNotePatch } from '../src/mcp/notePatch.ts';

const NOW = 1_800_000_000_000;

function task() {
  return {
    id: 'note_1',
    type: 'task',
    title: 'Починить синк',
    content: 'тело',
    folder: 'Проекты/SLAG',
    filename: 'Починить синк.md',
    tags: ['sync'],
    attachments: [],
    createdAt: 1,
    updatedAt: 2,
    status: 'todo',
    priority: 'high',
    dueDate: '2026-01-05',
    reminder: '2026-01-04T09:00:00.000Z',
    subtasks: [{ id: 'st_0', title: 'шаг', completed: false }],
  };
}

/** What the vault resolves before merging: body, parsed subtasks and the final folder. */
function resolved(overrides = {}) {
  const existing = task();
  return { content: existing.content, subtasks: existing.subtasks, folder: existing.folder, ...overrides };
}

test('обновили только статус — тип, папка, приоритет, срок и теги на месте', () => {
  const existing = task();
  const next = applyNotePatch(existing, { status: 'in_progress' }, resolved(), NOW);

  assert.equal(next.status, 'in_progress');
  assert.equal(next.type, 'task');
  assert.equal(next.folder, 'Проекты/SLAG');
  assert.equal(next.priority, 'high');
  assert.equal(next.dueDate, '2026-01-05');
  assert.equal(next.reminder, '2026-01-04T09:00:00.000Z');
  assert.deepEqual(next.tags, ['sync']);
  assert.equal(next.title, 'Починить синк');
  assert.equal(next.id, existing.id);
  assert.equal(next.createdAt, existing.createdAt);
  assert.equal(next.updatedAt, NOW);
});

test('append дописывает тело и не трогает остальные поля', () => {
  const existing = task();
  const next = applyNotePatch(existing, { appendContent: 'ещё' }, resolved({ content: 'тело\n\nещё' }), NOW);

  assert.equal(next.content, 'тело\n\nещё');
  assert.equal(next.type, 'task');
  assert.equal(next.folder, 'Проекты/SLAG');
  assert.equal(next.status, 'todo');
});

test('явные поля меняются: заголовок, папка и пустой tags', () => {
  const existing = task();
  const next = applyNotePatch(
    existing,
    { title: '  Новое имя  ', folder: 'Проекты/Иное', tags: [] },
    resolved({ folder: 'Проекты/Иное' }),
    NOW,
  );

  assert.equal(next.title, 'Новое имя');
  assert.equal(next.folder, 'Проекты/Иное');
  assert.deepEqual(next.tags, []);
  assert.equal(next.type, 'task');
});

test('тип меняется только когда его передали явно', () => {
  const existing = task();

  const demoted = applyNotePatch(existing, { type: 'note' }, resolved(), NOW);
  assert.equal(demoted.type, 'note');

  const untouched = applyNotePatch(existing, {}, resolved(), NOW);
  assert.equal(untouched.type, 'task');
  assert.equal(untouched.updatedAt, NOW);
});

test('чеклист из тела важнее фронтматтера, пустой разбор не стирает старый', () => {
  const existing = task();

  const kept = applyNotePatch(existing, { status: 'done' }, resolved({ subtasks: [] }), NOW);
  assert.deepEqual(kept.subtasks, existing.subtasks);

  const replaced = applyNotePatch(
    existing,
    { subtasks: ['новый'] },
    resolved({ subtasks: [{ id: 'st_0', title: 'новый', completed: false }] }),
    NOW,
  );
  assert.deepEqual(replaced.subtasks.map((item) => item.title), ['новый']);
});
