import React, { useState, useEffect, useRef, useMemo } from 'react';
import { logger } from '../../lib/logger';
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
  AlertCircle,
  AlertTriangle,
  Info as InfoIcon,
  Bug
} from 'lucide-react';

interface LogViewerProps {
  variant?: 'dock' | 'modal';
  onClose?: () => void;
}

const SCOPE_CLASSES: Record<LogScope, string> = {
  AI: 'bg-indigo-950/80 text-indigo-300 border-indigo-800/60',
  FS: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60',
  SEARCH: 'bg-amber-950/80 text-amber-300 border-amber-800/60',
  UI: 'bg-zinc-800/90 text-zinc-300 border-zinc-700/60',
  APP: 'bg-purple-950/80 text-purple-300 border-purple-800/60',
  SYNC: 'bg-cyan-950/80 text-cyan-300 border-cyan-800/60',
};

const LEVEL_CLASSES: Record<LogLevel, { badge: string; text: string; icon: React.FC<any> }> = {
  trace: { badge: 'bg-zinc-800/60 text-zinc-400 border-zinc-700/50', text: 'text-zinc-400', icon: Bug },
  debug: { badge: 'bg-zinc-800/60 text-zinc-400 border-zinc-700/50', text: 'text-zinc-400', icon: Bug },
  info: { badge: 'bg-sky-950/60 text-sky-300 border-sky-800/50', text: 'text-zinc-200', icon: InfoIcon },
  warn: { badge: 'bg-amber-950/80 text-amber-300 border-amber-800/60', text: 'text-amber-200', icon: AlertTriangle },
  error: { badge: 'bg-rose-950/80 text-rose-300 border-rose-800/60', text: 'text-rose-200', icon: AlertCircle },
};

const ALL_SCOPES: LogScope[] = ['AI', 'FS', 'SEARCH', 'UI', 'APP', 'SYNC'];
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

  const handleExportJson = () => {
    try {
      const json = logger.exportAsJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `slag_logs_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      addToast('Логи выгружены в JSON', 'success');
    } catch {
      addToast('Ошибка экспорта логов', 'error');
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
      className={`flex flex-col h-full w-full bg-[#08090a] text-[#f4f4f5] select-text font-sans ${
        variant === 'modal' ? 'rounded-lg border border-[#27272a] shadow-2xl overflow-hidden' : ''
      }`}
    >
      {/* Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-[#27272a] bg-[#0c0c0e]/90 backdrop-blur-xs shrink-0 select-none">
        {/* Title and stats */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
            <Terminal className="w-4 h-4 text-zinc-400" />
            <span>Логи & HUD</span>
          </div>

          <div className="flex items-center gap-1 text-[11px] font-mono text-zinc-400 bg-[#141417] px-2 py-0.5 rounded border border-[#27272a]">
            <span>{counts.total}</span>
            {counts.errors > 0 && (
              <span className="text-rose-400 font-medium">· {counts.errors} err</span>
            )}
            {counts.warns > 0 && (
              <span className="text-amber-400 font-medium">· {counts.warns} warn</span>
            )}
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex-1 max-w-xs min-w-[160px] relative">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по логам..."
            className="w-full bg-[#141417] text-xs text-zinc-200 pl-8 pr-7 py-1 rounded border border-[#27272a] focus:border-zinc-500 outline-none transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Actions Toolbar */}
        <div className="flex items-center gap-1.5">
          {/* Auto-scroll toggle */}
          <button
            onClick={() => setAutoScroll(prev => !prev)}
            title={autoScroll ? 'Автопрокрутка включена' : 'Автопрокрутка выключена'}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded border transition-colors ${
              autoScroll
                ? 'bg-zinc-800 text-zinc-200 border-zinc-600'
                : 'bg-[#141417] text-zinc-400 border-[#27272a] hover:text-zinc-200'
            }`}
          >
            <ArrowDown className={`w-3 h-3 ${autoScroll ? 'text-emerald-400' : 'text-zinc-500'}`} />
            <span className="text-[11px]">Авто</span>
          </button>

          {/* Copy Markdown Bug Report */}
          <button
            onClick={handleCopyReport}
            title="Копировать отчёт для баг-репорта (Markdown)"
            className="flex items-center gap-1 px-2 py-1 text-xs bg-[#141417] text-zinc-300 hover:text-zinc-100 hover:bg-[#1e1e24] rounded border border-[#27272a] transition-colors"
          >
            {reportCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span className="text-[11px] hidden sm:inline">Отчёт</span>
          </button>

          {/* Export JSON */}
          <button
            onClick={handleExportJson}
            title="Скачать JSON"
            className="flex items-center gap-1 px-2 py-1 text-xs bg-[#141417] text-zinc-300 hover:text-zinc-100 hover:bg-[#1e1e24] rounded border border-[#27272a] transition-colors"
          >
            <Download className="w-3 h-3" />
            <span className="text-[11px] hidden sm:inline">JSON</span>
          </button>

          {/* Clear Buffer */}
          <button
            onClick={handleClear}
            title="Очистить буфер логов"
            className="p-1 text-zinc-400 hover:text-rose-300 hover:bg-[#1e1e24] rounded border border-transparent hover:border-[#27272a] transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {/* Close button if in modal/dock with onClose */}
          {onClose && (
            <button
              onClick={onClose}
              title="Закрыть"
              className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-[#1e1e24] rounded border border-transparent hover:border-[#27272a] transition-colors ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Filter Chips Bar */}
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 border-b border-[#1e1e24] bg-[#09090b] text-[11px] shrink-0 select-none">
        <span className="text-zinc-500 font-mono text-[10px] mr-1">LEVEL:</span>
        <button
          onClick={() => setSelectedLevel('ALL')}
          className={`px-1.5 py-0.5 rounded border transition-colors ${
            selectedLevel === 'ALL'
              ? 'bg-zinc-700/80 text-zinc-100 border-zinc-500 font-medium'
              : 'bg-[#141417] text-zinc-400 border-[#27272a] hover:text-zinc-200'
          }`}
        >
          ALL
        </button>
        {ALL_LEVELS.map(lvl => (
          <button
            key={lvl}
            onClick={() => setSelectedLevel(lvl)}
            className={`px-1.5 py-0.5 rounded border uppercase transition-colors ${
              selectedLevel === lvl
                ? `${LEVEL_CLASSES[lvl].badge} font-medium`
                : 'bg-[#141417] text-zinc-400 border-[#27272a] hover:text-zinc-200'
            }`}
          >
            {lvl}
          </button>
        ))}

        <div className="w-[1px] h-3 bg-[#27272a] mx-1" />

        <span className="text-zinc-500 font-mono text-[10px] mr-1">SCOPE:</span>
        <button
          onClick={() => setSelectedScope('ALL')}
          className={`px-1.5 py-0.5 rounded border transition-colors ${
            selectedScope === 'ALL'
              ? 'bg-zinc-700/80 text-zinc-100 border-zinc-500 font-medium'
              : 'bg-[#141417] text-zinc-400 border-[#27272a] hover:text-zinc-200'
          }`}
        >
          ALL
        </button>
        {ALL_SCOPES.map(sc => (
          <button
            key={sc}
            onClick={() => setSelectedScope(sc)}
            className={`px-1.5 py-0.5 rounded border transition-colors ${
              selectedScope === sc
                ? `${SCOPE_CLASSES[sc]} font-medium`
                : 'bg-[#141417] text-zinc-400 border-[#27272a] hover:text-zinc-200'
            }`}
          >
            {sc}
          </button>
        ))}
      </div>

      {/* Log Entries List */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-1 font-mono text-xs"
      >
        {filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-zinc-500 text-xs">
            <Terminal className="w-8 h-8 stroke-1 text-zinc-600 mb-2" />
            <p>Логов нет или фильтр не дал результатов</p>
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

            const levelCfg = LEVEL_CLASSES[entry.level];
            const scopeClass = SCOPE_CLASSES[entry.scope];

            return (
              <div
                key={entry.id}
                onClick={() => hasData && toggleExpand(entry.id)}
                className={`group relative rounded border border-transparent hover:border-[#27272a] hover:bg-[#121215] transition-colors p-1.5 ${
                  entry.level === 'error'
                    ? 'bg-rose-950/20'
                    : entry.level === 'warn'
                      ? 'bg-amber-950/15'
                      : ''
                } ${hasData ? 'cursor-pointer' : ''}`}
              >
                <div className="flex items-start gap-2">
                  {/* Timestamp */}
                  <span className="text-zinc-500 shrink-0 text-[11px] pt-0.5">
                    {timeStr}
                  </span>

                  {/* Level Pill */}
                  <span
                    className={`px-1 py-0.2 rounded border text-[10px] font-bold uppercase shrink-0 ${levelCfg.badge}`}
                  >
                    {entry.level}
                  </span>

                  {/* Scope Badge */}
                  <span
                    className={`px-1.5 py-0.2 rounded border text-[10px] font-bold uppercase shrink-0 ${scopeClass}`}
                  >
                    {entry.scope}
                  </span>

                  {/* Message */}
                  <span className={`flex-1 break-all ${levelCfg.text}`}>
                    {entry.message}
                  </span>

                  {/* Duration if available */}
                  {entry.durationMs !== undefined && (
                    <span className="text-zinc-500 text-[10px] italic shrink-0">
                      +{Math.round(entry.durationMs)}ms
                    </span>
                  )}

                  {/* Action buttons (copy single entry, expand toggle) */}
                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0 transition-opacity">
                    <button
                      onClick={(e) => handleCopyItem(entry, e)}
                      title="Копировать запись"
                      className="p-0.5 text-zinc-400 hover:text-zinc-200"
                    >
                      {copiedId === entry.id ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                    {hasData && (
                      <span className="text-zinc-400 p-0.5">
                        {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      </span>
                    )}
                  </div>
                </div>

                {/* Expanded Payload Data */}
                {hasData && isExpanded && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="mt-2 p-2 bg-[#09090b] rounded border border-[#27272a] overflow-x-auto text-[11px] text-zinc-300"
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
