import React from 'react';
import { useApp } from '../../context/AppContext';
import type { MobileTabId } from '../../types';
import {
  Sparkles,
  Database,
  Terminal,
  ChevronRight,
  Shield,
  Folder,
  CheckSquare,
  Calendar,
  Settings as SettingsIcon,
  RotateCcw,
  Check,
  Sliders,
  Keyboard
} from 'lucide-react';

const ALL_AVAILABLE_TABS: { id: MobileTabId; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'folders', label: 'Папки', icon: Folder },
  { id: 'tasks', label: 'Таски', icon: CheckSquare },
  { id: 'assistant', label: 'ИИ', icon: Sparkles },
  { id: 'settings', label: 'Настройки', icon: SettingsIcon },
  { id: 'calendar', label: 'Календарь', icon: Calendar },
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
      <header
        className="h-14 border-b border-white/[0.06] bg-[#0c0c0e]/95 backdrop-blur-md px-4 flex items-center justify-between shrink-0"
        style={{ paddingTop: 'max(var(--sat), 0px)' }}
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center text-white">
            <SettingsIcon className="w-3.5 h-3.5" />
          </div>
          <h1 className="text-base font-bold text-white tracking-tight">Настройки</h1>
        </div>
      </header>

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
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-mono shrink-0">
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
                <div className="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-zinc-200">ИИ & Провайдеры</div>
                  <div className="text-[11px] text-zinc-500">Groq, Gemini Flash, Kie, тегирование</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
            </button>

            <button
              onClick={() => openSettingsModal('vault')}
              className="w-full flex items-center justify-between p-3.5 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-zinc-200">Хранилище & Бэкап</div>
                  <div className="text-[11px] text-zinc-500">Экспорт Markdown в ZIP, бэкап данных</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
            </button>

            <button
              onClick={() => openSettingsModal('ui')}
              className="w-full flex items-center justify-between p-3.5 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/15 text-indigo-400 flex items-center justify-center shrink-0">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-zinc-200">Интерфейс, масштаб и плотность</div>
                  <div className="text-2xs text-zinc-500">Масштаб шрифтов, сетка, плотность</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
            </button>

            <button
              onClick={() => openSettingsModal('shortcuts')}
              className="w-full flex items-center justify-between p-3.5 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                  <Keyboard className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-zinc-200">Горячие клавиши</div>
                  <div className="text-[11px] text-zinc-500">Шорткаты ⌘K, Escape, Enter</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
            </button>
          </div>
        </div>

        {/* Group 2: Dock Customization (Single-Row Horizontal Scrollable Strip) */}
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
          <div className="rounded-2xl bg-[#141417]/70 border border-white/[0.05] p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Кнопки в плавающем острове:</span>
              <span className="text-[10px] font-mono text-zinc-500">выбрано {mobileDockTabs.length}/5</span>
            </div>
            {/* 1-Row Horizontally Scrollable Pills */}
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-0.5">
              {ALL_AVAILABLE_TABS.map(tab => {
                const Icon = tab.icon;
                const isSelected = mobileDockTabs.includes(tab.id);

                return (
                  <button
                    key={tab.id}
                    onClick={() => toggleDockTab(tab.id)}
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border transition-all cursor-pointer whitespace-nowrap active:scale-95 ${
                      isSelected
                        ? 'bg-white/10 border-white/[0.15] text-white shadow-sm'
                        : 'bg-black/30 border-white/[0.04] text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="text-xs font-medium">{tab.label}</span>
                    {isSelected ? (
                      <Check className="w-3.5 h-3.5 text-blue-400 shrink-0 ml-0.5" />
                    ) : (
                      <span className="text-[10px] text-zinc-600 font-mono ml-0.5">+</span>
                    )}
                  </button>
                );
              })}
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
                <div className="w-8 h-8 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center shrink-0">
                  <Terminal className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-zinc-200">Логи & Dev HUD</div>
                  <div className="text-[11px] text-zinc-500">Журнал операций, FS, AI, ошибки</div>
                </div>
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
