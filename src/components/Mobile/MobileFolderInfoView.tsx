import React from 'react';
import { useApp } from '../../context/AppContext';
import {
  Folder,
  Inbox,
  Sparkles,
  Edit2,
  Plus
} from 'lucide-react';
import { useFolderMedia } from '../RightPanel/useFolderMedia';
import { FolderMediaTabs } from '../RightPanel/FolderMediaTabs';
import { MobileScreenHeader } from './MobileScreenHeader';

export const MobileFolderInfoView: React.FC = () => {
  const {
    currentFolder,
    folders,
    filteredItems,
    setMobileFolderInfoOpen,
    openEditFolderModal,
    openLightbox,
    setActiveTagFilter,
    setIsFullscreenEditorOpen,
    setSelectedItem,
    setIsTriageModalOpen
  } = useApp();

  const currentFolderMeta = folders.find(f => f.path === currentFolder);
  const isInbox = currentFolder === 'Входящие';

  const mediaData = useFolderMedia(filteredItems);
  const { notesCount, tasksCount, articlesCount } = mediaData;

  const handleCreateNote = () => {
    setMobileFolderInfoOpen(false);
    const draftItem = {
      id: 'draft_' + Date.now(),
      title: '',
      content: '',
      type: 'note' as const,
      folder: currentFolder || 'Входящие',
      tags: [],
      attachments: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setSelectedItem(draftItem);
    setIsFullscreenEditorOpen(true);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#09090b] flex flex-col text-[#f4f4f5] select-none animate-in slide-in-from-right duration-200 overflow-hidden">
      {/* Top Header with Back Button */}
      <MobileScreenHeader
        onBack={() => setMobileFolderInfoOpen(false)}
        backLabel="Назад"
        centerSlot={
          <span className="text-sm font-semibold text-zinc-200 truncate max-w-[200px]">
            {currentFolderMeta?.name || currentFolder}
          </span>
        }
        rightSlot={
          currentFolderMeta && !currentFolderMeta.isSystem ? (
            <button
              type="button"
              onClick={() => {
                openEditFolderModal(currentFolderMeta);
              }}
              className="w-10 h-10 rounded-lg text-zinc-400 hover:text-white flex items-center justify-center active:scale-95 transition-all cursor-pointer"
              title="Редактировать папку"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          ) : (
            <div className="w-10" />
          )
        }
      />

      {/* Main Content Scroll Area */}
      <div className="flex-1 overflow-y-auto px-4 py-3.5 flex flex-col gap-3.5 pb-16">
        {/* Profile Card Header */}
        <div className="flex flex-col items-center text-center gap-2 py-1">
          <div className="w-14 h-14 rounded-full bg-[#18181c] border border-white/[0.08] flex items-center justify-center text-zinc-200 shadow-md">
            {isInbox ? <Inbox className="w-7 h-7" /> : <Folder className="w-7 h-7 text-zinc-400" />}
          </div>

          <div className="flex flex-col gap-0.5">
            <h1 className="text-base font-bold text-white tracking-tight">
              {currentFolderMeta?.name || currentFolder}
            </h1>
            <p className="text-xs text-zinc-500 font-mono">
              {filteredItems.length} {filteredItems.length === 1 ? 'запись' : filteredItems.length < 5 ? 'записи' : 'записей'} • {currentFolder}
            </p>
            {currentFolderMeta?.description && (
              <p className="text-xs text-zinc-400 max-w-sm mt-0.5 px-3 leading-relaxed line-clamp-2">
                {currentFolderMeta.description}
              </p>
            )}
          </div>

          {/* Action Buttons Row */}
          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={handleCreateNote}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-medium active:scale-95 transition-all cursor-pointer border border-white/[0.08]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Запись</span>
            </button>

            {isInbox && (
              <button
                onClick={() => {
                  setMobileFolderInfoOpen(false);
                  setIsTriageModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-500/15 hover:bg-blue-500/20 text-blue-300 text-xs font-medium active:scale-95 transition-all cursor-pointer border border-blue-500/20"
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                <span>Трибунал</span>
              </button>
            )}
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-2 p-1 bg-[#141417]/80 rounded-xl border border-white/[0.06] text-center">
          <div className="py-1.5 flex flex-col items-center">
            <span className="text-sm font-bold text-zinc-200">{notesCount}</span>
            <span className="text-[10px] font-mono text-zinc-500 uppercase">Заметки</span>
          </div>
          <div className="py-1.5 flex flex-col items-center border-x border-white/[0.06]">
            <span className="text-sm font-bold text-amber-400">{tasksCount}</span>
            <span className="text-[10px] font-mono text-zinc-500 uppercase">Таски</span>
          </div>
          <div className="py-1.5 flex flex-col items-center">
            <span className="text-sm font-bold text-blue-400">{articlesCount}</span>
            <span className="text-[10px] font-mono text-zinc-500 uppercase">Статьи</span>
          </div>
        </div>

        {/* Segmented Media Tabs */}
        <FolderMediaTabs
          mediaData={mediaData}
          onOpenLightbox={(images, idx) => openLightbox(images, idx)}
          onSelectTag={(tag) => {
            setActiveTagFilter(tag);
            setMobileFolderInfoOpen(false);
          }}
          variant="mobile"
        />
      </div>
    </div>
  );
};
