// The tools the assistant may call: search notes, read one, and report on the vault.
import type { SlagItem, SuggestedAction, BatchUpdateItem, ItemUpdates } from '../../types';
import { querySearch, getSearchableAttachmentText } from '../searchService';
import { serializeItemToMarkdown } from '../vault/markdownSerializer';
import { storage } from '../storage';
import { parseTodoistInput } from '../time/todoistTaskParser';
import { DEFAULT_INBOX_FOLDER, AI_LIMITS } from '../../config';
import { cleanSnippetText } from './actionParser';
import { getAppGuideContent } from './appGuide';
import { memoryService } from '../memory';

interface ToolExecutorParams {
  allItems: SlagItem[];
  currentFolder: string;
  isInbox: boolean;
  capturedActions: SuggestedAction[];
  setCapturedFeedFilter: (filter: { itemIds: string[]; queryLabel: string }) => void;
}

export function createLocalToolExecutor(params: ToolExecutorParams) {
  const { allItems, currentFolder, isInbox, capturedActions, setCapturedFeedFilter } = params;

  return async (name: string, args: Record<string, any>): Promise<any> => {
    if (name === 'search_notes') {
      const query = typeof args.query === 'string' ? args.query.trim() : '';
      const requestedType = args.type && args.type !== 'all' ? args.type : undefined;
      const folderFilter = isInbox ? args.folder : currentFolder;

      // Base search pool: text query or type filter
      let pool = query
        ? await querySearch(query, allItems, requestedType)
        : allItems.filter((i) => (!requestedType ? true : i.type === requestedType));

      // Deduplicate pool by ID
      pool = Array.from(new Map(pool.map((item) => [item.id, item])).values());

      // Folder scoping
      if (folderFilter && folderFilter !== DEFAULT_INBOX_FOLDER && folderFilter !== 'all') {
        pool = pool.filter((i) => i.folder === folderFilter || i.folder.startsWith(folderFilter + '/'));
      }

      // Timeframe filtering
      const tf = (args.timeframe || 'all').toLowerCase();
      const todayMidnight = new Date().setHours(0, 0, 0, 0);
      const yesterdayMidnight = todayMidnight - 86400000;
      const now = Date.now();

      if (tf === 'today') {
        pool = pool.filter((i) => {
          const t = Math.max(i.createdAt || 0, i.updatedAt || 0);
          return t >= todayMidnight;
        });
      } else if (tf === 'yesterday') {
        pool = pool.filter((i) => {
          const t = Math.max(i.createdAt || 0, i.updatedAt || 0);
          return t >= yesterdayMidnight && t < todayMidnight;
        });
      } else if (tf === 'week') {
        const weekAgo = now - 7 * 86400000;
        pool = pool.filter((i) => Math.max(i.createdAt || 0, i.updatedAt || 0) >= weekAgo);
      } else if (tf === 'month') {
        const monthAgo = now - 30 * 86400000;
        pool = pool.filter((i) => Math.max(i.createdAt || 0, i.updatedAt || 0) >= monthAgo);
      }

      // Sorting
      const defaultSort = (tf === 'today' || tf === 'yesterday' || !query) ? 'recent' : 'relevance';
      const sortBy = (args.sortBy || defaultSort).toLowerCase();
      if (sortBy === 'recent') {
        pool.sort((a, b) => Math.max(b.createdAt || 0, b.updatedAt || 0) - Math.max(a.createdAt || 0, a.updatedAt || 0));
      } else if (sortBy === 'oldest') {
        pool.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      }

      // Limit
      const limit = Math.min(Math.max(Number(args.limit) || AI_LIMITS.SEARCH_RESULTS_DEFAULT, 1), AI_LIMITS.SEARCH_RESULTS_MAX);
      pool = pool.slice(0, limit);

      return pool.map((item) => {
        const bodySnippet = cleanSnippetText(item.content || '', AI_LIMITS.TEXT_SNIPPET_LENGTH);
        const attachSnippet = cleanSnippetText(getSearchableAttachmentText(item.attachments), AI_LIMITS.ATTACHMENT_SNIPPET_LENGTH);
        let snippet = bodySnippet;
        if (attachSnippet) {
          snippet = snippet ? `${snippet} [Вложения: ${attachSnippet}]` : `[Вложения: ${attachSnippet}]`;
        }

        const itemTime = Math.max(item.createdAt || 0, item.updatedAt || 0);
        let dateStr = new Date(itemTime || now).toISOString().slice(0, 10);
        if (itemTime >= todayMidnight) {
          dateStr = `Сегодня, ${new Date(itemTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
        } else if (itemTime >= yesterdayMidnight) {
          dateStr = `Вчера, ${new Date(itemTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
        }

        return {
          id: item.id,
          title: item.title,
          type: item.type,
          folder: item.folder,
          date: dateStr,
          tags: item.tags || [],
          ...(item.type === 'task' ? { status: item.status, priority: item.priority || 'medium', dueDate: item.dueDate } : {}),
          snippet: snippet || '(пусто)',
        };
      });
    }

    if (name === 'read_note') {
      const targetQuery = String(args.id || '').toLowerCase().trim();
      let note = allItems.find((i) => i.id === targetQuery || i.title.toLowerCase() === targetQuery);
      if (!note) {
        const cleanTitle = targetQuery.replace(/^\[\[|\]\]$/g, '').trim();
        note = allItems.find((i) => i.title.toLowerCase() === cleanTitle || i.title.toLowerCase().includes(cleanTitle));
      }
      if (!note) return { error: `Заметка с ID/названием "${args.id}" не найдена` };

      let markdown = serializeItemToMarkdown(note);
      const enriched = (note.attachments || []).filter(a => a.extractedText || a.summary);
      if (enriched.length > 0) {
        const attachBlock = enriched.map(att => {
          const icon = att.type === 'audio' ? '🎙' : att.type === 'image' ? '🖼' : '📄';
          const label = att.summary ? `**${att.name}** (Суть: ${att.summary})` : `**${att.name}**`;
          const text = att.extractedText ? `\n> ${att.extractedText.replace(/\n/g, '\n> ')}` : '';
          return `- ${icon} ${label}${text}`;
        }).join('\n');
        markdown = `${markdown}\n\n### Вложения и расшифровки\n${attachBlock}`;
      }

      return {
        id: note.id,
        title: note.title,
        folder: note.folder,
        markdown: markdown.slice(0, 4500),
        attachments: (note.attachments || []).map(att => ({
          name: att.name,
          type: att.type,
          summary: att.summary,
          extractedText: att.extractedText ? att.extractedText.slice(0, 300) : undefined,
        })),
      };
    }

    if (name === 'get_vault_stats') {
      return storage.getVaultStats(isInbox ? undefined : currentFolder);
    }

    if (name === 'get_calendar_agenda') {
      const today = new Date().toISOString().slice(0, 10);
      const targetDate = args.date || today;
      const tasks = allItems.filter((i) => {
        if (i.type !== 'task') return false;
        if (!isInbox && i.folder !== currentFolder && !i.folder.startsWith(currentFolder + '/')) return false;
        return true;
      });

      const overdue = tasks.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate < today);
      const scheduledOnDate = tasks.filter((t) => t.dueDate === targetDate);
      const unscheduled = tasks.filter((t) => t.status !== 'done' && !t.dueDate);

      return {
        targetDate,
        overdueCount: overdue.length,
        overdueTasks: overdue.slice(0, 5).map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate, priority: t.priority })),
        scheduledCount: scheduledOnDate.length,
        scheduledTasks: scheduledOnDate.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          reminder: t.reminder,
          subtasksCount: t.subtasks?.length || 0,
        })),
        unscheduledCount: unscheduled.length,
      };
    }

    if (name === 'memory') {
      const op = String(args.op ?? '').toLowerCase();

      if (op === 'remember') {
        const result = memoryService.remember({
          text: String(args.text ?? ''),
          kind: args.kind,
          tag: typeof args.tag === 'string' ? args.tag : undefined,
          importance: args.importance === undefined ? undefined : Number(args.importance),
          replaces: typeof args.replaces === 'string' ? args.replaces : undefined,
        });
        if (!result) {
          return { error: 'Пустой факт. Передайте text — одну короткую фразу от третьего лица.' };
        }
        return {
          status: result.status,
          id: result.item.id,
          kind: result.item.kind,
          tag: result.item.tag,
          replacedId: result.superseded?.id,
          message:
            result.status === 'merged'
              ? 'Этот факт уже был в памяти, отметил повтор.'
              : 'Запомнил.',
        };
      }

      if (op === 'forget') {
        const removed = memoryService.forget(String(args.id || args.text || ''));
        return removed
          ? { status: 'forgotten', message: 'Убрал из памяти.' }
          : { error: 'Такой записи в памяти нет. Уточните id или текст факта.' };
      }

      if (op === 'recall') {
        const items = memoryService.recall({
          query: String(args.text ?? ''),
          kind: args.kind,
          tag: typeof args.tag === 'string' ? args.tag : undefined,
          limit: 8,
        });
        return {
          count: items.length,
          items: items.map((item) => ({
            id: item.id,
            text: item.text,
            kind: item.kind,
            tag: item.tag,
            importance: item.importance,
          })),
        };
      }

      return { error: 'op должен быть remember, forget или recall.' };
    }

    if (name === 'save_item' || name === 'create_note' || name === 'schedule_task' || name === 'update_item') {
      const rawTitle = String(args.title || '').trim();
      const rawId = String(args.id || args.targetItemId || '').trim();
      const rawUpdates: ItemUpdates = args.updates || {};

      const content = args.content !== undefined ? args.content : rawUpdates.content;
      const appendContent = args.appendContent || rawUpdates.appendContent;
      const folder = args.folder || rawUpdates.folder;
      const itemType = args.itemType || (rawUpdates as any).type || (name === 'schedule_task' ? 'task' : undefined);
      const tags = args.tags || rawUpdates.tags;
      let dueDate = args.dueDate !== undefined ? args.dueDate : rawUpdates.dueDate;
      let reminder = args.reminder !== undefined ? args.reminder : rawUpdates.reminder;
      let priority = args.priority || rawUpdates.priority;
      const status = args.status || rawUpdates.status;
      const subtasks = args.subtasks || rawUpdates.subtasks;

      const dueDateText = args.dueDateText || (rawUpdates as any).dueDateText;
      if (dueDateText) {
        const parsed = parseTodoistInput(dueDateText);
        if (parsed.dueDate) dueDate = parsed.dueDate;
        if (parsed.reminder) reminder = parsed.reminder;
        if (parsed.priority) priority = parsed.priority;
      }

      const titleQuery = rawTitle.toLowerCase();
      const found = rawId
        ? allItems.find((i) => i.id === rawId || i.title.toLowerCase() === rawId.toLowerCase())
        : (name === 'update_item' || args.actionLabel || (titleQuery && (status || appendContent || (priority && !dueDate))))
          ? allItems.find((i) => i.title.toLowerCase() === titleQuery || i.title.toLowerCase().includes(titleQuery) || titleQuery.includes(i.title.toLowerCase()))
          : null;

      if (name === 'update_item' && !found) {
        const available = allItems.slice(0, 5).map(t => `«${t.title}» (id: ${t.id})`);
        return {
          error: `Запись не найдена по запросу "${args.title || args.targetItemId || args.id}". Доступные записи: ${available.join(', ') || 'нет записей'}. Уточните title или targetItemId.`,
        };
      }

      if (found) {
        if (reminder && !reminder.includes('T')) {
          const effectiveDate = dueDate || found.dueDate || new Date().toISOString().slice(0, 10);
          dueDate = effectiveDate;
          const time = reminder.trim();
          reminder = `${effectiveDate}T${time.length === 5 ? time : time.slice(0, 5)}:00`;
        }

        let actionLabel = args.actionLabel || (rawUpdates as any).actionLabel;
        if (!actionLabel) {
          if (appendContent) actionLabel = 'Дополнение заметки';
          else if (dueDate !== undefined) actionLabel = dueDate ? 'Перенос срока' : 'Снятие срока';
          else if (priority) actionLabel = `Приоритет ➔ ${priority.toUpperCase()}`;
          else if (status) actionLabel = `Статус ➔ ${status}`;
          else if (folder) actionLabel = 'Перемещение записи';
          else actionLabel = 'Обновление записи';
        }

        const resolvedUpdates: ItemUpdates = {
          ...rawUpdates,
          title: rawTitle || found.title,
          content: content !== undefined ? content : undefined,
          appendContent,
          folder: folder || found.folder,
          type: itemType || found.type,
          dueDate: dueDate !== undefined ? (dueDate || undefined) : undefined,
          reminder: reminder !== undefined ? (reminder || undefined) : undefined,
          priority,
          status,
          tags: tags || found.tags,
          subtasks: Array.isArray(subtasks)
            ? subtasks.map((st: any, idx: number) => typeof st === 'string' ? { id: `st_${Date.now()}_${idx}`, title: st, completed: false } : st)
            : undefined,
        };

        const formattedSubtasks = Array.isArray(resolvedUpdates.subtasks)
          ? resolvedUpdates.subtasks.map((st: any, idx: number) =>
              typeof st === 'string'
                ? { id: `st_${Date.now()}_${idx}`, title: st, completed: false }
                : { id: st.id || `st_${Date.now()}_${idx}`, title: st.title || '', completed: Boolean(st.completed) }
            )
          : undefined;

        capturedActions.push({
          type: 'update_item',
          targetItemId: found.id,
          title: found.title,
          actionLabel,
          folder: resolvedUpdates.folder || found.folder,
          content: resolvedUpdates.content || '',
          appendContent: resolvedUpdates.appendContent,
          tags: resolvedUpdates.tags || found.tags || [],
          itemType: resolvedUpdates.type || found.type,
          dueDate: resolvedUpdates.dueDate || undefined,
          reminder: resolvedUpdates.reminder || undefined,
          priority: resolvedUpdates.priority,
          status: resolvedUpdates.status,
          subtasks: formattedSubtasks,
          updates: resolvedUpdates,
          actionState: 'suggested',
        });

        return {
          status: 'proposed',
          message: `Изменения для «${found.title}» подготовлены. В интерфейсе пользователю отображена интерактивная карточка подтверждения. Завершите ответ подтверждением.`,
        };
      }

      if (reminder && !reminder.includes('T') && dueDate) {
        reminder = `${dueDate}T${reminder}:00`;
      }

      const effectiveType = itemType || (name === 'schedule_task' || dueDate ? 'task' : 'note');

      capturedActions.push({
        type: 'create_note',
        title: rawTitle || 'Новая запись',
        folder: folder || currentFolder,
        content: content || appendContent || '',
        dueDate,
        reminder,
        priority: priority || (effectiveType === 'task' ? 'medium' : undefined),
        status: status || (effectiveType === 'task' ? 'todo' : undefined),
        tags: Array.isArray(tags) ? tags : [],
        itemType: effectiveType,
        subtasks: Array.isArray(subtasks)
          ? subtasks.map((st: any, idx: number) => typeof st === 'string' ? { id: `st_${Date.now()}_${idx}`, title: st, completed: false } : st)
          : undefined,
        actionState: 'suggested',
      });

      const typeLabel = effectiveType === 'task' ? 'задачи' : (effectiveType === 'article' ? 'статьи' : 'заметки');
      return {
        status: 'proposed',
        message: `Черновик ${typeLabel} «${rawTitle || 'Новая запись'}» подготовлен к сохранению в хранилище. В интерфейсе пользователю отображена карточка подтверждения. Завершите ответ кратким подтверждением.`,
      };
    }

    if (name === 'batch_update_items') {
      const rawItems = Array.isArray(args.items) ? args.items : [];
      if (rawItems.length === 0) {
        return {
          error: 'Список записей для обновления пуст. Передайте массив items с объектами { targetItemId?, title?, updates }.',
        };
      }

      const resolvedItems: BatchUpdateItem[] = [];
      const missing: string[] = [];

      for (const item of rawItems) {
        const tId = String(item.targetItemId || '').trim();
        const tTitle = String(item.title || '').trim().toLowerCase();
        const target = allItems.find((i) =>
          (tId && i.id === tId) ||
          (tTitle && (i.title.toLowerCase() === tTitle || i.title.toLowerCase().includes(tTitle) || tTitle.includes(i.title.toLowerCase())))
        );

        if (!target) {
          missing.push(item.title || item.targetItemId || 'неизвестная');
          continue;
        }

        const rawUpdates: ItemUpdates = item.updates || {};
        if ((rawUpdates as any).dueDateText) {
          const parsed = parseTodoistInput((rawUpdates as any).dueDateText);
          if (parsed.dueDate) rawUpdates.dueDate = parsed.dueDate;
          if (parsed.reminder) rawUpdates.reminder = parsed.reminder;
          if (parsed.priority) rawUpdates.priority = parsed.priority;
        }

        if (rawUpdates.reminder && !rawUpdates.reminder.includes('T')) {
          const effectiveDate = rawUpdates.dueDate || target.dueDate || new Date().toISOString().slice(0, 10);
          rawUpdates.dueDate = effectiveDate;
          const time = rawUpdates.reminder.trim();
          rawUpdates.reminder = `${effectiveDate}T${time.length === 5 ? time : time.slice(0, 5)}:00`;
        }

        resolvedItems.push({
          targetItemId: target.id,
          title: target.title,
          updates: rawUpdates,
          reason: item.reason,
        });
      }

      if (resolvedItems.length === 0) {
        const available = allItems.slice(0, 5).map(t => `«${t.title}» (id: ${t.id})`);
        return {
          error: `Ни одна из указанных записей не найдена (${missing.join(', ')}). Доступные записи: ${available.join(', ')}. Вызовите batch_update_items с точными названиями или id из этого списка.`,
        };
      }

      const hasDueDate = resolvedItems.some(i => i.updates?.dueDate !== undefined);
      const hasPriority = resolvedItems.some(i => i.updates?.priority !== undefined);
      const hasStatus = resolvedItems.some(i => i.updates?.status !== undefined);
      let defaultBatchTitle = `Пакетное обновление (${resolvedItems.length})`;
      if (hasDueDate && !hasPriority && !hasStatus) {
        defaultBatchTitle = `Перенос задач (${resolvedItems.length})`;
      } else if (hasPriority && !hasDueDate) {
        defaultBatchTitle = `Изменение приоритета (${resolvedItems.length})`;
      } else if (hasStatus && !hasDueDate) {
        defaultBatchTitle = `Смена статуса (${resolvedItems.length})`;
      }

      capturedActions.push({
        type: 'batch_update',
        title: args.title || defaultBatchTitle,
        actionLabel: args.title || defaultBatchTitle,
        folder: currentFolder,
        content: '',
        tags: [],
        itemType: 'task',
        batchUpdateItems: resolvedItems,
        actionState: 'suggested',
      });

      return {
        status: 'proposed',
        message: `Подготовлено пакетное обновление для ${resolvedItems.length} записей. В интерфейсе пользователю отображена карточка подтверждения со списком предложенных изменений. Завершите ответ кратким резюме.`,
      };
    }

    if (name === 'filter_feed') {
      let matchedItems: SlagItem[] = [];
      const rawIds = Array.isArray(args.itemIds) ? args.itemIds : [];
      const rawTitles = Array.isArray(args.itemTitles) ? args.itemTitles : [];

      if (rawIds.length > 0) {
        matchedItems = allItems.filter(i => rawIds.includes(i.id));
      } else if (rawTitles.length > 0) {
        matchedItems = allItems.filter(i =>
          rawTitles.some((t: string) => i.title.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(i.title.toLowerCase()))
        );
      } else {
        matchedItems = allItems.slice(0, 5);
      }

      const queryLabel = args.queryLabel || 'Выборка ассистента';
      setCapturedFeedFilter({
        itemIds: matchedItems.map(i => i.id),
        queryLabel,
      });

      return {
        status: 'applied',
        count: matchedItems.length,
        message: `В ленте активирован фильтр ИИ «${queryLabel}» (${matchedItems.length} записей).`,
      };
    }

    if (name === 'web_search') {
      return {
        query: args.query,
        info: `Внешний поиск выполнен: результаты по запросу "${args.query}"`,
      };
    }

    if (name === 'get_app_guide') {
      const guide = getAppGuideContent(args.topics);
      return {
        status: 'success',
        guide,
      };
    }

    return { error: `Неизвестный инструмент: ${name}` };
  };
}
