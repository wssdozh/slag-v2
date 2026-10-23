import React, { useMemo, useSyncExternalStore } from 'react';
import { useApp } from '../../context/AppContext';
import { Calendar as CalendarIcon, Circle, CheckCircle2 } from 'lucide-react';

function subscribeToNow() {
  return () => {};
}

function getTodayString() {
  return new Date().toISOString().slice(0, 10);
}

export const MobileCalendarView: React.FC = () => {
  const {
    items,
    toggleTaskComplete,
    setSelectedItem,
    setIsFullscreenEditorOpen
  } = useApp();

  const todayStr = useSyncExternalStore(subscribeToNow, getTodayString, () => '');

  const tasksWithDueDate = useMemo(() => {
    return items
      .filter(i => (i.type === 'task' || (i.subtasks && i.subtasks.length > 0)) && i.dueDate)
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
  }, [items]);

  return (
    <div className="flex-1 flex flex-col bg-[#09090b] text-[#f4f4f5] overflow-hidden select-none">
      {/* Header */}
      <header
        className="h-14 border-b border-white/[0.06] bg-[#0c0c0e]/95 backdrop-blur-md px-4 flex items-center justify-between shrink-0"
        style={{ paddingTop: 'max(var(--sat), 0px)' }}
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <CalendarIcon className="w-3.5 h-3.5" />
          </div>
          <h1 className="text-base font-bold text-white tracking-tight">Календарь</h1>
          <span className="text-xs font-mono text-zinc-500">
            ({tasksWithDueDate.length})
          </span>
        </div>
      </header>

      {/* Task Deadlines List */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2.5 pb-24">
        {tasksWithDueDate.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-zinc-500">
            <div className="w-12 h-12 rounded-full bg-white/[0.03] border border-white/[0.05] flex items-center justify-center mb-3 text-zinc-600">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <p className="text-sm font-medium text-zinc-400">Нет задач с дедлайнами</p>
            <p className="text-xs text-zinc-600 mt-1">
              Укажите дату при создании задачи (например, «завтра» или «в пн»).
            </p>
          </div>
        ) : (
          tasksWithDueDate.map(task => {
            const isDone = task.status === 'done';
            const isOverdue = (task.dueDate || '') < todayStr && !isDone;
            const isToday = task.dueDate === todayStr;

            return (
              <div
                key={task.id}
                onClick={() => {
                  setSelectedItem(task);
                  setIsFullscreenEditorOpen(true);
                }}
                className="flex items-start justify-between p-3.5 rounded-2xl bg-[#141417]/80 hover:bg-[#18181c] border border-white/[0.05] active:scale-[0.99] transition-all cursor-pointer shadow-sm gap-3"
              >
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

                <div className="flex-1 min-w-0">
                  <div
                    className={`text-sm font-medium leading-snug break-words ${
                      isDone ? 'line-through text-zinc-500' : 'text-zinc-200'
                    }`}
                  >
                    {task.title || 'Без названия'}
                  </div>

                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                        isOverdue
                          ? 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                          : isToday
                          ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                          : 'bg-white/[0.04] border-white/[0.06] text-zinc-400'
                      }`}
                    >
                      {isOverdue ? 'Просрочено: ' : isToday ? 'Сегодня: ' : ''}
                      {task.dueDate}
                    </span>

                    {task.folder && (
                      <span className="text-[10px] font-mono text-zinc-500">
                        {task.folder}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
