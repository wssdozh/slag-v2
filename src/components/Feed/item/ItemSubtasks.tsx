// A task's subtasks: one counter, one toggleable line each, collapsible.
import React, { memo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { MarkdownRenderer } from '../../UI/MarkdownRenderer';
import { TaskStatusMark } from '../../UI/TaskStatusMark';
import type { SlagSubtask } from '../../../types';

export interface ItemSubtasksProps {
  subtasks?: SlagSubtask[];
  /** Marks one line by its own id; the card owns the item the line belongs to. */
  onToggle: (subtaskId: string) => void;
  onWikiLinkClick: (target: string) => void;
}

/** Subtasks of a task, flat: one counter above, one line per subtask under it. */
const ItemSubtasksComponent: React.FC<ItemSubtasksProps> = ({
  subtasks,
  onToggle,
  onWikiLinkClick,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!subtasks || subtasks.length === 0) return null;

  const completedCount = subtasks.filter((subtask) => subtask.completed).length;
  const totalCount = subtasks.length;

  return (
    <div className="mt-1 pl-[26px] flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-label={`Подзадачи: ${completedCount} из ${totalCount}`}
        className="flex items-center gap-1.5 text-2xs font-mono text-zinc-500 cursor-pointer hover:text-zinc-300 select-none py-0.5 w-fit"
      >
        <span>
          Подзадачи: {completedCount} из {totalCount}
        </span>
        <ChevronDown className={`w-3 h-3 text-zinc-500 transition-transform duration-200 ease-out ${isExpanded ? 'rotate-180' : ''}`} />
      </button>

      <div
        className="motion-accordion"
        data-expanded={isExpanded}
        aria-hidden={!isExpanded}
      >
        <div className="motion-accordion-inner flex flex-col gap-1.5 pt-0.5">
          {subtasks.map((subtask) => (
            <div
              key={subtask.id}
              onClick={() => onToggle(subtask.id)}
              className="flex items-center gap-2 cursor-pointer text-xs sm:text-ui group/sub select-none"
            >
              <button
                type="button"
                aria-label={`Отметить подзадачу ${subtask.title}`}
                className="text-zinc-500 group-hover/sub:text-zinc-300 transition-colors shrink-0"
              >
                <TaskStatusMark done={subtask.completed} className="w-3.5 h-3.5" />
              </button>
              <span
                className={`text-xs sm:text-ui flex-1 min-w-0 ${
                  subtask.completed ? 'line-through text-zinc-500' : 'text-zinc-300'
                }`}
              >
                <MarkdownRenderer
                  content={subtask.title}
                  inline
                  onWikiLinkClick={onWikiLinkClick}
                  className={subtask.completed ? 'line-through text-zinc-500' : 'text-zinc-300'}
                />
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const ItemSubtasks = memo(ItemSubtasksComponent);
