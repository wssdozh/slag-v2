import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  X,
  Image as ImageIcon,
  Mic,
  File,
  Link as LinkIcon,
  CheckSquare,
  FileText,
  StickyNote,
  Sparkles,
  ExternalLink,
  Bot,
  Info
} from 'lucide-react';
import { AudioPlayer } from '../UI/AudioPlayer';
import { AssistantChat } from '../Feed/AssistantChat';

export const FolderInfoPanel: React.FC = () => {
  const {
    currentFolder,
    folders,
    filteredItems,
    items,
    setIsRightPanelOpen,
    rightPanelMode,
    setRightPanelMode,
    saveFolder,
    setActiveTagFilter,
    addToast,
    openLightbox,
    setIsTriageModalOpen
  } = useApp();

  const [activeTab, setActiveTab] = useState<'media' | 'audio' | 'files' | 'links' | 'tags'>('media');
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');

  const currentFolderMeta = folders.find(f => f.path === currentFolder);
  const isInbox = currentFolder === 'Входящие';
  const inboxUnsortedCount = items.filter(i => i.folder === 'Входящие').length;

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

    // Extract links [text](url) and bare http URLs
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
      {/* Top Header with [ Инфо | Ассистент ] Toggle */}
      <div className="h-12 px-3 flex items-center justify-between border-b border-white/[0.04] gap-2">
        <div className="flex items-center h-8 bg-[#141417] p-0.5 rounded-lg border border-white/[0.08] shadow-inner w-fit">
          <button
            onClick={() => setRightPanelMode('info')}
            className={`flex items-center gap-1.5 h-7 px-3 rounded-md text-[12px] font-medium transition-all cursor-pointer ${
              rightPanelMode === 'info'
                ? 'bg-white/10 text-white font-medium shadow-sm border border-white/[0.08]'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent'
            }`}
            title="Информация и статистика папки"
          >
            <Info className="w-3.5 h-3.5 shrink-0" />
            <span>Инфо</span>
          </button>
          <button
            onClick={() => setRightPanelMode('assistant')}
            className={`flex items-center gap-1.5 h-7 px-3 rounded-md text-[12px] font-medium transition-all cursor-pointer ${
              rightPanelMode === 'assistant'
                ? 'bg-white/10 text-white font-medium shadow-sm border border-white/[0.08]'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent'
            }`}
            title="ИИ-Копилот и Ассистент (⌘J / Ctrl+J)"
          >
            <Bot className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            <span>Ассистент</span>
          </button>
        </div>

        <button
          onClick={() => setIsRightPanelOpen(false)}
          className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors shrink-0"
          title="Скрыть панель"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {rightPanelMode === 'assistant' ? (
        <AssistantChat variant="sidebar" />
      ) : (
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {/* Natural AI Triage button for Inbox in sidebar */}
          {isInbox && inboxUnsortedCount > 0 && (
            <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.08] flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-100 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>ИИ-Сортировка</span>
                </span>
                <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-mono text-zinc-300">
                  {inboxUnsortedCount} неразобранных
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Автоматически распределить заметки по смыслу в подходящие папки хранилища.
              </p>
              <button
                onClick={() => setIsTriageModalOpen(true)}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white text-black font-semibold text-xs hover:bg-zinc-200 transition-colors shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Запустить AI Triage</span>
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
                  className="hover:text-white text-[10px] text-zinc-500 transition-colors"
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
                    className="px-2 py-0.5 rounded text-[11px] text-zinc-400 hover:text-white"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={handleSaveDescription}
                    className="px-2.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white text-[11px] font-medium"
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

        {/* Telegram-style Metrics Table */}
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

        {/* Media / Files / Links Tabs with Linear-style underline indicator */}
        <div className="flex flex-col gap-3 pt-1">
          <div className="flex items-center gap-1 border-b border-white/[0.06] pb-1 overflow-x-auto scrollbar-none">
            {[
              { id: 'media' as const, label: 'Медиа', count: allImages.length },
              { id: 'audio' as const, label: 'Аудио', count: allAudio.length },
              { id: 'files' as const, label: 'Файлы', count: allFiles.length },
              { id: 'links' as const, label: 'Ссылки', count: allLinks.length },
              { id: 'tags' as const, label: 'Теги', count: folderTags.size },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative pb-1 px-2 text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'text-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span className={`text-[10px] font-mono px-1 py-0.2 rounded ${
                    activeTab === tab.id ? 'bg-white/10 text-zinc-300' : 'bg-white/[0.04] text-zinc-500'
                  }`}>
                    {tab.count}
                  </span>
                )}
                {activeTab === tab.id && (
                  <span className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-white rounded-full" />
                )}
              </button>
            ))}
          </div>

          {/* Tab Content Display */}
          <div className="flex flex-col gap-2 min-h-[140px]">
            {activeTab === 'media' && (
              allImages.length === 0 ? (
                <div className="text-xs text-zinc-600 text-center py-6">Нет фото в этой папке</div>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  {allImages.map((img, idx) => (
                    <div
                      key={img.id}
                      className="aspect-square rounded overflow-hidden bg-black/40 border border-white/[0.04] cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => openLightbox(allImages, idx)}
                    >
                      <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              )
            )}

            {activeTab === 'audio' && (
              allAudio.length === 0 ? (
                <div className="text-xs text-zinc-600 text-center py-6">Нет аудиозаписей</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {allAudio.map(aud => (
                    <div key={aud.id} className="p-1">
                      <AudioPlayer src={aud.url} />
                    </div>
                  ))}
                </div>
              )
            )}

            {activeTab === 'files' && (
              allFiles.length === 0 ? (
                <div className="text-xs text-zinc-600 text-center py-6">Нет прикрепленных файлов</div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {allFiles.map(file => (
                    <a
                      key={file.id}
                      href={file.url}
                      download={file.name}
                      className="flex items-center justify-between p-2 rounded bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] text-xs transition-colors"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <File className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        <span className="truncate text-zinc-300">{file.name}</span>
                      </div>
                      <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                        {Math.round(file.size / 1024)} KB
                      </span>
                    </a>
                  ))}
                </div>
              )
            )}

            {activeTab === 'links' && (
              allLinks.length === 0 ? (
                <div className="text-xs text-zinc-600 text-center py-6">Нет ссылок</div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {allLinks.map((link, idx) => (
                    <a
                      key={idx}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2 rounded bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] text-xs text-zinc-300 transition-colors group"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300 shrink-0" />
                      <span className="truncate text-zinc-300 group-hover:text-white">
                        {link.text}
                      </span>
                    </a>
                  ))}
                </div>
              )
            )}

            {activeTab === 'tags' && (
              folderTags.size === 0 ? (
                <div className="text-xs text-zinc-600 text-center py-6">Нет тегов</div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(folderTags).map(tag => (
                    <button
                      key={tag}
                      onClick={() => setActiveTagFilter(tag)}
                      className="px-2 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.08] text-xs font-mono text-zinc-300 transition-colors"
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
      )}
    </aside>
  );
};
