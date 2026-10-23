import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import type { SlagItem, TaskStatus } from '../../types';
import { parseTodoistInput } from '../../lib/todoistTaskParser';
import { querySearch } from '../../lib/searchService';
import {
  CircleDashed,
  Circle,
  CheckCircle2,
  Plus,
  MoreHorizontal,
  Calendar as CalendarIcon,
  Paperclip,
  CheckSquare,
  StickyNote,
  FileText,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Search,
  X,
} from 'lucide-react';
import { LinearSignalBars } from '../UI/PriorityBadge';

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
    saveItem,
    setSelectedItem,
    setIsFullscreenEditorOpen,
    openContextMenu,
    addToast,
    setActiveTagFilter,
    activeTagFilter,
  } = useApp();

  // Collapsible TRIZ materials dock
  const [isMaterialsOpen, setIsMaterialsOpen] = useState(true);

  // Search state for TRIZ Materials Dock
  const [materialsSearchQuery, setMaterialsSearchQuery] = useState('');
  const [searchedMaterials, setSearchedMaterials] = useState<SlagItem[]>([]);

  // Column drag highlight
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);

  // Adding task inline in column
  const [addingToColumn, setAddingToColumn] = useState<TaskStatus | null>(null);
  const [newTitle, setNewTitle] = useState('');

  // Active status dropdown card ID
  const [statusMenuTaskId, setStatusMenuTaskId] = useState<string | null>(null);

  // Filter items scoped to current folder
  const folderItems = useMemo(() => {
    return items.filter(item => {
      if (currentFolder === 'Входящие') return true;
      return item.folder === currentFolder || item.folder.startsWith(currentFolder + '/');
    });
  }, [items, currentFolder]);

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

  // Quick Action: Convert Note/Article to Task
  const handleConvertToTask = (material: SlagItem, targetStatus: TaskStatus = 'todo') => {
    updateItem({
      ...material,
      type: 'task',
      status: targetStatus,
    });
    addToast(`«${material.title || 'Заметка'}» преобразована в задачу`, 'success');
  };

  // Drag and Drop handlers
  const handleDragStartTask = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'task', id: taskId }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragStartMaterial = (e: React.DragEvent, materialId: string) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'material', id: materialId }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, colId: TaskStatus) => {
    e.preventDefault();
    if (dragOverColumn !== colId) {
      setDragOverColumn(colId);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault();
    setDragOverColumn(null);

    const raw = e.dataTransfer.getData('text/plain');
    if (!raw) return;

    try {
      const payload = JSON.parse(raw);
      if (payload.kind === 'task') {
        const task = items.find(i => i.id === payload.id);
        if (task && task.status !== targetStatus) {
          updateItem({
            ...task,
            status: targetStatus,
          });
          const colName = COLUMNS.find(c => c.id === targetStatus)?.title || targetStatus;
          addToast(`Задача перемещена в «${colName}»`, 'info');
        }
      } else if (payload.kind === 'material') {
        const material = items.find(i => i.id === payload.id);
        if (material) {
          handleConvertToTask(material, targetStatus);
        }
      }
    } catch {
      // Ignored non-json drops
    }
  };

  // Submit inline new task
  const handleCreateTaskInColumn = (status: TaskStatus) => {
    if (!newTitle.trim()) {
      setAddingToColumn(null);
      return;
    }

    const parsed = parseTodoistInput(newTitle.trim());
    saveItem({
      type: 'task',
      title: parsed.cleanTitle || newTitle.trim(),
      content: '',
      folder: currentFolder,
      status,
      priority: parsed.priority || 'none',
      tags: parsed.tags || [],
      dueDate: parsed.dueDate,
      reminder: parsed.reminder,
    });

    setNewTitle('');
    setAddingToColumn(null);
    addToast('Задача создана', 'success');
  };

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
    <div className="flex-1 flex overflow-hidden bg-[#09090b] text-[#f4f4f5] select-none relative">
      {/* ============================================================== */}
      {/* TRIZ Dock on the left: [ 📚 Материалы папки ] (collapsible)   */}
      {/* ============================================================== */}
      <div
        className={`border-r border-white/[0.06] bg-[#0c0c0e]/95 flex flex-col transition-all duration-200 shrink-0 ${
          isMaterialsOpen ? 'w-60 sm:w-64' : 'w-10'
        }`}
      >
        {/* TRIZ Dock Header */}
        <div className="h-10 px-2.5 border-b border-white/[0.06] flex items-center justify-between text-xs font-semibold text-zinc-300">
          {isMaterialsOpen ? (
            <>
              <div className="flex items-center gap-1.5 truncate">
                <BookOpen className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                <span className="truncate">Материалы папки</span>
                <span className="text-[11px] font-mono text-zinc-500">
                  ({materialsSearchQuery ? filteredMaterials.length : folderMaterials.length})
                </span>
              </div>
              <button
                onClick={() => setIsMaterialsOpen(false)}
                className="p-1 rounded hover:bg-white/[0.06] text-zinc-400 hover:text-white transition-colors"
                title="Свернуть док материалов"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsMaterialsOpen(true)}
              className="w-full flex flex-col items-center py-2 text-zinc-400 hover:text-white transition-colors gap-2"
              title="Развернуть материалы папки"
            >
              <BookOpen className="w-4 h-4 text-zinc-400" />
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* TRIZ Dock Content */}
        {isMaterialsOpen && (
          <>
            <div className="relative px-3 py-1.5 border-b border-white/[0.04]">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={materialsSearchQuery}
                onChange={e => setMaterialsSearchQuery(e.target.value)}
                placeholder="Поиск по материалам..."
                className="w-full bg-[#141417] border border-white/[0.06] rounded-md pl-8 pr-7 py-1 text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-white/20 transition-colors"
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
                  draggable
                  onDragStart={e => handleDragStartMaterial(e, mat.id)}
                  onClick={() => {
                    setSelectedItem(mat);
                    setIsFullscreenEditorOpen(true);
                  }}
                  className="group p-2.5 rounded-lg bg-[#141417]/80 hover:bg-[#18181c] border border-white/[0.05] hover:border-white/[0.12] transition-all cursor-grab active:cursor-grabbing text-left space-y-1.5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {mat.type === 'article' ? (
                        <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      ) : (
                        <StickyNote className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      )}
                      <span className="text-[12px] font-medium text-zinc-200 truncate">
                        {mat.title || 'Без названия'}
                      </span>
                    </div>
                  </div>

                  {mat.content && (
                    <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                      {mat.content.slice(0, 100)}
                    </p>
                  )}

                  {/* Tags */}
                  {mat.tags && mat.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 items-center pt-0.5">
                      {mat.tags.map(tag => (
                        <button
                          key={tag}
                          onClick={e => {
                            e.stopPropagation();
                            setActiveTagFilter(activeTagFilter === tag ? null : tag);
                          }}
                          className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                          #{tag}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </>
        )}
      </div>

      {/* ============================================================== */}
      {/* Linear Kanban Columns Area                                     */}
      {/* ============================================================== */}
      <div className="flex-1 flex overflow-x-auto gap-3.5 p-4 bg-[#09090b] min-w-0 h-full">
        {COLUMNS.map(column => {
          const colTasks = tasksByStatus[column.id] || [];
          const isOver = dragOverColumn === column.id;

          return (
            <div
              key={column.id}
              onDragOver={e => handleDragOver(e, column.id)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, column.id)}
              className={`w-64 sm:w-72 shrink-0 flex flex-col rounded-xl bg-[#0f0f12]/70 border transition-colors max-h-full overflow-hidden ${
                isOver ? 'border-blue-500/50 bg-[#12141a]' : 'border-white/[0.06]'
              }`}
            >
              {/* Column Header */}
              <div className="h-10 px-3 border-b border-white/[0.06] flex items-center justify-between shrink-0 bg-[#0c0c0e]/60">
                <div className="flex items-center gap-2 min-w-0">
                  {renderColumnIcon(column.iconType, column.iconColor)}
                  <h3 className="text-xs font-semibold text-zinc-200 tracking-tight truncate">
                    {column.title}
                  </h3>
                  <span className="text-[11px] font-mono text-zinc-500 shrink-0">
                    ({colTasks.length})
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => {
                      setAddingToColumn(addingToColumn === column.id ? null : column.id);
                      setNewTitle('');
                    }}
                    className="p-1 rounded hover:bg-white/[0.08] text-zinc-400 hover:text-white transition-colors"
                    title={`Добавить задачу в ${column.title}`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      addToast(`Столбец «${column.title}» (${colTasks.length} задач)`, 'info');
                    }}
                    className="p-1 rounded hover:bg-white/[0.08] text-zinc-400 hover:text-white transition-colors"
                    title="Опции столбца"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
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
                        draggable
                        onDragStart={e => handleDragStartTask(e, task.id)}
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
                        className="group relative p-2.5 rounded-lg bg-[#141417] hover:bg-[#18181c] border border-white/[0.06] hover:border-white/[0.14] transition-all cursor-grab active:cursor-grabbing text-left space-y-2 shadow-sm select-none"
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
                                  className="absolute left-0 top-full mt-1 w-36 rounded-lg bg-[#18181c] border border-white/[0.12] shadow-xl py-1 z-30 space-y-0.5"
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
                            <span className="text-[11px] font-mono text-zinc-500 font-medium">
                              {taskKey}
                            </span>
                          </div>

                          {/* Linear Signal Bars Priority */}
                          <div className="flex items-center gap-1">
                            <LinearSignalBars priority={task.priority} />
                          </div>
                        </div>

                        {/* Title (13px, font-medium, #f4f4f5) */}
                        <div
                          className={`text-[13px] font-medium leading-snug line-clamp-2 ${
                            task.status === 'done'
                              ? 'line-through text-zinc-500'
                              : 'text-[#f4f4f5]'
                          }`}
                        >
                          {task.title || 'Безымянная задача'}
                        </div>

                        {/* Tags */}
                        {task.tags && task.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 items-center pt-0.5">
                            {task.tags.map(tag => (
                              <button
                                key={tag}
                                onClick={e => {
                                  e.stopPropagation();
                                  setActiveTagFilter(activeTagFilter === tag ? null : tag);
                                }}
                                className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors"
                              >
                                #{tag}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Card Footer: Subtasks, Due Date, Attachments */}
                        <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 pt-1 border-t border-white/[0.04]">
                          <div className="flex items-center gap-2">
                            {/* Subtasks Progress Badge */}
                            {totalSubtasks > 0 && (
                              <span
                                className={`flex items-center gap-1 text-[10px] ${
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
                                className="flex items-center gap-1 text-[10px] text-zinc-400"
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
                              className={`flex items-center gap-1 text-[10px] font-mono ${
                                overdue ? 'text-rose-400 font-semibold' : 'text-zinc-400'
                              }`}
                              title={overdue ? 'Просрочено!' : 'Срок выполнения'}
                            >
                              <CalendarIcon className="w-3 h-3 shrink-0" />
                              <span>{task.dueDate}</span>
                            </span>
                          ) : (
                            <span className="text-[10px] text-zinc-600 font-mono">
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

                {/* Inline task creator or "+ Новая задача" button positioned directly under cards/empty state */}
                {addingToColumn === column.id ? (
                  <div className="p-2.5 rounded-lg bg-[#18181c] border border-blue-500/40 shadow-md space-y-2 mt-1">
                    <input
                      autoFocus
                      type="text"
                      placeholder="Название задачи... (Enter)"
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleCreateTaskInColumn(column.id);
                        } else if (e.key === 'Escape') {
                          setAddingToColumn(null);
                        }
                      }}
                      className="w-full bg-transparent text-xs text-zinc-100 placeholder-zinc-500 outline-none"
                    />
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-1">
                      <span>Нажмите Enter для создания</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setAddingToColumn(null)}
                          className="px-2 py-0.5 rounded hover:bg-white/[0.08] text-zinc-400 cursor-pointer"
                        >
                          Отмена
                        </button>
                        <button
                          onClick={() => handleCreateTaskInColumn(column.id)}
                          className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium cursor-pointer"
                        >
                          Создать
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setAddingToColumn(column.id);
                      setNewTitle('');
                    }}
                    className="w-full py-1.5 px-2.5 rounded-lg text-xs font-medium text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] border border-dashed border-white/[0.08] hover:border-white/[0.16] transition-colors flex items-center justify-center gap-1.5 cursor-pointer mt-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Новая задача</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
