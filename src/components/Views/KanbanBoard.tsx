// The Kanban board: columns by status, drag between them, and the materials dock.
import React, { useState, useMemo, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import type { SlagItem, TaskStatus } from '../../types';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { useDragToScroll } from '../../hooks/gestures/useDragToScroll';
import { useFlipLayout } from '../../hooks/layout/useFlipLayout';
import { usePointerDnd, type DragItemPayload } from '../../hooks/gestures/usePointerDnd';
import { Icon } from '../UI/icons/Icon';
import { KanbanMaterialsDock } from './kanban/KanbanMaterialsDock';
import { KanbanColumn } from './kanban/KanbanColumn';
import { KANBAN_COLUMNS } from './kanban/kanbanModel';

export const KanbanBoard: React.FC = () => {
  const { items, currentFolder, updateItem, addToast, isMobile } = useApp();

  // Active status dropdown card ID
  const [statusMenuTaskId, setStatusMenuTaskId] = useState<string | null>(null);

  // Quick Action: Convert Note/Article to Task
  const handleConvertToTask = useCallback((material: SlagItem, targetStatus: TaskStatus = 'todo') => {
    updateItem({
      ...material,
      type: 'task',
      status: targetStatus,
    });
    addToast(`«${material.title || 'Заметка'}» преобразована в задачу`, 'success');
  }, [updateItem, addToast]);

  // Pointer Events Drag and Drop hook (desktop & mobile robust)
  const {
    isDragging,
    draggingPayload,
    dragPos,
    activeZoneData,
    handlePointerDown,
  } = usePointerDnd<DragItemPayload>({
    onDrop: (payload, _targetZone, targetData) => {
      const targetStatus = targetData.dropColumn as TaskStatus | undefined;
      if (!targetStatus) return;

      if (payload.type === 'material') {
        const material = items.find(i => i.id === payload.id);
        if (material) {
          handleConvertToTask(material, targetStatus);
        }
      } else {
        const task = items.find(i => i.id === payload.id);
        if (task && task.status !== targetStatus) {
          updateItem({
            ...task,
            status: targetStatus,
          });
          const colName = KANBAN_COLUMNS.find(c => c.id === targetStatus)?.title || targetStatus;
          addToast(`Задача перемещена в «${colName}»`, 'info');
        }
      }
    },
  });

  // Mouse drag-to-scroll for horizontal Kanban board and vertical column scrolling
  const kanbanBoardRef = useDragToScroll<HTMLDivElement>({
    direction: 'both',
    getContainerX: (_target, container) => container,
    getContainerY: (target) => target.closest('.overflow-y-auto') as HTMLElement | null,
    ignoreSelector:
      'button, a, input, textarea, select, [contenteditable="true"], [data-draggable="true"], [data-no-pan], [data-testid="kanban-card"]',
  });

  // Filter items scoped to current folder
  const folderItems = useMemo(() => {
    return items.filter(item => {
      if (currentFolder === DEFAULT_INBOX_FOLDER) return true;
      return item.folder === currentFolder || item.folder.startsWith(currentFolder + '/');
    });
  }, [items, currentFolder]);

  // Cards glide between columns instead of teleporting.
  useFlipLayout(kanbanBoardRef, folderItems.map(item => `${item.id}:${item.status ?? ''}`).join('|'));

  // TRIZ Materials: Notes and Articles in this folder
  const folderMaterials = useMemo(() => {
    return folderItems.filter(item => item.type === 'note' || item.type === 'article');
  }, [folderItems]);

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

  const draggingItemId = isDragging && draggingPayload ? draggingPayload.id : null;

  return (
    <div className="flex-1 flex overflow-hidden bg-canvas text-fg-primary select-none relative">
      {/* ============================================================== */}
      {/* TRIZ Dock on the left: [ 📚 Материалы папки ] (collapsible)   */}
      {/* ============================================================== */}
      <KanbanMaterialsDock
        materials={folderMaterials}
        draggingItemId={draggingItemId}
        onItemPointerDown={handlePointerDown}
      />

      {/* ============================================================== */}
      {/* Linear Kanban Columns Area                                     */}
      {/* ============================================================== */}
      <div
        ref={kanbanBoardRef}
        data-testid="kanban-columns-container"
        className={`flex-1 flex overflow-x-auto gap-3.5 p-3 sm:p-4 bg-canvas min-w-0 h-full cursor-grab pb-20 sm:pb-4 ${
          isMobile ? 'snap-x snap-mandatory scroll-smooth' : ''
        }`}
      >
        {KANBAN_COLUMNS.map(column => (
          <KanbanColumn
            key={column.id}
            column={column}
            tasks={tasksByStatus[column.id] || []}
            isDropTarget={isDragging && activeZoneData?.dropColumn === column.id}
            draggingTaskId={draggingItemId}
            statusMenuTaskId={statusMenuTaskId}
            onStatusMenuChange={setStatusMenuTaskId}
            onItemPointerDown={handlePointerDown}
          />
        ))}
      </div>

      {/* Floating Drag Ghost Overlay */}
      {isDragging && dragPos && draggingPayload && (
        <div
          className="fixed pointer-events-none z-50 px-3 py-1.5 rounded-lg bg-surface-elevated border border-blue-500/40 text-xs font-medium text-white shadow-2xl flex items-center gap-2 transform -translate-x-1/2 -translate-y-1/2 opacity-90 scale-105"
          style={{
            left: `${dragPos.x}px`,
            top: `${dragPos.y}px`,
          }}
        >
          {draggingPayload.type === 'material' ? (
            <Icon name="entity.note" size="sm" tone="accent" className="shrink-0" />
          ) : (
            <Icon name="entity.task" size="sm" tone="accent" className="shrink-0" />
          )}
          <span className="truncate max-w-[180px]">{draggingPayload.title || 'Элемент'}</span>
        </div>
      )}
    </div>
  );
};
