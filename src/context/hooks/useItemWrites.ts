// Every write to a note: create, save, delete, restore from trash, move, complete a task.
import { useCallback } from 'react';
import type { SlagItem, SlagItemType } from '../../types';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { storage } from '../../lib/storage';
import { applyTaskCompletion } from '../../lib/tasks/taskCompletion';
import { parseSubtasksFromContent, setAllCheckboxesInContent, toggleCheckboxInContent } from '../../lib/tasks/taskUtils';
import { logger } from '../../lib/logger/logger';
import type { ToastMessage } from '../appContext.types';

const uiLog = logger.scope('UI');

export interface ItemWritesDeps {
  items: SlagItem[];
  currentFolder: string;
  selectedItem: SlagItem | null;
  setSelectedItem: (item: SlagItem | null) => void;
  addToast: (text: string, type?: 'info' | 'success' | 'error', action?: ToastMessage['action']) => void;
  refreshData: () => void;
  setIsFullscreenEditorOpen: (open: boolean) => void;
}

/**
 * Creating, changing and removing a single record.
 *
 * One reason to change — what a note or a task is. Every write goes through the
 * storage service and comes back through refreshData; the provider owns that list
 * and hands it in, so this is never a second source of truth.
 */
export function useItemWrites(deps: ItemWritesDeps) {
  const {
    items, currentFolder, selectedItem, setSelectedItem,
    addToast, refreshData, setIsFullscreenEditorOpen,
  } = deps;

  const saveItem = useCallback((itemData: Partial<SlagItem> & { title: string; content: string; type: SlagItemType }): SlagItem => {
    const newItem: SlagItem = {
      id: itemData.id || 'item_' + Date.now(),
      type: itemData.type,
      title: itemData.title,
      content: itemData.content,
      folder: itemData.folder || currentFolder,
      tags: itemData.tags || [],
      attachments: itemData.attachments || [],
      createdAt: itemData.createdAt || Date.now(),
      updatedAt: Date.now(),
      isPinned: itemData.isPinned || false,
      isArchived: itemData.isArchived || false,
      status: itemData.status || (itemData.type === 'task' ? 'todo' : undefined),
      kanbanColumn: itemData.kanbanColumn,
      priority: itemData.priority || (itemData.type === 'task' ? 'none' : undefined),
      dueDate: itemData.dueDate,
      reminder: itemData.reminder,
      duration: itemData.duration,
      recurrence: itemData.recurrence,
      subtasks: itemData.subtasks || [],
      readingTimeMinutes: itemData.readingTimeMinutes || (itemData.type === 'article' ? Math.max(1, Math.round(itemData.content.split(/\s+/).length / 200)) : undefined),
      summary: itemData.summary,
      replyToId: itemData.replyToId,
      linkedItemIds: itemData.linkedItemIds,
    };

    const saved = storage.saveItem(newItem);
    refreshData();
    return saved;
  }, [currentFolder, refreshData]);

  const openNewNote = useCallback((folder: string) => {
    const now = Date.now();
    setSelectedItem({
      id: 'draft_' + now, title: '', content: '', type: 'note',
      folder: folder || DEFAULT_INBOX_FOLDER, tags: [], attachments: [], createdAt: now, updatedAt: now,
    });
    setIsFullscreenEditorOpen(true);
  }, [setIsFullscreenEditorOpen, setSelectedItem]);

  const updateItem = useCallback((item: SlagItem, editedFrom?: SlagItem | null) => {
    const previous = editedFrom === undefined ? storage.getItems().find(existing => existing.id === item.id) : editedFrom;
    const updated = previous ? applyTaskCompletion(previous, item) : item;
    const saved = storage.saveNoteEdit(updated, { editedFrom });
    if (selectedItem?.id === item.id) setSelectedItem(saved.item);
    refreshData();
    return saved;
  }, [selectedItem, refreshData, setSelectedItem]);

  const deleteItem = useCallback((id: string) => {
    const vault = storage.getCurrentVault();
    const committed = storage.moveToTrash(id);
    if (selectedItem?.id === id) setSelectedItem(null);
    refreshData();
    void Promise.resolve(committed).then(() => {
      if (storage.getCurrentVault() !== vault) return;
      addToast('Запись в корзине', 'info', {
        kind: 'restore',
        label: 'Вернуть',
        onClick: () => {
          const restored = storage.restoreFromTrash(id);
          if (restored) void storage.whenNoteSaved(restored).catch(() => addToast('Не удалось восстановить запись', 'error'));
          refreshData();
        },
      });
    }, () => addToast('Не удалось переместить запись в корзину', 'error'));
  }, [selectedItem, refreshData, addToast, setSelectedItem]);

  const restoreFromTrash = useCallback((id: string) => {
    const restored = storage.restoreFromTrash(id);
    if (restored) {
      uiLog.info(`Restored note "${restored.title || id}" from .trash to "${restored.folder}"`, {
        itemId: id,
        folder: restored.folder,
      });
      refreshData();
      void storage.whenNoteSaved(restored).then(() => addToast(`Запись «${restored.title}» восстановлена`, 'success'),
        () => addToast('Не удалось восстановить запись', 'error'));
    }
  }, [refreshData, addToast]);

  const moveItem = useCallback((itemId: string, targetFolder: string) => {
    const item = items.find(i => i.id === itemId);
    const prevFolder = item?.folder || DEFAULT_INBOX_FOLDER;
    uiLog.info(`Moved note "${item?.title || itemId}" to folder "${targetFolder}"`, {
      itemId,
      title: item?.title,
      from: prevFolder,
      to: targetFolder,
    });
    const moved = storage.moveItem(itemId, targetFolder);
    refreshData();
    if (moved) void storage.whenNoteSaved(moved).then(() => addToast(`Перемещено в «${targetFolder}»`, 'success'),
      () => addToast('Не удалось переместить запись', 'error'));
  }, [items, refreshData, addToast]);

  const toggleTaskComplete = useCallback((itemId: string, subtaskId?: string) => {
    const item = storage.getItems().find(i => i.id === itemId);
    if (!item) return;

    if (subtaskId && (item.subtasks || item.content)) {
      const currentSubtasks = item.subtasks && item.subtasks.length > 0
        ? item.subtasks
        : parseSubtasksFromContent(item.content);

      let updatedContent = item.content;
      if (updatedContent && /^\s*[-*+]\s*\[[ xX]\]/m.test(updatedContent)) {
        updatedContent = toggleCheckboxInContent(updatedContent, subtaskId, currentSubtasks);
      }

      const parsed = parseSubtasksFromContent(updatedContent);
      const updatedSubtasks = parsed.length > 0
        ? parsed
        : currentSubtasks.map(st => (st.id === subtaskId ? { ...st, completed: !st.completed } : st));

      // Closing on the last tick lives in applyTaskCompletion, so the editor and every other
      // write agree with the feed. This branch owns only the reverse: un-ticking one line of a
      // done task puts it back to work.
      const hasOpenSubtasks = updatedSubtasks.some(st => !st.completed);
      const newStatus = item.status === 'done' && hasOpenSubtasks ? 'in_progress' : item.status;

      updateItem({
        ...item,
        content: updatedContent,
        subtasks: updatedSubtasks,
        status: newStatus,
      });
    } else {
      const isCurrentlyDone = item.status === 'done';
      const newStatus = isCurrentlyDone ? 'todo' : 'done';
      const updatedContent = setAllCheckboxesInContent(item.content, newStatus === 'done');
      const parsed = parseSubtasksFromContent(updatedContent);
      const updatedSubtasks = parsed.length > 0
        ? parsed
        : item.subtasks?.map(st => ({
            ...st,
            completed: newStatus === 'done',
          }));

      updateItem({
        ...item,
        content: updatedContent,
        status: newStatus,
        subtasks: updatedSubtasks,
      });

      if (newStatus === 'done') {
        const completed = storage.getItems().find(existing => existing.id === itemId);
        const toastText = item.recurrence && completed && completed.streak !== undefined
          ? `Таска выполнена (🔥 ${completed.streak})`
          : 'Таска выполнена';
        addToast(toastText, 'success');
      } else {
        addToast('Таска возобновлена', 'info');
      }
    }
  }, [updateItem, addToast]);

  const completeTaskForever = useCallback((itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    const updatedContent = setAllCheckboxesInContent(item.content, true);
    const parsed = parseSubtasksFromContent(updatedContent);
    const updatedSubtasks = parsed.length > 0
      ? parsed
      : item.subtasks?.map(st => ({
          ...st,
          completed: true,
        }));

    updateItem({
      ...item,
      content: updatedContent,
      subtasks: updatedSubtasks,
      status: 'done',
      recurrence: undefined,
    });
    addToast('Задача навсегда завершена', 'success');
  }, [items, updateItem, addToast]);

  return {
    saveItem,
    openNewNote,
    updateItem,
    deleteItem,
    restoreFromTrash,
    moveItem,
    toggleTaskComplete,
    completeTaskForever,
  };
}
