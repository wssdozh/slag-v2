import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import type { MobileTabId } from '../../types';
import {
  Sparkles,
  Database,
  Terminal,
  ChevronRight,
  ChevronLeft,
  Shield,
  Folder,
  CheckSquare,
  Calendar,
  Music,
  Settings as SettingsIcon,
  RotateCcw,
  Check,
  Sliders,
  Keyboard
} from 'lucide-react';
import { MobileScreenHeader } from './MobileScreenHeader';

const ALL_AVAILABLE_TABS: { id: MobileTabId; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'folders', label: 'Папки', icon: Folder },
  { id: 'tasks', label: 'Таски', icon: CheckSquare },
  { id: 'assistant', label: 'ИИ', icon: Sparkles },
  { id: 'settings', label: 'Настройки', icon: SettingsIcon },
  { id: 'calendar', label: 'Календарь', icon: Calendar },
  { id: 'audio', label: 'Плеер', icon: Music },
];

export const MobileSettingsView: React.FC = () => {
  const {
    vault,
    items,
    folders,
    openSettingsModal,
    setIsLogViewerOpen,
    mobileDockTabs,
    setMobileDockTabs,
    addToast
  } = useApp();

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const moveTab = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= mobileDockTabs.length) return;
    const nextTabs = [...mobileDockTabs];
    const [moved] = nextTabs.splice(index, 1);
    nextTabs.splice(targetIndex, 0, moved);
    setMobileDockTabs(nextTabs);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    const nextTabs = [...mobileDockTabs];
    const [removed] = nextTabs.splice(draggedIndex, 1);
    nextTabs.splice(index, 0, removed);
    setDraggedIndex(index);
    setMobileDockTabs(nextTabs);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const toggleDockTab = (tabId: MobileTabId) => {
    if (mobileDockTabs.includes(tabId)) {
      if (mobileDockTabs.length <= 2) {
        addToast('Минимум 2 вкладки в панели', 'error');
        return;
      }
      setMobileDockTabs(mobileDockTabs.filter(id => id !== tabId));
    } else {
      if (mobileDockTabs.length >= 5) {
        addToast('Максимум 5 вкладок в панели', 'error');
        return;
      }
      setMobileDockTabs([...mobileDockTabs, tabId]);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#09090b] text-[#f4f4f5] overflow-hidden select-none">
      {/* Top Header */}
      <MobileScreenHeader
        title="Настройки"
        icon={<SettingsIcon className="w-3.5 h-3.5" />}
      />

      {/* Main Settings List (Matching iOS/Telegram grouped style) */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4 pb-36">
        {/* Profile / Vault Card (Horizontal, Compact) */}
        <div className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-[#141417]/80 border border-white/[0.06] shadow-sm">
          <div className="w-12 h-12 rounded-full bg-white/[0.06] border border-white/[0.1] flex items-center justify-center text-white text-base font-bold font-mono shrink-0 shadow-inner">
            {vault.name ? vault.name.slice(0, 2).toUpperCase() : 'SL'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white tracking-tight truncate">{vault.name || 'SLAG Vault'}</h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.06] text-zinc-400 border border-white/[0.06] text-[10px] font-mono shrink-0">
                <Shield className="w-2.5 h-2.5" />
                <span>Local-First Obsidian Vault</span>
              </span>
            </div>
            <p className="text-xs text-zinc-500 font-mono mt-0.5 truncate">
              {folders.length} {folders.length === 1 ? 'папка' : folders.length < 5 ? 'папки' : 'папок'} • {items.length} {items.length === 1 ? 'запись' : items.length < 5 ? 'записи' : 'записей'}
            </p>
          </div>
        </div>

        {/* Group 1: Quick Settings Navigation (Opens specific tab in SettingsModal) */}
        <div className="flex flex-col gap-1.5">
          <div className="px-1 text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
            Параметры
          </div>
          <div className="rounded-2xl bg-[#141417]/70 border border-white/[0.05] overflow-hidden divide-y divide-white/[0.04]">
            <button
              onClick={() => openSettingsModal('ai')}
              className="w-full flex items-center justify-between p-3.5 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 flex items-center justify-center shrink-0 text-zinc-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="text-xs font-semibold text-zinc-200">ИИ & Провайдеры</div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
            </button>

            <button
              onClick={() => openSettingsModal('vault')}
              className="w-full flex items-center justify-between p-3.5 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 flex items-center justify-center shrink-0 text-zinc-400">
                  <Database className="w-5 h-5" />
                </div>
                <div className="text-xs font-semibold text-zinc-200">Хранилище & Бэкап</div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
            </button>

            <button
              onClick={() => openSettingsModal('ui')}
              className="w-full flex items-center justify-between p-3.5 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 flex items-center justify-center shrink-0 text-zinc-400">
                  <Sliders className="w-5 h-5" />
                </div>
                <div className="text-xs font-semibold text-zinc-200">Интерфейс, масштаб и плотность</div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
            </button>

            <button
              onClick={() => openSettingsModal('shortcuts')}
              className="w-full flex items-center justify-between p-3.5 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 flex items-center justify-center shrink-0 text-zinc-400">
                  <Keyboard className="w-5 h-5" />
                </div>
                <div className="text-xs font-semibold text-zinc-200">Горячие клавиши</div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
            </button>
          </div>
        </div>

        {/* Group 2: Dock Customization & Ordering */}
        <div className="flex flex-col gap-1.5">
          <div className="px-1 text-[11px] font-mono text-zinc-500 uppercase tracking-wider flex items-center justify-between">
            <span>Нижняя панель (Dock)</span>
            <button
              onClick={() => setMobileDockTabs(['folders', 'tasks', 'assistant', 'settings'])}
              className="text-zinc-500 hover:text-white flex items-center gap-1 cursor-pointer text-[10px]"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Сбросить</span>
            </button>
          </div>
          <div className="rounded-2xl bg-[#141417]/70 border border-white/[0.05] p-3 flex flex-col gap-3">
            {/* Section A: Selection Pills */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Включенные кнопки:</span>
                <span className="text-[10px] font-mono text-zinc-500">выбрано {mobileDockTabs.length}/5</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 py-0.5">
                {ALL_AVAILABLE_TABS.map(tab => {
                  const Icon = tab.icon;
                  const isSelected = mobileDockTabs.includes(tab.id);

                  return (
                    <button
                      key={tab.id}
                      onClick={() => toggleDockTab(tab.id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer whitespace-nowrap active:scale-95 ${
                        isSelected
                          ? 'bg-white/10 border-white/[0.15] text-white shadow-sm'
                          : 'bg-black/30 border-white/[0.04] text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="text-xs font-medium">{tab.label}</span>
                      {isSelected ? (
                        <Check className="w-3 h-3 text-zinc-200 shrink-0 ml-0.5" />
                      ) : (
                        <span className="text-[10px] text-zinc-600 font-mono ml-0.5">+</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section B: Order Reorder Strip */}
            <div className="pt-2.5 border-t border-white/[0.04] flex flex-col gap-1.5">
              <div className="text-[11px] text-zinc-400 font-medium">
                Порядок кнопок (стрелки или перетаскивание):
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {mobileDockTabs.map((tabId, idx) => {
                  const tab = ALL_AVAILABLE_TABS.find(t => t.id === tabId);
                  if (!tab) return null;
                  const Icon = tab.icon;
                  const isFirst = idx === 0;
                  const isLast = idx === mobileDockTabs.length - 1;

                  return (
                    <div
                      key={tabId}
                      draggable
                      onDragStart={() => handleDragStart(idx)}
                      onDragOver={(e) => handleDragOver(e, idx)}
                      onDragEnd={handleDragEnd}
                      className={`flex items-center gap-1 pl-1 pr-1 py-1 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white transition-all select-none ${
                        draggedIndex === idx ? 'opacity-40 scale-95 border-dashed border-blue-400' : ''
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => moveTab(idx, -1)}
                        disabled={isFirst}
                        className="w-5 h-5 rounded hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white disabled:opacity-20 disabled:pointer-events-none transition-colors cursor-pointer"
                        title="Сдвинуть влево"
                        aria-label={`Сдвинуть ${tab.label} влево`}
                      >
                        <ChevronLeft className="w-3 h-3" />
                      </button>

                      <div className="flex items-center gap-1 px-1">
                        <Icon className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
                        <span className="text-xs font-medium text-zinc-200">{tab.label}</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => moveTab(idx, 1)}
                        disabled={isLast}
                        className="w-5 h-5 rounded hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white disabled:opacity-20 disabled:pointer-events-none transition-colors cursor-pointer"
                        title="Сдвинуть вправо"
                        aria-label={`Сдвинуть ${tab.label} вправо`}
                      >
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Group 3: Diagnostics & HUD */}
        <div className="flex flex-col gap-1.5">
          <div className="px-1 text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
            Отладка & Диагностика
          </div>
          <div className="rounded-2xl bg-[#141417]/70 border border-white/[0.05] overflow-hidden divide-y divide-white/[0.04]">
            <button
              onClick={() => setIsLogViewerOpen(true)}
              className="w-full flex items-center justify-between p-3.5 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 flex items-center justify-center shrink-0 text-zinc-400">
                  <Terminal className="w-5 h-5" />
                </div>
                <div className="text-xs font-semibold text-zinc-200">Логи & Dev HUD</div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
            </button>
          </div>
        </div>

        {/* Version info footer */}
        <div className="text-center text-xs text-zinc-600 font-mono py-2">
          SLAG v2.0 • Local-First Minimal Notes
        </div>
      </div>
    </div>
  );
};
