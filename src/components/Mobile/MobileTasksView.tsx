import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import type { SlagItem, TaskStatus } from '../../types';
import { formatDueDateLabel } from '../../lib/time/dateUtils';
import { PRIORITY_LABELS } from '../../lib/tasks/taskUtils';
import {
  CheckSquare,
  Plus,
  MoreVertical,
  Calendar,
  Inbox,
} from 'lucide-react';
import { TaskStatusMark } from '../UI/TaskStatusMark';
import { ResponsiveSegmented, type SegmentedOption } from '../UI/ResponsiveSegmented';
import { MobileCalendarView } from './MobileCalendarView';
import { MobileScreenHeader } from './MobileScreenHeader';
import { useSwipeGesture } from '../../hooks/gestures/useSwipeGesture';
import { EmptyState } from '../UI/EmptyState';
import { DEFAULT_INBOX_FOLDER } from '../../config';

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

type MobileTasksViewMode = 'tasks' | 'calendar';

const VIEW_OPTIONS: SegmentedOption<MobileTasksViewMode>[] = [
  { value: 'tasks', label: 'Таски' },
  {
    value: 'calendar',
    label: 'Календарь',
    icon: <Calendar className="w-3 h-3" />,
    buttonClassName: 'flex items-center gap-1',
    labelClassName: 'hidden sm:inline',
    title: 'Календарь',
  },
];

export const MobileTasksView: React.FC = () => {
  const {
    items,
    toggleTaskComplete,
    setSelectedItem,
    setIsFullscreenEditorOpen,
    setMobileActionSheetItem,
    openComposerModal,
    currentFolder
  } = useApp();

  const [viewMode, setViewMode] = useState<MobileTasksViewMode>('tasks');
  const [activeStatusTab, setActiveStatusTab] = useState<TaskStatus>('todo');

  const { onTouchStart: handleTouchStart, onTouchEnd: handleTouchEnd } = useSwipeGesture({
    onSwipeLeft: () => {
      const idx = COLUMN_ORDER.indexOf(activeStatusTab);
      if (idx < COLUMN_ORDER.length - 1) {
        setActiveStatusTab(COLUMN_ORDER[idx + 1]);
      }
    },
    onSwipeRight: () => {
      const idx = COLUMN_ORDER.indexOf(activeStatusTab);
      if (idx > 0) {
        setActiveStatusTab(COLUMN_ORDER[idx - 1]);
      }
    },
  });

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

  const statusTabOptions = useMemo<SegmentedOption<TaskStatus>[]>(
    () =>
      COLUMNS.map((col) => ({
        value: col.id,
        label: col.title,
        trailing: (isSelected: boolean) => (
          <span className={`text-[10px] font-mono shrink-0 ${isSelected ? 'text-zinc-200' : 'text-zinc-500'}`}>
            ({(tasksByStatus[col.id] || []).length})
          </span>
        ),
      })),
    [tasksByStatus]
  );

  const switcher = (
    <ResponsiveSegmented<MobileTasksViewMode>
      variant="plain"
      value={viewMode}
      onChange={setViewMode}
      options={VIEW_OPTIONS}
    />
  );

  if (viewMode === 'calendar') {
    return <MobileCalendarView headerRightExtra={switcher} />;
  }

  return (
    <div className="flex-1 flex flex-col bg-canvas text-fg-primary overflow-hidden select-none">
      {/* Top Header */}
      <MobileScreenHeader
        title="Таски"
        leftSlot={
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center text-white">
              <CheckSquare className="w-3.5 h-3.5" />
            </div>
            <h1 className="text-base font-bold text-white tracking-tight">Таски</h1>
            <span className="text-xs font-mono text-zinc-500">
              ({allTasks.length})
            </span>
          </div>
        }
        rightSlot={switcher}
      />

      {/* Segmented Status Tabs (Pills style matching MobileFolderInfoView) */}
      <div className="px-3 py-2 bg-panel/60 border-b border-white/[0.04] shrink-0 select-none">
        <ResponsiveSegmented<TaskStatus>
          variant="tabs"
          value={activeStatusTab}
          onChange={setActiveStatusTab}
          options={statusTabOptions}
        />
      </div>

      {/* Main Content: Tasks List (with swipe gesture) */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2.5 pb-24"
      >
        {currentColumnTasks.length === 0 ? (
          <EmptyState
            icon={<Inbox className="w-5 h-5" />}
            title="В этом статусе нет тасок"
            description="Свайпните для переключения статуса или добавьте задачу ниже."
          />
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
                className="flex items-start justify-between p-3.5 rounded-2xl bg-surface/80 hover:bg-surface-elevated border border-white/[0.05] transition-colors cursor-pointer shadow-sm gap-3"
              >
                {/* Left: Checkbox */}
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    toggleTaskComplete(task.id);
                  }}
                  className="mt-0.5 p-1 rounded text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  aria-label="Изменить статус таски"
                >
                  <TaskStatusMark done={isDone} className="w-5 h-5" />
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
                        <span>{formatDueDateLabel(task.dueDate)}</span>
                      </span>
                    )}

                    {task.priority && task.priority !== 'none' && (
                      <span
                        className={`text-2xs font-mono font-medium ${
                          task.priority === 'high'
                            ? 'text-rose-400'
                            : task.priority === 'medium'
                            ? 'text-amber-400'
                            : 'text-zinc-500'
                        }`}
                      >
                        {PRIORITY_LABELS[task.priority] ?? task.priority}
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

        {/* Add Task Button (Opens Unified Composer with preset Task type & current Status) */}
        <button
          type="button"
          onClick={() => {
            openComposerModal({
              type: 'task',
              status: activeStatusTab,
              folder: currentFolder || DEFAULT_INBOX_FOLDER
            });
          }}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl border border-dashed border-white/[0.1] hover:border-white/20 text-xs font-medium text-zinc-400 hover:text-white bg-white/[0.02] hover:bg-white/[0.04] transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4 text-zinc-400" />
          <span>Добавить таску</span>
        </button>
      </div>
    </div>
  );
};
