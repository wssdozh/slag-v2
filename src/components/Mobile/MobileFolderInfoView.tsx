import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  ArrowLeft,
  Folder,
  Inbox,
  Sparkles,
  Edit2,
  Image as ImageIcon,
  Mic,
  File,
  Link as LinkIcon,
  Tag as TagIcon,
  ExternalLink,
  Plus
} from 'lucide-react';
import { AudioPlayer } from '../UI/AudioPlayer';

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

  const [activeTab, setActiveTab] = useState<'media' | 'audio' | 'files' | 'links' | 'tags'>('media');

  const currentFolderMeta = folders.find(f => f.path === currentFolder);
  const isInbox = currentFolder === 'Входящие';

  // Extract all attachments and links in the current folder
  const allImages: Array<{ id: string; name: string; url: string }> = [];
  const allAudio: Array<{ id: string; name: string; url: string }> = [];
  const allFiles: Array<{ id: string; name: string; url: string; size: number }> = [];
  const allLinks: Array<{ text: string; url: string }> = [];
  const folderTags = new Set<string>();

  filteredItems.forEach(item => {
    (item.tags || []).forEach(t => folderTags.add(t));

    (item.attachments || []).forEach(att => {
      if (att.type === 'image' && att.dataUrl) {
        allImages.push({ id: att.id, name: att.name, url: att.dataUrl });
      } else if (att.type === 'audio' && att.dataUrl) {
        allAudio.push({ id: att.id, name: att.name, url: att.dataUrl });
      } else if (att.type === 'file' && att.dataUrl) {
        allFiles.push({ id: att.id, name: att.name, url: att.dataUrl, size: att.size });
      }
    });

    const markdownLinks = Array.from(item.content.matchAll(/\[(.*?)\]\((https?:\/\/[^\s)]+)\)/g));
    markdownLinks.forEach(m => {
      allLinks.push({ text: m[1] || m[2], url: m[2] });
    });

    const bareUrls = Array.from(item.content.matchAll(/(?<!\]\()(https?:\/\/[^\s]+)/g));
    bareUrls.forEach(m => {
      if (!allLinks.some(l => l.url === m[1])) {
        allLinks.push({ text: m[1], url: m[1] });
      }
    });
  });

  const notesCount = filteredItems.filter(i => i.type === 'note').length;
  const tasksCount = filteredItems.filter(i => i.type === 'task').length;
  const articlesCount = filteredItems.filter(i => i.type === 'article').length;

  const handleCreateNote = () => {
    setSelectedItem({
      id: 'draft_' + Date.now(),
      title: '',
      content: '',
      type: 'note',
      folder: currentFolder,
      tags: [],
      attachments: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    setMobileFolderInfoOpen(false);
    setIsFullscreenEditorOpen(true);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#09090b] flex flex-col text-[#f4f4f5] select-none animate-in slide-in-from-right duration-200 overflow-hidden">
      {/* Top Header with Back Button */}
      <header
        className="h-14 border-b border-white/[0.06] bg-[#0c0c0e]/95 backdrop-blur-md px-4 flex items-center justify-between shrink-0"
        style={{ paddingTop: 'max(var(--sat), 0px)' }}
      >
        <button
          onClick={() => setMobileFolderInfoOpen(false)}
          className="h-10 px-2 rounded-lg text-zinc-400 hover:text-white flex items-center gap-1.5 text-sm active:scale-95 transition-all cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Назад</span>
        </button>

        <span className="text-sm font-semibold text-zinc-200 truncate max-w-[200px]">
          {currentFolderMeta?.name || currentFolder}
        </span>

        {currentFolderMeta && !currentFolderMeta.isSystem ? (
          <button
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
        )}
      </header>

      {/* Main Content Scroll Area */}
      <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-5 pb-16">
        {/* Profile Card Header (Matching user reference) */}
        <div className="flex flex-col items-center text-center gap-3 py-2">
          <div className="w-20 h-20 rounded-full bg-[#18181c] border border-white/[0.08] flex items-center justify-center text-zinc-200 shadow-xl">
            {isInbox ? <Inbox className="w-9 h-9" /> : <Folder className="w-9 h-9 text-zinc-400" />}
          </div>

          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-bold text-white tracking-tight">
              {currentFolderMeta?.name || currentFolder}
            </h1>
            <p className="text-xs text-zinc-500 font-mono">
              {filteredItems.length} {filteredItems.length === 1 ? 'запись' : filteredItems.length < 5 ? 'записи' : 'записей'} • {currentFolder}
            </p>
            {currentFolderMeta?.description && (
              <p className="text-xs text-zinc-400 max-w-sm mt-1 px-4 leading-relaxed">
                {currentFolderMeta.description}
              </p>
            )}
          </div>

          {/* Action Buttons Row */}
          <div className="flex items-center gap-2.5 mt-2">
            <button
              onClick={handleCreateNote}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-medium active:scale-95 transition-all cursor-pointer border border-white/[0.08]"
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
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-500/15 hover:bg-blue-500/20 text-blue-300 text-xs font-medium active:scale-95 transition-all cursor-pointer border border-blue-500/20"
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                <span>Трибунал</span>
              </button>
            )}
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-2 p-1 bg-[#141417]/80 rounded-xl border border-white/[0.06] text-center">
          <div className="py-2 flex flex-col items-center">
            <span className="text-sm font-bold text-zinc-200">{notesCount}</span>
            <span className="text-[10px] font-mono text-zinc-500 uppercase">Заметки</span>
          </div>
          <div className="py-2 flex flex-col items-center border-x border-white/[0.06]">
            <span className="text-sm font-bold text-amber-400">{tasksCount}</span>
            <span className="text-[10px] font-mono text-zinc-500 uppercase">Таски</span>
          </div>
          <div className="py-2 flex flex-col items-center">
            <span className="text-sm font-bold text-blue-400">{articlesCount}</span>
            <span className="text-[10px] font-mono text-zinc-500 uppercase">Статьи</span>
          </div>
        </div>

        {/* Segmented Media Tabs */}
        <div className="flex items-center gap-1.5 bg-[#141417]/90 p-1 rounded-2xl border border-white/[0.06] overflow-x-auto scrollbar-none">
          {[
            { id: 'media', label: 'Фото', icon: ImageIcon, count: allImages.length },
            { id: 'audio', label: 'Аудио', icon: Mic, count: allAudio.length },
            { id: 'files', label: 'Файлы', icon: File, count: allFiles.length },
            { id: 'links', label: 'Ссылки', icon: LinkIcon, count: allLinks.length },
            { id: 'tags', label: 'Теги', icon: TagIcon, count: folderTags.size },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`shrink-0 px-3 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap active:scale-95 ${
                  isActive
                    ? 'bg-white/10 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.label}</span>
                <span className={`text-[10px] font-mono shrink-0 ${isActive ? 'text-zinc-200' : 'text-zinc-500'}`}>
                  ({tab.count})
                </span>
              </button>
            );
          })}
        </div>

        {/* Tab Content Panes */}
        <div className="flex flex-col gap-3">
          {activeTab === 'media' && (
            allImages.length === 0 ? (
              <p className="text-center text-xs text-zinc-500 py-8">В этой папке нет изображений</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {allImages.map((img, idx) => (
                  <div
                    key={img.id + idx}
                    onClick={() => openLightbox(allImages, idx)}
                    className="aspect-square rounded-xl overflow-hidden border border-white/[0.06] bg-black/40 cursor-pointer active:scale-95 transition-all"
                  >
                    <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )
          )}

          {activeTab === 'audio' && (
            allAudio.length === 0 ? (
              <p className="text-center text-xs text-zinc-500 py-8">В этой папке нет голосовых заметок</p>
            ) : (
              <div className="flex flex-col gap-2">
                {allAudio.map(aud => (
                  <div key={aud.id} className="p-3 rounded-xl bg-[#141417] border border-white/[0.06]">
                    <div className="text-xs text-zinc-300 font-medium mb-1.5">{aud.name}</div>
                    <AudioPlayer src={aud.url} />
                  </div>
                ))}
              </div>
            )
          )}

          {activeTab === 'files' && (
            allFiles.length === 0 ? (
              <p className="text-center text-xs text-zinc-500 py-8">В этой папке нет документов</p>
            ) : (
              <div className="flex flex-col gap-2">
                {allFiles.map(file => (
                  <a
                    key={file.id}
                    href={file.url}
                    download={file.name}
                    className="flex items-center justify-between p-3 rounded-xl bg-[#141417] border border-white/[0.06] hover:bg-white/[0.04] transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <File className="w-4 h-4 text-zinc-400 shrink-0" />
                      <span className="text-xs text-zinc-200 truncate">{file.name}</span>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500 shrink-0 ml-2">
                      {Math.round(file.size / 1024)} KB
                    </span>
                  </a>
                ))}
              </div>
            )
          )}

          {activeTab === 'links' && (
            allLinks.length === 0 ? (
              <p className="text-center text-xs text-zinc-500 py-8">В этой папке нет веб-ссылок</p>
            ) : (
              <div className="flex flex-col gap-2">
                {allLinks.map((link, idx) => (
                  <a
                    key={idx}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between p-3 rounded-xl bg-[#141417] border border-white/[0.06] hover:bg-white/[0.04] transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <LinkIcon className="w-4 h-4 text-blue-400 shrink-0" />
                      <span className="text-xs text-zinc-200 truncate">{link.text}</span>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-zinc-500 shrink-0 ml-2" />
                  </a>
                ))}
              </div>
            )
          )}

          {activeTab === 'tags' && (
            folderTags.size === 0 ? (
              <p className="text-center text-xs text-zinc-500 py-8">В этой папке нет тегов</p>
            ) : (
              <div className="flex flex-wrap gap-2 pt-2">
                {Array.from(folderTags).map(tag => (
                  <button
                    key={tag}
                    onClick={() => {
                      setActiveTagFilter(tag);
                      setMobileFolderInfoOpen(false);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/10 text-xs font-mono text-zinc-300 border border-white/[0.06] cursor-pointer"
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};
