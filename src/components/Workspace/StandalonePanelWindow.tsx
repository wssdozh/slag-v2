import React from 'react';
import { useApp } from '../../context/AppContext';
import { WindowControls } from '../UI/WindowControls';
import { Sidebar } from '../Sidebar/Sidebar';
import { FeedHeader } from '../Feed/FeedHeader';
import { FeedList } from '../Feed/FeedList';
import { Composer } from '../Feed/Composer';
import { AssistantChat } from '../Feed/AssistantChat';
import { KanbanBoard } from '../Views/KanbanBoard';
import { CalendarView } from '../Views/CalendarView';
import { FolderInfoPanel } from '../RightPanel/FolderInfoPanel';
import { LogViewer } from '../Logs/LogViewer';
import { AudioPanel } from '../Audio/AudioPanel';

interface StandalonePanelWindowProps {
  panelId: string;
  title: string;
}

export const StandalonePanelWindow: React.FC<StandalonePanelWindowProps> = ({ panelId, title }) => {
  const { currentFolder, feedViewMode, setFeedViewMode } = useApp();

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#09090b] text-[#f4f4f5] select-none flex flex-col relative z-0 isolate">
      {/* Sleek Dark Header Drag Region with Title and Native Window Controls */}
      <header
        data-tauri-drag-region
        className="h-[34px] bg-[#0c0c0e] border-b border-white/[0.06] flex items-center justify-between px-3 select-none flex-shrink-0 cursor-default"
      >
        <div data-tauri-drag-region className="flex items-center gap-2 pointer-events-none">
          <span className="w-2 h-2 rounded-full bg-blue-500/80" />
          <span className="text-xs font-medium text-zinc-300 tracking-wide">{title}</span>
          {currentFolder && (
            <span className="text-[11px] text-zinc-500 font-mono">({currentFolder})</span>
          )}
        </div>
        <WindowControls />
      </header>

      {/* Main Content Area */}
      <main className="flex-1 min-h-0 relative overflow-hidden bg-[#09090b]">
        {panelId === 'sidebar' && (
          <aside className="w-full h-full bg-[#0c0c0e] overflow-hidden flex flex-col">
            <Sidebar />
          </aside>
        )}

        {panelId === 'feed' && (
          <div className="w-full h-full bg-[#09090b] flex flex-col overflow-hidden min-w-0">
            <FeedHeader viewMode={feedViewMode} onViewModeChange={setFeedViewMode} />
            <div className="flex-1 min-h-0 relative flex flex-col overflow-hidden">
              <FeedList />
              <div className="absolute bottom-0 inset-x-0 pointer-events-none z-20 pb-3 px-3 flex justify-center">
                <div className="pointer-events-auto max-w-2xl w-full">
                  <Composer key={currentFolder} />
                </div>
              </div>
            </div>
          </div>
        )}

        {panelId === 'kanban' && (
          <div className="w-full h-full bg-[#09090b] flex flex-col overflow-hidden min-w-0">
            <FeedHeader viewMode="kanban" onViewModeChange={setFeedViewMode} />
            <KanbanBoard />
          </div>
        )}

        {panelId === 'calendar' && (
          <div className="w-full h-full bg-[#09090b] flex flex-col overflow-hidden min-w-0">
            <FeedHeader viewMode="calendar" onViewModeChange={setFeedViewMode} />
            <CalendarView />
          </div>
        )}

        {panelId === 'assistant' && (
          <div className="w-full h-full bg-[#09090b] flex flex-col overflow-hidden min-w-0">
            <AssistantChat variant="center" />
          </div>
        )}

        {panelId === 'folder-info' && (
          <aside className="w-full h-full bg-[#0c0c0e] flex flex-col overflow-hidden min-w-0">
            <FolderInfoPanel />
          </aside>
        )}

        {panelId === 'logs' && (
          <div className="w-full h-full bg-[#08090a] flex flex-col overflow-hidden min-w-0">
            <LogViewer variant="dock" />
          </div>
        )}

        {panelId === 'audio' && (
          <div className="w-full h-full bg-[#09090b] flex flex-col overflow-hidden min-w-0">
            <AudioPanel />
          </div>
        )}
      </main>
    </div>
  );
};
