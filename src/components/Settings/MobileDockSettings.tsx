// Edits the phone dock: which tabs appear, in what order, dragged into place.
import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import type { MobileTabId } from '../../types';
import {
  Folder,
  CheckSquare,
  Sparkles,
  Settings as SettingsIcon,
  Calendar,
  Music,
  GripVertical,
  Check,
  Plus,
  RotateCcw,
} from 'lucide-react';
import { SettingsGroup } from './SettingsUI';

/**
 * Dock editing, shared by the mobile settings screen through the Interface tab.
 *
 * Rows are hand-rolled instead of `SettingsRow`: a row here owns a drag handle,
 * a native `draggable` payload and a pointer-capture gesture, none of which fit
 * the row component's button/div contract. The metrics are copied from it on
 * purpose so the list still reads as one settings surface.
 */

const ALL_AVAILABLE_TABS: {
  id: MobileTabId;
  label: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  { id: 'folders', label: 'Папки', icon: Folder },
  { id: 'tasks', label: 'Таски', icon: CheckSquare },
  { id: 'assistant', label: 'ИИ', icon: Sparkles },
  { id: 'settings', label: 'Настройки', icon: SettingsIcon },
  { id: 'calendar', label: 'Календарь', icon: Calendar },
  { id: 'audio', label: 'Плеер', icon: Music },
];

const DEFAULT_DOCK_TABS: MobileTabId[] = ['folders', 'tasks', 'assistant', 'settings'];

const MIN_DOCK_TABS = 2;
const MAX_DOCK_TABS = 5;

export const MobileDockSettings: React.FC = () => {
  const { mobileDockTabs, setMobileDockTabs, addToast } = useApp();

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  // Mirrors the order so several pointer moves before a re-render stay correct.
  const tabsRef = useRef<MobileTabId[]>(mobileDockTabs);
  useEffect(() => {
    tabsRef.current = mobileDockTabs;
  }, [mobileDockTabs]);

  const activeTabs = mobileDockTabs
    .map((id) => ALL_AVAILABLE_TABS.find((tab) => tab.id === id))
    .filter((tab): tab is (typeof ALL_AVAILABLE_TABS)[number] => Boolean(tab));
  const inactiveTabs = ALL_AVAILABLE_TABS.filter((tab) => !mobileDockTabs.includes(tab.id));

  const toggleDockTab = (tabId: MobileTabId) => {
    if (mobileDockTabs.includes(tabId)) {
      if (mobileDockTabs.length <= MIN_DOCK_TABS) {
        addToast('Минимум 2 вкладки в панели', 'error');
        return;
      }
      setMobileDockTabs(mobileDockTabs.filter((id) => id !== tabId));
      return;
    }
    if (mobileDockTabs.length >= MAX_DOCK_TABS) {
      addToast('Максимум 5 вкладок в панели', 'error');
      return;
    }
    setMobileDockTabs([...mobileDockTabs, tabId]);
  };

  const moveTab = (targetIndex: number) => {
    const from = dragIndexRef.current;
    if (from === null || from === targetIndex) return;
    const next = [...tabsRef.current];
    if (from < 0 || from >= next.length || targetIndex < 0 || targetIndex >= next.length) return;
    const [moved] = next.splice(from, 1);
    next.splice(targetIndex, 0, moved);
    dragIndexRef.current = targetIndex;
    tabsRef.current = next;
    setDraggedIndex(targetIndex);
    setMobileDockTabs(next);
  };

  const handleDragStart = (event: React.DragEvent, index: number) => {
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    dragIndexRef.current = index;
    setDraggedIndex(index);
  };

  const handleDragOver = (event: React.DragEvent, index: number) => {
    event.preventDefault();
    moveTab(index);
  };

  const handleDragEnd = () => {
    dragIndexRef.current = null;
    setDraggedIndex(null);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>, index: number) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragIndexRef.current = index;
    setDraggedIndex(index);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (dragIndexRef.current === null) return;
    const dropTarget = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-dock-tab-index]');
    if (!dropTarget) return;
    const overIndex = Number(dropTarget.dataset.dockTabIndex);
    if (Number.isNaN(overIndex)) return;
    moveTab(overIndex);
  };

  const endPointerDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragIndexRef.current = null;
    setDraggedIndex(null);
  };

  return (
    <SettingsGroup
      title="Нижняя панель (Dock)"
      action={
        <button
          type="button"
          onClick={() => setMobileDockTabs(DEFAULT_DOCK_TABS)}
          className="flex items-center gap-1 text-[11px] font-mono text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3 h-3" />
          Сбросить
        </button>
      }
    >
      <div className="divide-y divide-border-subtle">
        {activeTabs.map((tab, index) => {
          const Icon = tab.icon;
          const isDragging = draggedIndex === index;

          return (
            <div
              key={tab.id}
              data-dock-tab-index={index}
              draggable
              onDragStart={(event) => handleDragStart(event, index)}
              onDragOver={(event) => handleDragOver(event, index)}
              onDragEnd={handleDragEnd}
              className={`w-full flex items-center gap-3 p-3.5 transition-colors select-none ${
                isDragging ? 'bg-surface-active opacity-60' : 'hover:bg-surface-hover'
              }`}
            >
              <span
                role="button"
                tabIndex={-1}
                aria-label={`Перетащить ${tab.label}`}
                style={{ touchAction: 'none' }}
                onPointerDown={(event) => handlePointerDown(event, index)}
                onPointerMove={handlePointerMove}
                onPointerUp={endPointerDrag}
                onPointerCancel={endPointerDrag}
                className="text-zinc-600 hover:text-zinc-400 cursor-grab active:cursor-grabbing shrink-0"
              >
                <GripVertical className="w-4 h-4" />
              </span>
              <span className="w-5 h-5 shrink-0 flex items-center justify-center text-zinc-400">
                <Icon className="w-4 h-4" />
              </span>
              <span className="flex-1 min-w-0 text-sm font-medium text-zinc-200 truncate">
                {tab.label}
              </span>
              <button
                type="button"
                onClick={() => toggleDockTab(tab.id)}
                className="w-7 h-7 shrink-0 flex items-center justify-center rounded-md text-zinc-200 hover:bg-white/[0.06] transition-colors cursor-pointer"
                title="Отключить"
                aria-label={`Отключить ${tab.label}`}
              >
                <Check className="w-4 h-4" />
              </button>
            </div>
          );
        })}

        {inactiveTabs.map((tab) => {
          const Icon = tab.icon;

          return (
            <div
              key={tab.id}
              role="button"
              tabIndex={0}
              onClick={() => toggleDockTab(tab.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  toggleDockTab(tab.id);
                }
              }}
              aria-label={`Добавить ${tab.label}`}
              className="w-full flex items-center gap-3 p-3.5 opacity-50 hover:opacity-90 hover:bg-surface-hover transition-colors cursor-pointer select-none"
            >
              <span className="w-4 shrink-0" />
              <span className="w-5 h-5 shrink-0 flex items-center justify-center text-zinc-400">
                <Icon className="w-4 h-4" />
              </span>
              <span className="flex-1 min-w-0 text-sm font-medium text-zinc-500 truncate">
                {tab.label}
              </span>
              <span className="w-7 h-7 shrink-0 flex items-center justify-center text-zinc-500">
                <Plus className="w-4 h-4" />
              </span>
            </div>
          );
        })}
      </div>
    </SettingsGroup>
  );
};
