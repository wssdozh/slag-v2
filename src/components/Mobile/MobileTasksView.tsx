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
  Inbox
} from 'lucide-react';

interface ColumnDef {
  id: TaskStatus;
  title: string;
  iconColor: string;
}

const COLUMNS: ColumnDef[] = [
  { id: 'todo', title: 'К выполнению', iconColor: 'text-blue-400' },
  { id: 'in_progress', title: 'В работе', iconColor: 'text-amber-400' },
  { id: 'done', title: 'Готово', iconColor: 'text-emerald-400' },
  { id: 'backlog', title: 'Бэклог', iconColor: 'text-zinc-500' },
];

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

  const [activeStatusTab, setActiveStatusTab] = useState<TaskStatus>('todo');
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [isAdding, setIsAdding] = useState(false);

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

  return (
    <div className="flex-1 flex flex-col bg-[#09090b] text-[#f4f4f5] overflow-hidden select-none">
      {/* Top Header */}
      <header
        className="h-14 border-b border-white/[0.06] bg-[#0c0c0e]/95 backdrop-blur-md px-4 flex items-center justify-between shrink-0"
        style={{ paddingTop: 'max(var(--sat), 0px)' }}
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <CheckSquare className="w-3.5 h-3.5" />
          </div>
          <h1 className="text-base font-bold text-white tracking-tight">Задачи</h1>
          <span className="text-xs font-mono text-zinc-500">
            ({allTasks.length})
          </span>
        </div>

        <button
          onClick={() => setIsAdding(prev => !prev)}
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/15 text-white flex items-center justify-center active:scale-95 transition-all cursor-pointer"
          title="Быстрая задача"
        >
          <Plus className="w-4 h-4" />
        </button>
      </header>

      {/* Segmented Status Tabs */}
      <div className="px-3 py-2.5 bg-[#0c0c0e]/60 border-b border-white/[0.04] shrink-0">
        <div className="flex items-center gap-1 bg-[#141417] p-1 rounded-xl border border-white/[0.06] overflow-x-auto scrollbar-none">
          {COLUMNS.map(col => {
            const count = (tasksByStatus[col.id] || []).length;
            const isActive = activeStatusTab === col.id;

            return (
              <button
                key={col.id}
                onClick={() => setActiveStatusTab(col.id)}
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer shrink-0 ${
                  isActive
                    ? 'bg-white/10 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <span>{col.title}</span>
                <span className={`text-[10px] font-mono ${isActive ? 'text-zinc-300' : 'text-zinc-500'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Quick Add Form if opened */}
      {isAdding && (
        <form
          onSubmit={handleCreateTask}
          className="p-3 bg-[#141417] border-b border-white/[0.06] flex items-center gap-2 animate-in slide-in-from-top-2 duration-150 shrink-0"
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
            className="px-3.5 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium cursor-pointer active:scale-95 transition-all"
          >
            Добавить
          </button>
        </form>
      )}

      {/* Tasks List */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2.5 pb-24">
        {currentColumnTasks.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-zinc-500">
            <div className="w-12 h-12 rounded-full bg-white/[0.03] border border-white/[0.05] flex items-center justify-center mb-3 text-zinc-600">
              <Inbox className="w-5 h-5" />
            </div>
            <p className="text-sm font-medium text-zinc-400">В этом статусе нет задач</p>
            <p className="text-xs text-zinc-600 mt-1">
              Нажмите «+» вверху, чтобы добавить задачу.
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
      </div>
    </div>
  );
};
