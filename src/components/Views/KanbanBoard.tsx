import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import type { SlagItem, TaskStatus } from '../../types';
import { querySearch } from '../../lib/searchService';
import { pluralRu } from '../../lib/dateUtils';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { useDragToScroll } from '../../hooks/useDragToScroll';
import { useFlipLayout } from '../../hooks/useFlipLayout';
import { usePointerDnd, type DragItemPayload } from '../../hooks/usePointerDnd';
import {
  CircleDashed,
  Circle,
  CheckCircle2,
  Plus,
  MoreVertical,
  Calendar as CalendarIcon,
  Paperclip,
  CheckSquare,
  StickyNote,
  FileText,
  ChevronLeft,
  BookOpen,
  Search,
  X,
} from 'lucide-react';
import { LinearSignalBars } from '../UI/PriorityBadge';
import { TagChip } from '../UI/TagChip';

function isOverdue(dueDate?: string): boolean {
  if (!dueDate) return false;
  const today = new Date().toISOString().split('T')[0];
  return dueDate < today;
}

// Half-filled Circle for Linear "In Progress"
const InProgressIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5 text-amber-500' }) => (
  <svg className={`${className} shrink-0`} viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.75" />
    <path d="M8 2 A6 6 0 0 1 8 14 Z" fill="currentColor" />
  </svg>
);

function getTaskKey(item: SlagItem): string {
  const digits = item.id.replace(/\D/g, '');
  if (digits.length >= 2) {
    return `TSK-${digits.slice(-3).padStart(2, '0')}`;
  }
  return `TSK-${item.id.slice(-4).toUpperCase()}`;
}

interface ColumnConfig {
  id: TaskStatus;
  title: string;
  iconType: 'dashed' | 'circle' | 'in_progress' | 'done';
  iconColor: string;
}

const COLUMNS: ColumnConfig[] = [
  { id: 'backlog', title: 'Бэклог', iconType: 'dashed', iconColor: 'text-zinc-500' },
  { id: 'todo', title: 'К выполнению', iconType: 'circle', iconColor: 'text-zinc-400' },
  { id: 'in_progress', title: 'В работе', iconType: 'in_progress', iconColor: 'text-amber-500' },
  { id: 'done', title: 'Выполнено', iconType: 'done', iconColor: 'text-blue-500' },
];

export const KanbanBoard: React.FC = () => {
  const {
    items,
    currentFolder,
    updateItem,
    setSelectedItem,
    setIsFullscreenEditorOpen,
    openContextMenu,
    addToast,
    setActiveTagFilter,
    activeTagFilter,
    openComposerModal,
    isKanbanMaterialsOpen,
    setIsKanbanMaterialsOpen,
    isMobile,
  } = useApp();

  // Search state for TRIZ Materials Dock
  const [materialsSearchQuery, setMaterialsSearchQuery] = useState('');
  const [searchedMaterials, setSearchedMaterials] = useState<SlagItem[]>([]);

  // Active status dropdown card ID
  const [statusMenuTaskId, setStatusMenuTaskId] = useState<string | null>(null);

  // Quick Action: Convert Note/Article to Task
  const handleConvertToTask = useCallback((material: SlagItem, targetStatus: TaskStatus = 'todo') => {
    updateItem({
      ...material,
      type: 'task',
      status: targetStatus,
    });
    addToast(`«${material.title || 'Заметка'}» преобразована в задачу`, 'success');
  }, [updateItem, addToast]);

  // Pointer Events Drag and Drop hook (desktop & mobile robust)
  const {
    isDragging,
    draggingPayload,
    dragPos,
    activeZoneData,
    handlePointerDown,
  } = usePointerDnd<DragItemPayload>({
    onDrop: (payload, _targetZone, targetData) => {
      const targetStatus = targetData.dropColumn as TaskStatus | undefined;
      if (!targetStatus) return;

      if (payload.type === 'material') {
        const material = items.find(i => i.id === payload.id);
        if (material) {
          handleConvertToTask(material, targetStatus);
        }
      } else {
        const task = items.find(i => i.id === payload.id);
        if (task && task.status !== targetStatus) {
          updateItem({
            ...task,
            status: targetStatus,
          });
          const colName = COLUMNS.find(c => c.id === targetStatus)?.title || targetStatus;
          addToast(`Задача перемещена в «${colName}»`, 'info');
        }
      }
    },
  });

  // Mouse drag-to-scroll for horizontal Kanban board and vertical column scrolling
  const kanbanBoardRef = useDragToScroll<HTMLDivElement>({
    direction: 'both',
    getContainerX: (_target, container) => container,
    getContainerY: (target) => target.closest('.overflow-y-auto') as HTMLElement | null,
    ignoreSelector:
      'button, a, input, textarea, select, [contenteditable="true"], [data-draggable="true"], [data-no-pan], [data-testid="kanban-card"]',
  });

  // Filter items scoped to current folder
  const folderItems = useMemo(() => {
    return items.filter(item => {
      if (currentFolder === DEFAULT_INBOX_FOLDER) return true;
      return item.folder === currentFolder || item.folder.startsWith(currentFolder + '/');
    });
  }, [items, currentFolder]);

  // Cards glide between columns instead of teleporting.
  useFlipLayout(kanbanBoardRef, folderItems.map(item => `${item.id}:${item.status ?? ''}`).join('|'));

  // TRIZ Materials: Notes and Articles in this folder
  const folderMaterials = useMemo(() => {
    return folderItems.filter(item => item.type === 'note' || item.type === 'article');
  }, [folderItems]);

  useEffect(() => {
    if (!materialsSearchQuery.trim()) return;

    let isMounted = true;
    querySearch(materialsSearchQuery, folderMaterials).then(results => {
      if (isMounted) {
        setSearchedMaterials(results);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [materialsSearchQuery, folderMaterials]);

  const filteredMaterials = useMemo(() => {
    return materialsSearchQuery.trim() ? searchedMaterials : folderMaterials;
  }, [materialsSearchQuery, searchedMaterials, folderMaterials]);

  // Tasks in this folder
  const tasks = useMemo(() => {
    return folderItems.filter(item => item.type === 'task');
  }, [folderItems]);

  // Group tasks by status
  const tasksByStatus = useMemo(() => {
    const map: Record<TaskStatus, SlagItem[]> = {
      backlog: [],
      todo: [],
      in_progress: [],
      done: [],
    };

    tasks.forEach(task => {
      const status = task.status || 'todo';
      if (status in map) {
        map[status].push(task);
      } else {
        map.todo.push(task);
      }
    });

    return map;
  }, [tasks]);

  const renderColumnIcon = (type: ColumnConfig['iconType'], colorClass: string) => {
    switch (type) {
      case 'dashed':
        return <CircleDashed className={`w-3.5 h-3.5 ${colorClass} shrink-0`} />;
      case 'circle':
        return <Circle className={`w-3.5 h-3.5 ${colorClass} shrink-0`} />;
      case 'in_progress':
        return <InProgressIcon className={`w-3.5 h-3.5 ${colorClass}`} />;
      case 'done':
        return <CheckCircle2 className={`w-3.5 h-3.5 ${colorClass} shrink-0`} />;
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-canvas text-fg-primary select-none relative">
      {/* ============================================================== */}
      {/* TRIZ Dock on the left: [ 📚 Материалы папки ] (collapsible)   */}
      {/* ============================================================== */}
      {/* On mobile: backdrop overlay when materials drawer is open */}
      {/* Kept mounted on purpose: the drawer slides for 200ms, and a scrim that
          unmounts on the first frame of that slide leaves the board undimmed. */}
      {isMobile && (
        <div
          onClick={() => setIsKanbanMaterialsOpen(false)}
          aria-hidden={!isKanbanMaterialsOpen}
          className={`absolute inset-0 bg-black/60 backdrop-blur-xs z-30 transition-opacity duration-200 ${
            isKanbanMaterialsOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        />
      )}

      {/* TRIZ Dock: Slide-over drawer on mobile, inline dock on desktop */}
      <div
        className={`${
          isMobile
            ? `absolute inset-y-0 left-0 z-40 w-72 bg-panel shadow-2xl border-r border-white/[0.08] transition-transform duration-200 ${
                isKanbanMaterialsOpen ? 'translate-x-0' : '-translate-x-full'
              }`
            : `bg-panel/95 flex flex-col shrink-0 overflow-hidden transition-[width] duration-200 ease-out ${
                isKanbanMaterialsOpen ? 'w-60 sm:w-64 border-r border-white/[0.06]' : 'w-0 border-r-0'
              }`
        }`}
      >
        <div className="w-60 sm:w-64 flex flex-col h-full shrink-0">
          {/* TRIZ Dock Header */}
          <div className="h-10 px-2.5 border-b border-white/[0.06] flex items-center justify-between text-xs font-semibold text-zinc-300 shrink-0">
            <div className="flex items-center gap-1.5 truncate">
              <BookOpen className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <span className="truncate">Материалы папки</span>
              <span className="text-2xs font-mono text-zinc-500">
                ({materialsSearchQuery ? filteredMaterials.length : folderMaterials.length})
              </span>
            </div>
            <button
              onClick={() => setIsKanbanMaterialsOpen(false)}
              className="p-1 rounded hover:bg-white/[0.06] text-zinc-400 hover:text-white transition-colors cursor-pointer"
              title="Свернуть док материалов"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* TRIZ Dock Content */}
          <div className="relative px-3 py-1.5 border-b border-white/[0.04] shrink-0">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={materialsSearchQuery}
              onChange={e => setMaterialsSearchQuery(e.target.value)}
              placeholder="Поиск по материалам..."
              className="w-full bg-surface border border-white/[0.06] rounded-md pl-8 pr-7 py-1 text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-white/20 transition-colors ring-0"
            />
            {materialsSearchQuery && (
              <button
                onClick={() => setMaterialsSearchQuery('')}
                className="absolute right-5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2.5 space-y-2 scrollbar-thin">
            {filteredMaterials.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-600 px-2">
                {materialsSearchQuery
                  ? 'Ничего не найдено'
                  : 'В этой папке нет заметок или статей. Все материалы будут отображаться здесь.'}
              </div>
            ) : (
              filteredMaterials.map(mat => (
                <div
                  key={mat.id}
                  data-flip-id={mat.id}
                  data-draggable="true"
                  onPointerDown={e =>
                    handlePointerDown(e, {
                      type: 'material',
                      id: mat.id,
                      title: mat.title || 'Материал',
                    })
                  }
                  onClick={() => {
                    setSelectedItem(mat);
                    setIsFullscreenEditorOpen(true);
                  }}
                  className={`group p-2.5 rounded-lg bg-surface/80 hover:bg-surface-elevated border border-white/[0.05] hover:border-white/[0.12] transition-colors text-left space-y-1.5 shadow-sm touch-none ${
                    isDragging && draggingPayload?.id === mat.id
                      ? 'opacity-40 scale-[0.98] ring-1 ring-blue-500/50'
                      : 'cursor-grab active:cursor-grabbing'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {mat.type === 'article' ? (
                        <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      ) : (
                        <StickyNote className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      )}
                      <span className="text-sm font-medium text-zinc-200 truncate">
                        {mat.title || 'Без названия'}
                      </span>
                    </div>
                  </div>

                  {mat.content && (
                    <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                      {mat.content.slice(0, 100)}
                    </p>
                  )}

                  {/* Tags */}
                  {mat.tags && mat.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 items-center pt-0.5">
                      {mat.tags.map(tag => (
                        <TagChip
                          key={tag}
                          tag={tag}
                          variant="flat"
                          onClick={() => setActiveTagFilter(activeTagFilter === tag ? null : tag)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* Linear Kanban Columns Area                                     */}
      {/* ============================================================== */}
      <div
        ref={kanbanBoardRef}
        data-testid="kanban-columns-container"
        className={`flex-1 flex overflow-x-auto gap-3.5 p-3 sm:p-4 bg-canvas min-w-0 h-full cursor-grab pb-20 sm:pb-4 ${
          isMobile ? 'snap-x snap-mandatory scroll-smooth' : ''
        }`}
      >
        {COLUMNS.map(column => {
          const colTasks = tasksByStatus[column.id] || [];
          const isOver = isDragging && activeZoneData?.dropColumn === column.id;

          return (
            <div
              key={column.id}
              data-testid={`kanban-column-${column.id}`}
              data-drop-zone="kanban-column"
              data-drop-column={column.id}
              className={`w-[calc(100vw-2.5rem)] sm:w-72 max-w-[340px] shrink-0 flex flex-col rounded-xl bg-surface/70 border transition-colors max-h-full overflow-hidden ${
                isMobile ? 'snap-center' : ''
              } ${
                isOver ? 'border-accent/50 bg-surface-elevated' : 'border-white/[0.06]'
              }`}
            >
              {/* Column Header */}
              <div className="h-10 px-3 border-b border-white/[0.06] flex items-center justify-between shrink-0 bg-panel/60 cursor-grab">
                <div className="flex items-center gap-2 min-w-0">
                  {renderColumnIcon(column.iconType, column.iconColor)}
                  <h3 className="text-xs font-semibold text-zinc-200 tracking-tight truncate">
                    {column.title}
                  </h3>
                  <span className="text-2xs font-mono text-zinc-500 shrink-0">
                    ({colTasks.length})
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => {
                      openComposerModal({ type: 'task', status: column.id, folder: currentFolder });
                    }}
                    className="p-1 rounded hover:bg-white/[0.08] text-zinc-400 hover:text-white transition-colors cursor-pointer"
                    title={`Добавить таску в ${column.title}`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      addToast(`Столбец «${column.title}» (${colTasks.length} ${pluralRu(colTasks.length, ['таска', 'таски', 'тасок'])})`, 'info');
                    }}
                    className="p-1 rounded hover:bg-white/[0.08] text-zinc-400 hover:text-white transition-colors"
                    title="Опции столбца"
                  >
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Column Cards Container */}
              <div className="flex-1 overflow-y-auto p-2.5 space-y-2 scrollbar-thin">
                {/* Cards List */}
                {colTasks.length === 0 ? (
                  <div className="py-8 text-center text-xs text-zinc-600 font-mono">
                    Нет задач
                  </div>
                ) : (
                  colTasks.map(task => {
                    const taskKey = getTaskKey(task);
                    const overdue = isOverdue(task.dueDate) && task.status !== 'done';
                    const completedSubtasks = task.subtasks?.filter(st => st.completed).length || 0;
                    const totalSubtasks = task.subtasks?.length || 0;
                    const isMenuOpen = statusMenuTaskId === task.id;

                    return (
                      <div
                        key={task.id}
                        data-flip-id={task.id}
                        data-draggable="true"
                        onPointerDown={e =>
                          handlePointerDown(e, {
                            type: 'task',
                            id: task.id,
                            title: task.title || 'Задача',
                          })
                        }
                        onClick={() => {
                          setSelectedItem(task);
                          setIsFullscreenEditorOpen(true);
                        }}
                        onContextMenu={e => {
                          e.preventDefault();
                          e.stopPropagation();
                          openContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            type: 'item',
                            item: task,
                          });
                        }}
                        data-testid="kanban-card"
                        className={`group relative p-2.5 rounded-lg bg-surface hover:bg-surface-elevated border border-white/[0.06] hover:border-white/[0.14] transition-colors text-left space-y-2 shadow-sm select-none touch-none ${
                          isDragging && draggingPayload?.id === task.id
                            ? 'opacity-40 ring-1 ring-blue-500/50 scale-[0.98]'
                            : 'cursor-grab active:cursor-grabbing'
                        }`}
                      >
                        {/* Top bar: Task Key, Status Trigger, Linear Signal Bars Priority */}
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex items-center gap-1.5">
                            {/* Status quick switcher button */}
                            <div className="relative">
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  setStatusMenuTaskId(isMenuOpen ? null : task.id);
                                }}
                                className="p-0.5 rounded hover:bg-white/[0.1] transition-colors"
                                title="Сменить статус задачи"
                              >
                                {renderColumnIcon(column.iconType, column.iconColor)}
                              </button>

                              {/* Status Dropdown Menu */}
                              {isMenuOpen && (
                                <div
                                  onClick={e => e.stopPropagation()}
                                  className="absolute left-0 top-full mt-1 w-36 rounded-lg bg-surface-elevated border border-white/[0.12] shadow-xl py-1 z-30 space-y-0.5 motion-popover"
                                >
                                  {COLUMNS.map(col => (
                                    <button
                                      key={col.id}
                                      onClick={() => {
                                        updateItem({
                                          ...task,
                                          status: col.id,
                                        });
                                        setStatusMenuTaskId(null);
                                        addToast(`Статус: «${col.title}»`, 'info');
                                      }}
                                      className={`w-full px-2.5 py-1 text-left text-xs flex items-center gap-2 hover:bg-white/[0.08] transition-colors ${
                                        task.status === col.id ? 'text-white font-medium bg-white/[0.04]' : 'text-zinc-400'
                                      }`}
                                    >
                                      {renderColumnIcon(col.iconType, col.iconColor)}
                                      <span>{col.title}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Linear Task Key (e.g. TSK-12) */}
                            <span className="text-2xs font-mono text-zinc-500 font-medium">
                              {taskKey}
                            </span>
                          </div>

                          {/* Linear Signal Bars Priority */}
                          <div className="flex items-center gap-1">
                            <LinearSignalBars priority={task.priority} />
                          </div>
                        </div>

                        {/* Title (14px, font-medium) */}
                        <div
                          className={`text-sm font-medium leading-snug line-clamp-2 ${
                            task.status === 'done'
                              ? 'line-through text-zinc-500'
                              : 'text-fg-primary'
                          }`}
                        >
                          {task.title || 'Безымянная задача'}
                        </div>

                        {/* Tags */}
                        {task.tags && task.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 items-center pt-0.5">
                            {task.tags.map(tag => (
                              <TagChip
                                key={tag}
                                tag={tag}
                                variant="flat"
                                onClick={() => setActiveTagFilter(activeTagFilter === tag ? null : tag)}
                              />
                            ))}
                          </div>
                        )}

                        {/* Card Footer: Subtasks, Due Date, Attachments */}
                        <div className="flex items-center justify-between text-2xs font-mono text-zinc-500 pt-1 border-t border-white/[0.04]">
                          <div className="flex items-center gap-2">
                            {/* Subtasks Progress Badge */}
                            {totalSubtasks > 0 && (
                              <span
                                className={`flex items-center gap-1 text-2xs ${
                                  completedSubtasks === totalSubtasks
                                    ? 'text-emerald-400'
                                    : 'text-zinc-400'
                                }`}
                                title={`Подзадачи: ${completedSubtasks}/${totalSubtasks}`}
                              >
                                <CheckSquare className="w-3 h-3" />
                                <span>
                                  {completedSubtasks}/{totalSubtasks}
                                </span>
                              </span>
                            )}

                            {/* Attachments */}
                            {task.attachments && task.attachments.length > 0 && (
                              <span
                                className="flex items-center gap-1 text-2xs text-zinc-400"
                                title={`Файлы: ${task.attachments.length}`}
                              >
                                <Paperclip className="w-3 h-3" />
                                <span>{task.attachments.length}</span>
                              </span>
                            )}
                          </div>

                          {/* Due Date or Created Date */}
                          {task.dueDate ? (
                            <span
                              className={`flex items-center gap-1 text-2xs font-mono ${
                                overdue ? 'text-rose-400 font-semibold' : 'text-zinc-400'
                              }`}
                              title={overdue ? 'Просрочено!' : 'Срок выполнения'}
                            >
                              <CalendarIcon className="w-3 h-3 shrink-0" />
                              <span>{task.dueDate}</span>
                            </span>
                          ) : (
                            <span className="text-2xs text-zinc-600 font-mono">
                              {new Date(task.createdAt).toLocaleDateString([], {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}

                {/* "+ Новая задача" button positioned directly under cards/empty state */}
                <button
                  onClick={() => {
                    openComposerModal({ type: 'task', status: column.id, folder: currentFolder });
                  }}
                  className="w-full py-1.5 px-2.5 rounded-lg text-xs font-medium text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] border border-dashed border-white/[0.08] hover:border-white/[0.16] transition-colors flex items-center justify-center gap-1.5 cursor-pointer mt-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Новая задача</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Drag Ghost Overlay */}
      {isDragging && dragPos && draggingPayload && (
        <div
          className="fixed pointer-events-none z-50 px-3 py-1.5 rounded-lg bg-surface-elevated border border-blue-500/40 text-xs font-medium text-white shadow-2xl flex items-center gap-2 transform -translate-x-1/2 -translate-y-1/2 opacity-90 scale-105"
          style={{
            left: `${dragPos.x}px`,
            top: `${dragPos.y}px`,
          }}
        >
          {draggingPayload.type === 'material' ? (
            <StickyNote className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          ) : (
            <CheckSquare className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          )}
          <span className="truncate max-w-[180px]">{draggingPayload.title || 'Элемент'}</span>
        </div>
      )}
    </div>
  );
};
