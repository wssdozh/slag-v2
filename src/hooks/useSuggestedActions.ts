import { useCallback } from 'react';
import type { SlagItem, SlagItemType, ChatMessage, SuggestedAction, ItemUpdates } from '../types';
import { applyItemUpdates } from '../lib/itemUpdates';
import { parseSubtasksFromContent, migrateLegacySubtasksToContent } from '../lib/taskUtils';
import type { ToastMessage } from '../context/AppContext';

export interface ActionHistoryEntry {
  id: string;
  timestamp: number;
  description: string;
  itemSnapshots: SlagItem[];
}

export function useSuggestedActions(params: {
  items: SlagItem[];
  currentFolder: string;
  saveItem: (item: Partial<SlagItem> & { title: string; content: string; type: SlagItemType }) => SlagItem;
  updateItem: (item: SlagItem) => void;
  addToast: (text: string, type?: 'info' | 'success' | 'error', action?: ToastMessage['action']) => void;
  undoLastAction: () => boolean;
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  actionHistoryRef: React.MutableRefObject<ActionHistoryEntry[]>;
}): {
  executeSuggestedAction: (action: SuggestedAction, messageId?: string) => SlagItem | void;
  rejectAction: (messageId: string) => void;
} {
  const {
    items,
    currentFolder,
    saveItem,
    updateItem,
    addToast,
    undoLastAction,
    setChatMessages,
    actionHistoryRef,
  } = params;

  const executeSuggestedAction = useCallback((action: SuggestedAction, messageId?: string): SlagItem | void => {
    if (action.actionState === 'executing' || action.actionState === 'applied') {
      return;
    }

    if (messageId) {
      setChatMessages(prev => prev.map(m => {
        if (m.id !== messageId) return m;
        const updatedSingle = m.suggestedAction
          ? { ...m.suggestedAction, actionState: 'executing' as const }
          : undefined;
        const updatedList = m.suggestedActions
          ? m.suggestedActions.map(act => act === action || act.title === action.title ? { ...act, actionState: 'executing' as const } : act)
          : undefined;
        return {
          ...m,
          suggestedAction: updatedSingle,
          suggestedActions: updatedList,
        };
      }));
    }

    let savedItem: SlagItem | void = undefined;

    // 1. Create Note / Task / Schedule Task
    if (action.type === 'create_note' || action.type === 'schedule_task') {
      const targetFolder = action.folder || currentFolder;
      const targetType = action.itemType || (action.type === 'schedule_task' ? 'task' : 'note');

      // Prevent duplicate creation if matching item already exists (by targetItemId, appliedItemId, or exact title + folder + type)
      const existing = items.find(i =>
        (action.appliedItemId && i.id === action.appliedItemId) ||
        (action.targetItemId && i.id === action.targetItemId) ||
        (i.title.trim().toLowerCase() === action.title.trim().toLowerCase() && i.folder === targetFolder && i.type === targetType)
      );

      if (existing) {
        const rawContent = action.content !== undefined && action.content !== '' ? action.content : existing.content;
        const mergedContent = action.subtasks && action.subtasks.length > 0
          ? migrateLegacySubtasksToContent(rawContent, action.subtasks)
          : rawContent;
        const parsedSubtasks = parseSubtasksFromContent(mergedContent);

        const updated: SlagItem = {
          ...existing,
          title: action.title.trim() || existing.title,
          content: mergedContent,
          tags: action.tags && action.tags.length > 0 ? Array.from(new Set([...existing.tags, ...action.tags])) : existing.tags,
          dueDate: action.dueDate !== undefined ? action.dueDate : existing.dueDate,
          reminder: action.reminder !== undefined ? action.reminder : existing.reminder,
          priority: action.priority !== undefined ? action.priority : existing.priority,
          status: action.status !== undefined ? action.status : existing.status,
          subtasks: parsedSubtasks.length > 0 ? parsedSubtasks : existing.subtasks,
          updatedAt: Date.now(),
        };
        updateItem(updated);
        savedItem = updated;
        addToast(`Запись «${updated.title}» обновлена`, 'success');
      } else {
        const rawContent = action.content || '';
        const mergedContent = action.subtasks && action.subtasks.length > 0
          ? migrateLegacySubtasksToContent(rawContent, action.subtasks)
          : rawContent;
        const parsedSubtasks = parseSubtasksFromContent(mergedContent);

        const saved = saveItem({
          type: targetType,
          title: action.title.trim(),
          content: mergedContent,
          folder: targetFolder,
          tags: action.tags || [],
          dueDate: action.dueDate,
          reminder: action.reminder,
          priority: action.priority,
          status: action.status,
          subtasks: parsedSubtasks.length > 0 ? parsedSubtasks : action.subtasks,
        });
        savedItem = saved;
        addToast(`Запись «${saved.title}» сохранена`, 'success');
      }
    }

    // 2. Universal Update Item (single)
    else if (action.type === 'update_item') {
      const targetQuery = (action.targetItemId || action.title || '').trim().toLowerCase();
      const target = items.find(i =>
        (action.targetItemId && i.id === action.targetItemId) ||
        (targetQuery && (i.title.toLowerCase() === targetQuery || i.title.toLowerCase().includes(targetQuery) || targetQuery.includes(i.title.toLowerCase())))
      );

      if (target) {
        actionHistoryRef.current.push({
          id: 'hist_' + Date.now(),
          timestamp: Date.now(),
          description: `Изменение «${target.title}»`,
          itemSnapshots: [{ ...target }],
        });

        const rawUpdates: ItemUpdates = action.updates || {
          title: action.title && action.title !== target.title ? action.title : undefined,
          content: action.content || undefined,
          appendContent: action.appendContent || undefined,
          folder: action.folder && action.folder !== target.folder ? action.folder : undefined,
          status: action.status,
          priority: action.priority,
          dueDate: action.dueDate,
          reminder: action.reminder,
          subtasks: action.subtasks,
          tags: action.tags && action.tags.length > 0 ? action.tags : undefined,
        };

        const updated = applyItemUpdates(target, rawUpdates);
        updateItem(updated);
        savedItem = updated;

        let toastMsg = `Запись «${updated.title}» обновлена`;
        if (rawUpdates.subtasks && Array.isArray(rawUpdates.subtasks) && rawUpdates.subtasks.length > 0) {
          toastMsg = `К задаче «${updated.title}» добавлено ${rawUpdates.subtasks.length} подзадач`;
        } else if (rawUpdates.appendContent) {
          toastMsg = `Заметка «${updated.title}» дополнена`;
        } else if (rawUpdates.dueDate !== undefined) {
          toastMsg = rawUpdates.dueDate ? `Задача перенесена на ${rawUpdates.dueDate}` : 'Срок задачи снят';
        } else if (rawUpdates.status) {
          toastMsg = `Статус задачи изменен на «${rawUpdates.status}»`;
        } else if (rawUpdates.folder) {
          toastMsg = `Запись перенесена в «${rawUpdates.folder}»`;
        }

        addToast(toastMsg, 'success', {
          kind: 'undo',
          label: 'Отменить',
          onClick: () => undoLastAction(),
        });
      }
    }

    // 3. Universal Batch Update (multiple)
    else if (action.type === 'batch_update') {
      const batchList = action.batchUpdateItems || [];
      const snapshots: SlagItem[] = [];
      let updatedCount = 0;

      for (const item of batchList) {
        const tId = item.targetItemId;
        const tTitle = (item.title || '').toLowerCase().trim();
        const target = items.find(i =>
          (tId && i.id === tId) ||
          (tTitle && (i.title.toLowerCase() === tTitle || i.title.toLowerCase().includes(tTitle) || tTitle.includes(i.title.toLowerCase())))
        );

        if (target) {
          snapshots.push({ ...target });
          const updated = applyItemUpdates(target, item.updates);
          updateItem(updated);
          savedItem = updated;
          updatedCount++;
        } else if (item.title) {
          const newItem = saveItem({
            title: item.title,
            type: action.itemType || 'task',
            folder: action.folder || currentFolder,
            tags: action.tags || [],
            dueDate: item.updates?.dueDate || undefined,
            reminder: item.updates?.reminder || undefined,
            priority: item.updates?.priority || 'none',
            status: item.updates?.status || 'todo',
            content: '',
          });
          savedItem = newItem;
          updatedCount++;
        }
      }

      if (updatedCount > 0) {
        actionHistoryRef.current.push({
          id: 'hist_' + Date.now(),
          timestamp: Date.now(),
          description: `Пакетное применение ${updatedCount} записей`,
          itemSnapshots: snapshots,
        });
        addToast(`Применено задач: ${updatedCount}`, 'success', {
          kind: 'undo',
          label: 'Отменить',
          onClick: () => undoLastAction(),
        });
      }
    }

    if (messageId && (savedItem || action.type === 'batch_update')) {
      const finalSavedId = savedItem?.id;
      setChatMessages(prev => prev.map(m => {
        if (m.id !== messageId) return m;
        const updatedSingle = m.suggestedAction
          ? {
              ...m.suggestedAction,
              actionState: 'applied' as const,
              appliedItemId: finalSavedId,
            }
          : undefined;
        const updatedList = m.suggestedActions
          ? m.suggestedActions.map(act => act === action || act.title === action.title
              ? { ...act, actionState: 'applied' as const, appliedItemId: finalSavedId }
              : act)
          : undefined;
        return {
          ...m,
          suggestedAction: updatedSingle,
          suggestedActions: updatedList,
        };
      }));
    }

    return savedItem;
  }, [
    actionHistoryRef,
    addToast,
    currentFolder,
    items,
    saveItem,
    setChatMessages,
    undoLastAction,
    updateItem,
  ]);

  const rejectAction = useCallback((messageId: string) => {
    setChatMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m;
      return {
        ...m,
        suggestedAction: m.suggestedAction ? { ...m.suggestedAction, actionState: 'rejected' as const } : undefined,
        suggestedActions: m.suggestedActions ? m.suggestedActions.map(a => ({ ...a, actionState: 'rejected' as const })) : undefined,
      };
    }));
    addToast('Действие отклонено', 'info');
  }, [addToast, setChatMessages]);

  return { executeSuggestedAction, rejectAction };
}
