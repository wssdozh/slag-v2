// The repair planner: what a sweep would move, and when it refuses to move anything.
import assert from 'node:assert/strict';
import test from 'node:test';
import { planRepair } from '../src/lib/vault/integrity/repair.ts';
import { FIX_KIND_BY_SCANNER } from '../src/lib/vault/integrity/types.ts';

function finding(scanner, overrides = {}) {
  return {
    id: `${scanner}:${overrides.path ?? 'x'}`,
    scanner,
    severity: 'low',
    fix: FIX_KIND_BY_SCANNER[scanner],
    path: '',
    summary: 's',
    why: 'w',
    evidence: [],
    ...overrides,
  };
}

function snapshot(notes = [], overrides = {}) {
  return {
    notes,
    diskFolders: [],
    stateFolders: [],
    attachmentFiles: [],
    trash: [],
    inbox: 'Входящие',
    ...overrides,
  };
}

test('a duplicate group keeps the keeper and moves the rest', () => {
  const plan = planRepair(
    [finding('duplicate-id', { itemId: 'item_1', path: 'Проекты/dupe.md', paths: ['Проекты/dupe.md', 'Входящие/dupe.md'] })],
    snapshot([{ path: 'Проекты/dupe.md', id: 'item_1' }]),
    { maxActions: 50 },
  );

  assert.equal(plan.ops.length, 1);
  assert.deepEqual(plan.ops[0], {
    kind: 'move',
    findingId: 'duplicate-id:Проекты/dupe.md',
    from: 'Входящие/dupe.md',
    to: '.trash/.hygiene/run/Входящие/dupe.md',
    note: 'дубль Входящие/dupe.md в корзину чистки',
  });
  assert.deepEqual(plan.blocked, []);
});

test('a note filed in the wrong folder is planned into its declared one', () => {
  const plan = planRepair(
    [finding('path-mismatch', { path: 'Входящие/баги.md' })],
    snapshot([{ path: 'Входящие/баги.md', id: 'item_2', folder: 'Проекты/SLAG' }]),
  );

  assert.equal(plan.ops.length, 1);
  assert.equal(plan.ops[0].from, 'Входящие/баги.md');
  assert.equal(plan.ops[0].to, 'Проекты/SLAG/баги.md');
});

test('a mismatch with no declared folder in the snapshot plans nothing', () => {
  const plan = planRepair([finding('path-mismatch', { path: 'Входящие/баги.md' })], snapshot([]));
  assert.deepEqual(plan.ops, []);
});

test('ghosts, empty folders and old trash each become their own op', () => {
  const plan = planRepair(
    [
      finding('ghost-folder', { path: 'Проекты/Боты' }),
      finding('empty-folder', { path: 'Личное/Пусто' }),
      finding('trash-aging', { path: '.trash/старое.md' }),
    ],
    snapshot(
      [
        { path: 'a.md', id: 'item_3' },
        { path: 'b.md', id: 'item_4' },
        { path: 'c.md', id: 'item_5' },
        { path: 'd.md', id: 'item_6' },
      ],
      { trash: [{ name: 'старое.md', ageMs: 40 * 86_400_000 }] },
    ),
    { maxShare: 1 },
  );

  assert.equal(plan.ops.length, 3);
  assert.deepEqual(
    plan.ops.map((op) => op.kind),
    ['remove-dir', 'drop-folders', 'move'],
  );
  const move = plan.ops.find((op) => op.kind === 'move');
  assert.equal(move.to, '.trash/.hygiene/run/.trash/старое.md');
});

test('manual findings are never planned and never blocked', () => {
  const plan = planRepair(
    [finding('broken-frontmatter', { path: 'x/broken.md' }), finding('folder-missing', { path: 'x/a.md' })],
    snapshot([{ path: 'x/a.md', id: 'item_4' }]),
  );
  assert.deepEqual(plan.ops, []);
  assert.deepEqual(plan.blocked, []);
});

test('an orphaned attachment is moved into the hygiene trash, not deleted', () => {
  const plan = planRepair(
    [finding('unreferenced-attachment', { path: 'att_1_shot.webp' })],
    snapshot([{ path: 'Входящие/note.md', id: 'item_1' }], { attachmentFiles: ['att_1_shot.webp'] }),
  );

  assert.deepEqual(plan.ops, [
    {
      kind: 'move',
      findingId: 'unreferenced-attachment:att_1_shot.webp',
      from: '.attachments/att_1_shot.webp',
      to: '.trash/.hygiene/run/attachments/att_1_shot.webp',
      note: 'вложение att_1_shot.webp в архив чистки',
    },
  ]);
  assert.deepEqual(plan.blocked, []);
});

test('attachments have their own ceiling, far above the note one', () => {
  const many = Array.from({ length: 60 }, (_, i) => finding('unreferenced-attachment', { path: `att_${i}.webp` }));

  // Sixty orphaned files is under the attachment ceiling, so the same plan the note ceiling would
  // have refused outright goes through.
  const planned = planRepair(many, snapshot([{ path: 'a.md', id: 'item_1' }]), { maxActions: 50 });
  assert.equal(planned.ops.length, 60);
  assert.deepEqual(planned.blocked, []);

  const refused = planRepair(many, snapshot([{ path: 'a.md', id: 'item_1' }]), { maxAttachments: 10 });
  assert.deepEqual(refused.ops, []);
  assert.equal(refused.blocked.length, 60);
});

test('a mass note event takes the attachments down with it', () => {
  const notes = Array.from({ length: 60 }, (_, i) => finding('empty-folder', { path: `f/${i}` }));
  const plan = planRepair(
    [...notes, finding('unreferenced-attachment', { path: 'att_1.webp' })],
    snapshot(Array.from({ length: 400 }, (_, i) => ({ path: `n/${i}.md`, id: `i${i}` })), { attachmentFiles: ['att_1.webp'] }),
    { maxActions: 50 },
  );

  assert.deepEqual(plan.ops, []);
  assert.equal(plan.blocked.length, 61);
});

test('an empty vault of findings is an empty plan', () => {
  assert.deepEqual(planRepair([], snapshot([])), { ops: [], blocked: [] });
});

test('more ops than the action ceiling blocks the whole run', () => {
  const findings = Array.from({ length: 60 }, (_, i) => finding('empty-folder', { path: `f/${i}` }));
  const plan = planRepair(findings, snapshot(Array.from({ length: 400 }, (_, i) => ({ path: `n/${i}.md`, id: `i${i}` }))), { maxActions: 50 });

  assert.deepEqual(plan.ops, []);
  assert.equal(plan.blocked.length, 60);
});

test('a share of the vault past the ceiling blocks the run even under the action cap', () => {
  const findings = [
    finding('path-mismatch', { path: 'a.md' }),
    finding('path-mismatch', { path: 'b.md' }),
    finding('path-mismatch', { path: 'c.md' }),
  ];
  const plan = planRepair(
    findings,
    snapshot(['a.md', 'b.md', 'c.md', 'd.md', 'e.md'].map((path, i) => ({ path, id: `i${i}`, folder: 'Проекты' }))),
    { maxActions: 50, maxShare: 0.1 },
  );

  assert.deepEqual(plan.ops, []);
  assert.equal(plan.blocked.length, 3);
});

test('the plan is stable and never moves one file twice', () => {
  const findings = [
    finding('empty-folder', { path: 'z' }),
    finding('path-mismatch', { path: 'a.md' }),
    finding('empty-folder', { path: 'y' }),
    finding('path-mismatch', { path: 'a.md' }),
  ];
  const snap = snapshot([
    { path: 'a.md', id: 'i1', folder: 'Проекты' },
    { path: 'b.md', id: 'i2' },
    { path: 'c.md', id: 'i3' },
    { path: 'd.md', id: 'i4' },
  ]);
  const first = planRepair(findings, snap, { maxShare: 1 });
  const second = planRepair([...findings].reverse(), snap, { maxShare: 1 });

  assert.deepEqual(first, second);
  const froms = first.ops.filter((op) => op.kind === 'move').map((op) => op.from);
  assert.equal(new Set(froms).size, froms.length);
  assert.deepEqual(first.ops.map((op) => op.kind), ['remove-dir', 'remove-dir', 'move']);
});

test('paths are normalized before they reach an op', () => {
  const plan = planRepair(
    [finding('path-mismatch', { path: './Входящие\\баги.md' })],
    snapshot([{ path: 'Входящие/баги.md', id: 'i1', folder: 'Проекты/SLAG/' }]),
  );
  assert.equal(plan.ops.length, 1);
  assert.equal(plan.ops[0].from, 'Входящие/баги.md');
  assert.equal(plan.ops[0].to, 'Проекты/SLAG/баги.md');
});
