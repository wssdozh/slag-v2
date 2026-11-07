import React, { useState, useEffect, useRef, useMemo } from 'react';
import { logger } from '../../lib/logger';
import { openAppFolder } from '../../lib/folderOpener';
import type { LogEntry, LogLevel, LogScope } from '../../types';
import { useApp } from '../../context/AppContext';
import {
  Terminal,
  Search,
  X,
  Copy,
  Download,
  Trash2,
  ChevronRight,
  ArrowDown,
  FolderOpen,
  FileText
} from 'lucide-react';

interface LogViewerProps {
  variant?: 'dock' | 'modal';
  onClose?: () => void;
}

const LEVEL_COLORS: Record<LogLevel, { text: string; labelColor: string }> = {
  trace: { text: 'text-fg-muted', labelColor: 'text-fg-dim' },
  debug: { text: 'text-fg-secondary', labelColor: 'text-fg-muted' },
  info: { text: 'text-fg-primary', labelColor: 'text-fg-muted' },
  warn: { text: 'text-warning', labelColor: 'text-warning' },
  error: { text: 'text-danger', labelColor: 'text-danger' },
};

const ALL_SCOPES: LogScope[] = ['AI', 'FS', 'SEARCH', 'UI', 'APP', 'SYNC', 'MEDIA', 'WORKSPACE'];
const ALL_LEVELS: LogLevel[] = ['error', 'warn', 'info', 'debug'];

export const LogViewer: React.FC<LogViewerProps> = ({ variant = 'dock', onClose }) => {
  const { addToast } = useApp();
  const [entries, setEntries] = useState<LogEntry[]>(() => logger.getEntries());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedScope, setSelectedScope] = useState<LogScope | 'ALL'>('ALL');
  const [selectedLevel, setSelectedLevel] = useState<LogLevel | 'ALL'>('ALL');
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Subscribe to live logs
  useEffect(() => {
    const unsubscribe = logger.subscribe(() => {
      setEntries(logger.getEntries());
    });
    return () => unsubscribe();
  }, []);

  // Auto-scroll when new items arrive
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [entries, autoScroll]);

  // Handle user manual scroll: disable auto-scroll if scrolled up
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
    if (!isAtBottom && autoScroll) {
      setAutoScroll(false);
    } else if (isAtBottom && !autoScroll) {
      setAutoScroll(true);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const counts = useMemo(() => {
    let errors = 0;
    let warns = 0;
    let infos = 0;
    for (const e of entries) {
      if (e.level === 'error') errors++;
      else if (e.level === 'warn') warns++;
      else if (e.level === 'info') infos++;
    }
    return { total: entries.length, errors, warns, infos };
  }, [entries]);

  const storageHealth = logger.getStorageHealth();

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return entries.filter(e => {
      if (selectedScope !== 'ALL' && e.scope !== selectedScope) return false;
      if (selectedLevel !== 'ALL' && e.level !== selectedLevel) return false;
      if (!q) return true;

      const inMessage = e.message.toLowerCase().includes(q);
      const inScope = e.scope.toLowerCase().includes(q);
      const inData = e.data ? JSON.stringify(e.data).toLowerCase().includes(q) : false;
      return inMessage || inScope || inData;
    });
  }, [entries, selectedScope, selectedLevel, searchQuery]);

  const handleCopyReport = async () => {
    try {
      const report = logger.exportAsMarkdown();
      await navigator.clipboard.writeText(report);
      addToast('Отчёт скопирован в буфер (Markdown)', 'success');
    } catch {
      addToast('Не удалось скопировать отчёт', 'error');
    }
  };

  const handleDownloadLog = (format: 'log' | 'json' | 'markdown' = 'log') => {
    try {
      const filename = logger.downloadLog(format);
      if (filename) {
        addToast(`Файл логов скачан: ${filename}`, 'success');
      }
    } catch {
      addToast('Ошибка скачивания лога', 'error');
    }
  };

  const handleOpenFolder = async () => {
    try {
      const res = await openAppFolder('logs');
      addToast(res.message, res.success ? 'success' : 'info');
    } catch {
      addToast('Не удалось открыть папку логов', 'error');
    }
  };

  const handleClear = () => {
    logger.clear();
    setEntries([]);
    setExpandedIds(new Set());
    addToast('Логи очищены', 'info');
  };

  const handleCopyItem = async (entry: LogEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const text = `[${new Date(entry.timestamp).toISOString()}] [${entry.scope}] [${entry.level.toUpperCase()}] ${entry.message}${entry.data ? '\n' + JSON.stringify(entry.data, null, 2) : ''}`;
      await navigator.clipboard.writeText(text);
      addToast('Строка лога скопирована в буфер', 'success');
    } catch {
      addToast('Не удалось скопировать строку лога', 'error');
    }
  };

  return (
    <div
      data-testid="log-viewer"
      className={`flex flex-col h-full w-full bg-surface text-fg-primary select-text font-sans ${
        variant === 'modal' ? 'rounded-2xl shadow-2xl overflow-hidden' : ''
      }`}
    >
      {/* Flat Unified Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2 border-b border-border-subtle shrink-0 select-none">
        {/* Title and stats */}
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-fg-muted" />
          <span className="text-xs font-medium text-fg-primary">Логи & HUD</span>
          <span className="text-[11px] font-mono text-fg-muted">
            {counts.total}
            {counts.errors > 0 && <span className="text-danger ml-1">· {counts.errors}e</span>}
            {counts.warns > 0 && <span className="text-warning ml-1">· {counts.warns}w</span>}
          </span>
          <span
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
              storageHealth.isNearQuota
                ? 'text-danger'
                : 'text-fg-muted'
            }`}
            title={`Использование localStorage: ${storageHealth.usedKb} KB (${storageHealth.totalKeys} ключей)`}
          >
            {storageHealth.usedKb} KB
          </span>
        </div>

        {/* Flat Minimal Search Input */}
        <div className="flex-1 max-w-xs min-w-[140px] relative">
          <Search className="w-3 h-3 text-fg-dim absolute left-2 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по логам..."
            className="w-full text-xs text-fg-primary bg-surface-hover pl-7 pr-6 py-1 rounded-md border border-transparent focus:border-border-hover outline-none ring-0 transition-colors placeholder-fg-dim"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-dim hover:text-fg-secondary"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Flat Minimal Actions */}
        <div className="flex items-center gap-1 text-xs">
          <button
            onClick={() => setAutoScroll(prev => !prev)}
            title={autoScroll ? 'Автопрокрутка включена' : 'Автопрокрутка выключена'}
            className={`flex items-center gap-1 px-1.5 py-1 rounded transition-colors ${
              autoScroll ? 'text-fg-primary bg-surface-active' : 'text-fg-muted hover:text-fg-primary'
            }`}
          >
            <ArrowDown className={`w-3 h-3 ${autoScroll ? 'text-fg-primary' : 'text-fg-dim'}`} />
            <span className="text-[11px]">Авто</span>
          </button>

          <button
            onClick={handleCopyReport}
            title="Копировать отчёт для баг-репорта (Markdown)"
            className="flex items-center gap-1 px-1.5 py-1 text-fg-secondary hover:text-fg-primary hover:bg-surface-hover rounded transition-colors"
          >
            <Copy className="w-3 h-3" />
            <span className="text-[11px] hidden sm:inline">Отчёт</span>
          </button>

          <button
            onClick={() => handleDownloadLog('log')}
            title="Скачать структурированный лог (.log)"
            data-testid="log-download-plain"
            className="flex items-center gap-1 px-1.5 py-1 text-fg-secondary hover:text-fg-primary hover:bg-surface-hover rounded transition-colors"
          >
            <FileText className="w-3 h-3" />
            <span className="text-[11px] hidden sm:inline">.log</span>
          </button>

          <button
            onClick={() => handleDownloadLog('json')}
            title="Скачать машинный массив (.json)"
            data-testid="log-download-json"
            className="flex items-center gap-1 px-1.5 py-1 text-fg-secondary hover:text-fg-primary hover:bg-surface-hover rounded transition-colors"
          >
            <Download className="w-3 h-3" />
            <span className="text-[11px] hidden sm:inline">JSON</span>
          </button>

          <button
            onClick={handleOpenFolder}
            title="Открыть папку с логами"
            data-testid="log-open-folder"
            className="flex items-center gap-1 px-1.5 py-1 text-fg-secondary hover:text-fg-primary hover:bg-surface-hover rounded transition-colors"
          >
            <FolderOpen className="w-3 h-3" />
            <span className="text-[11px] hidden sm:inline">Папка</span>
          </button>

          <button
            onClick={handleClear}
            title="Очистить буфер"
            className="p-1 text-fg-muted hover:text-fg-primary hover:bg-surface-hover rounded transition-colors"
          >
            <Trash2 className="w-3 h-3" />
          </button>

          {onClose && (
            <button
              onClick={onClose}
              title="Закрыть"
              className="p-1 text-fg-muted hover:text-fg-primary hover:bg-surface-hover rounded transition-colors ml-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Flat Single-line Filters (No Chips-on-Chips, pure text buttons) */}
      <div className="flex flex-wrap items-center gap-1 px-3 py-1 text-[11px] font-mono shrink-0 select-none">
        <span className="text-fg-dim text-[10px] mr-1">LEVEL:</span>
        <button
          onClick={() => setSelectedLevel('ALL')}
          className={`px-1.5 py-0.5 rounded transition-colors ${
            selectedLevel === 'ALL'
              ? 'text-fg-primary bg-surface-active font-medium'
              : 'text-fg-muted hover:text-fg-primary'
          }`}
        >
          ALL
        </button>
        {ALL_LEVELS.map(lvl => (
          <button
            key={lvl}
            onClick={() => setSelectedLevel(lvl)}
            className={`px-1.5 py-0.5 rounded uppercase transition-colors ${
              selectedLevel === lvl
                ? 'text-fg-primary bg-surface-active font-medium'
                : 'text-fg-muted hover:text-fg-primary'
            }`}
          >
            {lvl}
          </button>
        ))}

        <div className="w-px h-2.5 bg-border-subtle mx-1.5" />

        <span className="text-fg-dim text-[10px] mr-1">SCOPE:</span>
        <button
          onClick={() => setSelectedScope('ALL')}
          className={`px-1.5 py-0.5 rounded transition-colors ${
            selectedScope === 'ALL'
              ? 'text-fg-primary bg-surface-active font-medium'
              : 'text-fg-muted hover:text-fg-primary'
          }`}
        >
          ALL
        </button>
        {ALL_SCOPES.map(sc => (
          <button
            key={sc}
            onClick={() => setSelectedScope(sc)}
            className={`px-1.5 py-0.5 rounded transition-colors ${
              selectedScope === sc
                ? 'text-fg-primary bg-surface-active font-medium'
                : 'text-fg-muted hover:text-fg-primary'
            }`}
          >
            {sc}
          </button>
        ))}
      </div>

      {/* Flat Log Entries Stream */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-0.5 font-mono text-[11px] leading-relaxed"
      >
        {filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-44 text-fg-dim text-xs">
            <Terminal className="w-6 h-6 stroke-1 text-fg-dim mb-1.5" />
            <p>Логов нет или фильтр пуст</p>
          </div>
        ) : (
          filteredEntries.map(entry => {
            const isExpanded = expandedIds.has(entry.id);
            const hasData = entry.data !== undefined;
            const timeStr = new Date(entry.timestamp).toLocaleTimeString('ru-RU', {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              fractionalSecondDigits: 3,
            });

            const levelCfg = LEVEL_COLORS[entry.level];

            return (
              <div
                key={entry.id}
                onClick={() => hasData && toggleExpand(entry.id)}
                className={`group flex flex-col px-2 py-1 rounded transition-colors hover:bg-surface-hover ${
                  hasData ? 'cursor-pointer' : ''
                }`}
              >
                <div className="flex flex-wrap sm:flex-nowrap items-baseline gap-x-2 gap-y-0.5">
                  {/* Timestamp */}
                  <span className="text-fg-dim shrink-0 text-[10px]">
                    {timeStr}
                  </span>

                  {/* Level Text (flat, no glowing box) */}
                  <span className={`w-9 shrink-0 text-[10px] uppercase font-semibold ${levelCfg.labelColor}`}>
                    {entry.level}
                  </span>

                  {/* Scope */}
                  <span className="w-14 shrink-0 text-[10px] uppercase font-medium text-fg-secondary">
                    [{entry.scope}]
                  </span>

                  {/* Message (clean typography) */}
                  <span className={`order-last sm:order-none w-full sm:w-auto sm:flex-1 min-w-0 break-words ${levelCfg.text}`}>
                    {entry.message}
                  </span>

                  {/* Duration if available */}
                  {entry.durationMs !== undefined && (
                    <span className="text-fg-dim text-[10px] shrink-0">
                      +{Math.round(entry.durationMs)}ms
                    </span>
                  )}

                  {/* Hover Actions */}
                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0 transition-opacity">
                    <button
                      onClick={(e) => handleCopyItem(entry, e)}
                      title="Копировать строку"
                      className="text-fg-muted hover:text-fg-primary p-0.5"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    {hasData && (
                      <span className="text-fg-muted p-0.5">
                        <ChevronRight className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? 'rotate-90 text-fg-primary' : ''}`} />
                      </span>
                    )}
                  </div>
                </div>

                {/* Expanded Payload Data (flat subtle pre) */}
                {hasData && (
                  <div
                    className="motion-accordion"
                    data-expanded={isExpanded}
                    aria-hidden={!isExpanded}
                  >
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="motion-accordion-inner mt-1.5 px-2 overflow-x-auto text-[10px] text-fg-secondary"
                    >
                      <pre className="whitespace-pre-wrap font-mono">
                        {JSON.stringify(entry.data, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};
