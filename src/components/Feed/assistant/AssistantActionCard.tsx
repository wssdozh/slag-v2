import React from 'react';
import {
  Calendar,
  Clock,
  Plus,
  CheckSquare,
  FolderOpen,
  FileText,
  GitCompare,
  Circle,
  ArrowUpRight,
  X,
  Check,
  Loader2,
} from 'lucide-react';
import { LinearSignalBars } from '../../UI/PriorityBadge';
import { PRIORITY_TONE_CHIP, priorityTone } from '../../UI/priorityTone';
import { TagChip } from '../../UI/TagChip';
import type { SuggestedAction } from '../../../types';

const formatReminderTime = (rem?: string) => {
  if (!rem) return '';
  if (/^\d{2}:\d{2}$/.test(rem)) return rem;
  try {
    const d = new Date(rem);
    return isNaN(d.getTime()) ? rem : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return rem;
  }
};

const canShowDiff = (action: SuggestedAction): boolean => {
  if (action.type === 'batch_update' && action.batchUpdateItems && action.batchUpdateItems.length > 0) {
    return true;
  }
  if (action.type === 'update_item' || action.type === 'create_note') {
    return true;
  }
  if (action.updates && Object.keys(action.updates).length > 0) {
    return true;
  }
  return false;
};

interface AssistantActionCardProps {
  action: SuggestedAction;
  isSidebar: boolean;
  isTaskSelected: (taskId: string) => boolean;
  onToggleTaskSelection: (taskId: string) => void;
  onOpenDiff: (initialIndex?: number) => void;
  onExecute: (action: SuggestedAction) => void;
  onReject: () => void;
  onOpenItem: (idOrTitle: string) => void;
}

export const AssistantActionCard: React.FC<AssistantActionCardProps> = ({
  action,
  isSidebar,
  isTaskSelected,
  onToggleTaskSelection,
  onOpenDiff,
  onExecute,
  onReject,
  onOpenItem,
}) => {
  const actionState = action.actionState || 'suggested';
  const isRejected = actionState === 'rejected';
  const isApplied = actionState === 'applied';
  const isExecuting = actionState === 'executing';
  const actionPriority = action.updates?.priority || action.priority;

  return (
    <div
      data-testid="action-card"
      className={`w-full ${isSidebar ? 'max-w-full' : 'max-w-xl'} rounded-xl bg-surface border border-white/[0.08] overflow-hidden mt-1 text-xs shadow-sm transition-opacity ${
        isRejected ? 'opacity-50' : ''
      }`}
    >
      {/* Header bar: Monochrome Linear style */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-white/[0.02] border-b border-white/[0.04] text-2xs font-mono text-zinc-400">
        <div className="flex items-center gap-1.5">
          {action.type === 'schedule_task' && <Calendar className="w-3.5 h-3.5 text-zinc-400" />}
          {action.type === 'batch_update' && <Clock className="w-3.5 h-3.5 text-zinc-400" />}
          {action.type === 'update_item' && (
            action.updates?.appendContent || action.appendContent ? <Plus className="w-3.5 h-3.5 text-zinc-400" /> :
            action.updates?.dueDate || action.dueDate ? <Clock className="w-3.5 h-3.5 text-zinc-400" /> :
            action.updates?.status ? <CheckSquare className="w-3.5 h-3.5 text-zinc-400" /> :
            action.updates?.folder ? <FolderOpen className="w-3.5 h-3.5 text-zinc-400" /> :
            <FileText className="w-3.5 h-3.5 text-zinc-400" />
          )}
          {(!action.type || action.type === 'create_note') && <Plus className="w-3.5 h-3.5 text-zinc-400" />}
          <span className={isRejected ? 'text-zinc-500' : isApplied ? 'text-zinc-300 font-medium' : 'text-zinc-200 font-medium'}>
            {action.actionLabel ? action.actionLabel :
             action.type === 'schedule_task' ? 'Планирование в календарь' :
             action.type === 'batch_update' ? (action.title || 'Перенос задач') :
             action.type === 'create_note' ? (
               action.itemType === 'task' ? 'Черновик таски' :
               action.itemType === 'article' ? 'Черновик статьи' :
               'Черновик заметки'
             ) :
             'Обновление записи'
            }
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-zinc-500 truncate max-w-[120px]">
            {action.folder}
          </span>
          {canShowDiff(action) && (
            <button
              type="button"
              onClick={() => onOpenDiff()}
              className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
              title="Сравнить изменения (Diff)"
            >
              <GitCompare className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="p-3.5 flex flex-col gap-2.5">
        {/* Title & Priority (Only for single-item actions, omitted for batch_update to prevent duplicate header) */}
        {action.type !== 'batch_update' && (
          <div className="text-xs font-semibold flex items-center justify-between gap-2">
            <span className={isRejected ? 'line-through text-zinc-500' : isApplied ? 'text-zinc-300' : 'text-zinc-100'}>
              {action.title}
            </span>
            {actionPriority && !isRejected && (
              <span className="flex items-center gap-1 shrink-0">
                <LinearSignalBars priority={actionPriority} className="w-3 h-3" />
                <span className={`text-2xs font-mono px-1.5 py-0.5 rounded font-semibold ${PRIORITY_TONE_CHIP[priorityTone(actionPriority)]}`}>
                  {actionPriority.toUpperCase()}
                </span>
              </span>
            )}
          </div>
        )}

        {/* Single Schedule info: show ONLY if dueDate was actually set or changed */}
        {Boolean(action.type === 'schedule_task' || action.updates?.dueDate || (action.type === 'update_item' && !action.updates && action.dueDate)) && (
          <div className="flex items-center gap-2 text-2xs font-mono text-zinc-400">
            <Calendar className="w-3 h-3 text-zinc-500" />
            <span>Срок: {action.updates?.dueDate || action.dueDate}</span>
            {(action.updates?.reminder || action.reminder) && (
              <span className="text-zinc-500">
                ({formatReminderTime((action.updates?.reminder || action.reminder)!)})
              </span>
            )}
          </div>
        )}

        {/* Subtasks checklist if present */}
        {action.subtasks && action.subtasks.length > 0 && (
          <div className="flex flex-col gap-1.5 py-0.5">
            {action.subtasks.map((st, sIdx) => (
              <div key={sIdx} className="flex items-center gap-2 text-xs text-zinc-300">
                <Circle className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                <span className="leading-tight">{st.title}</span>
              </div>
            ))}
          </div>
        )}

        {/* Batch update items list with selection checkboxes */}
        {action.type === 'batch_update' && action.batchUpdateItems && action.batchUpdateItems.length > 0 && (
          <div className="flex flex-col divide-y divide-white/[0.04] border-t border-b border-white/[0.04] -mx-3.5 px-3.5 py-1">
            {action.batchUpdateItems.map((item, bIdx) => {
              const selected = isTaskSelected(item.targetItemId);
              const up = item.updates || {};
              return (
                <div key={bIdx} className={`flex items-center justify-between text-xs py-1.5 gap-2 transition-opacity ${
                  !selected && !isApplied ? 'opacity-40' : ''
                }`}>
                  <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                    {!isApplied && !isRejected && (
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => onToggleTaskSelection(item.targetItemId)}
                        className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 accent-zinc-200 cursor-pointer shrink-0"
                      />
                    )}
                    <span className={`truncate leading-tight ${selected ? 'text-zinc-200' : 'text-zinc-500 line-through'}`}>
                      {item.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 text-2xs font-mono text-zinc-400">
                    {(up.dueDate !== undefined || up.reminder) && (
                      <>
                        <Calendar className="w-3 h-3 text-zinc-500" />
                        <span>{(() => {
                          const today = new Date().toISOString().slice(0, 10);
                          const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
                          const d = up.dueDate || (up.reminder?.includes('T') ? up.reminder.split('T')[0] : undefined);
                          if (d === today) return 'сегодня';
                          if (d === tomorrow) return 'завтра';
                          return d || 'без срока';
                        })()}</span>
                      </>
                    )}
                    {up.reminder && (
                      <span className="text-zinc-400 font-medium">
                        {formatReminderTime(up.reminder)}
                      </span>
                    )}
                    {up.priority && up.priority !== 'none' && (
                      <span className={`px-1.5 py-0.5 rounded text-2xs font-mono font-semibold ${PRIORITY_TONE_CHIP[priorityTone(up.priority)]}`}>
                        {up.priority.toUpperCase()}
                      </span>
                    )}
                    {up.status && (
                      <span className="px-1.5 py-0.5 rounded text-2xs font-mono font-semibold bg-white/[0.06] text-zinc-300">
                        {up.status}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenDiff(bIdx);
                      }}
                      className="p-1 rounded hover:bg-white/[0.08] text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
                      title="Посмотреть изменения этой заметки (Diff)"
                    >
                      <GitCompare className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenItem(item.targetItemId || item.title);
                      }}
                      className="p-1 rounded hover:bg-white/[0.08] text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
                      title={`Перейти к «${item.title}»`}
                    >
                      <ArrowUpRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Append to note diff preview */}
        {(action.updates?.appendContent || action.appendContent) && (
          <div className="border-l border-white/20 pl-2.5 py-0.5 text-xs text-zinc-200 font-mono whitespace-pre-wrap leading-relaxed">
            + {action.updates?.appendContent || action.appendContent}
          </div>
        )}

        {/* Content snippet */}
        {!action.updates?.appendContent && !action.appendContent && action.content && (
          <p className="text-xs text-zinc-400 line-clamp-2">
            {action.content}
          </p>
        )}

        {/* Tags */}
        {action.tags && action.tags.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {action.tags.map((t, idx) => (
              <TagChip key={idx} tag={t} variant="flat" />
            ))}
          </div>
        )}

        {/* Dynamic extra properties (e.g. duration, customProps) */}
        {action.updates && Object.keys(action.updates).some(k => ['duration', 'kanbanColumn', 'customProps'].includes(k)) && (
          <div className="flex items-center gap-1.5 flex-wrap text-2xs font-mono text-zinc-400 pt-0.5">
            {action.updates.duration !== undefined && (
              <span className="px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-zinc-300">
                ⏳ {action.updates.duration} мин
              </span>
            )}
            {action.updates.kanbanColumn !== undefined && (
              <span className="px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-zinc-300">
                📋 {action.updates.kanbanColumn}
              </span>
            )}
            {action.updates.customProps && Object.entries(action.updates.customProps).map(([k, v]) => (
              <span key={k} className="px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-zinc-300">
                {k}: {String(v)}
              </span>
            ))}
          </div>
        )}

        {/* Action Lifecycle Controls */}
        {isRejected ? (
          <div className="mt-1 flex items-center gap-1.5 text-xs font-mono text-zinc-500 py-0.5">
            <X className="w-3.5 h-3.5 text-zinc-600" />
            <span>Действие отклонено</span>
          </div>
        ) : isApplied ? (
          <div className="mt-1 flex items-center justify-between gap-2 pt-1 border-t border-white/[0.04] min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-zinc-300 font-medium min-w-0 flex-1 truncate">
              <Check className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <span className="truncate">
                {action.type === 'schedule_task' ? `Запланировано на ${action.dueDate}` :
                 action.type === 'batch_update' ? (action.actionLabel ? `${action.actionLabel}` : `Применено: ${action.batchUpdateItems?.length || 0}`) :
                 action.updates?.appendContent || action.appendContent ? 'Дополнено' :
                 action.updates?.dueDate ? `Срок: ${action.updates.dueDate || 'бэклог'}` :
                 action.updates?.priority ? `Приоритет: ${action.updates.priority.toUpperCase()}` :
                 action.updates?.status ? `Статус: ${action.updates.status}` :
                 action.actionLabel ? `Применено: ${action.actionLabel}` :
                 'Обновлено'}
              </span>
            </div>
            {action.type !== 'batch_update' ? (
              <button
                onClick={() => onOpenItem(action.appliedItemId || action.title)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 hover:text-white text-xs font-medium transition-colors cursor-pointer shrink-0 whitespace-nowrap ml-1"
                title="Показать запись в ленте"
              >
                <span>{action.updates?.appendContent || action.appendContent ? 'Открыть' : 'Перейти к записи'}</span>
                <ArrowUpRight className="w-3 h-3 text-zinc-400" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onOpenDiff()}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 hover:text-zinc-200 text-xs font-medium transition-colors cursor-pointer shrink-0 whitespace-nowrap ml-1"
                title="Посмотреть изменения"
              >
                <GitCompare className="w-3 h-3 text-zinc-400" />
                <span>Сравнить</span>
              </button>
            )}
          </div>
        ) : isExecuting ? (
          <button
            disabled
            className="mt-1 w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 font-semibold text-xs opacity-80 cursor-not-allowed shadow-sm"
          >
            <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
            <span>Применение...</span>
          </button>
        ) : (
          <div className="mt-1 flex items-center gap-2">
            {(() => {
              let finalAction = action;
              let count = action.batchUpdateItems?.length || 0;
              let isDisabled = false;

              if (action.type === 'batch_update' && action.batchUpdateItems) {
                const activeItems = action.batchUpdateItems.filter(it => isTaskSelected(it.targetItemId));
                count = activeItems.length;
                isDisabled = count === 0;
                finalAction = {
                  ...action,
                  batchUpdateItems: activeItems,
                };
              }

              const buttonLabel = count > 0
                ? `Применить (${count})`
                : action.type === 'create_note'
                ? 'Сохранить'
                : action.type === 'schedule_task'
                ? 'Запланировать'
                : (action.updates?.appendContent || action.appendContent)
                ? 'Дописать'
                : 'Применить';

              return (
                <button
                  disabled={isDisabled}
                  onClick={() => onExecute(finalAction)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold text-xs whitespace-nowrap transition-colors shadow-sm ${
                    isDisabled
                      ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-white/[0.04]'
                      : 'bg-white text-black hover:bg-zinc-200 cursor-pointer'
                  }`}
                >
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  <span>{buttonLabel}</span>
                </button>
              );
            })()}

            <button
              onClick={onReject}
              className="px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 hover:text-zinc-200 text-xs font-medium border border-white/[0.06] transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0"
              title="Отклонить это действие"
            >
              <X className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              <span>Отклонить</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
