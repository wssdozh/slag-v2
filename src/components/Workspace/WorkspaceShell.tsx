import React, { useRef, useState, useCallback } from 'react';
import {
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
  type DockviewApi,
} from 'dockview-react';
import { Sidebar } from '../Sidebar/Sidebar';
import { FeedHeader } from '../Feed/FeedHeader';
import { FeedList } from '../Feed/FeedList';
import { Composer } from '../Feed/Composer';
import { AssistantChat } from '../Feed/AssistantChat';
import { KanbanBoard } from '../Views/KanbanBoard';
import { CalendarView } from '../Views/CalendarView';
import { FolderInfoPanel } from '../RightPanel/FolderInfoPanel';
import {
  LayoutGrid,
  Columns,
  RotateCcw,
  Sparkles,
  Maximize2,
  Monitor,
  ExternalLink
} from 'lucide-react';

export type WorkspacePreset = 'default' | 'ai_lab' | 'deep_focus' | 'dual_screen';

const WORKSPACE_LAYOUT_KEY = 'slag_workspace_layout_v1';
const WORKSPACE_PRESET_KEY = 'slag_workspace_preset_v1';

interface WorkspaceShellProps {
  onToggleLayout?: () => void;
  layoutMode?: 'dockview' | 'classic';
}

export const WorkspaceShell: React.FC<WorkspaceShellProps> = ({
  onToggleLayout,
  layoutMode = 'dockview',
}) => {
  const apiRef = useRef<DockviewApi | null>(null);
  const [activePreset, setActivePreset] = useState<WorkspacePreset>(() => {
    try {
      const saved = localStorage.getItem(WORKSPACE_PRESET_KEY);
      if (saved === 'default' || saved === 'ai_lab' || saved === 'deep_focus' || saved === 'dual_screen') {
        return saved;
      }
    } catch {
      // Ignore
    }
    return 'default';
  });

  // Reusable panel components for Dockview
  const components: Record<string, React.FC<IDockviewPanelProps>> = {
    sidebar: () => (
      <div className="w-full h-full bg-[#0c0c0e] overflow-hidden flex flex-col">
        <Sidebar />
      </div>
    ),
    feed: () => (
      <div className="w-full h-full bg-[#09090b] flex flex-col overflow-hidden min-w-0">
        <FeedHeader onToggleLayout={onToggleLayout} layoutMode={layoutMode} />
        <FeedList />
        <Composer />
      </div>
    ),
    kanban: () => (
      <div className="w-full h-full bg-[#09090b] flex flex-col overflow-hidden min-w-0">
        <FeedHeader onToggleLayout={onToggleLayout} layoutMode={layoutMode} />
        <KanbanBoard />
      </div>
    ),
    calendar: () => (
      <div className="w-full h-full bg-[#09090b] flex flex-col overflow-hidden min-w-0">
        <FeedHeader onToggleLayout={onToggleLayout} layoutMode={layoutMode} />
        <CalendarView />
      </div>
    ),
    assistant: () => (
      <div className="w-full h-full bg-[#09090b] flex flex-col overflow-hidden min-w-0">
        <AssistantChat variant="center" />
      </div>
    ),
    'folder-info': () => (
      <div className="w-full h-full bg-[#0c0c0e] flex flex-col overflow-hidden min-w-0">
        <FolderInfoPanel />
      </div>
    ),
  };

  const applyPresetLayout = useCallback((preset: WorkspacePreset, api: DockviewApi) => {
    api.clear();

    if (preset === 'default') {
      // Canonical Triptych: Left Sidebar, Center Feed/Kanban/Calendar, Right Assistant/Info
      api.addPanel({
        id: 'panel_sidebar',
        component: 'sidebar',
        title: 'Навигация',
        position: { direction: 'left' },
      });

      api.addPanel({
        id: 'panel_feed',
        component: 'feed',
        title: 'Лента',
        position: { direction: 'right' },
      });

      api.addPanel({
        id: 'panel_kanban',
        component: 'kanban',
        title: 'Канбан',
      });

      api.addPanel({
        id: 'panel_calendar',
        component: 'calendar',
        title: 'Календарь',
      });

      api.addPanel({
        id: 'panel_assistant',
        component: 'assistant',
        title: 'Ассистент',
        position: { direction: 'right' },
      });

      api.addPanel({
        id: 'panel_info',
        component: 'folder-info',
        title: 'Инфо',
      });
    } else if (preset === 'ai_lab') {
      // AI Focus: Compact Sidebar Left, Wide Center Assistant, Feed Right
      api.addPanel({
        id: 'panel_sidebar',
        component: 'sidebar',
        title: 'Навигация',
        position: { direction: 'left' },
      });

      api.addPanel({
        id: 'panel_assistant',
        component: 'assistant',
        title: 'ИИ-Лаборатория (Чат & RAG)',
        position: { direction: 'right' },
      });

      api.addPanel({
        id: 'panel_feed',
        component: 'feed',
        title: 'Лента заметок',
        position: { direction: 'right' },
      });
    } else if (preset === 'deep_focus') {
      // Pure Writing Focus: Fullscreen center feed / kanban, 0 sidebars
      api.addPanel({
        id: 'panel_feed',
        component: 'feed',
        title: 'Фокус: Лента',
        position: { direction: 'left' },
      });

      api.addPanel({
        id: 'panel_kanban',
        component: 'kanban',
        title: 'Канбан',
      });

      api.addPanel({
        id: 'panel_calendar',
        component: 'calendar',
        title: 'Календарь',
      });
    } else if (preset === 'dual_screen') {
      // Dual Screen: Sidebar + Kanban on main, Assistant ready to popout
      api.addPanel({
        id: 'panel_sidebar',
        component: 'sidebar',
        title: 'Навигация',
        position: { direction: 'left' },
      });

      api.addPanel({
        id: 'panel_kanban',
        component: 'kanban',
        title: 'Канбан',
        position: { direction: 'right' },
      });

      api.addPanel({
        id: 'panel_feed',
        component: 'feed',
        title: 'Лента',
      });

      api.addPanel({
        id: 'panel_assistant',
        component: 'assistant',
        title: 'Ассистент (Popout)',
        position: { direction: 'right' },
      });
    }
  }, []);

  const handleSelectPreset = (preset: WorkspacePreset) => {
    setActivePreset(preset);
    try {
      localStorage.setItem(WORKSPACE_PRESET_KEY, preset);
      localStorage.removeItem(WORKSPACE_LAYOUT_KEY);
    } catch {
      // Ignore
    }
    if (apiRef.current) {
      applyPresetLayout(preset, apiRef.current);
    }
  };

  const handleResetLayout = () => {
    try {
      localStorage.removeItem(WORKSPACE_LAYOUT_KEY);
    } catch {
      // Ignore
    }
    if (apiRef.current) {
      applyPresetLayout(activePreset, apiRef.current);
    }
  };

  const handlePopoutActive = () => {
    if (!apiRef.current) return;
    const activeGroup = apiRef.current.activeGroup;
    if (activeGroup) {
      try {
        apiRef.current.addPopoutGroup(activeGroup);
      } catch {
        // Fallback to native window.open
        window.open('/popout.html', '_blank', 'width=800,height=600');
      }
    } else {
      window.open('/popout.html', '_blank', 'width=800,height=600');
    }
  };

  const onReady = (event: DockviewReadyEvent) => {
    apiRef.current = event.api;

    // Save layout on changes
    event.api.onDidLayoutChange(() => {
      try {
        const json = event.api.toJSON();
        localStorage.setItem(WORKSPACE_LAYOUT_KEY, JSON.stringify(json));
      } catch {
        // Ignore
      }
    });

    // Try restoring saved layout
    let restored = false;
    try {
      const savedLayout = localStorage.getItem(WORKSPACE_LAYOUT_KEY);
      if (savedLayout) {
        event.api.fromJSON(JSON.parse(savedLayout));
        restored = true;
      }
    } catch {
      restored = false;
    }

    if (!restored) {
      applyPresetLayout(activePreset, event.api);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen w-screen overflow-hidden bg-[#09090b] text-[#f4f4f5] select-none">
      {/* Top Controls Bar: Presets & Layout Mode */}
      <div className="h-8 px-3 border-b border-white/[0.06] bg-[#0c0c0e] flex items-center justify-between gap-2 text-[11px] shrink-0 select-none">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="flex items-center gap-1 text-zinc-400 font-medium">
            <LayoutGrid className="w-3 h-3 text-zinc-400" />
            <span className="hidden sm:inline">Сетка:</span>
          </span>

          {/* Presets buttons */}
          <div className="flex items-center p-0.5 rounded-md bg-white/[0.03] border border-white/[0.04]">
            <button
              onClick={() => handleSelectPreset('default')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors ${
                activePreset === 'default'
                  ? 'bg-white/10 text-white font-medium shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Стандартный трехколоночный пресет"
            >
              <Columns className="w-2.5 h-2.5" />
              <span>Стандарт</span>
            </button>
            <button
              onClick={() => handleSelectPreset('ai_lab')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors ${
                activePreset === 'ai_lab'
                  ? 'bg-white/10 text-white font-medium shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Фокус на ИИ: Ассистент в центре"
            >
              <Sparkles className="w-2.5 h-2.5 text-amber-300" />
              <span>AI Lab</span>
            </button>
            <button
              onClick={() => handleSelectPreset('deep_focus')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors ${
                activePreset === 'deep_focus'
                  ? 'bg-white/10 text-white font-medium shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Глубокий фокус: только контент"
            >
              <Maximize2 className="w-2.5 h-2.5" />
              <span>Фокус</span>
            </button>
            <button
              onClick={() => handleSelectPreset('dual_screen')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors ${
                activePreset === 'dual_screen'
                  ? 'bg-white/10 text-white font-medium shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Двухэкранный сетап с выносом в окно"
            >
              <Monitor className="w-2.5 h-2.5" />
              <span>2 Экрана</span>
            </button>
          </div>
        </div>

        {/* Right Actions: Popout, Reset, Layout Engine Toggle */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handlePopoutActive}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-white/[0.03] hover:bg-white/[0.08] text-zinc-400 hover:text-zinc-200 text-[10px] font-medium transition-colors"
            title="Открепить активную панель в отдельное окно ОС"
          >
            <ExternalLink className="w-2.5 h-2.5" />
            <span className="hidden md:inline">Popout</span>
          </button>

          <button
            onClick={handleResetLayout}
            className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors"
            title="Сбросить расположение панелей к выбранному пресету"
          >
            <RotateCcw className="w-3 h-3" />
          </button>

          {onToggleLayout && (
            <button
              onClick={onToggleLayout}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/20 text-[10px] font-medium transition-colors cursor-pointer"
              title="Переключиться в классический трехколоночный вид"
            >
              <span>📑 Классика</span>
            </button>
          )}
        </div>
      </div>

      {/* Dockview Container */}
      <div className="flex-1 w-full h-full relative overflow-hidden">
        <DockviewReact
          components={components}
          onReady={onReady}
          className="dockview-theme-slag w-full h-full"
          popoutUrl="/popout.html"
        />
      </div>
    </div>
  );
};
