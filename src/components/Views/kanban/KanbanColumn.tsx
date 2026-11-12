import React from 'react';
import { useApp } from '../../../context/AppContext';
import type { SlagItem } from '../../../types';
import { pluralRu } from '../../../lib/time/dateUtils';
import type { DragItemPayload } from '../../../hooks/gestures/usePointerDnd';
import { MoreVertical, Plus } from 'lucide-react';
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
export const KanbanColumn: React.FC<KanbanColumnProps> = ({
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
        isDropTarget ? 'border-accent/50 bg-surface-elevated' : 'border-white/[0.06]'
      }`}
    >
      {/* Column Header */}
      <div className="h-10 px-3 border-b border-white/[0.06] flex items-center justify-between shrink-0 bg-panel/60 cursor-grab">
        <div className="flex items-center gap-2 min-w-0">
          <KanbanStatusIcon iconType={column.iconType} iconColor={column.iconColor} />
          <h3 className="text-xs font-semibold text-zinc-200 tracking-tight truncate">
            {column.title}
          </h3>
          <span className="text-2xs font-mono text-zinc-500 shrink-0">
            ({tasks.length})
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleAddTask}
            className="p-1 rounded hover:bg-white/[0.08] text-zinc-400 hover:text-white transition-colors cursor-pointer"
            title={`Добавить таску в ${column.title}`}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              addToast(`Столбец «${column.title}» (${tasks.length} ${pluralRu(tasks.length, ['таска', 'таски', 'тасок'])})`, 'info');
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
        {tasks.length === 0 ? (
          <div className="py-8 text-center text-xs text-zinc-600 font-mono">
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
          className="w-full py-1.5 px-2.5 rounded-lg text-xs font-medium text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] border border-dashed border-white/[0.08] hover:border-white/[0.16] transition-colors flex items-center justify-center gap-1.5 cursor-pointer mt-1"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Новая задача</span>
        </button>
      </div>
    </div>
  );
};
