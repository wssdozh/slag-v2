// The log: levels, scopes, listeners, the buffer, retention and persistence. What must never be
// written is decided in `logRedaction`.
import type { LogEntry, LogLevel, LogScope } from '../../types';
import { STORAGE_KEYS, UI_DELAYS } from '../../config';
import { maskSensitiveString, sanitizeForLog } from './logRedaction';

export type LogListener = (entry: LogEntry) => void;

// Styling badges for browser console
const SCOPE_STYLES: Record<LogScope, { bg: string; fg: string }> = {
  AI: { bg: '#312e81', fg: '#c7d2fe' },
  FS: { bg: '#064e3b', fg: '#6ee7b7' },
  NODE: { bg: '#3f3f46', fg: '#e4e4e7' },
  SEARCH: { bg: '#451a03', fg: '#fcd34d' },
  UI: { bg: '#27272a', fg: '#d4d4d8' },
  APP: { bg: '#4c1d95', fg: '#ddd6fe' },
  SYNC: { bg: '#164e63', fg: '#67e8f9' },
  MEDIA: { bg: '#831843', fg: '#fbcfe8' },
  WORKSPACE: { bg: '#075985', fg: '#bae6fd' },
  NOTIFY: { bg: '#78350f', fg: '#fcd34d' },
  UPDATE: { bg: '#1e3a8a', fg: '#bfdbfe' },
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  trace: '#71717a',
  debug: '#a1a1aa',
  info: '#38bdf8',
  warn: '#fbbf24',
  error: '#f87171',
};

/** A week of dailies answers "what broke yesterday" and costs nothing on a phone. */
const LOG_RETENTION_DAYS = 7;

/** Local day, not UTC: a file named after a UTC day would flip at 03:00 in Moscow. */
function localDay(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

class LoggerEngine {
  private buffer: LogEntry[] = [];
  private maxEntries = 250;
  private listeners: Set<LogListener> = new Set();
  private timers: Map<string, number> = new Map();
  private persistTimeout: number | null = null;
  private diskLogQueue: string[] = [];
  private isDiskFlushing = false;
  private diskDirEnsured = false;
  private diskPruned = false;
  private diskFlushTimeout: number | null = null;

  constructor() {
    // Restore breadcrumbs from previous session if crashed or reloaded
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        const raw = sessionStorage.getItem(STORAGE_KEYS.SESSION_BREADCRUMBS);
        if (raw) {
          const parsed: LogEntry[] = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            this.buffer = parsed.slice(-20).map(e => ({
              ...e,
              message: `[PREV_SESSION] ${e.message}`,
            }));
          }
        }
      } catch {
        // Ignore session read error
      }
    }

    // Intercept uncaught errors in browser window
    if (typeof window !== 'undefined') {
      window.addEventListener('error', (event) => {
        this.error('APP', `Uncaught error: ${event.message}`, {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          error: event.error,
        });
      });

      window.addEventListener('unhandledrejection', (event) => {
        this.error('APP', `Unhandled Promise rejection: ${String(event.reason)}`, {
          reason: event.reason,
        });
      });

      window.addEventListener('beforeunload', () => {
        void this.flushToDisk();
      });

      // If running inside Tauri, write initial session header to disk queue
      if ('__TAURI_INTERNALS__' in window) {
        this.diskLogQueue.push(
          `\n==================== SESSION START: ${new Date().toISOString()} ====================\n`
        );
        this.scheduleDiskFlush(500);
      }
    }
  }

  private persistToSession(): void {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    if (this.persistTimeout !== null) return;
    this.persistTimeout = window.setTimeout(() => {
      this.persistTimeout = null;
      try {
        const compact = this.buffer.slice(-20).map(e => ({
          id: e.id,
          timestamp: e.timestamp,
          level: e.level,
          scope: e.scope,
          message: e.message,
          durationMs: e.durationMs,
        }));
        sessionStorage.setItem(STORAGE_KEYS.SESSION_BREADCRUMBS, JSON.stringify(compact));
      } catch {
        // Ignore quota
      }
    }, UI_DELAYS.LOGGER_PERSIST_DEBOUNCE_MS);
  }

  private emit(entry: LogEntry): void {
    // Add to buffer
    this.buffer.push(entry);
    if (this.buffer.length > this.maxEntries) {
      this.buffer.shift();
    }

    // Print to browser console with styled badges
    this.printToConsole(entry);

    // Persist lightweight breadcrumb trail across page reloads
    this.persistToSession();

    // Buffer for desktop file persistence
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      this.diskLogQueue.push(this.formatEntryForDisk(entry));
      if (entry.level === 'error' || entry.level === 'warn' || this.diskLogQueue.length >= 25) {
        void this.flushToDisk();
      } else {
        this.scheduleDiskFlush(UI_DELAYS.LOGGER_DISK_FLUSH_DEBOUNCE_MS);
      }
    }

    // Notify in-app subscribers
    this.listeners.forEach((listener) => {
      try {
        listener(entry);
      } catch (err) {
        console.error('Error in log listener:', err);
      }
    });
  }

  private formatEntryForDisk(entry: LogEntry): string {
    const iso = new Date(entry.timestamp).toISOString();
    const level = entry.level.toUpperCase().padEnd(5);
    const scope = entry.scope.padEnd(9);
    const dur = entry.durationMs !== undefined ? ` (+${Math.round(entry.durationMs)}ms)` : '';
    let dataPart = '';
    if (entry.data !== undefined) {
      try {
        dataPart = ` | ${JSON.stringify(sanitizeForLog(entry.data))}`;
      } catch {
        dataPart = ` | [unserializable payload]`;
      }
    }
    return `[${iso}] [${level}] [${scope}] ${entry.message}${dur}${dataPart}\n`;
  }

  private scheduleDiskFlush(delayMs: number): void {
    if (this.diskFlushTimeout !== null) return;
    this.diskFlushTimeout = window.setTimeout(() => {
      this.diskFlushTimeout = null;
      void this.flushToDisk();
    }, delayMs);
  }

  public async flushToDisk(): Promise<void> {
    if (this.diskLogQueue.length === 0 || this.isDiskFlushing) return;
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;

    if (this.diskFlushTimeout !== null) {
      clearTimeout(this.diskFlushTimeout);
      this.diskFlushTimeout = null;
    }

    this.isDiskFlushing = true;
    const batch = this.diskLogQueue.splice(0, this.diskLogQueue.length);
    const textToAppend = batch.join('');

    try {
      const { mkdir, writeTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
      if (!this.diskDirEnsured) {
        await mkdir('logs', { baseDir: BaseDirectory.AppData, recursive: true });
        this.diskDirEnsured = true;
      }

      const logPath = `logs/slag-${localDay()}.log`;
      if (!this.diskPruned) {
        this.diskPruned = true;
        void this.pruneOldLogs();
      }

      await writeTextFile(logPath, textToAppend, {
        baseDir: BaseDirectory.AppData,
        append: true,
      });
    } catch (err) {
      // Re-queue on failure so logs aren't lost
      this.diskLogQueue.unshift(...batch);
      console.error('Failed to flush logs to disk:', err);
    } finally {
      this.isDiskFlushing = false;
      if (this.diskLogQueue.length > 0) {
        this.scheduleDiskFlush(1000);
      }
    }
  }

  /**
   * One file per day, so the folder is the history: drop anything older than the retention.
   * The old single-file scheme (`slag.log`, `slag.old.log`) has no date and is stale by definition.
   * Exported logs (`slag_logs_*.log`) are somebody's artefact, not ours to delete.
   */
  private async pruneOldLogs(): Promise<void> {
    try {
      const { readDir, remove, BaseDirectory } = await import('@tauri-apps/plugin-fs');
      const cutoff = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
      const entries = await readDir('logs', { baseDir: BaseDirectory.AppData });
      for (const entry of entries) {
        const match = entry.name.match(/^slag(?:-(\d{4}-\d{2}-\d{2}))?(?:\.old)?\.log$/);
        if (!match) continue;
        const expired = !match[1] || new Date(`${match[1]}T00:00:00`).getTime() < cutoff;
        if (expired) await remove(`logs/${entry.name}`, { baseDir: BaseDirectory.AppData });
      }
    } catch (err) {
      console.warn('Failed to prune old logs:', err);
    }
  }

  private printToConsole(entry: LogEntry): void {
    // In non-dev environments skip noisy trace logs from console to prevent console buffer memory bloat
    if (entry.level === 'trace' && typeof import.meta !== 'undefined' && !import.meta.env?.DEV) {
      return;
    }

    const timeStr = new Date(entry.timestamp).toLocaleTimeString('ru-RU', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    });

    const scopeStyle = SCOPE_STYLES[entry.scope] || { bg: '#27272a', fg: '#f4f4f5' };
    const levelColor = LEVEL_COLORS[entry.level];

    const badgeStyle = `background: ${scopeStyle.bg}; color: ${scopeStyle.fg}; font-weight: 700; font-size: 10px; padding: 1px 5px; border-radius: 3px; text-transform: uppercase;`;
    const timeStyle = 'color: #71717a; font-size: 11px; font-family: monospace;';
    const levelStyle = `color: ${levelColor}; font-weight: 700; font-size: 10px; text-transform: uppercase;`;
    const textStyle = 'color: #f4f4f5; font-size: 12px;';
    const durationStyle = 'color: #a1a1aa; font-size: 11px; font-style: italic;';

    const durationText = entry.durationMs !== undefined ? ` +${Math.round(entry.durationMs)}ms` : '';

    const consoleMethod = entry.level === 'error'
      ? console.error
      : entry.level === 'warn'
        ? console.warn
        : entry.level === 'debug' || entry.level === 'trace'
          ? console.debug
          : console.log;

    if (entry.data !== undefined) {
      console.groupCollapsed(
        `%c${timeStr}%c %c${entry.level}%c %c${entry.scope}%c ${entry.message}%c${durationText}`,
        timeStyle,
        '',
        levelStyle,
        '',
        badgeStyle,
        textStyle,
        durationStyle
      );
      // Detach payload from live application object graph to prevent DevTools memory retention
      try {
        if (typeof entry.data === 'object' && entry.data !== null) {
          consoleMethod(JSON.parse(JSON.stringify(entry.data)));
        } else {
          consoleMethod(entry.data);
        }
      } catch {
        consoleMethod(entry.data);
      }
      console.groupEnd();
    } else {
      consoleMethod(
        `%c${timeStr}%c %c${entry.level}%c %c${entry.scope}%c ${entry.message}%c${durationText}`,
        timeStyle,
        '',
        levelStyle,
        '',
        badgeStyle,
        textStyle,
        durationStyle
      );
    }
  }

  public log(
    level: LogLevel,
    scope: LogScope,
    message: string,
    data?: unknown,
    durationMs?: number
  ): void {
    const cleanMessage = maskSensitiveString(message);
    const sanitizedData = data !== undefined ? sanitizeForLog(data) : undefined;

    const entry: LogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      level,
      scope,
      message: cleanMessage,
      data: sanitizedData,
      durationMs,
    };

    this.emit(entry);
  }

  public trace(scope: LogScope, message: string, data?: unknown): void {
    this.log('trace', scope, message, data);
  }

  public debug(scope: LogScope, message: string, data?: unknown): void {
    this.log('debug', scope, message, data);
  }

  public info(scope: LogScope, message: string, data?: unknown): void {
    this.log('info', scope, message, data);
  }

  public warn(scope: LogScope, message: string, data?: unknown): void {
    this.log('warn', scope, message, data);
  }

  public error(scope: LogScope, message: string, data?: unknown): void {
    this.log('error', scope, message, data);
  }

  public time(scope: LogScope, label: string): (endMessage?: string, data?: unknown) => void {
    const timerId = `${scope}:${label}`;
    const start = performance.now();
    this.timers.set(timerId, start);

    return (endMessage?: string, data?: unknown) => {
      const elapsed = performance.now() - start;
      this.timers.delete(timerId);
      const msg = endMessage || `${label} completed`;
      this.info(scope, msg, data);
      // We can also record duration specifically in last log entry or update it:
      const last = this.buffer[this.buffer.length - 1];
      if (last && last.message === msg) {
        last.durationMs = elapsed;
      }
    };
  }

  public async trackAsync<T>(
    scope: LogScope,
    label: string,
    action: () => Promise<T>
  ): Promise<T> {
    const start = performance.now();
    this.debug(scope, `Starting ${label}...`);
    try {
      const result = await action();
      const elapsed = performance.now() - start;
      this.info(scope, `${label} finished`, undefined);
      const last = this.buffer[this.buffer.length - 1];
      if (last) last.durationMs = elapsed;
      return result;
    } catch (err) {
      const elapsed = performance.now() - start;
      this.error(scope, `${label} failed: ${err instanceof Error ? err.message : String(err)}`, err);
      const last = this.buffer[this.buffer.length - 1];
      if (last) last.durationMs = elapsed;
      throw err;
    }
  }

  // Scoped helper for module-level cleanly bound callers
  public scope(scope: LogScope) {
    return {
      trace: (msg: string, data?: unknown, durationMs?: number) => this.log('trace', scope, msg, data, durationMs),
      debug: (msg: string, data?: unknown, durationMs?: number) => this.log('debug', scope, msg, data, durationMs),
      info: (msg: string, data?: unknown, durationMs?: number) => this.log('info', scope, msg, data, durationMs),
      warn: (msg: string, data?: unknown, durationMs?: number) => this.log('warn', scope, msg, data, durationMs),
      error: (msg: string, data?: unknown, durationMs?: number) => this.log('error', scope, msg, data, durationMs),
      time: (label: string) => this.time(scope, label),
      trackAsync: <T>(label: string, fn: () => Promise<T>) => this.trackAsync(scope, label, fn),
    };
  }

  public getEntries(): LogEntry[] {
    return [...this.buffer];
  }

  public clear(): void {
    this.buffer = [];
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        sessionStorage.removeItem('slag_session_breadcrumbs');
      } catch {
        // Ignore
      }
    }
    // Notify with a sentinel or just trigger listeners with dummy entry or re-render
    this.log('info', 'APP', 'Log buffer cleared');
  }

  public subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public exportAsPlainText(): string {
    return this.buffer
      .map(e => {
        const iso = new Date(e.timestamp).toISOString();
        const level = e.level.toUpperCase().padEnd(5);
        const scope = e.scope.padEnd(9);
        const dur = e.durationMs !== undefined ? ` (+${Math.round(e.durationMs)}ms)` : '';
        const dataPart = e.data !== undefined ? ` | ${JSON.stringify(e.data)}` : '';
        return `[${iso}] [${level}] [${scope}] ${e.message}${dur}${dataPart}`;
      })
      .join('\n');
  }

  public downloadLog(format: 'log' | 'json' | 'markdown' = 'log'): string {
    if (typeof window === 'undefined' || typeof document === 'undefined') return '';
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    let content: string;
    let mimeType: string;
    let filename: string;

    if (format === 'json') {
      content = this.exportAsJson();
      mimeType = 'application/json';
      filename = `slag_logs_${timestamp}.json`;
    } else if (format === 'markdown') {
      content = this.exportAsMarkdown();
      mimeType = 'text/markdown;charset=utf-8';
      filename = `slag_diagnostics_${timestamp}.md`;
    } else {
      content = this.exportAsPlainText();
      mimeType = 'text/plain;charset=utf-8';
      filename = `slag_logs_${timestamp}.log`;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Also persist exported file into desktop AppData/logs directory
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      void (async () => {
        try {
          const { mkdir, writeTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
          await mkdir('logs', { baseDir: BaseDirectory.AppData, recursive: true });
          await writeTextFile(`logs/${filename}`, content, { baseDir: BaseDirectory.AppData });
        } catch {
          // ignore disk save error in download
        }
      })();
    }

    return filename;
  }

  public exportAsJson(): string {
    return JSON.stringify(this.buffer, null, 2);
  }

  public exportAsMarkdown(): string {
    const now = new Date().toISOString();
    const total = this.buffer.length;
    const errors = this.buffer.filter(e => e.level === 'error').length;
    const warns = this.buffer.filter(e => e.level === 'warn').length;
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

    const lines: string[] = [
      `# SLAG v2 — Application Diagnostics Report`,
      `**Generated:** ${now}`,
      `**Network Status:** ${isOnline ? 'Online 🟢' : 'Offline 🔴'}`,
      `**User Agent:** ${typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown'}`,
      `**Total Log Entries:** ${total} (${errors} errors, ${warns} warnings)`,
      ``,
      `---`,
      ``,
      `## Recent Logs (Last ${Math.min(100, total)})`,
      ``,
      `| Timestamp | Level | Scope | Message | Duration |`,
      `| --- | --- | --- | --- | --- |`,
    ];

    const recent = this.buffer.slice(-100);
    for (const e of recent) {
      const time = new Date(e.timestamp).toLocaleTimeString('ru-RU', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      const levelBadge = e.level === 'error' ? '❌ ERROR' : e.level === 'warn' ? '⚠️ WARN' : e.level.toUpperCase();
      const dur = e.durationMs ? `${Math.round(e.durationMs)}ms` : '-';
      const cleanMsg = e.message.replace(/\|/g, '\\|');
      lines.push(`| ${time} | ${levelBadge} | **${e.scope}** | ${cleanMsg} | ${dur} |`);
    }

    const errorsWithData = recent.filter(e => e.level === 'error' && e.data);
    if (errorsWithData.length > 0) {
      lines.push(``, `## Error Details & Payloads`, ``);
      for (const err of errorsWithData) {
        lines.push(`### [${new Date(err.timestamp).toLocaleTimeString()}] ${err.scope}: ${err.message}`);
        lines.push('```json');
        lines.push(JSON.stringify(err.data, null, 2));
        lines.push('```', '');
      }
    }

    return lines.join('\n');
  }
}

export const logger = new LoggerEngine();

if (typeof window !== 'undefined') {
  (window as any).logger = logger;
}
