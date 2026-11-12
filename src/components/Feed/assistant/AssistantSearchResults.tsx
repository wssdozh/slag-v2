import React from 'react';
import {
  ChevronRight,
  Search,
  CheckSquare,
  FileText,
  ArrowUpRight,
  Filter,
} from 'lucide-react';
import { DEFAULT_INBOX_FOLDER } from '../../../config';

export interface AssistantSearchResult {
  id: string;
  title: string;
  type?: string;
  folder?: string;
  tags?: string[];
  snippet?: string;
}

interface AssistantSearchResultsProps {
  results: AssistantSearchResult[];
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onShowInFeed: () => void;
  onOpenItem: (idOrTitle: string) => void;
}

export const AssistantSearchResults: React.FC<AssistantSearchResultsProps> = ({
  results,
  isExpanded,
  onToggleExpanded,
  onShowInFeed,
  onOpenItem,
}) => {
  const count = results.length;
  const showHeader = count > 3;
  const showFilterButton = count > 1;

  return (
    <div className="max-w-[92%] w-full rounded-xl bg-surface border border-white/[0.08] overflow-hidden mt-0.5 text-xs shadow-sm">
      {/* Header trigger only when more than 3 results */}
      {showHeader && (
        <button
          onClick={onToggleExpanded}
          className="w-full flex items-center justify-between px-3 py-2 bg-white/[0.02] hover:bg-white/[0.05] transition-colors cursor-pointer text-zinc-300"
        >
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <Search className="w-3.5 h-3.5 text-zinc-400" />
            <span>Найдено {count} в хранилище</span>
          </div>
          <div className="flex items-center gap-1 text-2xs font-mono text-zinc-500">
            <ChevronRight className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
          </div>
        </button>
      )}

      {/* Items list: always rendered when count <= 3, or when isExpanded */}
      <div
        className="motion-accordion w-full"
        data-expanded={!showHeader || isExpanded}
        aria-hidden={showHeader && !isExpanded}
      >
        <div className={`motion-accordion-inner flex flex-col divide-y divide-white/[0.04] ${showHeader ? 'border-t border-white/[0.06]' : ''}`}>
          {results.map((res, rIdx) => (
            <button
              key={res.id || rIdx}
              onClick={() => onOpenItem(res.id || res.title)}
              className="flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-white/[0.04] transition-colors cursor-pointer group"
              title={`Перейти к «${res.title}» (${res.folder || DEFAULT_INBOX_FOLDER})`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {res.type === 'task' ? (
                  <CheckSquare className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                )}
                <span className="text-zinc-200 group-hover:text-white truncate font-medium text-xs">
                  {res.title}
                </span>
                {res.folder && (
                  <span className="text-2xs font-mono text-zinc-500 shrink-0 truncate max-w-[120px]">
                    {res.folder}
                  </span>
                )}
              </div>
              <ArrowUpRight className="w-3 h-3 text-zinc-500 group-hover:text-zinc-300 shrink-0 transition-colors" />
            </button>
          ))}

          {/* Button to show in feed (only if more than 1 result) */}
          {showFilterButton && (
            <button
              onClick={onShowInFeed}
              className="flex items-center justify-between px-3 py-2 bg-white/[0.02] hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer text-xs font-medium"
              title="Отобразить только эти найденные записи в центральной ленте"
            >
              <div className="flex items-center gap-1.5">
                <Filter className="w-3 h-3 text-zinc-400" />
                <span>Показать {count} в ленте</span>
              </div>
              <ArrowUpRight className="w-3 h-3 text-zinc-500" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
