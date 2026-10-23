import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import type { SlagItem } from '../../types';
import { querySearch, initSearchIndex } from '../../lib/searchService';
import {
  Search,
  X,
  FileText,
  CheckSquare,
  StickyNote,
  CornerDownLeft,
  Folder,
  ArrowLeft
} from 'lucide-react';

const SearchDialog: React.FC = () => {
  const {
    setIsSearchOpen,
    items,
    setCurrentFolder,
    setSelectedItem,
    setIsFullscreenEditorOpen
  } = useApp();

  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [results, setResults] = useState<SlagItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let isCancelled = false;
    querySearch(query, items, filterType).then(res => {
      if (!isCancelled) {
        setResults(res);
        setSelectedIndex(0);
      }
    });
    return () => {
      isCancelled = true;
    };
  }, [query, filterType, items]);

  const handleSelectItem = (item: SlagItem) => {
    setCurrentFolder(item.folder);
    setSelectedItem(item);
    if (item.type === 'article') {
      setIsFullscreenEditorOpen(true);
    }
    setIsSearchOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        handleSelectItem(results[selectedIndex]);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 z-[100] flex items-start justify-center md:pt-20 p-0 md:p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-100">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full h-full md:h-auto md:max-w-xl rounded-none md:rounded-2xl bg-[#141416] border-0 md:border md:border-white/[0.08] shadow-2xl flex flex-col overflow-hidden md:max-h-[70vh] animate-in zoom-in-95 duration-100"
      >
        {/* Search Input Bar */}
        <div
          className="flex items-center gap-2.5 px-4 py-3.5 border-b border-white/[0.06] bg-[#0c0c0e]"
          style={{ paddingTop: 'max(var(--sat), 0.875rem)' }}
        >
          <button
            onClick={() => setIsSearchOpen(false)}
            className="md:hidden p-1 -ml-1 text-zinc-400 hover:text-white"
            title="Назад"
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
            placeholder="Поиск по заметкам, тегам, таскам и статьям..."
            className="flex-1 bg-transparent text-base md:text-sm text-white placeholder-zinc-500 border-none focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1.5 rounded text-zinc-500 hover:text-zinc-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <span className="hidden md:inline-block text-[10px] font-mono text-zinc-500 px-1.5 py-0.5 rounded border border-white/[0.06]">
            ESC
          </span>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-white/[0.04] bg-[#0f0f11] text-[11px]">
          <span className="text-zinc-500 mr-1">Фильтр:</span>
          {(['all', 'note', 'task', 'article'] as const).map(t => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-2 py-0.5 rounded transition-colors ${
                filterType === t
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t === 'all' ? 'Все' : t === 'note' ? 'Заметки' : t === 'task' ? 'Таски' : 'Статьи'}
            </button>
          ))}
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5">
          {results.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-500">
              Ничего не найдено по запросу «{query}»
            </div>
          ) : (
            results.map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => handleSelectItem(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors ${
                    isSelected ? 'bg-white/[0.07] text-white' : 'text-zinc-300 hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {item.type === 'task' && (
                      <CheckSquare className="w-4 h-4 text-amber-400 shrink-0" />
                    )}
                    {item.type === 'article' && (
                      <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                    )}
                    {item.type === 'note' && (
                      <StickyNote className="w-4 h-4 text-zinc-400 shrink-0" />
                    )}

                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-xs font-medium truncate text-zinc-100">
                        {item.title}
                      </span>
                      <span className="text-[11px] text-zinc-500 truncate">
                        {item.content ? item.content.slice(0, 80) : 'Пустая заметка'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="flex items-center gap-1 text-[10px] font-mono text-zinc-500">
                      <Folder className="w-3 h-3" />
                      {item.folder}
                    </span>
                    {isSelected && (
                      <CornerDownLeft className="w-3 h-3 text-zinc-400" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts info */}
        <div className="px-4 py-2 border-t border-white/[0.04] bg-[#0c0c0e] flex items-center justify-between text-[11px] text-zinc-500">
          <div className="flex items-center gap-3">
            <span>↑↓ Навигация</span>
            <span>↵ Открыть</span>
            <span>esc Закрыть</span>
          </div>
          <span>Orama Hybrid Engine</span>
        </div>
      </div>
    </div>
  );
};

export const SearchModal: React.FC = () => {
  const { isSearchOpen, items } = useApp();

  // Initialize / re-index Orama when items change
  useEffect(() => {
    initSearchIndex(items);
  }, [items]);

  if (!isSearchOpen) return null;

  return <SearchDialog />;
};
