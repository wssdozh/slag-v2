// Day-calendar geometry: which column a timed task takes and how tall its block is.
import type { SlagItem } from '../../types';
import { getTaskTimeSlot, type TaskTimeSlot } from './todoistTaskParser';

export interface LayoutPositionedTask {
  task: SlagItem & { isVirtual?: boolean };
  slot: TaskTimeSlot;
  startMinutes: number;
  endMinutes: number;
  topPx: number;
  heightPx: number;
  colIndex: number;
  totalCols: number;
}

export interface TimedBlockBox {
  left: number;
  width: number;
}

/**
 * Геометрия блока по времени в процентах: колонки анти-наложения ужимаются внутри
 * дня, одиночная таска занимает всю ширину. `colIndex`/`totalCols` приходят из
 * `computeAntiOverlapLayout`.
 */
export function timedBlockBox(colIndex: number, totalCols: number): TimedBlockBox {
  const colWidth = 94 / totalCols;
  return {
    left: 3 + colIndex * colWidth,
    width: totalCols > 1 ? colWidth - 1 : 94,
  };
}

/**
 * Calculates anti-overlap column positions for timed calendar tasks so simultaneous
 * tasks cleanly split column width instead of occluding each other.
 */
export function computeAntiOverlapLayout(
  tasks: (SlagItem & { isVirtual?: boolean })[],
  hourHeight = 52,
  resizingTaskId: string | null = null,
  resizingDuration: number | null = null
): LayoutPositionedTask[] {
  if (tasks.length === 0) return [];

  // 1. Calculate slot & interval for each task
  const layoutItems = tasks.map(task => {
    const rawSlot = getTaskTimeSlot(task);
    const isBeingResized = resizingTaskId && (task.id === resizingTaskId || task.id.startsWith(resizingTaskId + '_virtual_'));
    const durationMinutes = isBeingResized && resizingDuration ? resizingDuration : rawSlot.durationMinutes;

    // Dynamically recompute end time and timeLabel so the card displays the updated time during resize
    const endTotal = rawSlot.startHour * 60 + rawSlot.startMinute + durationMinutes;
    const endH = Math.floor(endTotal / 60) % 24;
    const endM = endTotal % 60;
    const timeLabel = `${String(rawSlot.startHour).padStart(2, '0')}:${String(rawSlot.startMinute).padStart(2, '0')} - ${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

    const slot: TaskTimeSlot = {
      ...rawSlot,
      durationMinutes,
      timeLabel,
    };

    const startMinutes = slot.startHour * 60 + slot.startMinute;
    const endMinutes = startMinutes + slot.durationMinutes;
    const startH = Math.max(0, Math.min(23, slot.startHour));
    const topPx = startH * hourHeight + (slot.startMinute / 60) * hourHeight;
    const gridHeightPx = (slot.durationMinutes / 60) * hourHeight;
    const heightPx = Math.max(20, Math.round(gridHeightPx));

    return {
      task,
      slot,
      startMinutes,
      endMinutes,
      topPx,
      heightPx,
      colIndex: 0,
      totalCols: 1,
    };
  });

  // 2. Sort by startMinutes ASC, then durationMinutes DESC
  layoutItems.sort((a, b) => a.startMinutes - b.startMinutes || (b.endMinutes - b.startMinutes) - (a.endMinutes - a.startMinutes));

  // 3. Cluster overlapping tasks
  const clusters: typeof layoutItems[] = [];
  let currentCluster: typeof layoutItems = [];
  let clusterEnd = -1;

  for (const item of layoutItems) {
    if (currentCluster.length === 0) {
      currentCluster.push(item);
      clusterEnd = item.endMinutes;
    } else if (item.startMinutes < clusterEnd) {
      currentCluster.push(item);
      clusterEnd = Math.max(clusterEnd, item.endMinutes);
    } else {
      clusters.push(currentCluster);
      currentCluster = [item];
      clusterEnd = item.endMinutes;
    }
  }
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  // 4. Assign columns within each cluster
  const result: LayoutPositionedTask[] = [];

  for (const cluster of clusters) {
    const columns: number[] = [];

    for (const item of cluster) {
      let placedCol = -1;
      for (let c = 0; c < columns.length; c++) {
        if (columns[c] <= item.startMinutes) {
          placedCol = c;
          columns[c] = item.endMinutes;
          break;
        }
      }
      if (placedCol === -1) {
        placedCol = columns.length;
        columns.push(item.endMinutes);
      }
      item.colIndex = placedCol;
    }

    const totalCols = Math.max(1, columns.length);
    for (const item of cluster) {
      item.totalCols = totalCols;
      result.push(item);
    }
  }

  return result;
}
