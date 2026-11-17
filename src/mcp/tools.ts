// MCP tools that read and write notes, tasks and folders in a vault over JSON-RPC.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpVault } from './vault';
import type { SlagItem } from '../types';

import {
  SaveNoteSchema,
  GetNoteSchema,
  SearchNotesSchema,
  ListNotesSchema,
  DeleteNoteSchema,
  ListTasksSchema,
  ToggleTaskSchema,
  CreateFolderSchema,
} from './types';

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
        const actionWord = res.created ? 'создана' : 'обновлена';
        const typeWord = res.item.type === 'task' ? 'Задача' : (res.item.type === 'article' ? 'Статья' : 'Заметка');
        const dueInfo = res.item.dueDate ? `, срок: ${res.item.dueDate}` : '';
        const priorityInfo = res.item.priority && res.item.priority !== 'none' ? `, приоритет: ${res.item.priority.toUpperCase()}` : '';

        return {
          content: [
            {
              type: 'text',
              text: `${typeWord} «${res.item.title}» успешно ${actionWord}.\nID: ${res.item.id}\nПапка: ${res.item.folder}\nФайл: ${res.path}${dueInfo}${priorityInfo}${taskSchedule(res.item)}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Ошибка сохранения: ${err.message}` }],
        };
      }
    }
  );

  // 2. get_note
  server.tool(
    'get_note',
    'Прочитать полное содержимое заметки, задачи или статьи по ID, заголовку или имени файла.',
    GetNoteSchema,
    async (args) => {
      try {
        const res = await vault.getNote(args.idOrTitle);
        return {
          content: [
            {
              type: 'text',
              text: res.rawMarkdown,
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: err.message }],
        };
      }
    }
  );

  // 3. search_notes
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
          return `${idx + 1}. [${item.type.toUpperCase()}] «${item.title}» (id: ${item.id}, папка: ${item.folder})${statusStr}${dueStr}${tagsStr}${taskSchedule(item)}\n   ${snippet}`;
        });

        return {
          content: [
            {
              type: 'text',
              text: `Найдено совпадений: ${results.length}\n\n${lines.join('\n\n')}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Ошибка поиска: ${err.message}` }],
        };
      }
    }
  );

  // 4. list_notes
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
          const tagsStr = item.tags.length > 0 ? ` | теги: ${item.tags.join(', ')}` : '';
          return `${idx + 1}. [${item.type}] «${item.title}» (id: ${item.id}, ${item.folder})${statusStr}${dueStr}${tagsStr}${taskSchedule(item)}`;
        });

        return {
          content: [
            {
              type: 'text',
              text: `Всего найдено: ${filtered.length} (показано ${limited.length}):\n${lines.join('\n')}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Ошибка листинга: ${err.message}` }],
        };
      }
    }
  );

  // 5. delete_note (Safe .trash move)
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
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: err.message }],
        };
      }
    }
  );

  // 6. list_tasks
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
          return `${idx + 1}. ${statusMark}${priority}«${t.title}» (id: ${t.id}, ${t.folder})${due}${subtaskProgress}${taskSchedule(t)}`;
        });

        return {
          content: [
            {
              type: 'text',
              text: `Задачи (${args.view}): ${tasks.length} шт.\n\n${lines.join('\n')}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Ошибка: ${err.message}` }],
        };
      }
    }
  );

  // 7. toggle_task
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
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: err.message }],
        };
      }
    }
  );

  // 8. list_folders
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
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Ошибка: ${err.message}` }],
        };
      }
    }
  );

  // 9. create_folder
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
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Ошибка создания папки: ${err.message}` }],
        };
      }
    }
  );

  // 10. list_tags (Taxonomy First)
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
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Ошибка: ${err.message}` }],
        };
      }
    }
  );

  // 11. get_vault_stats
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
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Ошибка: ${err.message}` }],
        };
      }
    }
  );
}
