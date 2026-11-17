// The ⌘K palette: one query, hits grouped by kind, and keyboard navigation through them.
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { usePresence } from '../../hooks/ui/usePresence';
import { useApp } from '../../context/AppContext';
import type { SlagItem } from '../../types';
import { querySearch, initSearchIndex, preloadSearchEngine } from '../../lib/searchService';
import {
  formatShortcut,
  APP_COMMANDS,
  type AppCommand,
  type AppCommandContext,
} from '../../lib/commands';
import { Icon } from '../UI/icons/Icon';
import { BaseModal } from '../Modals/BaseModal';

type SearchFilterType = 'all' | 'commands' | 'note' | 'task' | 'article';

type CombinedItem =
  | { kind: 'command'; command: AppCommand }
  | { kind: 'note'; item: SlagItem };

const SearchDialog: React.FC<{ presence: ReturnType<typeof usePresence> }> = ({ presence }) => {
  const { isPresent } = presence;
  const {
    isSearchOpen,
    setIsSearchOpen,
    items,
    setCurrentFolder,
    setSelectedItem,
    setIsFullscreenEditorOpen,
    toggleAssistant,
    isLogViewerOpen,
    setIsLogViewerOpen,
    openComposerModal,
    openSettingsModal,
    dismissTopLayer,
    isMobile,
  } = useApp();

  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState<SearchFilterType>('all');
  const [noteResults, setNoteResults] = useState<SlagItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isStaggering, setIsStaggering] = useState(true);

  // Results cascade only for the first batch after the palette opens. Typing after
  // that must feel instant, so the rows stop animating once the window closes.
  useEffect(() => {
    const timer = window.setTimeout(() => setIsStaggering(false), 600);
    return () => window.clearTimeout(timer);
  }, []);

  const commandContext: AppCommandContext = useMemo(
    () => ({
      openSearch: () => setIsSearchOpen(true),
      toggleAssistant,
      toggleLogs: () => setIsLogViewerOpen(!isLogViewerOpen),
      openComposer: (options) => openComposerModal(options),
      openSettings: (tab) => openSettingsModal(tab),
      dismissTopLayer,
      isOverlayOpen: () => true,
    }),
    [toggleAssistant, isLogViewerOpen, setIsLogViewerOpen, openComposerModal, openSettingsModal, dismissTopLayer, setIsSearchOpen]
  );

  useEffect(() => {
    if (!isSearchOpen) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [isSearchOpen]);

  const isExplicitCommandMode = query.startsWith('>') || filterType === 'commands';

  const matchingCommands = useMemo(() => {
    if (filterType !== 'all' && filterType !== 'commands' && !query.startsWith('>')) {
      return [];
    }

    const term = (query.startsWith('>') ? query.slice(1) : query).trim().toLowerCase();
    if (!term) {
      return isExplicitCommandMode ? APP_COMMANDS : [];
    }

    return APP_COMMANDS.filter(cmd =>
      cmd.title.toLowerCase().includes(term) ||
      cmd.description?.toLowerCase().includes(term) ||
      cmd.category.toLowerCase().includes(term) ||
      (cmd.shortcut && cmd.shortcut.toLowerCase().includes(term)) ||
      cmd.keywords?.some(kw => kw.toLowerCase().includes(term) || term.includes(kw.toLowerCase()))
    );
  }, [query, filterType, isExplicitCommandMode]);

  useEffect(() => {
    if (!isSearchOpen || isExplicitCommandMode) {
      return;
    }

    let isCancelled = false;
    const searchTargetType = filterType;
    const delay = query.trim() ? 120 : 0;
    const timer = setTimeout(() => {
      querySearch(query, items, searchTargetType).then(res => {
        if (!isCancelled) {
          setNoteResults(res);
          setSelectedIndex(0);
        }
      });
    }, delay);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [isSearchOpen, query, filterType, items, isExplicitCommandMode]);

  const combinedItems: CombinedItem[] = useMemo(() => {
    const cmds: CombinedItem[] = matchingCommands.map(command => ({
      kind: 'command',
      command,
    }));
    const notes: CombinedItem[] = isExplicitCommandMode
      ? []
      : noteResults.map(item => ({
          kind: 'note',
          item,
        }));
    return [...cmds, ...notes];
  }, [matchingCommands, noteResults, isExplicitCommandMode]);

  const handleSelectItem = (item: SlagItem) => {
    setCurrentFolder(item.folder);
    setSelectedItem(item);
    if (item.type === 'article') {
      setIsFullscreenEditorOpen(true);
    }
    setIsSearchOpen(false);
  };

  const handleSelectCommand = (cmd: AppCommand) => {
    setIsSearchOpen(false);
    cmd.run(commandContext);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < combinedItems.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const current = combinedItems[selectedIndex];
      if (current) {
        if (current.kind === 'command') {
          handleSelectCommand(current.command);
        } else {
          handleSelectItem(current.item);
        }
      }
    }
  };

  const customHeader = (
    <div
      className="flex items-center gap-2.5 px-4 py-3.5 border-b border-tint-6 bg-panel rounded-t-[15px]"
      style={{ paddingTop: 'max(var(--sat), 0.875rem)' }}
    >
      <button
        type="button"
        onClick={() => setIsSearchOpen(false)}
        className="md:hidden w-10 h-10 -ml-2 rounded-lg flex items-center justify-center text-fg-secondary hover:text-white motion-press motion-surface cursor-pointer shrink-0"
        title="Назад"
        aria-label="Закрыть поиск"
      >
        <Icon name="nav.back" size="lg" tone="inherit" />
      </button>
      <Icon name="action.search" size="md" className="shrink-0 hidden md:block" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Поиск по заметкам"
        enterKeyHint="search"
        className="flex-1 bg-transparent text-base md:text-sm text-white placeholder-fg-muted border-none focus:outline-none"
      />
      {query && (
        <button
          type="button"
          onClick={() => setQuery('')}
          className="p-1.5 rounded text-fg-muted hover:text-fg-tertiary cursor-pointer"
        >
          <Icon name="action.close" size="md" tone="inherit" />
        </button>
      )}
      <span className="hidden md:inline-block text-3xs font-mono text-fg-muted px-1.5 py-0.5 rounded border border-tint-6">
        ESC
      </span>
    </div>
  );

  const searchBody = (
    <>
      {/* Filter Pills */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-tint-4 bg-panel text-2xs shrink-0 overflow-x-auto">
        <span className="text-fg-muted mr-1 shrink-0">Фильтр:</span>
        {(
          [
            { id: 'all', label: 'Все' },
            { id: 'commands', label: 'Команды' },
            { id: 'note', label: 'Заметки' },
            { id: 'task', label: 'Таски' },
            { id: 'article', label: 'Статьи' },
          ] as const
        ).map(f => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilterType(f.id)}
            className={`px-2 py-0.5 rounded transition-colors cursor-pointer shrink-0 ${
              filterType === f.id
                ? 'bg-tint-10 text-white font-medium'
                : 'text-fg-muted hover:text-fg-tertiary'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Results List */}
      <div
        className="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5 motion-stagger"
        data-stagger={isStaggering ? 'true' : undefined}
      >
        {combinedItems.length === 0 ? (
          <div className="py-12 text-center text-xs text-fg-muted">
            Ничего не найдено по запросу «{query}»
          </div>
        ) : (
          combinedItems.map((entry, index) => {
            const isSelected = index === selectedIndex;

            if (entry.kind === 'command') {
              const cmd = entry.command;
              return (
                <div
                  key={`cmd_${cmd.id}`}
                  onClick={() => handleSelectCommand(cmd)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  style={{ '--stagger-index': Math.min(index, 6) } as React.CSSProperties}
                  className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors ${
                    isSelected ? 'bg-tint-7 text-white' : 'text-fg-tertiary hover:bg-tint-3'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-6 h-6 rounded bg-tint-4 border border-tint-8 flex items-center justify-center shrink-0">
                      <Icon name="system.command" size="sm" />
                    </div>

                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-medium truncate text-fg-primary">
                          {cmd.title}
                        </span>
                        <span className="text-2xs font-mono px-1.5 py-0.5 rounded bg-tint-6 text-fg-secondary shrink-0">
                          {cmd.category}
                        </span>
                      </div>
                      {cmd.description && (
                        <span className="text-xs text-fg-secondary truncate">
                          {cmd.description}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {cmd.shortcut && (
                      <kbd className="px-1.5 py-0.5 rounded bg-tint-10 font-mono text-2xs text-fg-tertiary border border-tint-6">
                        {formatShortcut(cmd.shortcut)}
                      </kbd>
                    )}
                    {isSelected && (
                      <Icon name="system.keyEnter" size="sm" className="hidden [@media(pointer:fine)]:block" />
                    )}
                  </div>
                </div>
              );
            }

            const item = entry.item;
            const matchedAtt = item.attachments?.find(a =>
              (a.summary && a.summary.toLowerCase().includes(query.toLowerCase())) ||
              (a.extractedText && a.extractedText.toLowerCase().includes(query.toLowerCase()))
            ) || item.attachments?.find(a => a.summary || a.extractedText);

            const snippet = item.content
              ? item.content.slice(0, 90)
              : (matchedAtt?.summary || matchedAtt?.extractedText || 'Пустая заметка');

            return (
              <div
                key={`note_${item.id}`}
                onClick={() => handleSelectItem(item)}
                onMouseEnter={() => setSelectedIndex(index)}
                style={{ '--stagger-index': Math.min(index, 6) } as React.CSSProperties}
                className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors ${
                  isSelected ? 'bg-tint-7 text-white' : 'text-fg-tertiary hover:bg-tint-3'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {item.type === 'task' && (
                    item.status === 'done' ? (
                      <Icon name="status.done" size="md" tone="success" aria-label="Таска выполнена" className="shrink-0" />
                    ) : (
                      <Icon name="status.todo" size="md" tone="muted" aria-label="Таска к выполнению" className="shrink-0" />
                    )
                  )}
                  {item.type === 'article' && (
                    <Icon name="entity.article" size="md" tone="accent" className="shrink-0" />
                  )}
                  {item.type === 'note' && (
                    <Icon name="entity.note" size="md" className="shrink-0" />
                  )}

                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-medium truncate text-fg-primary">
                        {item.title}
                      </span>
                      {matchedAtt && (matchedAtt.summary || matchedAtt.extractedText) && (
                        <span className="inline-flex items-center gap-0.5 text-2xs font-mono px-1.5 py-0.5 rounded bg-tint-6 text-fg-secondary shrink-0">
                          {matchedAtt.type === 'audio' && <Icon name="media.microphone" size="xs" tone="inherit" />}
                          {matchedAtt.type === 'image' && <Icon name="entity.image" size="xs" tone="inherit" />}
                          {matchedAtt.type === 'file' && <Icon name="action.attach" size="xs" tone="inherit" />}
                          {matchedAtt.type === 'audio' ? 'аудио' : matchedAtt.type === 'image' ? 'фото' : 'файл'}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-fg-secondary truncate">
                      {snippet}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="flex items-center gap-1 text-2xs font-mono text-fg-muted">
                    <Icon name="entity.folder" size="sm" tone="inherit" />
                    {item.folder}
                  </span>
                  {isSelected && (
                    <Icon name="system.keyEnter" size="sm" className="hidden [@media(pointer:fine)]:block" />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );

  if (!isPresent) return null;

  if (isMobile) {
    if (!isSearchOpen) return null;
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Поиск"
        className="fixed inset-0 z-50 bg-canvas flex flex-col select-none motion-fade"
      >
        {customHeader}
        {searchBody}
      </div>
    );
  }

  return (
    <BaseModal
      presence={presence}
      isOpen={isSearchOpen}
      onClose={() => setIsSearchOpen(false)}
      customHeader={customHeader}
      className="items-start md:pt-20"
      maxWidth="md:max-w-xl"
      maxHeight="h-full md:h-auto md:max-h-[70vh]"
    >
      {searchBody}
    </BaseModal>
  );
};

export const SearchModal: React.FC = () => {
  const { isSearchOpen, items } = useApp();

  // This chunk is already prefetched on idle from App; Orama itself is a second lazy chunk
  // inside searchService, and its download+eval was the first ⌘K's extra cost on top of the
  // index build. Ask for it on idle as well: never on the startup path.
  useEffect(() => {
    const preload = () => {
      void preloadSearchEngine();
    };
    if (typeof requestIdleCallback === 'function') {
      const handle = requestIdleCallback(preload, { timeout: 3000 });
      return () => cancelIdleCallback(handle);
    }
    const timer = setTimeout(preload, 1500);
    return () => clearTimeout(timer);
  }, []);

  // Lazy index: sync on open. The sync is incremental, so this stays cheap even
  // after every keystroke that changed a note — and it must start before the query
  // effect fires, otherwise the first search of a just-saved note sees a stale index.
  useEffect(() => {
    if (!isSearchOpen) return;
    void initSearchIndex(items);
  }, [items, isSearchOpen]);

  const presence = usePresence(isSearchOpen);
  const [session, setSession] = useState({ open: isSearchOpen, id: 0 });
  if (session.open !== isSearchOpen) {
    setSession({ open: isSearchOpen, id: session.id + (isSearchOpen ? 1 : 0) });
  }
  if (!presence.isPresent) return null;

  return <SearchDialog key={session.id} presence={presence} />;
};
