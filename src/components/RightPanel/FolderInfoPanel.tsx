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
    saveFolder,
    setActiveTagFilter,
    addToast,
    openLightbox
  } = useApp();

  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');

  const currentFolderMeta = folders.find(f => f.path === currentFolder);

  const mediaData = useFolderMedia(filteredItems);
  const { allImages, allAudio, allLinks, notesCount, tasksCount, articlesCount } = mediaData;

  const metrics = [
    { label: 'Заметки', count: notesCount, icon: StickyNote },
    { label: 'Таски', count: tasksCount, icon: CheckSquare },
    { label: 'Статьи', count: articlesCount, icon: FileText },
    { label: 'Фото / Медиа', count: allImages.length, icon: ImageIcon },
    { label: 'Голосовые', count: allAudio.length, icon: Mic },
    { label: 'Ссылки', count: allLinks.length, icon: LinkIcon },
  ];

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
      className="w-full h-full flex flex-col bg-panel select-none text-fg-secondary overflow-hidden"
    >
      {/* Top Header: Folder info */}
      <div className="h-12 px-3 flex items-center justify-between border-b border-white/[0.04] gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Folder className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <span className="text-xs font-semibold text-zinc-200 truncate">
            {currentFolderMeta?.name || currentFolder}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {/* Folder Description for AI & User (Flat, zero-box) */}
        <div className="group flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px] font-medium text-zinc-500">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-zinc-500" />
              Описание для ИИ
            </span>
            {!isEditingDescription && (
              <button
                onClick={() => {
                  setDescriptionDraft(currentFolderMeta?.description || '');
                  setIsEditingDescription(true);
                }}
                className="text-[10px] text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
              >
                Изменить
              </button>
            )}
          </div>

          {isEditingDescription ? (
            <div className="flex flex-col gap-2 pt-1 motion-fade">
              <textarea
                value={descriptionDraft}
                onChange={(e) => setDescriptionDraft(e.target.value)}
                placeholder="Опишите, какие заметки и темы должны попадать в эту папку..."
                rows={3}
                autoFocus
                className="w-full bg-white/[0.03] border border-white/[0.08] focus:border-white/20 rounded-md p-2 text-xs text-white placeholder-zinc-500 resize-none leading-relaxed outline-none ring-0"
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
            <p className="text-xs text-zinc-300 leading-relaxed font-normal motion-fade">
              {currentFolderMeta?.description || (
                <span className="italic text-zinc-600">
                  Описание не задано. Добавьте его, чтобы ИИ понимал, что сортировать сюда.
                </span>
              )}
            </p>
          )}
        </div>

        {/* Metrics List (Functional contrast) */}
        <div className="flex flex-col text-xs">
          {metrics.map(({ label, count, icon: Icon }) => {
            const hasItems = count > 0;
            return (
              <div
                key={label}
                className="flex items-center justify-between py-1.5 border-b border-white/[0.03]"
              >
                <span
                  className={`flex items-center gap-2 transition-colors ${
                    hasItems ? 'text-zinc-300' : 'text-zinc-600'
                  }`}
                >
                  <Icon
                    className={`w-3.5 h-3.5 shrink-0 ${
                      hasItems ? 'text-zinc-400' : 'text-zinc-600'
                    }`}
                  />
                  <span>{label}</span>
                </span>
                <span
                  className={`font-mono text-xs ${
                    hasItems ? 'text-zinc-200 font-medium' : 'text-zinc-600'
                  }`}
                >
                  {count}
                </span>
              </div>
            );
          })}
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
