import { useApp } from '../context/AppContext';
import { decomposeItemWithAi, generateSmartTags } from '../lib/aiService';
import type { SlagItem, SlagItemType, SlagSubtask } from '../types';

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
    updateItem({ ...item, type: newType });
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
    deleteItem(item.id);
    addToast('Запись удалена', 'info');
    onDone?.();
  };

  const handleAiDecompose = async () => {
    if (!item) return;
    onDone?.();
    addToast('ИИ разбирает запись на шаги...', 'info');
    try {
      const res = await decomposeItemWithAi(item, aiSettings);
      const updatedSubtasks: SlagSubtask[] = res.subtasks.map((st, i) => ({
        id: `st_${Date.now()}_${i}`,
        title: st.title,
        completed: false,
      }));
      const mergedTags = Array.from(new Set([...(item.tags || []), ...(res.tags || [])]));
      const isGeneric =
        !item.title ||
        ['заметка', 'черновик', 'новая заметка', 'без названия', 'новая задача'].includes(
          item.title.trim().toLowerCase()
        );

      const updatedItem: SlagItem = {
        ...item,
        type: 'task',
        title: !isGeneric ? item.title : (res.title || item.title || 'Разобранная задача'),
        subtasks: [...(item.subtasks || []), ...updatedSubtasks],
        tags: mergedTags,
        summary: res.summary || item.summary,
        updatedAt: Date.now(),
      };
      updateItem(updatedItem);
      addToast(`Запись разобрана: добавлено ${updatedSubtasks.length} подзадач`, 'success');
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
    handleDuplicate,
    handleToggleArchive,
    handleDelete,
    handleAiDecompose,
    handleAiTags,
    handleAskAssistant,
  };
}
