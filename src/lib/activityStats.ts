// Turns the vault's own timestamps into a GitHub-style year of activity.
import type { SlagItem } from '../types';
import { getISODateString, getMondayOfWeek } from './time/dateUtils';

/** One cell of the grid. `total` is what the colour is chosen by. */
export interface ActivityDay {
  /** `YYYY-MM-DD`, local. */
  date: string;
  total: number;
  created: number;
  updated: number;
  completed: number;
}

export interface ActivitySummary {
  /** 53 columns of 7 days, Monday first; days after today are `null`. */
  weeks: (ActivityDay | null)[][];
  totalCreated: number;
  totalCompleted: number;
  /** Characters in everything touched this year — a size, not a diff. */
  characters: number;
  /** Consecutive days with any activity, ending today or yesterday. */
  streak: number;
  activeDays: number;
  bestDay: number;
  firstDate: string;
  lastDate: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function dateKey(timestamp: number): string {
  return getISODateString(new Date(timestamp));
}

/** Monday of the week a date belongs to, at local midnight. */
function startOfWeek(timestamp: number): number {
  return getMondayOfWeek(new Date(timestamp)).getTime();
}

function emptyDay(timestamp: number): ActivityDay {
  return { date: dateKey(timestamp), total: 0, created: 0, updated: 0, completed: 0 };
}

/**
 * Everything here is derived from data the vault already has: creation and modification
 * timestamps, and the completion history each task keeps. Nothing new is stored, so the
 * graph is honest about its own precision — see the labels in the UI.
 */
export function summarizeActivity(items: SlagItem[], now = Date.now(), weeks = 53): ActivitySummary {
  const firstWeek = startOfWeek(now) - (weeks - 1) * 7 * DAY_MS;
  const firstDate = dateKey(firstWeek);
  const todayKey = dateKey(now);
  const byDate = new Map<string, ActivityDay>();
  let characters = 0;

  const dayFor = (timestamp: number): ActivityDay | null => {
    const key = dateKey(timestamp);
    // Outside the window (older than a year, or clock skew into the future) is not shown.
    if (key < firstDate || key > todayKey) return null;
    let day = byDate.get(key);
    if (!day) {
      day = emptyDay(timestamp);
      byDate.set(key, day);
    }
    return day;
  };

  for (const item of items) {
    const created = Number.isFinite(item.createdAt) ? item.createdAt : null;
    const updated = Number.isFinite(item.updatedAt) ? item.updatedAt : null;
    if (created !== null) {
      const day = dayFor(created);
      if (day) day.created += 1;
    }
    if (updated !== null && (created === null || dateKey(updated) !== dateKey(created))) {
      const day = dayFor(updated);
      if (day) day.updated += 1;
    }
    if (created !== null || updated !== null) {
      const touched = dayFor(Math.max(created ?? 0, updated ?? 0));
      if (touched) characters += item.content?.length ?? 0;
    }
    // Completions live on the task: `history` keeps past dates, `lastCompletedDate` the newest.
    const completions = new Set<string>();
    for (const entry of item.history ?? []) {
      const day = entry.slice(0, 10);
      if (day) completions.add(day);
    }
    if (item.lastCompletedDate) completions.add(item.lastCompletedDate.slice(0, 10));
    for (const date of completions) {
      if (date < firstDate || date > todayKey) continue;
      let day = byDate.get(date);
      if (!day) {
        day = { date, total: 0, created: 0, updated: 0, completed: 0 };
        byDate.set(date, day);
      }
      day.completed += 1;
    }
  }

  for (const day of byDate.values()) day.total = day.created + day.updated + day.completed;

  // The grid is filled Monday-first, column by column.
  const grid: (ActivityDay | null)[][] = [];
  let totalCreated = 0;
  let totalCompleted = 0;
  let activeDays = 0;
  let bestDay = 0;
  for (let week = 0; week < weeks; week += 1) {
    const column: (ActivityDay | null)[] = [];
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const timestamp = firstWeek + (week * 7 + weekday) * DAY_MS;
      const key = dateKey(timestamp);
      if (key > todayKey) {
        column.push(null);
        continue;
      }
      const day = byDate.get(key) ?? emptyDay(timestamp);
      column.push(day);
    }
    grid.push(column);
  }

  for (const day of byDate.values()) {
    totalCreated += day.created;
    totalCompleted += day.completed;
    if (day.total > 0) activeDays += 1;
    bestDay = Math.max(bestDay, day.total);
  }

  // A streak that would end yesterday is still alive: today may simply not be over yet.
  let streak = 0;
  const start = byDate.get(todayKey)?.total ? 0 : 1;
  for (let back = start; back < 400; back += 1) {
    const day = byDate.get(dateKey(now - back * DAY_MS));
    if (!day || day.total === 0) break;
    streak += 1;
  }

  return {
    weeks: grid,
    totalCreated,
    totalCompleted,
    characters,
    streak,
    activeDays,
    bestDay,
    firstDate,
    lastDate: todayKey,
  };
}
