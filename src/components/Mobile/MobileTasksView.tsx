import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import type { SlagItem, TaskStatus } from '../../types';
import {
  CheckSquare,
  Circle,
  CheckCircle2,
  Plus,
  MoreVertical,
  Calendar,
  Inbox,
  X
} from 'lucide-react';
import { MobileCalendarView } from './MobileCalendarView';

interface ColumnDef {
  id: TaskStatus;
  title: string;
}

const COLUMNS: ColumnDef[] = [
  { id: 'todo', title: 'К выполнению' },
  { id: 'in_progress', title: 'В работе' },
  { id: 'done', title: 'Готово' },
  { id: 'backlog', title: 'Бэклог' },
];

const COLUMN_ORDER: TaskStatus[] = ['todo', 'in_progress', 'done', 'backlog'];

export const MobileTasksView: React.FC = () => {
  const {
    items,
    saveItem,
    toggleTaskComplete,
    setSelectedItem,
    setIsFullscreenEditorOpen,
    setMobileActionSheetItem,
    currentFolder
  } = useApp();

  const [viewMode, setViewMode] = useState<'tasks' | 'calendar'>('tasks');
  const [activeStatusTab, setActiveStatusTab] = useState<TaskStatus>('todo');
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // Swipe gesture coordinates
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);

  // Filter only task items
  const allTasks = useMemo(() => {
    return items.filter(i => i.type === 'task' || (i.subtasks && i.subtasks.length > 0));
  }, [items]);

  // Group tasks by status
  const tasksByStatus = useMemo(() => {
    const map: Record<TaskStatus, SlagItem[]> = {
      backlog: [],
      todo: [],
      in_progress: [],
      done: [],
    };

    allTasks.forEach(task => {
      const status: TaskStatus = task.status || 'todo';
      if (map[status]) {
        map[status].push(task);
      } else {
        map.todo.push(task);
      }
    });

    return map;
  }, [allTasks]);

  const currentColumnTasks = tasksByStatus[activeStatusTab] || [];

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTaskTitle.trim()) return;

    saveItem({
      title: quickTaskTitle.trim(),
      content: '',
      type: 'task',
      folder: currentFolder || 'Входящие',
      status: activeStatusTab,
      priority: 'none',
      attachments: [],
      tags: [],
    });

    setQuickTaskTitle('');
    setIsAdding(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
    setTouchStartY(e.touches[0].clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null || touchStartY === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX;
    const deltaY = e.changedTouches[0].clientY - touchStartY;
    setTouchStartX(null);
    setTouchStartY(null);

    // Threshold 40px, more horizontal than vertical
    if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      const idx = COLUMN_ORDER.indexOf(activeStatusTab);
      if (deltaX < 0 && idx < COLUMN_ORDER.length - 1) {
        setActiveStatusTab(COLUMN_ORDER[idx + 1]);
      } else if (deltaX > 0 && idx > 0) {
        setActiveStatusTab(COLUMN_ORDER[idx - 1]);
      }
    }
  };

  const switcher = (
    <div className="flex items-center bg-[#141417] p-0.5 rounded-lg border border-white/[0.08]">
      <button
        type="button"
        onClick={() => setViewMode('tasks')}
        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
          viewMode === 'tasks'
            ? 'bg-white/10 text-white shadow-sm'
            : 'text-zinc-400 hover:text-zinc-200'
        }`}
      >
        Задачи
      </button>
      <button
        type="button"
        onClick={() => setViewMode('calendar')}
        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer flex items-center gap-1 ${
          viewMode === 'calendar'
            ? 'bg-white/10 text-white shadow-sm'
            : 'text-zinc-400 hover:text-zinc-200'
        }`}
      >
        <Calendar className="w-3 h-3" />
        <span>Календарь</span>
      </button>
    </div>
  );

  if (viewMode === 'calendar') {
    return <MobileCalendarView headerRightExtra={switcher} />;
  }

  return (
    <div className="flex-1 flex flex-col bg-[#09090b] text-[#f4f4f5] overflow-hidden select-none">
      {/* Top Header */}
      <header
        className="h-14 border-b border-white/[0.06] bg-[#0c0c0e]/95 backdrop-blur-md px-4 flex items-center justify-between shrink-0"
        style={{ paddingTop: 'max(var(--sat), 0px)' }}
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center text-white">
            <CheckSquare className="w-3.5 h-3.5" />
          </div>
          <h1 className="text-base font-bold text-white tracking-tight">Задачи</h1>
          <span className="text-xs font-mono text-zinc-500">
            ({allTasks.length})
          </span>
        </div>

        {/* View Switcher: Tasks vs Calendar */}
        {switcher}
      </header>

      {/* Segmented Status Tabs (Pills style matching MobileFolderInfoView) */}
      <div className="px-3 py-2 bg-[#0c0c0e]/60 border-b border-white/[0.04] shrink-0">
        <div className="flex items-center gap-1.5 bg-[#141417]/90 p-1 rounded-2xl border border-white/[0.06] overflow-x-auto scrollbar-none">
          {COLUMNS.map(col => {
            const count = (tasksByStatus[col.id] || []).length;
            const isActive = activeStatusTab === col.id;

            return (
              <button
                key={col.id}
                onClick={() => setActiveStatusTab(col.id)}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap active:scale-95 ${
                  isActive
                    ? 'bg-white/10 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <span>{col.title}</span>
                <span className={`text-[10px] font-mono shrink-0 ${isActive ? 'text-zinc-200' : 'text-zinc-500'}`}>
                  ({count})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content: Tasks List (with swipe gesture) */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2.5 pb-24"
      >
        {currentColumnTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center p-6 text-zinc-500">
            <div className="w-12 h-12 rounded-full bg-white/[0.03] border border-white/[0.05] flex items-center justify-center mb-3 text-zinc-600">
              <Inbox className="w-5 h-5" />
            </div>
            <p className="text-sm font-medium text-zinc-400">В этом статусе нет задач</p>
            <p className="text-xs text-zinc-600 mt-1 mb-4">
              Свайпните для переключения статуса или добавьте задачу ниже.
            </p>
          </div>
        ) : (
          currentColumnTasks.map(task => {
            const isDone = task.status === 'done';

            return (
              <div
                key={task.id}
                onClick={() => {
                  setSelectedItem(task);
                  setIsFullscreenEditorOpen(true);
                }}
                className="flex items-start justify-between p-3.5 rounded-2xl bg-[#141417]/80 hover:bg-[#18181c] border border-white/[0.05] active:scale-[0.99] transition-all cursor-pointer shadow-sm gap-3"
              >
                {/* Left: Checkbox */}
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    toggleTaskComplete(task.id);
                  }}
                  className="mt-0.5 p-1 rounded text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  aria-label="Изменить статус задачи"
                >
                  {isDone ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 fill-emerald-400/20" />
                  ) : (
                    <Circle className="w-5 h-5 text-zinc-500 hover:text-zinc-300" />
                  )}
                </button>

                {/* Center: Title & Metadata */}
                <div className="flex-1 min-w-0">
                  <div
                    className={`text-sm font-medium leading-snug break-words ${
                      isDone ? 'line-through text-zinc-500' : 'text-zinc-200'
                    }`}
                  >
                    {task.title || 'Без названия'}
                  </div>

                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {task.folder && (
                      <span className="text-[10px] font-mono text-zinc-500">
                        {task.folder}
                      </span>
                    )}

                    {task.dueDate && (
                      <span className="flex items-center gap-1 text-[10px] font-mono text-blue-400">
                        <Calendar className="w-3 h-3" />
                        <span>{task.dueDate}</span>
                      </span>
                    )}

                    {task.priority && task.priority !== 'none' && (
                      <span
                        className={`text-[9px] uppercase font-mono font-medium ${
                          task.priority === 'high'
                            ? 'text-rose-400'
                            : task.priority === 'medium'
                            ? 'text-amber-400'
                            : 'text-zinc-500'
                        }`}
                      >
                        {task.priority}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: More button */}
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    setMobileActionSheetItem(task);
                  }}
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                  title="Опции"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
            );
          })
        )}

        {/* Inline Quick Add Task Button / Form (After the last task card) */}
        {isAdding ? (
          <form
            onSubmit={handleCreateTask}
            className="p-3 bg-[#141417] border border-white/[0.08] rounded-2xl flex items-center gap-2 animate-in fade-in duration-150 shadow-sm"
          >
            <input
              type="text"
              value={quickTaskTitle}
              onChange={e => setQuickTaskTitle(e.target.value)}
              placeholder={`Новая задача в «${COLUMNS.find(c => c.id === activeStatusTab)?.title}»...`}
              autoFocus
              className="flex-1 bg-black/40 border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none"
            />
            <button
              type="submit"
              className="px-3.5 py-2 rounded-xl bg-white text-black text-xs font-semibold cursor-pointer active:scale-95 transition-all shrink-0"
            >
              Добавить
            </button>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white transition-colors cursor-pointer"
              title="Отмена"
            >
              <X className="w-4 h-4" />
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl border border-dashed border-white/[0.1] hover:border-white/20 text-xs font-medium text-zinc-400 hover:text-white bg-white/[0.02] hover:bg-white/[0.04] transition-all cursor-pointer active:scale-[0.99]"
          >
            <Plus className="w-4 h-4 text-zinc-400" />
            <span>Добавить задачу</span>
          </button>
        )}
      </div>
    </div>
  );
};
