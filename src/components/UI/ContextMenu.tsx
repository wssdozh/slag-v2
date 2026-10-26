import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Maximize2,
  Trash2,
  FolderInput,
  Copy,
  FolderPlus,
  Edit2,
  Search,
  CheckSquare,
  FileText,
  StickyNote,
  CornerUpLeft,
  Link2,
  Pin,
  ChevronRight,
  ChevronDown,
  Repeat,
  Check,
  Sparkles,
  Tag,
  MessageSquare,
  CopyPlus,
  Calendar,
  Archive,
  Inbox,
  Info
} from 'lucide-react';
import { LinearSignalBars } from './PriorityBadge';
import { decomposeItemWithAi, generateSmartTags } from '../../lib/aiService';
import { getTodayIso, getTomorrowIso, getNextWeekIso } from '../../lib/dateUtils';
import type { SlagItem, SlagItemType, SlagSubtask } from '../../types';

export const ContextMenu: React.FC = () => {
  const {
    contextMenu,
    closeContextMenu,
    setSelectedItem,
    setIsFullscreenEditorOpen,
    deleteItem,
    openCreateFolderModal,
    openEditFolderModal,
    openFolderInfoModal,
    deleteFolder,
    setIsSearchOpen,
    saveItem,
    updateItem,
    currentFolder,
    folders,
    moveItem,
    setReplyTarget,
    completeTaskForever,
    addToast,
    aiSettings,
    sendChatMessage,
    setActiveMobileTab,
    isMobile,
  } = useApp();

  const [openSubmenu, setOpenSubmenu] = useState<'move' | 'type' | 'priority' | 'date' | null>(null);

  if (!contextMenu) return null;

  const { x, y, type, item, folder } = contextMenu;

  // Viewport clamping
  const menuWidth = 240; // w-60
  const menuHeight = 440;
  const clampedX = Math.min(Math.max(8, x), window.innerWidth - menuWidth - 8);
  const clampedY = Math.min(Math.max(8, y), window.innerHeight - menuHeight - 8);

  const toggleSubmenu = (name: 'move' | 'type' | 'priority' | 'date') => {
    setOpenSubmenu(prev => (prev === name ? null : name));
  };

  const handleOpenFocus = () => {
    if (item) {
      setSelectedItem(item);
      setIsFullscreenEditorOpen(true);
    }
    closeContextMenu();
  };

  const handleCopyMarkdown = () => {
    if (item) {
      navigator.clipboard.writeText(item.content);
      addToast('Markdown скопирован', 'success');
    }
    closeContextMenu();
  };

  const handleTogglePin = () => {
    if (item) {
      updateItem({ ...item, isPinned: !item.isPinned });
      addToast(item.isPinned ? 'Запись откреплена' : 'Запись закреплена', 'success');
    }
    closeContextMenu();
  };

  const handleChangeType = (newType: SlagItemType) => {
    if (item) {
      updateItem({ ...item, type: newType });
      addToast(`Превращено в: ${newType === 'task' ? 'таску' : newType === 'article' ? 'статью' : 'заметку'}`, 'success');
    }
    closeContextMenu();
  };

  const handleDeleteItem = () => {
    if (item) {
      deleteItem(item.id);
      addToast('Запись удалена', 'info');
    }
    closeContextMenu();
  };

  const handleAiDecompose = async () => {
    if (!item) return;
    closeContextMenu();
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
        type: 'task', // Convert to task so subtasks and checkboxes render interactively
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
    closeContextMenu();
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
    closeContextMenu();
    const prompt = `Разбери подробнее запись «${item.title || item.id}»: "${item.content.slice(0, 300)}" и предложи следующие шаги.`;
    sendChatMessage(prompt);
    if (isMobile) {
      setActiveMobileTab('assistant');
    }
    addToast('Запрос отправлен ассистенту', 'info');
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
    closeContextMenu();
  };

  const handleToggleArchive = () => {
    if (!item) return;
    updateItem({ ...item, isArchived: !item.isArchived });
    addToast(item.isArchived ? 'Запись разархивирована' : 'Запись перемещена в архив', 'info');
    closeContextMenu();
  };

  const handleSetPriority = (priority: 'none' | 'low' | 'medium' | 'high') => {
    if (!item) return;
    updateItem({ ...item, priority });
    const labels = { none: 'Без приоритета', low: 'Низкий', medium: 'Средний', high: 'Срочный' };
    addToast(`Приоритет: ${labels[priority]}`, 'success');
    closeContextMenu();
  };

  const handleSetDueDate = (dueDate?: string) => {
    if (!item) return;
    updateItem({ ...item, dueDate: dueDate || undefined });
    addToast(dueDate ? `Дедлайн: ${dueDate}` : 'Дедлайн снят', 'success');
    closeContextMenu();
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ left: `${clampedX}px`, top: `${clampedY}px` }}
      className="fixed z-50 z-[110] w-60 max-h-[85vh] overflow-y-auto scrollbar-thin rounded-xl bg-[#121215]/95 backdrop-blur-xl border border-white/[0.08] shadow-2xl p-1 text-xs text-zinc-300 flex flex-col gap-0.5 select-none animate-in fade-in zoom-in-95 duration-100"
    >
      {type === 'item' && item && (
        <>
          {/* Quick Actions */}
          <button
            onClick={() => {
              setReplyTarget(item);
              closeContextMenu();
            }}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <CornerUpLeft className="w-3.5 h-3.5 text-zinc-400" />
              <span>Ответить</span>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">R</span>
          </button>

          <button
            onClick={handleOpenFocus}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Maximize2 className="w-3.5 h-3.5 text-zinc-400" />
              <span>Фокус-редактор</span>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">⌘E</span>
          </button>

          <button
            onClick={handleTogglePin}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Pin className={`w-3.5 h-3.5 ${item.isPinned ? 'text-amber-400 rotate-45' : 'text-zinc-400'}`} />
              <span>{item.isPinned ? 'Открепить' : 'Закрепить'}</span>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">P</span>
          </button>

          {item.type === 'task' && item.recurrence && item.status !== 'done' && (
            <button
              onClick={() => {
                completeTaskForever(item.id);
                closeContextMenu();
              }}
              className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-amber-300 text-amber-400/90 transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Завершить навсегда</span>
              </div>
            </button>
          )}

          <div className="my-0.5 border-t border-white/[0.06]" />

          {/* AI Actions */}
          <button
            onClick={handleAiDecompose}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-purple-500/15 hover:text-purple-200 text-purple-300 transition-colors text-left cursor-pointer group"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-purple-400 group-hover:scale-110 transition-transform" />
              <span className="font-medium">Разобрать с ИИ</span>
            </div>
            <span className="text-[10px] text-purple-400/70 font-mono">AI</span>
          </button>

          <button
            onClick={handleAiTags}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Tag className="w-3.5 h-3.5 text-zinc-400" />
              <span>Подобрать теги (ИИ)</span>
            </div>
          </button>

          <button
            onClick={handleAskAssistant}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />
              <span>Спросить ассистента</span>
            </div>
          </button>

          <div className="my-0.5 border-t border-white/[0.06]" />

          {/* Priority Submenu */}
          <button
            onClick={() => toggleSubmenu('priority')}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <LinearSignalBars priority={item.priority || 'none'} className="w-3.5 h-3.5" />
              <span>Приоритет</span>
            </div>
            {openSubmenu === 'priority' ? (
              <ChevronDown className="w-3 h-3 text-zinc-500" />
            ) : (
              <ChevronRight className="w-3 h-3 text-zinc-500" />
            )}
          </button>

          {openSubmenu === 'priority' && (
            <div className="px-1 py-1 flex flex-col gap-0.5 bg-white/[0.02] rounded-lg border border-white/[0.04] my-0.5">
              {[
                { value: 'high' as const, label: 'Срочный' },
                { value: 'medium' as const, label: 'Высокий' },
                { value: 'low' as const, label: 'Средний' },
                { value: 'none' as const, label: 'Без приоритета' },
              ].map(p => (
                <button
                  key={p.value}
                  onClick={() => handleSetPriority(p.value)}
                  className={`flex items-center justify-between px-2 py-1 rounded text-[11px] transition-colors cursor-pointer ${
                    (item.priority || 'none') === p.value
                      ? 'bg-white/10 text-white font-medium'
                      : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <LinearSignalBars priority={p.value} className="w-3 h-3" />
                    <span>{p.label}</span>
                  </div>
                  {(item.priority || 'none') === p.value && <Check className="w-3 h-3 text-zinc-400" />}
                </button>
              ))}
            </div>
          )}

          {/* Deadline Submenu */}
          <button
            onClick={() => toggleSubmenu('date')}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-zinc-400" />
              <span>Дедлайн</span>
            </div>
            {openSubmenu === 'date' ? (
              <ChevronDown className="w-3 h-3 text-zinc-500" />
            ) : (
              <ChevronRight className="w-3 h-3 text-zinc-500" />
            )}
          </button>

          {openSubmenu === 'date' && (
            <div className="px-1 py-1 flex flex-col gap-0.5 bg-white/[0.02] rounded-lg border border-white/[0.04] my-0.5">
              <button
                onClick={() => handleSetDueDate(getTodayIso())}
                className="flex items-center justify-between px-2 py-1 rounded text-[11px] text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <span>Сегодня</span>
                <span className="font-mono text-[10px] text-zinc-500">{getTodayIso()}</span>
              </button>
              <button
                onClick={() => handleSetDueDate(getTomorrowIso())}
                className="flex items-center justify-between px-2 py-1 rounded text-[11px] text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <span>Завтра</span>
                <span className="font-mono text-[10px] text-zinc-500">{getTomorrowIso()}</span>
              </button>
              <button
                onClick={() => handleSetDueDate(getNextWeekIso())}
                className="flex items-center justify-between px-2 py-1 rounded text-[11px] text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <span>Через неделю</span>
                <span className="font-mono text-[10px] text-zinc-500">{getNextWeekIso()}</span>
              </button>
              {item.dueDate && (
                <button
                  onClick={() => handleSetDueDate(undefined)}
                  className="flex items-center gap-2 px-2 py-1 rounded text-[11px] text-rose-400/80 hover:text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer"
                >
                  <span>Снять дедлайн</span>
                </button>
              )}
            </div>
          )}

          {/* Type Conversion */}
          <button
            onClick={() => toggleSubmenu('type')}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Repeat className="w-3.5 h-3.5 text-zinc-400" />
              <span>Сменить тип</span>
            </div>
            {openSubmenu === 'type' ? (
              <ChevronDown className="w-3 h-3 text-zinc-500" />
            ) : (
              <ChevronRight className="w-3 h-3 text-zinc-500" />
            )}
          </button>

          {openSubmenu === 'type' && (
            <div className="px-1 py-1 flex flex-col gap-0.5 bg-white/[0.02] rounded-lg border border-white/[0.04] my-0.5">
              {item.type !== 'note' && (
                <button
                  onClick={() => handleChangeType('note')}
                  className="flex items-center gap-2 px-2 py-1 rounded text-[11px] text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                  <StickyNote className="w-3 h-3 text-zinc-400" />
                  <span>Превратить в заметку</span>
                </button>
              )}
              {item.type !== 'task' && (
                <button
                  onClick={() => handleChangeType('task')}
                  className="flex items-center gap-2 px-2 py-1 rounded text-[11px] text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                  <CheckSquare className="w-3 h-3 text-amber-400" />
                  <span>Превратить в таску</span>
                </button>
              )}
              {item.type !== 'article' && (
                <button
                  onClick={() => handleChangeType('article')}
                  className="flex items-center gap-2 px-2 py-1 rounded text-[11px] text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                  <FileText className="w-3 h-3 text-blue-400" />
                  <span>Превратить в статью</span>
                </button>
              )}
            </div>
          )}

          {/* Move to folder */}
          <button
            onClick={() => toggleSubmenu('move')}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <FolderInput className="w-3.5 h-3.5 text-zinc-400" />
              <span>Переместить в папку</span>
            </div>
            {openSubmenu === 'move' ? (
              <ChevronDown className="w-3 h-3 text-zinc-500" />
            ) : (
              <ChevronRight className="w-3 h-3 text-zinc-500" />
            )}
          </button>

          {openSubmenu === 'move' && (
            <div className="max-h-36 overflow-y-auto px-1 py-1 flex flex-col gap-0.5 bg-white/[0.02] rounded-lg border border-white/[0.04] my-0.5 scrollbar-thin">
              {item.folder !== 'Входящие' && (
                <button
                  onClick={() => {
                    moveItem(item.id, 'Входящие');
                    addToast('Перемещено во Входящие', 'success');
                    closeContextMenu();
                  }}
                  className="flex items-center gap-2 px-2 py-1 rounded text-[11px] text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-colors font-medium border-b border-white/[0.04] mb-0.5 cursor-pointer"
                >
                  <Inbox className="w-3 h-3 text-zinc-400" />
                  <span>Во Входящие</span>
                </button>
              )}
              {folders.map(f => {
                const isCurrent = f.path === item.folder;
                return (
                  <button
                    key={f.path}
                    onClick={() => {
                      moveItem(item.id, f.path);
                      addToast(`Перемещено в «${f.name}»`, 'success');
                      closeContextMenu();
                    }}
                    disabled={isCurrent}
                    className={`flex items-center justify-between px-2 py-1 rounded text-[11px] transition-colors cursor-pointer ${
                      isCurrent
                        ? 'text-zinc-500 opacity-60 cursor-default'
                        : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
                    }`}
                  >
                    <span className="truncate">{f.name}</span>
                    {isCurrent && <Check className="w-3 h-3 text-zinc-500 shrink-0 ml-1" />}
                  </button>
                );
              })}
            </div>
          )}

          <div className="my-0.5 border-t border-white/[0.06]" />

          {/* Utilities */}
          <button
            onClick={handleDuplicate}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <CopyPlus className="w-3.5 h-3.5 text-zinc-400" />
              <span>Дублировать</span>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">⌘D</span>
          </button>

          <button
            onClick={handleToggleArchive}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Archive className="w-3.5 h-3.5 text-zinc-400" />
              <span>{item.isArchived ? 'Разархивировать' : 'В архив'}</span>
            </div>
          </button>

          <button
            onClick={() => {
              const linkText = `[[${item.title || item.id}]]`;
              navigator.clipboard.writeText(linkText);
              addToast(`Скопирован: ${linkText}`, 'success');
              closeContextMenu();
            }}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Link2 className="w-3.5 h-3.5 text-zinc-400" />
              <span>Копировать [[линк]]</span>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">⌘L</span>
          </button>

          <button
            onClick={handleCopyMarkdown}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Copy className="w-3.5 h-3.5 text-zinc-400" />
              <span>Копировать текст</span>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">⌘C</span>
          </button>

          <div className="my-0.5 border-t border-white/[0.06]" />

          {/* Delete */}
          <button
            onClick={handleDeleteItem}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Trash2 className="w-3.5 h-3.5" />
              <span>Удалить</span>
            </div>
            <span className="text-[10px] text-rose-400/60 font-mono">⌫</span>
          </button>
        </>
      )}

      {type === 'folder' && folder && (
        <>
          <button
            onClick={() => {
              openFolderInfoModal(folder.path);
              closeContextMenu();
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
          >
            <Info className="w-3.5 h-3.5 text-zinc-400" />
            <span>Информация и медиа</span>
          </button>

          <button
            onClick={() => {
              openCreateFolderModal(folder.path);
              closeContextMenu();
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
          >
            <FolderPlus className="w-3.5 h-3.5 text-zinc-400" />
            <span>Создать подпапку</span>
          </button>

          <button
            onClick={() => {
              openEditFolderModal(folder);
              closeContextMenu();
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
          >
            <Edit2 className="w-3.5 h-3.5 text-zinc-400" />
            <span>Иконка и описание</span>
          </button>

          {folder.path !== 'Входящие' && (
            <>
              <div className="my-0.5 border-t border-white/[0.06]" />
              <button
                onClick={() => {
                  deleteFolder(folder.path);
                  closeContextMenu();
                }}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors text-left cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Удалить папку</span>
              </button>
            </>
          )}
        </>
      )}

      {type === 'feed' && (
        <>
          <button
            onClick={() => {
              saveItem({ type: 'note', title: 'Быстрая заметка', content: '', folder: currentFolder });
              closeContextMenu();
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
          >
            <StickyNote className="w-3.5 h-3.5 text-zinc-400" />
            <span>Новая заметка</span>
          </button>

          <button
            onClick={() => {
              saveItem({ type: 'task', title: 'Новая задача', content: '', folder: currentFolder });
              closeContextMenu();
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
          >
            <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
            <span>Новая таска</span>
          </button>

          <button
            onClick={() => {
              saveItem({ type: 'article', title: 'Новая статья', content: '', folder: currentFolder });
              closeContextMenu();
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-blue-400" />
            <span>Новая статья</span>
          </button>

          <div className="my-0.5 border-t border-white/[0.06]" />

          <button
            onClick={() => {
              setIsSearchOpen(true);
              closeContextMenu();
            }}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-zinc-400" />
              <span>Поиск</span>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">⌘K</span>
          </button>
        </>
      )}
    </div>
  );
};
