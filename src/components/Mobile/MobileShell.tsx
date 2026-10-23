import React from 'react';
import { useApp } from '../../context/AppContext';
import { MobileFoldersView } from './MobileFoldersView';
import { MobileTasksView } from './MobileTasksView';
import { MobileAssistantView } from './MobileAssistantView';
import { MobileSettingsView } from './MobileSettingsView';
import { MobileCalendarView } from './MobileCalendarView';
import { MobileFolderInfoView } from './MobileFolderInfoView';
import { MobileFloatingDock } from './MobileFloatingDock';

export const MobileShell: React.FC = () => {
  const {
    activeMobileTab,
    mobileActiveFolder,
    mobileFolderInfoOpen
  } = useApp();

  // Show floating dock when at the root level of tabs (not deep in a folder's feed, and not in assistant)
  const isInsideFolderFeed = activeMobileTab === 'folders' && mobileActiveFolder !== null;
  const isFloatingDockVisible = !isInsideFolderFeed && activeMobileTab !== 'assistant';

  return (
    <div className="w-full h-full flex flex-col bg-[#09090b] text-[#f4f4f5] overflow-hidden relative">
      {/* Active Tab Screen */}
      <main className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
        {activeMobileTab === 'folders' && <MobileFoldersView />}
        {activeMobileTab === 'tasks' && <MobileTasksView />}
        {activeMobileTab === 'assistant' && <MobileAssistantView />}
        {activeMobileTab === 'settings' && <MobileSettingsView />}
        {activeMobileTab === 'calendar' && <MobileCalendarView />}
      </main>

      {/* Floating Linear Island Dock (Visible on root views except Assistant) */}
      {isFloatingDockVisible && <MobileFloatingDock />}

      {/* Fullscreen Slide-over Folder Info & Media Profile */}
      {mobileFolderInfoOpen && <MobileFolderInfoView />}
    </div>
  );
};
