import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import type { SlagItem } from '../../types';
import { querySearch, initSearchIndex } from '../../lib/searchService';
import {
  formatShortcut,
  APP_COMMANDS,
  type AppCommand,
  type AppCommandContext,
} from '../../lib/commands';
import {
  Search,
  X,
  FileText,
  Circle,
  CheckCircle2,
  StickyNote,
  CornerDownLeft,
  Folder,
  ArrowLeft,
  Mic,
  Image as ImageIcon,
  Paperclip,
  Command,
} from 'lucide-react';
import { BaseModal } from '../Modals/BaseModal';

type SearchFilterType = 'all' | 'commands' | 'note' | 'task' | 'article';

type CombinedItem =
  | { kind: 'command'; command: AppCommand }
  | { kind: 'note'; item: SlagItem };

const SearchDialog: React.FC = () => {
  const {
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

  const commandContext: AppCommandContext = useMemo(
    () => ({
      openSearch: () => setIsSearchOpen(true),
      toggleAssistant,
      toggleLogs: () => setIsLogViewerOpen(!isLogViewerOpen),
      openComposer: (options) => openComposerModal(options),
      openSettings: (tab) => openSettingsModal(tab),
      dismissTopLayer,
    }),
    [toggleAssistant, isLogViewerOpen, setIsLogViewerOpen, openComposerModal, openSettingsModal, dismissTopLayer, setIsSearchOpen]
  );

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

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
    if (isExplicitCommandMode) {
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
  }, [query, filterType, items, isExplicitCommandMode]);

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
      className="flex items-center gap-2.5 px-4 py-3.5 border-b border-white/[0.06] bg-panel rounded-t-[15px]"
      style={{ paddingTop: 'max(var(--sat), 0.875rem)' }}
    >
      <button
        type="button"
        onClick={() => setIsSearchOpen(false)}
        className="md:hidden w-10 h-10 -ml-2 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white active:scale-95 transition-all cursor-pointer shrink-0"
        title="Назад"
        aria-label="Закрыть поиск"
      >
        <ArrowLeft className="w-5 h-5" />
      </button>
      <Search className="w-4 h-4 text-zinc-400 shrink-0 hidden md:block" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Поиск по заметкам"
        enterKeyHint="search"
        className="flex-1 bg-transparent text-base md:text-sm text-white placeholder-zinc-500 border-none focus:outline-none"
      />
      {query && (
        <button
          type="button"
          onClick={() => setQuery('')}
          className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      )}
      <span className="hidden md:inline-block text-[10px] font-mono text-zinc-500 px-1.5 py-0.5 rounded border border-white/[0.06]">
        ESC
      </span>
    </div>
  );

  const footer = (
    <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono">
      <div className="flex items-center gap-3">
        <span>↑↓ Навигация</span>
        <span>↵ Выбрать</span>
        <span>esc Закрыть</span>
      </div>
      <span>Orama Hybrid Engine</span>
    </div>
  );

  const searchBody = (
    <>
      {/* Filter Pills */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-white/[0.04] bg-panel text-[11px] shrink-0 overflow-x-auto">
        <span className="text-zinc-500 mr-1 shrink-0">Фильтр:</span>
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
                ? 'bg-white/10 text-white font-medium'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Results List */}
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5">
        {combinedItems.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-500">
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
                  className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors ${
                    isSelected ? 'bg-white/[0.07] text-white' : 'text-zinc-300 hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-6 h-6 rounded bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
                      <Command className="w-3.5 h-3.5 text-purple-400" />
                    </div>

                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-medium truncate text-zinc-100">
                          {cmd.title}
                        </span>
                        <span className="text-2xs font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-400 shrink-0">
                          {cmd.category}
                        </span>
                      </div>
                      {cmd.description && (
                        <span className="text-xs text-zinc-400 truncate">
                          {cmd.description}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {cmd.shortcut && (
                      <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-2xs text-zinc-300 border border-white/[0.06]">
                        {formatShortcut(cmd.shortcut)}
                      </kbd>
                    )}
                    {isSelected && (
                      <CornerDownLeft className="w-3 h-3 text-zinc-400 hidden [@media(pointer:fine)]:block" />
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
                className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors ${
                  isSelected ? 'bg-white/[0.07] text-white' : 'text-zinc-300 hover:bg-white/[0.03]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {item.type === 'task' && (
                    item.status === 'done' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-label="Таска выполнена" />
                    ) : (
                      <Circle className="w-4 h-4 text-zinc-500 shrink-0" aria-label="Таска к выполнению" />
                    )
                  )}
                  {item.type === 'article' && (
                    <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                  )}
                  {item.type === 'note' && (
                    <StickyNote className="w-4 h-4 text-zinc-400 shrink-0" />
                  )}

                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-medium truncate text-zinc-100">
                        {item.title}
                      </span>
                      {matchedAtt && (matchedAtt.summary || matchedAtt.extractedText) && (
                        <span className="inline-flex items-center gap-0.5 text-2xs font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-400 shrink-0">
                          {matchedAtt.type === 'audio' && <Mic className="w-2.5 h-2.5" />}
                          {matchedAtt.type === 'image' && <ImageIcon className="w-2.5 h-2.5" />}
                          {matchedAtt.type === 'file' && <Paperclip className="w-2.5 h-2.5" />}
                          {matchedAtt.type === 'audio' ? 'аудио' : matchedAtt.type === 'image' ? 'фото' : 'файл'}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-zinc-400 truncate">
                      {snippet}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="flex items-center gap-1 text-2xs font-mono text-zinc-500">
                    <Folder className="w-3 h-3" />
                    {item.folder}
                  </span>
                  {isSelected && (
                    <CornerDownLeft className="w-3 h-3 text-zinc-400 hidden [@media(pointer:fine)]:block" />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );

  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50 bg-canvas flex flex-col select-none animate-in fade-in duration-150">
        {customHeader}
        {searchBody}
      </div>
    );
  }

  return (
    <BaseModal
      isOpen={true}
      onClose={() => setIsSearchOpen(false)}
      customHeader={customHeader}
      footer={footer}
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

  // Lazy index: initialize / re-index Orama only when the search modal is opened,
  // preventing constant indexing churn during rapid note writing or background operations.
  useEffect(() => {
    if (!isSearchOpen) return;
    const timer = setTimeout(() => {
      initSearchIndex(items);
    }, 200);
    return () => clearTimeout(timer);
  }, [items, isSearchOpen]);

  if (!isSearchOpen) return null;

  return <SearchDialog />;
};
