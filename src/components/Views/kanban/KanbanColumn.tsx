// One board column: header with counter, its cards, the drop highlight, an add button.
import React from 'react';
import { useApp } from '../../../context/AppContext';
import type { SlagItem } from '../../../types';
import { pluralRu } from '../../../lib/time/dateUtils';
import type { DragItemPayload } from '../../../hooks/gestures/usePointerDnd';
import { Icon } from '../../UI/icons/Icon';
import { KanbanCard } from './KanbanCard';
import { KanbanStatusIcon } from './KanbanStatusIcon';
import type { KanbanColumnConfig } from './kanbanModel';

export interface KanbanColumnProps {
  column: KanbanColumnConfig;
  tasks: SlagItem[];
  /** The pointer currently hovers this column as a drop target. */
  isDropTarget: boolean;
  /** Id of the task being dragged, null when nothing moves. */
  draggingTaskId: string | null;
  /** Task whose status menu is open, at most one across the board. */
  statusMenuTaskId: string | null;
  onStatusMenuChange: (taskId: string | null) => void;
  onItemPointerDown: (e: React.PointerEvent, payload: DragItemPayload) => void;
}

/** Kanban column: own header with counter, card list and the inline "new task" button. */
const KanbanColumnComponent: React.FC<KanbanColumnProps> = ({
  column,
  tasks,
  isDropTarget,
  draggingTaskId,
  statusMenuTaskId,
  onStatusMenuChange,
  onItemPointerDown,
}) => {
  const { openComposerModal, addToast, currentFolder, isMobile } = useApp();

  const handleAddTask = () => {
    openComposerModal({ type: 'task', status: column.id, folder: currentFolder });
  };

  return (
    <div
      data-testid={`kanban-column-${column.id}`}
      data-drop-zone="kanban-column"
      data-drop-column={column.id}
      className={`w-[calc(100vw-2.5rem)] sm:w-72 max-w-[340px] shrink-0 flex flex-col rounded-xl bg-surface/70 border transition-colors max-h-full overflow-hidden ${
        isMobile ? 'snap-center' : ''
      } ${
        isDropTarget ? 'border-accent/50 bg-surface-elevated' : 'border-tint-6'
      }`}
    >
      {/* Column Header */}
      <div className="h-10 px-3 border-b border-tint-6 flex items-center justify-between shrink-0 bg-panel/60 cursor-grab">
        <div className="flex items-center gap-2 min-w-0">
          <KanbanStatusIcon iconType={column.iconType} iconColor={column.iconColor} />
          <h3 className="text-xs font-semibold text-fg-soft tracking-tight truncate">
            {column.title}
          </h3>
          <span className="text-2xs font-mono text-fg-muted shrink-0">
            ({tasks.length})
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleAddTask}
            className="p-1 rounded hover:bg-tint-8 text-fg-secondary hover:text-white transition-colors cursor-pointer"
            title={`Добавить таску в ${column.title}`}
          >
            <Icon name="action.add" size="sm" tone="inherit" />
          </button>
          <button
            onClick={() => {
              addToast(`Столбец «${column.title}» (${tasks.length} ${pluralRu(tasks.length, ['таска', 'таски', 'тасок'])})`, 'info');
            }}
            className="p-1 rounded hover:bg-tint-8 text-fg-secondary hover:text-white transition-colors"
            title="Опции столбца"
          >
            <Icon name="action.more" size="sm" tone="inherit" />
          </button>
        </div>
      </div>

      {/* Column Cards Container */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2 scrollbar-thin">
        {/* Cards List */}
        {tasks.length === 0 ? (
          <div className="py-8 text-center text-xs text-fg-dim font-mono">
            Нет задач
          </div>
        ) : (
          tasks.map(task => (
            <KanbanCard
              key={task.id}
              task={task}
              column={column}
              isMenuOpen={statusMenuTaskId === task.id}
              isDragging={draggingTaskId === task.id}
              onStatusMenuChange={onStatusMenuChange}
              onItemPointerDown={onItemPointerDown}
            />
          ))
        )}

        {/* "+ Новая задача" button positioned directly under cards/empty state */}
        <button
          onClick={handleAddTask}
          className="w-full py-1.5 px-2.5 rounded-lg text-xs font-medium text-fg-muted hover:text-fg-tertiary hover:bg-tint-4 border border-dashed border-tint-8 hover:border-tint-16 transition-colors flex items-center justify-center gap-1.5 cursor-pointer mt-1"
        >
          <Icon name="action.add" size="sm" tone="inherit" />
          <span>Новая задача</span>
        </button>
      </div>
    </div>
  );
};

/** A save re-renders the board; without memo every column below it drops its whole card list. */
export const KanbanColumn = React.memo(KanbanColumnComponent);
