import { useApp } from '../context/AppContext';
import { categorizeDraft, generateSmartTags } from '../lib/aiService';
import { storage, getSafeNoteFilename } from '../lib/storage';
import { openAppFolder } from '../lib/folderOpener';
import type { SlagItem, SlagItemType } from '../types';
import { DEFAULT_INBOX_FOLDER } from '../config';

export const PRIORITY_LABELS: Record<'none' | 'low' | 'medium' | 'high', string> = {
  high: 'Срочный',
  medium: 'Высокий',
  low: 'Средний',
  none: 'Без приоритета',
};

export const TYPE_LABELS: Record<SlagItemType, string> = {
  note: 'Заметка',
  task: 'Таска',
  article: 'Статья',
};

export function useItemActions(item: SlagItem | null | undefined, onDone?: () => void) {
  const {
    setSelectedItem,
    setIsFullscreenEditorOpen,
    deleteItem,
    saveItem,
    updateItem,
    moveItem,
    setReplyTarget,
    completeTaskForever,
    addToast,
    aiSettings,
    folders,
    sendChatMessage,
    setActiveMobileTab,
    isMobile,
  } = useApp();

  const handleOpenFocus = () => {
    if (item) {
      setSelectedItem(item);
      setIsFullscreenEditorOpen(true);
    }
    onDone?.();
  };

  const handleReply = () => {
    if (item) {
      setReplyTarget(item);
      addToast('Ответ на запись', 'info');
    }
    onDone?.();
  };

  const handleTogglePin = () => {
    if (item) {
      updateItem({ ...item, isPinned: !item.isPinned });
      addToast(item.isPinned ? 'Запись откреплена' : 'Запись закреплена', 'success');
    }
    onDone?.();
  };

  const handleCompleteTaskForever = () => {
    if (item) {
      completeTaskForever(item.id);
    }
    onDone?.();
  };

  const handleSetPriority = (priority: 'none' | 'low' | 'medium' | 'high') => {
    if (!item) return;
    updateItem({ ...item, priority });
    addToast(`Приоритет: ${PRIORITY_LABELS[priority]}`, 'success');
    onDone?.();
  };

  const handleSetDueDate = (dueDate?: string) => {
    if (!item) return;
    updateItem({ ...item, dueDate: dueDate || undefined });
    addToast(dueDate ? `Дедлайн: ${dueDate}` : 'Дедлайн снят', 'success');
    onDone?.();
  };

  const handleChangeType = (newType: SlagItemType) => {
    if (!item) return;
    if (item.type === newType) {
      onDone?.();
      return;
    }
    const updated: SlagItem = {
      ...item,
      type: newType,
      status: newType === 'task' ? (item.status || 'todo') : item.status,
      priority: newType === 'task' ? (item.priority || 'none') : item.priority,
      readingTimeMinutes: newType === 'article'
        ? (item.readingTimeMinutes || Math.max(1, Math.round((item.content || '').split(/\s+/).length / 200)))
        : item.readingTimeMinutes,
    };
    updateItem(updated);
    addToast(`Превращено в: ${TYPE_LABELS[newType].toLowerCase()}`, 'success');
    onDone?.();
  };

  const handleMoveFolder = (folderPath: string) => {
    if (!item) return;
    moveItem(item.id, folderPath);
    addToast(`Перемещено в «${folderPath}»`, 'success');
    onDone?.();
  };

  const handleCopyMarkdown = () => {
    if (!item) return;
    navigator.clipboard.writeText(item.content);
    addToast('Markdown скопирован', 'success');
    onDone?.();
  };

  const handleCopyLink = () => {
    if (!item) return;
    const linkText = `[[${item.title || item.id}]]`;
    navigator.clipboard.writeText(linkText);
    addToast(`Скопирован: ${linkText}`, 'success');
    onDone?.();
  };

  const handleCopyFullLink = () => {
    if (!item) return;
    const fullLink = `slag://note/${item.id}`;
    navigator.clipboard.writeText(fullLink);
    addToast(`Скопирована ссылка: ${fullLink}`, 'success');
    onDone?.();
  };

  const handleCopyFullPath = async () => {
    if (!item) return;
    const fullPath = await storage.getNoteAbsolutePath(item);
    navigator.clipboard.writeText(fullPath);
    addToast(`Путь к файлу скопирован`, 'success');
    onDone?.();
  };

  const handleCopyRelativePath = () => {
    if (!item) return;
    const filename = item.filename || getSafeNoteFilename(item.title, item.id);
    const relPath = `${item.folder || DEFAULT_INBOX_FOLDER}/${filename}`;
    navigator.clipboard.writeText(relPath);
    addToast(`Путь скопирован: ${relPath}`, 'success');
    onDone?.();
  };

  const handleOpenInExplorer = async () => {
    if (!item) return;
    const notesBase = storage.getVaultNotesPath();
    const folder = item.folder || DEFAULT_INBOX_FOLDER;
    const filename = item.filename || getSafeNoteFilename(item.title, item.id);
    const target = `${notesBase}/${folder}/${filename}`;
    const res = await openAppFolder(target);
    addToast(res.message, res.success ? 'success' : 'info');
    onDone?.();
  };

  const handleDuplicate = () => {
    if (!item) return;
    const copy: Partial<SlagItem> & { title: string; content: string; type: SlagItemType } = {
      type: item.type,
      title: item.title ? `${item.title} (копия)` : 'Копия записи',
      content: item.content,
      folder: item.folder,
      tags: item.tags ? [...item.tags] : [],
      attachments: item.attachments ? [...item.attachments] : [],
      priority: item.priority,
      dueDate: item.dueDate,
      reminder: item.reminder,
      duration: item.duration,
      recurrence: item.recurrence,
      subtasks: item.subtasks ? item.subtasks.map(s => ({ ...s, completed: false })) : undefined,
    };
    saveItem(copy);
    addToast('Запись продублирована', 'success');
    onDone?.();
  };

  const handleToggleArchive = () => {
    if (!item) return;
    updateItem({ ...item, isArchived: !item.isArchived });
    addToast(item.isArchived ? 'Запись разархивирована' : 'Запись перемещена в архив', 'info');
    onDone?.();
  };

  const handleDelete = () => {
    if (!item) return;
    // Deleting is reversible: the note lands in .trash and the model layer offers it back in
    // the toast, so the question before the click was just a second click.
    deleteItem(item.id);
    onDone?.();
  };

  const handleAiDecompose = async () => {
    if (!item) return;
    onDone?.();
    addToast('ИИ определяет папку и теги...', 'info');
    try {
      const fullText = `${item.title ? item.title + '\n' : ''}${item.content || ''}`.trim();
      const res = await categorizeDraft(fullText, item.folder || DEFAULT_INBOX_FOLDER, folders, aiSettings);

      const mergedTags = Array.from(new Set([...(item.tags || []), ...(res.tags || [])]));
      const targetFolder = res.targetFolder || item.folder || DEFAULT_INBOX_FOLDER;

      if (targetFolder !== item.folder) {
        moveItem(item.id, targetFolder);
      }

      updateItem({
        ...item,
        folder: targetFolder,
        tags: mergedTags,
        updatedAt: Date.now(),
      });

      const folderNotice = targetFolder !== item.folder ? ` → ${targetFolder}` : '';
      const tagsNotice = res.tags.length > 0 ? ` [${res.tags.map(t => '#' + t).join(' ')}]` : '';
      addToast(`Запись разобрана${folderNotice}${tagsNotice}: ${res.reason}`, 'success');
    } catch {
      addToast('Не удалось разобрать запись через ИИ', 'error');
    }
  };

  const handleAiTags = async () => {
    if (!item) return;
    onDone?.();
    addToast('Подбор тегов через ИИ...', 'info');
    try {
      const tags = await generateSmartTags(item.content || item.title, aiSettings);
      if (tags.length > 0) {
        const merged = Array.from(new Set([...(item.tags || []), ...tags]));
        updateItem({ ...item, tags: merged, updatedAt: Date.now() });
        addToast(`Добавлены теги: #${tags.join(' #')}`, 'success');
      } else {
        addToast('Подходящих новых тегов не найдено', 'info');
      }
    } catch {
      addToast('Не удалось подобрать теги', 'error');
    }
  };

  const handleAskAssistant = () => {
    if (!item) return;
    onDone?.();
    const prompt = `Разбери подробнее запись «${item.title || item.id}»: "${item.content.slice(0, 300)}" и предложи следующие шаги.`;
    sendChatMessage(prompt);
    if (isMobile) {
      setActiveMobileTab('assistant');
    }
    addToast('Запрос отправлен ассистенту', 'info');
  };

  return {
    handleOpenFocus,
    handleReply,
    handleTogglePin,
    handleCompleteTaskForever,
    handleSetPriority,
    handleSetDueDate,
    handleChangeType,
    handleMoveFolder,
    handleCopyMarkdown,
    handleCopyLink,
    handleCopyFullLink,
    handleCopyFullPath,
    handleCopyRelativePath,
    handleOpenInExplorer,
    handleDuplicate,
    handleToggleArchive,
    handleDelete,
    handleAiDecompose,
    handleAiTags,
    handleAskAssistant,
  };
}
