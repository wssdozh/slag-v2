// Folder media browser: images, audio, files, links and tags in one tab strip.
import React, { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import { Icon } from '../UI/icons/Icon';
import type { IconName } from '../UI/icons/icons';
import { AudioPlayer } from '../UI/AudioPlayer';
import type { FolderMediaData } from './useFolderMedia';
import type { FolderMediaTabId, LightboxImage } from '../../types';
import { storage } from '../../lib/storage';

export interface FolderMediaTabsProps {
  mediaData: FolderMediaData;
  onOpenLightbox: (images: LightboxImage[], index: number) => void;
  onSelectTag?: (tag: string) => void;
  variant?: 'desktop' | 'mobile';
  className?: string;
  compact?: boolean;
}

export const FolderMediaTabs: React.FC<FolderMediaTabsProps> = ({
  mediaData,
  onOpenLightbox,
  onSelectTag,
  variant = 'desktop',
  className = '',
  compact = false,
}) => {
  const [activeTab, setActiveTabState] = useState<FolderMediaTabId>(() => {
    return storage.getWorkspaceState().folderMediaTab || 'media';
  });

  const setActiveTab = (tabId: FolderMediaTabId) => {
    setActiveTabState(tabId);
    storage.saveWorkspaceState({ folderMediaTab: tabId });
  };

  const { allImages, allAudio, allFiles, allLinks, folderTags } = mediaData;

  const isMobile = variant === 'mobile';

  const desktopTabBarRef = useRef<HTMLDivElement | null>(null);
  const [desktopTabIndicator, setDesktopTabIndicator] = useState<{ left: number; width: number; ready: boolean }>({
    left: 0,
    width: 0,
    ready: false,
  });

  const mobileTabBarRef = useRef<HTMLDivElement | null>(null);
  const [mobileTabIndicator, setMobileTabIndicator] = useState<{ left: number; width: number; ready: boolean }>({
    left: 0,
    width: 0,
    ready: false,
  });

  const updateIndicators = useCallback(() => {
    if (isMobile) {
      if (!mobileTabBarRef.current) return;
      const activeBtn = mobileTabBarRef.current.querySelector<HTMLButtonElement>(`[data-mobile-media-tab="${activeTab}"]`);
      if (activeBtn) {
        setMobileTabIndicator({
          left: activeBtn.offsetLeft,
          width: activeBtn.offsetWidth,
          ready: true,
        });
      }
    } else {
      if (!desktopTabBarRef.current) return;
      const activeBtn = desktopTabBarRef.current.querySelector<HTMLButtonElement>(`[data-media-tab="${activeTab}"]`);
      if (activeBtn) {
        setDesktopTabIndicator({
          left: activeBtn.offsetLeft,
          width: activeBtn.offsetWidth,
          ready: true,
        });
      }
    }
  }, [activeTab, isMobile]);

  useLayoutEffect(() => {
    updateIndicators();
  }, [updateIndicators]);

  useEffect(() => {
    window.addEventListener('resize', updateIndicators);
    return () => window.removeEventListener('resize', updateIndicators);
  }, [updateIndicators]);

  const tabDefs: { id: FolderMediaTabId; label: string; icon: IconName; count: number }[] = [
    { id: 'media', label: isMobile ? 'Фото' : 'Медиа', icon: 'entity.image', count: allImages.length },
    { id: 'audio', label: 'Аудио', icon: 'media.microphone', count: allAudio.length },
    { id: 'files', label: 'Файлы', icon: 'entity.file', count: allFiles.length },
    { id: 'links', label: 'Ссылки', icon: 'entity.link', count: allLinks.length },
    { id: 'tags', label: 'Теги', icon: 'entity.tag', count: folderTags.size },
  ];

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* Tabs Header */}
      {isMobile ? (
        <div ref={mobileTabBarRef} className="relative flex items-center gap-1 bg-surface/90 p-1 rounded-2xl border border-tint-6 overflow-x-auto scrollbar-none select-none">
          {mobileTabIndicator.ready && (
            <div
              data-testid="folder-media-pill"
              className="absolute top-1 bottom-1 left-0 rounded-xl bg-tint-10 shadow-sm pointer-events-none transition-[transform,width] duration-200"
              style={{
                transform: `translateX(${mobileTabIndicator.left}px)`,
                width: `${mobileTabIndicator.width}px`,
                transitionTimingFunction: 'var(--ease-settle)',
              }}
            />
          )}
          {tabDefs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                data-mobile-media-tab={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`relative z-10 shrink-0 px-2.5 py-1.5 rounded-xl text-xs font-medium motion-press flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                  isActive
                    ? `${mobileTabIndicator.ready ? '' : 'bg-tint-10'} text-white font-semibold`
                    : 'text-fg-secondary hover:text-white hover:bg-tint-4'
                }`}
              >
                <Icon name={tab.icon} size="sm" tone="inherit" className="shrink-0" />
                <span>{tab.label}</span>
                <span className={`text-3xs font-mono shrink-0 ${isActive ? 'text-fg-soft' : 'text-fg-muted'}`}>
                  ({tab.count})
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div ref={desktopTabBarRef} className="relative flex items-center gap-1 border-b border-tint-6 pb-1 overflow-x-auto scrollbar-none select-none">
          {desktopTabIndicator.ready && (
            <span
              className="absolute bottom-[-1px] left-0 h-[2px] bg-white rounded-full transition-[transform,width] duration-200 pointer-events-none"
              style={{
                transform: `translateX(${desktopTabIndicator.left}px)`,
                width: `${desktopTabIndicator.width}px`,
                transitionTimingFunction: 'var(--ease-settle)',
              }}
            />
          )}
          {tabDefs.map(tab => (
            <button
              key={tab.id}
              data-media-tab={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`relative pb-1 ${compact ? 'px-1.5' : 'px-2'} text-2xs font-medium transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'text-white'
                  : 'text-fg-muted hover:text-fg-tertiary'
              }`}
            >
              <span>{tab.label}</span>
              {((compact && tab.id !== 'tags') || tab.count > 0) && (
                <span
                  data-testid={compact ? `folder-stat-${tab.id}-value` : undefined}
                  className={`text-3xs font-mono ${compact ? 'text-fg-secondary' : `px-1 py-0.2 rounded ${
                    activeTab === tab.id ? 'bg-tint-10 text-fg-tertiary' : 'bg-tint-4 text-fg-muted'
                  }`}`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Tab Panes */}
      <div key={activeTab} className="flex flex-col gap-2 min-h-[140px] motion-fade">
        {/* Media / Photos */}
        {activeTab === 'media' && (
          allImages.length === 0 ? (
            <p className="text-center text-xs text-fg-muted py-8">
              {isMobile ? 'В этой папке нет изображений' : 'Нет фото в этой папке'}
            </p>
          ) : (
            <div className={`grid grid-cols-3 ${isMobile ? 'gap-2' : 'gap-1.5'}`}>
              {allImages.map((img, idx) => (
                <div
                  key={(img.id || img.url) + idx}
                  onClick={() => onOpenLightbox(allImages, idx)}
                  className={`aspect-square overflow-hidden bg-scrim-40 border border-tint-6 cursor-pointer hover:opacity-90 transition-opacity ${
                    isMobile ? 'rounded-xl' : 'rounded'
                  }`}
                >
                  <img src={img.url} alt={img.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )
        )}

        {/* Audio Notes */}
        {activeTab === 'audio' && (
          allAudio.length === 0 ? (
            <p className="text-center text-xs text-fg-muted py-8">
              {isMobile ? 'В этой папке нет голосовых заметок' : 'Нет аудиозаписей'}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {allAudio.map(aud => (
                <div
                  key={aud.id}
                  className={isMobile ? 'p-3 rounded-xl bg-surface border border-tint-6' : 'p-1'}
                >
                  {isMobile && <div className="text-xs text-fg-tertiary font-medium mb-1.5">{aud.name}</div>}
                  <AudioPlayer
                    src={aud.url}
                    extractedText={aud.extractedText}
                    enrichmentStatus={aud.enrichmentStatus}
                  />
                </div>
              ))}
            </div>
          )
        )}

        {/* Files */}
        {activeTab === 'files' && (
          allFiles.length === 0 ? (
            <p className="text-center text-xs text-fg-muted py-8">
              {isMobile ? 'В этой папке нет документов' : 'Нет прикрепленных файлов'}
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {allFiles.map(file => (
                <a
                  key={file.id}
                  href={file.url}
                  download={file.name}
                  className={`flex items-center justify-between p-2 rounded bg-tint-2 hover:bg-tint-5 border border-tint-4 text-xs transition-colors ${
                    isMobile ? 'p-3 rounded-xl bg-surface border-tint-6' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Icon name="entity.file" size="sm" className="shrink-0" />
                    <span className="truncate text-fg-tertiary">{file.name}</span>
                  </div>
                  <span className="text-3xs font-mono text-fg-muted shrink-0 ml-2">
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
            <p className="text-center text-xs text-fg-muted py-8">
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
                  className={`flex items-center gap-2 p-2 rounded bg-tint-2 hover:bg-tint-5 border border-tint-4 text-xs text-fg-tertiary transition-colors group ${
                    isMobile ? 'justify-between p-3 rounded-xl bg-surface border-tint-6' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon name="nav.externalLink" size="sm" tone="inherit" className="text-fg-muted group-hover:text-fg-tertiary shrink-0" />
                    <span className="truncate text-fg-tertiary group-hover:text-white">
                      {link.text}
                    </span>
                  </div>
                  {isMobile && <Icon name="nav.externalLink" size="sm" tone="inherit" className="text-fg-muted shrink-0 ml-2" />}
                </a>
              ))}
            </div>
          )
        )}

        {/* Tags */}
        {activeTab === 'tags' && (
          folderTags.size === 0 ? (
            <p className="text-center text-xs text-fg-muted py-8">
              {isMobile ? 'В этой папке нет тегов' : 'Нет тегов'}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {Array.from(folderTags).map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onSelectTag?.(tag)}
                  className="px-2 py-0.5 rounded bg-tint-4 hover:bg-tint-8 text-xs font-mono text-fg-tertiary transition-colors cursor-pointer"
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
