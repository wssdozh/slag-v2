// The ⌘K palette as a still: one query, three hits, the filter strip and the footer counter.
// The frame and rows are `SearchModal` + `BaseModal` markup; the dialog is absolute instead of
// fixed, because the landing block owns a 960×600 box and must not paint over the page.
import React from 'react';
import { Icon } from '../UI/icons/Icon';

interface PaletteHit {
  key: string;
  kind: 'task' | 'article' | 'note';
  title: string;
  snippet: string;
  folder: string;
  isSelected?: boolean;
  isMatched?: boolean;
  isDone?: boolean;
}

const HITS: PaletteHit[] = [
  {
    key: 'service',
    kind: 'task',
    title: 'Сервис: позвонить',
    snippet: 'позвонить в сервис завтра в 15:00',
    folder: 'Карьера',
    isSelected: true,
    isMatched: true,
    isDone: true,
  },
  {
    key: 'repair',
    kind: 'task',
    title: 'Смета на ремонт',
    snippet: 'Собрать три сметы и сравнить по материалам',
    folder: 'Проекты',
  },
  {
    key: 'week',
    kind: 'article',
    title: 'План на неделю',
    snippet: 'Разобрать входящие, закрыть хвосты по дому',
    folder: 'Личное',
  },
];

const HIT_ICON: Record<PaletteHit['kind'], React.ReactNode> = {
  task: <Icon name="status.todo" size="md" tone="muted" aria-label="Таска к выполнению" className="shrink-0" />,
  article: <Icon name="entity.article" size="md" tone="accent" className="shrink-0" />,
  note: <Icon name="entity.note" size="md" className="shrink-0" />,
};

/**
 * The palette is the tile: the modal sheet plus a 24px edge, no full-page scrim. The 576px width
 * is the palette's own (BaseModal `max-w-xl`), so the block cannot leave a dark empty half.
 */
export const PaletteFragment: React.FC = () => (
  <div
    data-landing-canvas="palette"
    className="overflow-hidden bg-canvas font-sans antialiased leading-normal text-fg-primary select-none p-6"
    style={{ width: 624 }}
  >
    <div className="w-full md:max-w-xl h-auto rounded-2xl bg-surface border border-tint-8 shadow-2xl flex flex-col overflow-hidden">
      {/* Header: the query field, the clear button and the Escape hint. */}
      <div className="rounded-t-[15px] overflow-hidden shrink-0">
        <div
          className="flex items-center gap-2.5 px-4 py-3.5 border-b border-tint-6 bg-panel rounded-t-[15px]"
          style={{ paddingTop: 'max(var(--sat), 0.875rem)' }}
        >
          <Icon name="action.search" size="md" className="shrink-0 hidden md:block" />

            <div
              role="textbox"
              aria-label="Поиск по заметкам"
              className="flex-1 min-w-0 bg-transparent text-base md:text-sm text-white border-none"
            >
              <span data-beat="query">звон</span>
            </div>

            <button
              type="button"
              title="Очистить запрос"
              aria-label="Очистить запрос"
              className="p-1.5 rounded text-fg-muted hover:text-fg-tertiary cursor-pointer"
            >
              <Icon name="action.close" size="md" tone="inherit" />
            </button>

            <span className="hidden md:inline-block text-3xs font-mono text-fg-muted px-1.5 py-0.5 rounded border border-tint-6">
              ESC
            </span>
          </div>
        </div>

        {/* Body: the filter strip and the hits. */}
        <div className="flex-1 overflow-y-auto min-h-0">
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
            ).map(filter => (
              <button
                key={filter.id}
                type="button"
                className={`px-2 py-0.5 rounded transition-colors cursor-pointer shrink-0 ${
                  filter.id === 'all'
                    ? 'bg-tint-10 text-white font-medium'
                    : 'text-fg-muted hover:text-fg-tertiary'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5 motion-stagger">
            {HITS.map(hit => (
              <div
                key={hit.key}
                data-beat="hit"
                className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors ${
                  hit.isSelected ? 'bg-tint-7 text-white' : 'text-fg-tertiary hover:bg-tint-3'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {hit.isDone ? (
                    <Icon
                      name="status.done"
                      size="md"
                      tone="success"
                      aria-label="Таска выполнена"
                      className="shrink-0"
                    />
                  ) : (
                    HIT_ICON[hit.kind]
                  )}

                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        data-beat={hit.isMatched ? 'hit-match' : undefined}
                        className="text-xs font-medium truncate text-fg-primary"
                      >
                        {hit.title}
                      </span>
                    </div>
                    <span className="text-xs text-fg-secondary truncate">{hit.snippet}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="flex items-center gap-1 text-2xs font-mono text-fg-muted">
                    <Icon name="entity.folder" size="xs" tone="inherit" />
                    {hit.folder}
                  </span>
                  {hit.isSelected && (
                    <Icon
                      name="system.keyEnter"
                      size="xs"
                      className="hidden [@media(pointer:fine)]:block"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer: keyboard hints and the result counter, the way the palette closes a query. */}
        <div className="px-4 md:px-5 py-3 border-t border-tint-6 bg-panel shrink-0 rounded-b-[15px]">
          <div className="flex items-center justify-between text-2xs text-fg-muted font-mono">
            <div className="flex items-center gap-3">
              <span>↑↓ Навигация</span>
              <span>↵ Выбрать</span>
              <span>esc Закрыть</span>
            </div>
            <div className="flex items-center gap-2">
              <span data-beat="count">3 результата</span>
              <span className="text-fg-dim">·</span>
              <span>Orama Hybrid Engine</span>
            </div>
          </div>
        </div>
      </div>
    </div>
);
