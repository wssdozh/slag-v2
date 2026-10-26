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
  ChevronDown,
  ChevronRight,
  Check,
  ArrowDown,
  FolderOpen,
  FileText
} from 'lucide-react';

interface LogViewerProps {
  variant?: 'dock' | 'modal';
  onClose?: () => void;
}

// Flat, muted text colors without heavy background fills or thick borders
const SCOPE_COLORS: Record<LogScope, string> = {
  AI: 'text-indigo-400/90',
  FS: 'text-emerald-400/90',
  SEARCH: 'text-amber-400/90',
  UI: 'text-zinc-400',
  APP: 'text-purple-400/90',
  SYNC: 'text-cyan-400/90',
  MEDIA: 'text-pink-400/90',
  WORKSPACE: 'text-sky-400/90',
};

const LEVEL_COLORS: Record<LogLevel, { text: string; labelColor: string }> = {
  trace: { text: 'text-zinc-500', labelColor: 'text-zinc-600' },
  debug: { text: 'text-zinc-400', labelColor: 'text-zinc-500' },
  info: { text: 'text-zinc-300', labelColor: 'text-zinc-500' },
  warn: { text: 'text-amber-300/90', labelColor: 'text-amber-500' },
  error: { text: 'text-rose-300/95', labelColor: 'text-rose-400' },
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
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [reportCopied, setReportCopied] = useState(false);

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
      setReportCopied(true);
      addToast('Отчёт скопирован в буфер (Markdown)', 'success');
      setTimeout(() => setReportCopied(false), 2000);
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
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div
      data-testid="log-viewer"
      className={`flex flex-col h-full w-full bg-[#0a0a0c] text-zinc-300 select-text font-sans ${
        variant === 'modal' ? 'rounded-lg border border-white/[0.08] shadow-2xl overflow-hidden' : ''
      }`}
    >
      {/* Flat Unified Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2 border-b border-white/[0.06] bg-[#0c0c0e] shrink-0 select-none">
        {/* Title and stats */}
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-zinc-500" />
          <span className="text-xs font-medium text-zinc-200">Логи & HUD</span>
          <span className="text-[11px] font-mono text-zinc-500">
            {counts.total}
            {counts.errors > 0 && <span className="text-rose-400 ml-1">· {counts.errors}e</span>}
            {counts.warns > 0 && <span className="text-amber-400 ml-1">· {counts.warns}w</span>}
          </span>
          <span
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
              storageHealth.isNearQuota
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                : 'text-zinc-500 bg-white/[0.03]'
            }`}
            title={`Использование localStorage: ${storageHealth.usedKb} KB (${storageHealth.totalKeys} ключей)`}
          >
            {storageHealth.usedKb} KB
          </span>
        </div>

        {/* Flat Minimal Search Input */}
        <div className="flex-1 max-w-xs min-w-[140px] relative">
          <Search className="w-3 h-3 text-zinc-600 absolute left-2 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по логам..."
            className="w-full bg-white/[0.03] text-xs text-zinc-200 pl-7 pr-6 py-1 rounded border border-transparent focus:border-white/10 focus:bg-white/[0.05] outline-none transition-all placeholder-zinc-600"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400"
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
              autoScroll ? 'text-zinc-200 bg-white/[0.06]' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <ArrowDown className={`w-3 h-3 ${autoScroll ? 'text-zinc-200' : 'text-zinc-600'}`} />
            <span className="text-[11px]">Авто</span>
          </button>

          <button
            onClick={handleCopyReport}
            title="Копировать отчёт для баг-репорта (Markdown)"
            className="flex items-center gap-1 px-1.5 py-1 text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] rounded transition-colors"
          >
            {reportCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span className="text-[11px] hidden sm:inline">Отчёт</span>
          </button>

          <button
            onClick={() => handleDownloadLog('log')}
            title="Скачать структурированный лог (.log)"
            data-testid="log-download-plain"
            className="flex items-center gap-1 px-1.5 py-1 text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] rounded transition-colors"
          >
            <FileText className="w-3 h-3" />
            <span className="text-[11px] hidden sm:inline">.log</span>
          </button>

          <button
            onClick={() => handleDownloadLog('json')}
            title="Скачать машинный массив (.json)"
            data-testid="log-download-json"
            className="flex items-center gap-1 px-1.5 py-1 text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] rounded transition-colors"
          >
            <Download className="w-3 h-3" />
            <span className="text-[11px] hidden sm:inline">JSON</span>
          </button>

          <button
            onClick={handleOpenFolder}
            title="Открыть папку с логами"
            data-testid="log-open-folder"
            className="flex items-center gap-1 px-1.5 py-1 text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] rounded transition-colors"
          >
            <FolderOpen className="w-3 h-3" />
            <span className="text-[11px] hidden sm:inline">Папка</span>
          </button>

          <button
            onClick={handleClear}
            title="Очистить буфер"
            className="p-1 text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] rounded transition-colors"
          >
            <Trash2 className="w-3 h-3" />
          </button>

          {onClose && (
            <button
              onClick={onClose}
              title="Закрыть"
              className="p-1 text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04] rounded transition-colors ml-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Flat Single-line Filters (No Chips-on-Chips, pure text buttons) */}
      <div className="flex flex-wrap items-center gap-1 px-3 py-1 border-b border-white/[0.04] bg-[#0c0c0e]/50 text-[11px] font-mono shrink-0 select-none">
        <span className="text-zinc-600 text-[10px] mr-1">LEVEL:</span>
        <button
          onClick={() => setSelectedLevel('ALL')}
          className={`px-1.5 py-0.5 rounded transition-colors ${
            selectedLevel === 'ALL'
              ? 'text-zinc-100 bg-white/[0.08] font-medium'
              : 'text-zinc-500 hover:text-zinc-300'
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
                ? 'text-zinc-100 bg-white/[0.08] font-medium'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {lvl}
          </button>
        ))}

        <div className="w-[1px] h-2.5 bg-white/[0.08] mx-1.5" />

        <span className="text-zinc-600 text-[10px] mr-1">SCOPE:</span>
        <button
          onClick={() => setSelectedScope('ALL')}
          className={`px-1.5 py-0.5 rounded transition-colors ${
            selectedScope === 'ALL'
              ? 'text-zinc-100 bg-white/[0.08] font-medium'
              : 'text-zinc-500 hover:text-zinc-300'
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
                ? 'text-zinc-100 bg-white/[0.08] font-medium'
                : 'text-zinc-500 hover:text-zinc-300'
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
          <div className="flex flex-col items-center justify-center h-44 text-zinc-600 text-xs">
            <Terminal className="w-6 h-6 stroke-1 text-zinc-700 mb-1.5" />
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
            const scopeColor = SCOPE_COLORS[entry.scope];

            return (
              <div
                key={entry.id}
                onClick={() => hasData && toggleExpand(entry.id)}
                className={`group flex flex-col px-2 py-1 rounded transition-colors hover:bg-white/[0.025] ${
                  hasData ? 'cursor-pointer' : ''
                }`}
              >
                <div className="flex items-baseline gap-2">
                  {/* Timestamp */}
                  <span className="text-zinc-600 shrink-0 text-[10px]">
                    {timeStr}
                  </span>

                  {/* Level Text (flat, no glowing box) */}
                  <span className={`w-9 shrink-0 text-[10px] uppercase font-semibold ${levelCfg.labelColor}`}>
                    {entry.level}
                  </span>

                  {/* Scope (subtle colored text) */}
                  <span className={`w-14 shrink-0 text-[10px] uppercase font-medium ${scopeColor}`}>
                    [{entry.scope}]
                  </span>

                  {/* Message (clean typography) */}
                  <span className={`flex-1 break-all ${levelCfg.text}`}>
                    {entry.message}
                  </span>

                  {/* Duration if available */}
                  {entry.durationMs !== undefined && (
                    <span className="text-zinc-600 text-[10px] shrink-0">
                      +{Math.round(entry.durationMs)}ms
                    </span>
                  )}

                  {/* Hover Actions */}
                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0 transition-opacity">
                    <button
                      onClick={(e) => handleCopyItem(entry, e)}
                      title="Копировать строку"
                      className="text-zinc-500 hover:text-zinc-300 p-0.5"
                    >
                      {copiedId === entry.id ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                    {hasData && (
                      <span className="text-zinc-500 p-0.5">
                        {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      </span>
                    )}
                  </div>
                </div>

                {/* Expanded Payload Data (flat subtle pre) */}
                {hasData && isExpanded && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1.5 p-2 bg-black/40 rounded border border-white/[0.04] overflow-x-auto text-[10px] text-zinc-400"
                  >
                    <pre className="whitespace-pre-wrap font-mono">
                      {JSON.stringify(entry.data, null, 2)}
                    </pre>
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
