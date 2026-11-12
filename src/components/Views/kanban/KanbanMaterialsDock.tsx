import React, { useState, useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import type { SlagItem } from '../../../types';
import { querySearch } from '../../../lib/searchService';
import { BookOpen, ChevronLeft, FileText, Search, StickyNote, X } from 'lucide-react';
import { TagChip } from '../../UI/TagChip';
import type { DragItemPayload } from '../../../hooks/gestures/usePointerDnd';

export interface KanbanMaterialsDockProps {
  /** Notes and articles of the current folder, the dock searches inside them. */
  materials: SlagItem[];
  /** Id of the item currently being dragged, null when nothing moves. */
  draggingItemId: string | null;
  onItemPointerDown: (e: React.PointerEvent, payload: DragItemPayload) => void;
}

/**
 * TRIZ Materials dock: slide-over drawer with a scrim on mobile, inline dock on
 * desktop. Kept mounted on purpose — the drawer slides for 200ms, and a scrim
 * that unmounts on the first frame of that slide leaves the board undimmed.
 */
export const KanbanMaterialsDock: React.FC<KanbanMaterialsDockProps> = ({
  materials,
  draggingItemId,
  onItemPointerDown,
}) => {
  const {
    isKanbanMaterialsOpen,
    setIsKanbanMaterialsOpen,
    isMobile,
    setSelectedItem,
    setIsFullscreenEditorOpen,
    setActiveTagFilter,
    activeTagFilter,
  } = useApp();

  const [materialsSearchQuery, setMaterialsSearchQuery] = useState('');
  const [searchedMaterials, setSearchedMaterials] = useState<SlagItem[]>([]);

  useEffect(() => {
    if (!materialsSearchQuery.trim()) return;

    let isMounted = true;
    querySearch(materialsSearchQuery, materials).then(results => {
      if (isMounted) {
        setSearchedMaterials(results);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [materialsSearchQuery, materials]);

  const filteredMaterials = materialsSearchQuery.trim() ? searchedMaterials : materials;

  return (
    <>
      {/* On mobile: backdrop overlay when materials drawer is open */}
      {isMobile && (
        <div
          onClick={() => setIsKanbanMaterialsOpen(false)}
          aria-hidden={!isKanbanMaterialsOpen}
          className={`absolute inset-0 bg-black/70 z-30 transition-opacity duration-200 ${
            isKanbanMaterialsOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        />
      )}

      {/* TRIZ Dock: Slide-over drawer on mobile, inline dock on desktop */}
      <div
        className={`${
          isMobile
            ? `absolute inset-y-0 left-0 z-40 w-72 bg-panel shadow-2xl border-r border-white/[0.08] transition-transform duration-200 ${
                isKanbanMaterialsOpen ? 'translate-x-0' : '-translate-x-full'
              }`
            : `bg-panel/95 flex flex-col shrink-0 overflow-hidden transition-[width] duration-200 ease-out ${
                isKanbanMaterialsOpen ? 'w-60 sm:w-64 border-r border-white/[0.06]' : 'w-0 border-r-0'
              }`
        }`}
      >
        <div className="w-60 sm:w-64 flex flex-col h-full shrink-0">
          {/* TRIZ Dock Header */}
          <div className="h-10 px-2.5 border-b border-white/[0.06] flex items-center justify-between text-xs font-semibold text-zinc-300 shrink-0">
            <div className="flex items-center gap-1.5 truncate">
              <BookOpen className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <span className="truncate">Материалы папки</span>
              <span className="text-2xs font-mono text-zinc-500">
                ({materialsSearchQuery ? filteredMaterials.length : materials.length})
              </span>
            </div>
            <button
              onClick={() => setIsKanbanMaterialsOpen(false)}
              className="p-1 rounded hover:bg-white/[0.06] text-zinc-400 hover:text-white transition-colors cursor-pointer"
              title="Свернуть док материалов"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* TRIZ Dock Content */}
          <div className="relative px-3 py-1.5 border-b border-white/[0.04] shrink-0">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={materialsSearchQuery}
              onChange={e => setMaterialsSearchQuery(e.target.value)}
              placeholder="Поиск по материалам..."
              className="w-full bg-surface border border-white/[0.06] rounded-md pl-8 pr-7 py-1 text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-white/20 transition-colors ring-0"
            />
            {materialsSearchQuery && (
              <button
                onClick={() => setMaterialsSearchQuery('')}
                className="absolute right-5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2.5 space-y-2 scrollbar-thin">
            {filteredMaterials.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-600 px-2">
                {materialsSearchQuery
                  ? 'Ничего не найдено'
                  : 'В этой папке нет заметок или статей. Все материалы будут отображаться здесь.'}
              </div>
            ) : (
              filteredMaterials.map(mat => (
                <div
                  key={mat.id}
                  data-flip-id={mat.id}
                  data-draggable="true"
                  onPointerDown={e =>
                    onItemPointerDown(e, {
                      type: 'material',
                      id: mat.id,
                      title: mat.title || 'Материал',
                    })
                  }
                  onClick={() => {
                    setSelectedItem(mat);
                    setIsFullscreenEditorOpen(true);
                  }}
                  className={`group p-2.5 rounded-lg bg-surface/80 hover:bg-surface-elevated border border-white/[0.05] hover:border-white/[0.12] transition-colors text-left space-y-1.5 shadow-sm touch-none ${
                    draggingItemId === mat.id
                      ? 'opacity-40 scale-[0.98] ring-1 ring-blue-500/50'
                      : 'cursor-grab active:cursor-grabbing'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {mat.type === 'article' ? (
                        <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      ) : (
                        <StickyNote className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      )}
                      <span className="text-sm font-medium text-zinc-200 truncate">
                        {mat.title || 'Без названия'}
                      </span>
                    </div>
                  </div>

                  {mat.content && (
                    <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                      {mat.content.slice(0, 100)}
                    </p>
                  )}

                  {/* Tags */}
                  {mat.tags && mat.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 items-center pt-0.5">
                      {mat.tags.map(tag => (
                        <TagChip
                          key={tag}
                          tag={tag}
                          variant="flat"
                          onClick={() => setActiveTagFilter(activeTagFilter === tag ? null : tag)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
};
