import React, { useState } from 'react';
import {
  Image as ImageIcon,
  Mic,
  File,
  Link as LinkIcon,
  Tag as TagIcon,
  ExternalLink
} from 'lucide-react';
import { AudioPlayer } from '../UI/AudioPlayer';
import type { FolderMediaData } from './useFolderMedia';

export type FolderMediaTabId = 'media' | 'audio' | 'files' | 'links' | 'tags';

export interface FolderMediaTabsProps {
  mediaData: FolderMediaData;
  onOpenLightbox: (images: Array<{ id: string; name: string; url: string }>, index: number) => void;
  onSelectTag?: (tag: string) => void;
  variant?: 'desktop' | 'mobile';
  className?: string;
}

export const FolderMediaTabs: React.FC<FolderMediaTabsProps> = ({
  mediaData,
  onOpenLightbox,
  onSelectTag,
  variant = 'desktop',
  className = '',
}) => {
  const [activeTab, setActiveTab] = useState<FolderMediaTabId>('media');
  const { allImages, allAudio, allFiles, allLinks, folderTags } = mediaData;

  const isMobile = variant === 'mobile';

  const tabDefs = isMobile
    ? [
        { id: 'media' as const, label: 'Фото', icon: ImageIcon, count: allImages.length },
        { id: 'audio' as const, label: 'Аудио', icon: Mic, count: allAudio.length },
        { id: 'files' as const, label: 'Файлы', icon: File, count: allFiles.length },
        { id: 'links' as const, label: 'Ссылки', icon: LinkIcon, count: allLinks.length },
        { id: 'tags' as const, label: 'Теги', icon: TagIcon, count: folderTags.size },
      ]
    : [
        { id: 'media' as const, label: 'Медиа', icon: ImageIcon, count: allImages.length },
        { id: 'audio' as const, label: 'Аудио', icon: Mic, count: allAudio.length },
        { id: 'files' as const, label: 'Файлы', icon: File, count: allFiles.length },
        { id: 'links' as const, label: 'Ссылки', icon: LinkIcon, count: allLinks.length },
        { id: 'tags' as const, label: 'Теги', icon: TagIcon, count: folderTags.size },
      ];

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* Tabs Header */}
      {isMobile ? (
        <div className="flex items-center gap-1.5 bg-[#141417]/90 p-1 rounded-2xl border border-white/[0.06] overflow-x-auto scrollbar-none">
          {tabDefs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
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
      ) : (
        <div className="flex items-center gap-1 border-b border-white/[0.06] pb-1 overflow-x-auto scrollbar-none">
          {tabDefs.map(tab => (
            <button
              key={tab.id}
              type="button"
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
      )}

      {/* Tab Panes */}
      <div className="flex flex-col gap-2 min-h-[140px]">
        {/* Media / Photos */}
        {activeTab === 'media' && (
          allImages.length === 0 ? (
            <p className="text-center text-xs text-zinc-500 py-8">
              {isMobile ? 'В этой папке нет изображений' : 'Нет фото в этой папке'}
            </p>
          ) : (
            <div className={`grid grid-cols-3 ${isMobile ? 'gap-2' : 'gap-1.5'}`}>
              {allImages.map((img, idx) => (
                <div
                  key={img.id + idx}
                  onClick={() => onOpenLightbox(allImages, idx)}
                  className={`aspect-square overflow-hidden bg-black/40 border border-white/[0.06] cursor-pointer hover:opacity-90 active:scale-95 transition-all ${
                    isMobile ? 'rounded-xl' : 'rounded'
                  }`}
                >
                  <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )
        )}

        {/* Audio Notes */}
        {activeTab === 'audio' && (
          allAudio.length === 0 ? (
            <p className="text-center text-xs text-zinc-500 py-8">
              {isMobile ? 'В этой папке нет голосовых заметок' : 'Нет аудиозаписей'}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {allAudio.map(aud => (
                <div
                  key={aud.id}
                  className={isMobile ? 'p-3 rounded-xl bg-[#141417] border border-white/[0.06]' : 'p-1'}
                >
                  {isMobile && <div className="text-xs text-zinc-300 font-medium mb-1.5">{aud.name}</div>}
                  <AudioPlayer src={aud.url} />
                </div>
              ))}
            </div>
          )
        )}

        {/* Files */}
        {activeTab === 'files' && (
          allFiles.length === 0 ? (
            <p className="text-center text-xs text-zinc-500 py-8">
              {isMobile ? 'В этой папке нет документов' : 'Нет прикрепленных файлов'}
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {allFiles.map(file => (
                <a
                  key={file.id}
                  href={file.url}
                  download={file.name}
                  className={`flex items-center justify-between p-2 rounded bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] text-xs transition-colors ${
                    isMobile ? 'p-3 rounded-xl bg-[#141417] border-white/[0.06]' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <File className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span className="truncate text-zinc-300">{file.name}</span>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500 shrink-0 ml-2">
                    {Math.round(file.size / 1024)} KB
                  </span>
                </a>
              ))}
            </div>
          )
        )}

        {/* Links */}
        {activeTab === 'links' && (
          allLinks.length === 0 ? (
            <p className="text-center text-xs text-zinc-500 py-8">
              {isMobile ? 'В этой папке нет веб-ссылок' : 'Нет ссылок'}
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {allLinks.map((link, idx) => (
                <a
                  key={idx}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-2 p-2 rounded bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] text-xs text-zinc-300 transition-colors group ${
                    isMobile ? 'justify-between p-3 rounded-xl bg-[#141417] border-white/[0.06]' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <ExternalLink className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300 shrink-0" />
                    <span className="truncate text-zinc-300 group-hover:text-white">
                      {link.text}
                    </span>
                  </div>
                  {isMobile && <ExternalLink className="w-3.5 h-3.5 text-zinc-500 shrink-0 ml-2" />}
                </a>
              ))}
            </div>
          )
        )}

        {/* Tags */}
        {activeTab === 'tags' && (
          folderTags.size === 0 ? (
            <p className="text-center text-xs text-zinc-500 py-8">
              {isMobile ? 'В этой папке нет тегов' : 'Нет тегов'}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {Array.from(folderTags).map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onSelectTag?.(tag)}
                  className="px-2 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.08] text-xs font-mono text-zinc-300 transition-colors cursor-pointer"
                >
                  #{tag}
                </button>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
};
