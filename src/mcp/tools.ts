// MCP tools that read and write notes, tasks, folders and attachments in a vault over JSON-RPC.
import type { SlagItem } from '../types';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpVault, AttachmentRead } from './vault';
import { formatAttachmentCount, formatBytes, renderNoteCard } from './noteCard';
import {
  SaveNoteSchema,
  GetNoteSchema,
  ReadAttachmentSchema,
  SearchNotesSchema,
  ListNotesSchema,
  DeleteNoteSchema,
  ListTasksSchema,
  ToggleTaskSchema,
  CreateFolderSchema,
} from './types';

/** The message of a thrown value, without assuming it is an Error. */
function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Header shared by every read_attachment answer: what was asked for and where it lives. */
function attachmentHeader(read: AttachmentRead): string {
  const { attachment, note } = read;
  const size = attachment.absolutePath
    ? `${attachment.sizeHuman} · ${attachment.absolutePath}`
    : `${attachment.sizeHuman} · байтов на этом диске нет`;
  return [
    `вложение «${attachment.name}» заметки «${note.title}»`,
    `mime: ${attachment.mimeType} · тип: ${attachment.type}${attachment.isImage ? ' (картинка)' : ''} · размер: ${size}`,
    `путь в хранилище: ${attachment.relativePath}`,
  ].join('\n');
}

function taskSchedule(item: SlagItem): string {
  if (item.type !== 'task') return '';
  return ` | ${JSON.stringify({ dueDate: item.dueDate ?? null, reminder: item.reminder ?? null, duration: item.duration ?? null, recurrence: item.recurrence ?? null })}`;
}

export function registerMcpTools(server: McpServer, vault: McpVault): void {
  // 1. save_note (Universal Create / Update pattern)
  server.tool(
    'save_note',
    'Создать новую или обновить существующую заметку, задачу или статью. Перед обновлением прочитай get_note, передай id; пропущенные поля сохраняются. Без id создается новая запись. Дату, длительность и повтор передавай в dueDate, duration (минуты), recurrence, а не только в тексте. Не выдумывай расписание: уточни неоднозначные дату/часовой пояс. Для снятия расписания передай null. После изменения проверь get_note. Перед тегами/папкой сверяй list_tags/list_folders.',
    SaveNoteSchema,
    async (args) => {
      try {
        const res = await vault.saveNote(args);
        // Check if this was a status-only update (mailbox path): only id and status were sent.
        const isStatusOnly = args.status !== undefined && args.id !== undefined &&
          Object.keys(args).length === 2;
        const typeWord = res.item.type === 'task' ? 'Задача' : (res.item.type === 'article' ? 'Статья' : 'Заметка');
        const dueInfo = res.item.dueDate ? `, срок: ${res.item.dueDate}` : '';
        const priorityInfo = res.item.priority && res.item.priority !== 'none' ? `, приоритет: ${res.item.priority.toUpperCase()}` : '';
        const statusInfo = res.item.status ? ` | статус: ${res.item.status}` : '';

        return {
          content: [
            {
              type: 'text',
              text: isStatusOnly
                ? `Статус задачи «${res.item.title}» обновлён.\nID: ${res.item.id}\nНовый статус: ${res.item.status}`
                : `${typeWord} «${res.item.title}» успешно обновлена.\nID: ${res.item.id}\nПапка: ${res.item.folder}\nФайл: ${res.path}${dueInfo}${priorityInfo}${statusInfo}`,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Ошибка сохранения: ${messageOf(err)}` }],
        };
      }
    }
  );

  // 2. get_note (one call, the whole card)
  server.tool(
    'get_note',
    'Прочитать заметку, задачу или статью целиком одним вызовом: заголовок, тип, папка и её путь, теги, статус, приоритет, срок, даты создания и изменения, чеклист с подзадачами и вложенностью, markdown, связи и список вложений (имя, mime, размер, путь и url). Отдельные вызовы за метаданными или вложениями не нужны.',
    GetNoteSchema,
    async (args) => {
      try {
        const card = await vault.getNoteCard(args.idOrTitle);
        return {
          content: [{ type: 'text', text: renderNoteCard(card) }],
          structuredContent: { card },
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: messageOf(err) }],
        };
      }
    }
  );

  // 3. read_attachment
  server.tool(
    'read_attachment',
    'Прочитать вложение заметки по её имени из списка attachments: текст файла или транскрипт аудио приходит текстом, картинка — base64 с mime. Размер ограничен, при превышении — внятная ошибка с путём на диске.',
    ReadAttachmentSchema,
    async (args) => {
      try {
        const read = await vault.readAttachment(args.note, args.filename);
        const header = attachmentHeader(read);

        switch (read.payload.kind) {
          case 'text': {
            const source = read.payload.origin === 'transcript' ? ' (транскрипт)' : '';
            return {
              content: [{ type: 'text', text: `${header}${source}\n\n${read.payload.text}` }],
            };
          }
          case 'image':
            return {
              content: [
                {
                  type: 'text',
                  text: `${header}\n\nкартинка ниже: base64, mime ${read.payload.mimeType}`,
                },
                { type: 'image', data: read.payload.base64, mimeType: read.payload.mimeType },
              ],
            };
          case 'binary':
            return {
              content: [
                {
                  type: 'text',
                  text: `${header}\n\nbase64 (${read.payload.mimeType}):\n${read.payload.base64}`,
                },
              ],
            };
          case 'no-bytes':
            return {
              isError: true,
              content: [
                {
                  type: 'text',
                  text: `${header}\n\nбайтов на этом диске нет: файл приехал из синка и лежит только на другом устройстве. Метаданные вложения — в карточке заметки.`,
                },
              ],
            };
          case 'too-large':
            return {
              isError: true,
              content: [
                {
                  type: 'text',
                  text: `${header}\n\nвложение весит ${formatBytes(read.payload.size)}, лимит чтения — ${formatBytes(read.payload.limit)}. Файл не читается целиком; возьмите его по пути из карточки или уменьшите.`,
                },
              ],
            };
          case 'no-transcript':
            return {
              content: [
                {
                  type: 'text',
                  text: `${header}\n\nтранскрипта нет: аудио не распознано, поэтому текстом его не отдать. Остальные поля — в карточке заметки.`,
                },
              ],
            };
        }
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: messageOf(err) }],
        };
      }
    }
  );

  // 4. search_notes
  server.tool(
    'search_notes',
    'Полнотекстовый и метаданный поиск по заметкам, таскам и статьям хранилища с фильтрами по папке, типу, статусу и тегу.',
    SearchNotesSchema,
    async (args) => {
      try {
        const results = await vault.searchNotes(args);
        if (results.length === 0) {
          return {
            content: [{ type: 'text', text: `По запросу «${args.query}» ничего не найдено.` }],
          };
        }

        const lines = results.map(({ item, snippet }, idx) => {
          const tagsStr = item.tags.length > 0 ? ` [${item.tags.map(t => `#${t}`).join(' ')}]` : '';
          const statusStr = item.status ? ` (${item.status})` : '';
          const dueStr = item.dueDate ? ` 📅 ${item.dueDate}` : '';
          const attachmentsStr = formatAttachmentCount(item.attachments.length);
          return `${idx + 1}. [${item.type.toUpperCase()}] «${item.title}» (id: ${item.id}, папка: ${item.folder})${statusStr}${dueStr}${attachmentsStr}${tagsStr}${taskSchedule(item)}\n   ${snippet}`;
        });

        return {
          content: [
            {
              type: 'text',
              text: `Найдено совпадений: ${results.length}\n\n${lines.join('\n\n')}`,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Ошибка поиска: ${messageOf(err)}` }],
        };
      }
    }
  );

  // 5. list_notes
  server.tool(
    'list_notes',
    'Получить список заметок с фильтрацией по папке, типу, тегу и сортировкой.',
    ListNotesSchema,
    async (args) => {
      try {
        const all = await vault.scanAllNotes();
        let filtered = all.map(m => m.item);

        if (args.folder) {
          const fLow = args.folder.toLowerCase();
          filtered = filtered.filter(i => i.folder.toLowerCase() === fLow || i.folder.toLowerCase().startsWith(`${fLow}/`));
        }
        if (args.type && args.type !== 'all') {
          filtered = filtered.filter(i => i.type === args.type);
        }
        if (args.tag) {
          const cleanTag = args.tag.replace(/^#/, '').toLowerCase();
          filtered = filtered.filter(i => i.tags.some(t => t.toLowerCase() === cleanTag));
        }

        const sortBy = args.sortBy || 'recent';
        if (sortBy === 'title') {
          filtered.sort((a, b) => a.title.localeCompare(b.title));
        } else if (sortBy === 'priority') {
          const priorityWeight: Record<string, number> = { high: 3, medium: 2, low: 1, none: 0 };
          filtered.sort((a, b) => (priorityWeight[b.priority || 'none'] || 0) - (priorityWeight[a.priority || 'none'] || 0));
        } else {
          filtered.sort((a, b) => b.updatedAt - a.updatedAt);
        }

        const limited = filtered.slice(0, args.limit || 20);
        if (limited.length === 0) {
          return {
            content: [{ type: 'text', text: 'Заметок не найдено.' }],
          };
        }

        const lines = limited.map((item, idx) => {
          const dueStr = item.dueDate ? ` | срок: ${item.dueDate}` : '';
          const statusStr = item.status ? ` | статус: ${item.status}` : '';
          const attachmentsStr = formatAttachmentCount(item.attachments.length);
          const tagsStr = item.tags.length > 0 ? ` | теги: ${item.tags.join(', ')}` : '';
          return `${idx + 1}. [${item.type}] «${item.title}» (id: ${item.id}, ${item.folder})${statusStr}${dueStr}${attachmentsStr}${tagsStr}${taskSchedule(item)}`;
        });

        return {
          content: [
            {
              type: 'text',
              text: `Всего найдено: ${filtered.length} (показано ${limited.length}):\n${lines.join('\n')}`,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Ошибка листинга: ${messageOf(err)}` }],
        };
      }
    }
  );

  // 6. delete_note (Safe .trash move)
  server.tool(
    'delete_note',
    'Безопасно переместить заметку или задачу в корзину .trash/ хранилища (Obsidian Local-First contract).',
    DeleteNoteSchema,
    async (args) => {
      try {
        const res = await vault.deleteNote(args.idOrTitle);
        return {
          content: [
            {
              type: 'text',
              text: `Запись «${res.item.title}» (id: ${res.item.id}) перемещена в корзину .trash/ (${res.trashPath}).`,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: messageOf(err) }],
        };
      }
    }
  );

  // 7. list_tasks
  server.tool(
    'list_tasks',
    'Получить срез задач: на сегодня (today), просроченные (overdue), будущие (upcoming), бэклог (backlog), выполненные (completed) или все.',
    ListTasksSchema,
    async (args) => {
      try {
        const tasks = await vault.listTasks(args.view, args.folder);
        if (tasks.length === 0) {
          return {
            content: [{ type: 'text', text: `Задач в категории «${args.view}» нет.` }],
          };
        }

        const lines = tasks.map((t, idx) => {
          const priority = t.priority && t.priority !== 'none' ? `[${t.priority.toUpperCase()}] ` : '';
          const due = t.dueDate ? ` (до ${t.dueDate})` : '';
          const subtaskProgress = t.subtasks && t.subtasks.length > 0
            ? ` [Чеклист: ${t.subtasks.filter(s => s.completed).length}/${t.subtasks.length}]`
            : '';
          const statusMark = t.status === 'done' ? '✓ ' : '○ ';
          const attachmentsStr = formatAttachmentCount(t.attachments.length);
          return `${idx + 1}. ${statusMark}${priority}«${t.title}» (id: ${t.id}, ${t.folder})${due}${subtaskProgress}${attachmentsStr}${taskSchedule(t)}`;
        });

        return {
          content: [
            {
              type: 'text',
              text: `Задачи (${args.view}): ${tasks.length} шт.\n\n${lines.join('\n')}`,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Ошибка: ${messageOf(err)}` }],
        };
      }
    }
  );

  // 8. toggle_task
  server.tool(
    'toggle_task',
    'Отметить задачу как выполненную/невыполненную или переключить конкретный чекбокс подзадачи.',
    ToggleTaskSchema,
    async (args) => {
      try {
        const updated = await vault.toggleTask(args.id, args.subtaskId, args.status);
        if (args.subtaskId) {
          return {
            content: [
              {
                type: 'text',
                text: `Чекбокс в задаче «${updated.title}» переключен. Подзадачи:\n${(updated.subtasks || []).map(s => `- [${s.completed ? 'x' : ' '}] ${s.title}`).join('\n')}`,
              },
            ],
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: `Статус задачи «${updated.title}» изменен на ${updated.status?.toUpperCase()}.`,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: messageOf(err) }],
        };
      }
    }
  );

  // 9. list_folders
  server.tool(
    'list_folders',
    'Получить дерево папок хранилища вместе с их описаниями для классификации мыслей и заметок ИИ.',
    {},
    async () => {
      try {
        const folders = await vault.getFolders();
        const formatted = folders.map(f => `• ${f.path}: ${f.description || f.name}`);
        return {
          content: [
            {
              type: 'text',
              text: `Папки хранилища SLAG (${folders.length}):\n${formatted.join('\n')}`,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Ошибка: ${messageOf(err)}` }],
        };
      }
    }
  );

  // 10. create_folder
  server.tool(
    'create_folder',
    'Создать новую папку с описанием её назначения для ИИ-триажа.',
    CreateFolderSchema,
    async (args) => {
      try {
        const folder = await vault.createFolder(args.path, args.description, args.icon);
        return {
          content: [
            {
              type: 'text',
              text: `Папка «${folder.path}» успешно зарегистрирована.\nОписание: ${folder.description}`,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Ошибка создания папки: ${messageOf(err)}` }],
        };
      }
    }
  );

  // 11. list_tags (Taxonomy First)
  server.tool(
    'list_tags',
    'Получить словарь существующих тегов с частотой их использования (используй перед генерацией новых тегов для предотвращения дублей синонимов).',
    {},
    async () => {
      try {
        const tags = await vault.listTags();
        if (tags.length === 0) {
          return {
            content: [{ type: 'text', text: 'В хранилище пока нет тегов.' }],
          };
        }
        const formatted = tags.map(t => `#${t.tag} (${t.count})`).join(', ');
        return {
          content: [
            {
              type: 'text',
              text: `Активные теги хранилища (${tags.length}):\n${formatted}`,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Ошибка: ${messageOf(err)}` }],
        };
      }
    }
  );

  // 12. get_vault_stats
  server.tool(
    'get_vault_stats',
    'Получить полную сводную статистику хранилища: количество заметок, задач, лонгридов, открытых и просроченных дел, распределение по папкам.',
    {},
    async () => {
      try {
        const stats = await vault.getStats();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(stats, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Ошибка: ${messageOf(err)}` }],
        };
      }
    }
  );
}
