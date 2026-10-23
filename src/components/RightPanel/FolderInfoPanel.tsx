import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Image as ImageIcon,
  Mic,
  Link as LinkIcon,
  CheckSquare,
  FileText,
  StickyNote,
  Sparkles,
  Folder
} from 'lucide-react';
import { useFolderMedia } from './useFolderMedia';
import { FolderMediaTabs } from './FolderMediaTabs';

export const FolderInfoPanel: React.FC = () => {
  const {
    currentFolder,
    folders,
    filteredItems,
    items,
    saveFolder,
    setActiveTagFilter,
    addToast,
    openLightbox,
    setIsTriageModalOpen
  } = useApp();

  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');

  const currentFolderMeta = folders.find(f => f.path === currentFolder);
  const isInbox = currentFolder === 'Входящие';
  const inboxUnsortedCount = items.filter(i => i.folder === 'Входящие').length;

  const mediaData = useFolderMedia(filteredItems);
  const { allImages, allAudio, allLinks, notesCount, tasksCount, articlesCount } = mediaData;

  const handleSaveDescription = () => {
    if (!currentFolderMeta) return;
    saveFolder({
      ...currentFolderMeta,
      description: descriptionDraft.trim(),
    });
    setIsEditingDescription(false);
    addToast('Описание папки для ИИ обновлено', 'success');
  };

  return (
    <aside
      className="w-full h-full flex flex-col bg-[#0c0c0e] select-none text-[#a1a1aa] overflow-hidden"
    >
      {/* Top Header: Folder info */}
      <div className="h-12 px-3 flex items-center justify-between border-b border-white/[0.04] gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Folder className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <span className="text-xs font-semibold text-zinc-200 truncate">
            {currentFolderMeta?.name || currentFolder}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {/* Compact AI Triage card for Inbox */}
        {isInbox && inboxUnsortedCount > 0 && (
          <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between gap-2 shadow-sm">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-lg bg-amber-400/10 flex items-center justify-center shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              </div>
              <span className="font-semibold text-xs text-zinc-100 truncate">ИИ-Сортировка</span>
              <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-mono text-zinc-300 shrink-0">
                {inboxUnsortedCount}
              </span>
            </div>
            <button
              onClick={() => setIsTriageModalOpen(true)}
              className="px-2.5 py-1 rounded-lg bg-white text-black font-semibold text-xs hover:bg-zinc-200 transition-colors shadow-sm shrink-0 cursor-pointer"
            >
              Запустить
            </button>
          </div>
        )}

        {/* Folder Description for AI & User */}
        <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-white/[0.02] border border-white/[0.05]">
          <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-zinc-400" />
              Описание для ИИ
            </span>
            {!isEditingDescription && (
              <button
                onClick={() => {
                  setDescriptionDraft(currentFolderMeta?.description || '');
                  setIsEditingDescription(true);
                }}
                className="hover:text-white text-[10px] text-zinc-500 transition-colors cursor-pointer"
              >
                Изменить
              </button>
            )}
          </div>

          {isEditingDescription ? (
            <div className="flex flex-col gap-2 pt-1">
              <textarea
                value={descriptionDraft}
                onChange={(e) => setDescriptionDraft(e.target.value)}
                placeholder="Опишите, какие заметки и темы должны попадать в эту папку..."
                rows={3}
                autoFocus
                className="w-full bg-black/40 border border-white/[0.08] rounded p-2 text-xs text-white placeholder-zinc-500 resize-none leading-relaxed"
              />
              <div className="flex justify-end gap-1.5">
                <button
                  onClick={() => setIsEditingDescription(false)}
                  className="px-2 py-0.5 rounded text-[11px] text-zinc-400 hover:text-white cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  onClick={handleSaveDescription}
                  className="px-2.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white text-[11px] font-medium cursor-pointer"
                >
                  Сохранить
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-zinc-300 leading-relaxed font-normal">
              {currentFolderMeta?.description || (
                <span className="italic text-zinc-500">
                  Описание не задано. Добавьте его, чтобы ИИ понимал, что сортировать сюда.
                </span>
              )}
            </p>
          )}
        </div>

        {/* Metrics Table */}
        <div className="flex flex-col gap-1 text-xs">
          <div className="flex justify-between py-1 border-b border-white/[0.03]">
            <span className="text-zinc-500 flex items-center gap-1.5">
              <StickyNote className="w-3.5 h-3.5 text-zinc-500" /> Заметки
            </span>
            <span className="font-mono text-zinc-300">{notesCount}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-white/[0.03]">
            <span className="text-zinc-500 flex items-center gap-1.5">
              <CheckSquare className="w-3.5 h-3.5 text-zinc-500" /> Таски
            </span>
            <span className="font-mono text-zinc-300">{tasksCount}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-white/[0.03]">
            <span className="text-zinc-500 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-zinc-500" /> Статьи
            </span>
            <span className="font-mono text-zinc-300">{articlesCount}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-white/[0.03]">
            <span className="text-zinc-500 flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-zinc-500" /> Фото / Медиа
            </span>
            <span className="font-mono text-zinc-300">{allImages.length}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-white/[0.03]">
            <span className="text-zinc-500 flex items-center gap-1.5">
              <Mic className="w-3.5 h-3.5 text-zinc-500" /> Голосовые
            </span>
            <span className="font-mono text-zinc-300">{allAudio.length}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-white/[0.03]">
            <span className="text-zinc-500 flex items-center gap-1.5">
              <LinkIcon className="w-3.5 h-3.5 text-zinc-500" /> Ссылки
            </span>
            <span className="font-mono text-zinc-300">{allLinks.length}</span>
          </div>
        </div>

        {/* Media / Files / Links Tabs */}
        <FolderMediaTabs
          mediaData={mediaData}
          onOpenLightbox={(images, idx) => openLightbox(images, idx)}
          onSelectTag={setActiveTagFilter}
          variant="desktop"
        />
      </div>
    </aside>
  );
};
