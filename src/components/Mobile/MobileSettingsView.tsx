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
  Check
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
    setIsSettingsOpen,
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
      <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-6 pb-36">
        {/* Profile / Vault Card */}
        <div className="flex flex-col items-center text-center p-4 rounded-2xl bg-[#141417]/80 border border-white/[0.06] shadow-sm">
          <div className="w-16 h-16 rounded-full bg-white/[0.06] border border-white/[0.1] flex items-center justify-center text-white text-xl font-bold font-mono mb-2 shadow-inner">
            {vault.name ? vault.name.slice(0, 2).toUpperCase() : 'SL'}
          </div>
          <h2 className="text-base font-bold text-white tracking-tight">{vault.name || 'SLAG Vault'}</h2>
          <p className="text-xs text-zinc-500 font-mono mt-0.5">
            {folders.length} {folders.length === 1 ? 'папка' : folders.length < 5 ? 'папки' : 'папок'} • {items.length} {items.length === 1 ? 'запись' : items.length < 5 ? 'записи' : 'записей'}
          </p>
          <div className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06] text-[10px] font-mono text-zinc-400">
            <Shield className="w-3 h-3 text-emerald-400" />
            <span>Local-First Obsidian Vault</span>
          </div>
        </div>

        {/* Group 1: AI & Storage */}
        <div className="flex flex-col gap-1.5">
          <div className="px-1 text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
            Система & Данные
          </div>
          <div className="rounded-2xl bg-[#141417]/70 border border-white/[0.05] overflow-hidden divide-y divide-white/[0.04]">
            <button
              onClick={() => setIsSettingsOpen(true)}
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
              onClick={() => setIsSettingsOpen(true)}
              className="w-full flex items-center justify-between p-3.5 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-zinc-200">Хранилище (Vault)</div>
                  <div className="text-[11px] text-zinc-500">Экспорт Markdown в ZIP, бэкап данных</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
            </button>
          </div>
        </div>

        {/* Group 2: Dock Customization (Requested by user) */}
        <div className="flex flex-col gap-1.5">
          <div className="px-1 text-[11px] font-mono text-zinc-500 uppercase tracking-wider flex items-center justify-between">
            <span>Нижняя панель (Dock)</span>
            <button
              onClick={() => setMobileDockTabs(['folders', 'tasks', 'assistant', 'settings'])}
              className="text-zinc-500 hover:text-white flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Сбросить</span>
            </button>
          </div>
          <div className="rounded-2xl bg-[#141417]/70 border border-white/[0.05] p-3.5 flex flex-col gap-2.5">
            <p className="text-xs text-zinc-400">
              Выберите кнопки для плавающего острова навигации:
            </p>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {ALL_AVAILABLE_TABS.map(tab => {
                const Icon = tab.icon;
                const isSelected = mobileDockTabs.includes(tab.id);

                return (
                  <button
                    key={tab.id}
                    onClick={() => toggleDockTab(tab.id)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-white/10 border-white/[0.12] text-white'
                        : 'bg-black/20 border-white/[0.04] text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4" />
                      <span className="text-xs font-medium">{tab.label}</span>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-blue-400" />}
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
