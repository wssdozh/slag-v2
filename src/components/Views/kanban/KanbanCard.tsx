// A task card on the board: status glyph, key, due date, tags, and its drag handle.
import React from 'react';
import { useApp } from '../../../context/AppContext';
import type { SlagItem, TaskStatus } from '../../../types';
import { Icon } from '../../UI/icons/Icon';
import { LinearSignalBars } from '../../UI/PriorityBadge';
import { TagChip } from '../../UI/TagChip';
import type { DragItemPayload } from '../../../hooks/gestures/usePointerDnd';
import { KanbanStatusIcon } from './KanbanStatusIcon';
import { KANBAN_COLUMNS, getTaskKey, isOverdue } from './kanbanModel';
import type { KanbanColumnConfig } from './kanbanModel';

export interface KanbanCardProps {
  task: SlagItem;
  /** Column the card sits in: drives the status glyph it shows. */
  column: KanbanColumnConfig;
  isMenuOpen: boolean;
  isDragging: boolean;
  onStatusMenuChange: (taskId: string | null) => void;
  onItemPointerDown: (e: React.PointerEvent, payload: DragItemPayload) => void;
}

/** Task card inside a Kanban column. */
const KanbanCardComponent: React.FC<KanbanCardProps> = ({
  task,
  column,
  isMenuOpen,
  isDragging,
  onStatusMenuChange,
  onItemPointerDown,
}) => {
  const {
    updateItem,
    addToast,
    setSelectedItem,
    setIsFullscreenEditorOpen,
    openContextMenu,
    setActiveTagFilter,
    activeTagFilter,
  } = useApp();

  const taskKey = getTaskKey(task);
  const overdue = isOverdue(task.dueDate) && task.status !== 'done';
  const completedSubtasks = task.subtasks?.filter(st => st.completed).length || 0;
  const totalSubtasks = task.subtasks?.length || 0;

  const handleStatusChange = (status: TaskStatus) => {
    updateItem({
      ...task,
      status,
    });
    onStatusMenuChange(null);
    const columnTitle = KANBAN_COLUMNS.find(col => col.id === status)?.title || status;
    addToast(`Статус: «${columnTitle}»`, 'info');
  };

  return (
    <div
      data-flip-id={task.id}
      data-draggable="true"
      onPointerDown={e =>
        onItemPointerDown(e, {
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
      className={`group relative p-2.5 rounded-lg bg-surface hover:bg-surface-elevated border border-tint-6 hover:border-tint-14 transition-colors text-left space-y-2 shadow-sm select-none touch-none ${
        isDragging
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
                onStatusMenuChange(isMenuOpen ? null : task.id);
              }}
              className="p-0.5 rounded hover:bg-tint-10 transition-colors"
              title="Сменить статус задачи"
            >
              <KanbanStatusIcon iconType={column.iconType} iconColor={column.iconColor} />
            </button>

            {/* Status Dropdown Menu */}
            {isMenuOpen && (
              <div
                onClick={e => e.stopPropagation()}
                className="absolute left-0 top-full mt-1 w-36 rounded-lg bg-surface-elevated border border-tint-12 shadow-xl py-1 z-30 space-y-0.5 motion-popover"
              >
                {KANBAN_COLUMNS.map(col => (
                  <button
                    key={col.id}
                    onClick={() => handleStatusChange(col.id)}
                    className={`w-full px-2.5 py-1 text-left text-xs flex items-center gap-2 hover:bg-tint-8 transition-colors ${
                      task.status === col.id ? 'text-white font-medium bg-tint-4' : 'text-fg-secondary'
                    }`}
                  >
                    <KanbanStatusIcon iconType={col.iconType} iconColor={col.iconColor} />
                    <span>{col.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Linear Task Key (e.g. TSK-12) */}
          <span className="text-2xs font-mono text-fg-muted font-medium">
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
            ? 'line-through text-fg-muted'
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
      <div className="flex items-center justify-between text-2xs font-mono text-fg-muted pt-1 border-t border-tint-4">
        <div className="flex items-center gap-2">
          {/* Subtasks Progress Badge */}
          {totalSubtasks > 0 && (
            <span
              className={`flex items-center gap-1 text-2xs ${
                completedSubtasks === totalSubtasks
                  ? 'text-emerald-400'
                  : 'text-fg-secondary'
              }`}
              title={`Подзадачи: ${completedSubtasks}/${totalSubtasks}`}
            >
              <Icon name="entity.task" size="sm" tone="inherit" />
              <span>
                {completedSubtasks}/{totalSubtasks}
              </span>
            </span>
          )}

          {/* Attachments */}
          {task.attachments && task.attachments.length > 0 && (
            <span
              className="flex items-center gap-1 text-2xs text-fg-secondary"
              title={`Файлы: ${task.attachments.length}`}
            >
              <Icon name="action.attach" size="sm" tone="inherit" />
              <span>{task.attachments.length}</span>
            </span>
          )}
        </div>

        {/* Due Date or Created Date */}
        {task.dueDate ? (
          <span
            className={`flex items-center gap-1 text-2xs font-mono ${
              overdue ? 'text-rose-400 font-semibold' : 'text-fg-secondary'
            }`}
            title={overdue ? 'Просрочено!' : 'Срок выполнения'}
          >
            <Icon name="time.date" size="sm" tone="inherit" className="shrink-0" />
            <span>{task.dueDate}</span>
          </span>
        ) : (
          <span className="text-2xs text-fg-dim font-mono">
            {new Date(task.createdAt).toLocaleDateString([], {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        )}
      </div>
    </div>
  );
};

/** A folder can hold hundreds of tasks: a toast must not re-render every card's props subtree. */
export const KanbanCard = React.memo(KanbanCardComponent);
