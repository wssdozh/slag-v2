import React from 'react';
import { AppProvider } from './context/AppContext';
import { Sidebar } from './components/Sidebar/Sidebar';
import { FeedHeader } from './components/Feed/FeedHeader';
import { FeedList } from './components/Feed/FeedList';
import { Composer } from './components/Feed/Composer';
import { FolderInfoPanel } from './components/RightPanel/FolderInfoPanel';
import { FullscreenEditor } from './components/Editor/FullscreenEditor';
import { SearchModal } from './components/Search/SearchModal';
import { SettingsModal } from './components/Modals/SettingsModal';
import { FolderModal } from './components/Modals/FolderModal';
import { TriageModal } from './components/Modals/TriageModal';
import { ToastContainer } from './components/UI/Toast';

const MainLayout: React.FC = () => {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#09090b] text-[#f4f4f5] select-none">
      {/* 1. Left Sidebar: Folders, Inbox, Vault Switcher, Settings */}
      <Sidebar />

      {/* 2. Center Column: Telegram-Style Stream / Monologue Feed */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#09090b] relative">
        <FeedHeader />
        <FeedList />
        <Composer />
      </main>

      {/* 3. Right Column: Folder Info Panel, Statistics & Media Tabs */}
      <FolderInfoPanel />

      {/* Modals & Overlays */}
      <FullscreenEditor />
      <SearchModal />
      <SettingsModal />
      <FolderModal />
      <TriageModal />
      <ToastContainer />
    </div>
  );
};

export function App() {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}

export default App;
