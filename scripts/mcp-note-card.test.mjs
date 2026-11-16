// `get_note` answers once with the whole card. This pins the fields a bot reads and the shape it
// parses, so a second round trip for metadata or attachments never sneaks back in unnoticed.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildNoteCard,
  formatAttachmentCount,
  formatBytes,
  parseChecklist,
  renderNoteCard,
} from '../src/mcp/noteCard.ts';

const CREATED = Date.UTC(2026, 0, 2, 10, 0, 0);
const UPDATED = Date.UTC(2026, 0, 3, 11, 30, 0);
const MARKDOWN = '---\nid: note_1\n---\n\nконтекст';

function baseItem(overrides = {}) {
  return {
    id: 'note_1',
    type: 'task',
    title: 'Починить синк',
    content: 'контекст\n\n- [ ] разобрать очередь\n  - [x] логи\n- [x] прогнать тесты',
    folder: 'Проекты/SLAG',
    filename: 'Починить синк.md',
    tags: ['sync', 'bug'],
    attachments: [],
    createdAt: CREATED,
    updatedAt: UPDATED,
    status: 'in_progress',
    priority: 'high',
    dueDate: '2026-01-05',
    reminder: '2026-01-04T09:00:00.000Z',
    ...overrides,
  };
}

function photo() {
  return {
    name: 'photo.webp',
    type: 'image',
    mimeType: 'image/webp',
    size: 245760,
    sizeHuman: formatBytes(245760),
    isImage: true,
    relativePath: '.attachments/att_1_photo.webp',
    absolutePath: 'C:\\vault\\notes\\..\\..\\.attachments\\att_1_photo.webp',
    url: 'file:///C:/vault/.attachments/att_1_photo.webp',
    resourceUri: 'slag://attachments/note_1/photo.webp',
    hasBytes: true,
    hasTranscript: false,
  };
}

function card(overrides = {}) {
  return buildNoteCard({
    item: baseItem(),
    rawMarkdown: MARKDOWN,
    relativePath: 'Проекты/SLAG/Починить синк.md',
    absolutePath: 'C:\\vault\\notes\\Проекты\\SLAG\\Починить синк.md',
    folderAbsolutePath: 'C:\\vault\\notes\\Проекты\\SLAG',
    attachments: [photo()],
    replyTo: { id: 'note_0', title: 'Синк падает', type: 'note' },
    linked: [{ id: 'note_2', title: 'Очередь', type: 'note' }],
    backlinks: [{ id: 'note_3', title: 'Релиз' }],
    ...overrides,
  });
}

test('карточка несёт тип, папку, путь, теги, статус, срок и обе даты', () => {
  const value = card();

  assert.equal(value.id, 'note_1');
  assert.equal(value.title, 'Починить синк');
  assert.equal(value.type, 'task');
  assert.equal(value.folder, 'Проекты/SLAG');
  assert.equal(value.folderPath, 'Проекты/SLAG');
  assert.equal(value.path, 'Проекты/SLAG/Починить синк.md');
  assert.equal(value.folderAbsolutePath, 'C:\\vault\\notes\\Проекты\\SLAG');
  assert.equal(value.absolutePath, 'C:\\vault\\notes\\Проекты\\SLAG\\Починить синк.md');
  assert.equal(value.filename, 'Починить синк.md');
  assert.deepEqual(value.tags, ['sync', 'bug']);
  assert.equal(value.status, 'in_progress');
  assert.equal(value.priority, 'high');
  assert.equal(value.dueDate, '2026-01-05');
  assert.equal(value.reminder, '2026-01-04T09:00:00.000Z');
  assert.equal(value.createdAt, CREATED);
  assert.equal(value.createdAtIso, '2026-01-02T10:00:00.000Z');
  assert.equal(value.updatedAtIso, '2026-01-03T11:30:00.000Z');
  assert.equal(value.markdown, MARKDOWN);
  assert.equal(value.content, baseItem().content);
});

test('чеклист сохраняет отметки и вложенность', () => {
  const { checklist } = card();

  assert.equal(checklist.total, 3);
  assert.equal(checklist.done, 2);
  assert.deepEqual(
    checklist.items.map((item) => [item.text, item.completed, item.depth]),
    [
      ['разобрать очередь', false, 0],
      ['логи', true, 1],
      ['прогнать тесты', true, 0],
    ],
  );
});

test('вложения приходят списком с mime, путём и url, а не только именем', () => {
  const value = card();

  assert.equal(value.attachments.length, 1);
  const [first] = value.attachments;
  assert.equal(first.name, 'photo.webp');
  assert.equal(first.type, 'image');
  assert.equal(first.mimeType, 'image/webp');
  assert.equal(first.isImage, true);
  assert.equal(first.size, 245760);
  assert.equal(first.sizeHuman, '240.0 КБ');
  assert.equal(first.relativePath, '.attachments/att_1_photo.webp');
  assert.match(first.absolutePath, /att_1_photo\.webp$/);
  assert.match(first.url, /^file:\/\//);
  assert.equal(first.resourceUri, 'slag://attachments/note_1/photo.webp');
  assert.equal(first.hasBytes, true);
});

test('связи: ответ, связанные заметки и обратные ссылки', () => {
  const { links } = card();

  assert.equal(links.replyTo.id, 'note_0');
  assert.equal(links.replyTo.title, 'Синк падает');
  assert.deepEqual(links.linked.map((relation) => relation.id), ['note_2']);
  assert.deepEqual(links.backlinks.map((relation) => relation.id), ['note_3']);
});

test('текст карточки содержит всё, что читает бот, и markdown целиком', () => {
  const text = renderNoteCard(card());

  assert.match(text, /задача «Починить синк»/);
  assert.match(text, /папка: Проекты\/SLAG/);
  assert.match(text, /статус: in_progress/);
  assert.match(text, /приоритет: high/);
  assert.match(text, /срок: 2026-01-05/);
  assert.match(text, /теги: #sync #bug/);
  assert.match(text, /связи: ответ на «Синк падает»/);
  assert.match(text, /чеклист: 2\/3/);
  assert.match(text, /  - \[x\] логи/);
  assert.match(text, /вложения: 1/);
  assert.match(text, /photo\.webp · image\/webp/);
  assert.match(text, /markdown:\n---\nid: note_1/);
});

test('фронтматтерные подзадачи — запасной путь, когда чекбоксов в теле нет', () => {
  const value = buildNoteCard({
    item: baseItem({
      content: 'без чекбоксов',
      subtasks: [{ id: 'st_0', title: 'первый шаг', completed: false }],
    }),
    rawMarkdown: '',
    relativePath: 'Входящие/Задача.md',
    attachments: [],
  });

  assert.deepEqual(
    value.checklist.items.map((item) => [item.text, item.completed, item.depth]),
    [['первый шаг', false, 0]],
  );
});

test('parseChecklist понимает табы и все маркеры списка', () => {
  const items = parseChecklist('- [ ] одно\n\t* [X] два\n+ [ ] три');

  assert.deepEqual(
    items.map((item) => [item.completed, item.depth]),
    [[false, 0], [true, 1], [false, 0]],
  );
});

test('суффикс списка показывает вложения только когда они есть', () => {
  assert.equal(formatAttachmentCount(0), '');
  assert.equal(formatAttachmentCount(2), ' | вложения: 2');
  assert.equal(formatBytes(512), '512 Б');
  assert.equal(formatBytes(2.5 * 1024 * 1024), '2.5 МБ');
});
