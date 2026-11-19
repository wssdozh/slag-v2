import { test, expect } from '@playwright/test';

test('completion transition is the single gate for status, streak and checklist sync', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { applyTaskCompletion } = await import(/* @vite-ignore */ '/src/lib/tasks/taskCompletion.ts');
    const today = new Date(2026, 10, 5, 12);
    const base = {
      id: 't', type: 'task' as const, title: 't', folder: 'Входящие', tags: [], attachments: [],
      content: '- [ ] one\n- [ ] two',
      subtasks: [{ id: 'st_0', title: 'one', completed: false }, { id: 'st_1', title: 'two', completed: false }],
      createdAt: 1, updatedAt: 1, status: 'todo' as const,
      recurrence: { freq: 'daily' as const, interval: 1 },
      streak: 2, history: ['2026-11-03', '2026-11-04'], lastCompletedDate: '2026-11-04',
    };
    const done = applyTaskCompletion(base, { ...base, status: 'done' }, today);
    const reopened = applyTaskCompletion(base, { ...base, status: 'in_progress' }, today);
    const reopenAfterDone = applyTaskCompletion(done, { ...done, status: 'todo' }, today);
    const noRecurrence = applyTaskCompletion(
      { ...base, recurrence: undefined },
      { ...base, recurrence: undefined, status: 'done' }, today);
    const alreadyDone = applyTaskCompletion(done, done, today);
    return {
      done: {
        status: done.status, streak: done.streak, history: done.history,
        last: done.lastCompletedDate,
        content: done.content,
        subtasks: done.subtasks?.map(st => st.completed),
      },
      reopenAfterDone: {
        status: reopenAfterDone.status, streak: reopenAfterDone.streak,
        history: reopenAfterDone.history, last: reopenAfterDone.lastCompletedDate,
        content: reopenAfterDone.content,
        subtasks: reopenAfterDone.subtasks?.map(st => st.completed),
      },
      // unchecking one subtask must not uncheck its completed siblings
      reopenedSibling: reopened.content,
      noRecurrence: { streak: noRecurrence.streak, history: noRecurrence.history },
      alreadyDone: { streak: alreadyDone.streak, last: alreadyDone.lastCompletedDate },
    };
  });
  expect(result).toEqual({
    done: {
      status: 'done', streak: 3, history: ['2026-11-03', '2026-11-04', '2026-11-05'],
      last: '2026-11-05', content: '- [x] one\n- [x] two', subtasks: [true, true],
    },
    reopenAfterDone: {
      status: 'todo', streak: 2, history: ['2026-11-03', '2026-11-04'], last: '2026-11-04',
      content: '- [x] one\n- [x] two', subtasks: [true, true],
    },
    reopenedSibling: '- [ ] one\n- [ ] two',
    noRecurrence: { streak: 2, history: ['2026-11-03', '2026-11-04'] },
    alreadyDone: { streak: 3, last: '2026-11-05' },
  });
});

test('reopen → rename stays todo and streak does not change', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { applyTaskCompletion } = await import(/* @vite-ignore */ '/src/lib/tasks/taskCompletion.ts');
    const today = new Date(2026, 10, 7, 14);
    const done = {
      id: 't', type: 'task' as const, title: 'original', folder: 'Входящие', tags: [], attachments: [],
      content: '- [x] one\n- [x] two',
      subtasks: [{ id: 'st_0', title: 'one', completed: true }, { id: 'st_1', title: 'two', completed: true }],
      createdAt: 1, updatedAt: 1, status: 'done' as const,
      recurrence: { freq: 'daily' as const, interval: 1 },
      streak: 5, history: ['2026-11-03', '2026-11-04'], lastCompletedDate: '2026-11-04',
    };
    // User reopens the task (explicitly changes status)
    const reopened = applyTaskCompletion(done, { ...done, status: 'todo', title: 'renamed' }, today);
    // Second save: user edits title again, content/subtasks unchanged
    const renameAgain = applyTaskCompletion(reopened, { ...reopened, title: 'again renamed' }, today);
    return {
      reopened: {
        status: reopened.status, streak: reopened.streak, title: reopened.title,
        last: reopened.lastCompletedDate,
      },
      renameAgain: {
        status: renameAgain.status, streak: renameAgain.streak, title: renameAgain.title,
      },
    };
  });
  expect(result).toEqual({
    reopened: { status: 'todo', streak: 5, title: 'renamed', last: '2026-11-04' },
    renameAgain: { status: 'todo', streak: 5, title: 'again renamed' },
  });
});

test('partial checklist does not close', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { applyTaskCompletion } = await import(/* @vite-ignore */ '/src/lib/tasks/taskCompletion.ts');
    const today = new Date(2026, 10, 7, 14);
    const open = {
      id: 't', type: 'task' as const, title: 'open', folder: 'Входящие', tags: [], attachments: [],
      content: '- [x] one\n- [ ] two\n- [ ] three',
      subtasks: [
        { id: 'st_0', title: 'one', completed: true },
        { id: 'st_1', title: 'two', completed: false },
        { id: 'st_2', title: 'three', completed: false },
      ],
      createdAt: 1, updatedAt: 1, status: 'todo' as const,
      recurrence: { freq: 'daily' as const, interval: 1 },
      streak: 1, history: [], lastCompletedDate: undefined,
    };
    const tickedOneMore = applyTaskCompletion(
      open,
      { ...open, content: '- [x] one\n- [x] two\n- [ ] three', subtasks: [
        { id: 'st_0', title: 'one', completed: true },
        { id: 'st_1', title: 'two', completed: true },
        { id: 'st_2', title: 'three', completed: false },
      ]},
      today,
    );
    return {
      status: tickedOneMore.status,
      subtasks: tickedOneMore.subtasks?.map(st => st.completed),
    };
  });
  expect(result).toEqual({ status: 'todo', subtasks: [true, true, false] });
});

test('legacy subtasks without checkboxes close on the transition', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { applyTaskCompletion } = await import(/* @vite-ignore */ '/src/lib/tasks/taskCompletion.ts');
    const today = new Date(2026, 10, 7, 14);
    // Legacy format: body has no checkboxes, subtasks carry the list
    const open = {
      id: 't', type: 'task' as const, title: 'open', folder: 'Входящие', tags: [], attachments: [],
      content: 'просто текст',
      subtasks: [{ id: 'st_0', title: 'one', completed: false }, { id: 'st_1', title: 'two', completed: false }],
      createdAt: 1, updatedAt: 1, status: 'todo' as const,
      recurrence: { freq: 'daily' as const, interval: 1 },
      streak: 2, history: ['2026-11-03'], lastCompletedDate: '2026-11-03',
    };
    const allDone = applyTaskCompletion(
      open,
      { ...open, subtasks: [{ id: 'st_0', title: 'one', completed: true }, { id: 'st_1', title: 'two', completed: true }] },
      today,
    );
    // Second write: user tweaks title, everything else identical
    const tweakTitle = applyTaskCompletion(allDone, { ...allDone, title: 'tweaked' }, today);
    return {
      first: { status: allDone.status, streak: allDone.streak, last: allDone.lastCompletedDate },
      second: { status: tweakTitle.status, streak: tweakTitle.streak },
    };
  });
  expect(result).toEqual({
    first: { status: 'done', streak: 3, last: '2026-11-07' },
    second: { status: 'done', streak: 3 },
  });
});

test('ticking the last subtask completes the task on its own', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { applyTaskCompletion } = await import(/* @vite-ignore */ '/src/lib/tasks/taskCompletion.ts');
    const today = new Date(2026, 10, 5, 12);
    const open = {
      id: 't', type: 'task' as const, title: 't', folder: 'Входящие', tags: [], attachments: [],
      content: '- [ ] one\n- [ ] two',
      subtasks: [{ id: 'st_0', title: 'one', completed: false }, { id: 'st_1', title: 'two', completed: false }],
      createdAt: 1, updatedAt: 1, status: 'todo' as const,
    };
    const ticked = {
      ...open,
      content: '- [x] one\n- [x] two',
      subtasks: [{ id: 'st_0', title: 'one', completed: true }, { id: 'st_1', title: 'two', completed: true }],
    };

    const autoClosed = applyTaskCompletion(open, ticked, today);
    const partial = applyTaskCompletion(open, { ...open, content: '- [x] one\n- [ ] two' }, today);
    const recurring = {
      ...open,
      recurrence: { freq: 'daily' as const, interval: 1 },
      streak: 2, history: ['2026-11-04'], lastCompletedDate: '2026-11-04',
    };
    const recurringClosed = applyTaskCompletion(recurring, { ...ticked, recurrence: recurring.recurrence }, today);
    const plain = {
      ...open, content: 'просто текст', subtasks: [],
    };
    const noChecklist = applyTaskCompletion(plain, plain, today);
    const legacy = {
      ...open, content: 'без чекбоксов в теле',
      subtasks: [{ id: 'st_0', title: 'one', completed: true }, { id: 'st_1', title: 'two', completed: true }],
    };
    const legacyClosed = applyTaskCompletion(open, legacy, today);
    // An explicit reopen keeps the status the user picked, even with the checklist still ticked.
    const explicitReopen = applyTaskCompletion(autoClosed, { ...autoClosed, status: 'todo' }, today);

    return {
      autoClosed: {
        status: autoClosed.status,
        content: autoClosed.content,
        subtasks: autoClosed.subtasks?.map(st => st.completed),
      },
      partial: { status: partial.status, content: partial.content },
      recurringClosed: { status: recurringClosed.status, streak: recurringClosed.streak, last: recurringClosed.lastCompletedDate },
      noChecklist: { status: noChecklist.status, subtasks: noChecklist.subtasks?.length },
      legacyClosed: { status: legacyClosed.status, subtasks: legacyClosed.subtasks?.map(st => st.completed) },
      explicitReopen: { status: explicitReopen.status },
    };
  });
  expect(result).toEqual({
    autoClosed: { status: 'done', content: '- [x] one\n- [x] two', subtasks: [true, true] },
    partial: { status: 'todo', content: '- [x] one\n- [ ] two' },
    recurringClosed: { status: 'done', streak: 3, last: '2026-11-05' },
    noChecklist: { status: 'todo', subtasks: 0 },
    legacyClosed: { status: 'done', subtasks: [true, true] },
    explicitReopen: { status: 'todo' },
  });
});
