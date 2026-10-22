import type { LogEntry, LogLevel, LogScope } from '../types';

export type LogListener = (entry: LogEntry) => void;

// Mask sensitive keys (Groq, Gemini, KIE, Bearer tokens, general secrets)
const SENSITIVE_PATTERNS = [
  /gsk_[a-zA-Z0-9_-]{20,}/g,
  /AIzaSy[a-zA-Z0-9_-]{30,}/g,
  /sk-kie-[a-zA-Z0-9_-]+/gi,
  /sk-[a-zA-Z0-9_-]{20,}/gi,
  /Bearer\s+[a-zA-Z0-9._-]+/gi,
  /key=[a-zA-Z0-9_-]{20,}/gi,
];

function maskSensitiveString(str: string): string {
  let masked = str;
  for (const pattern of SENSITIVE_PATTERNS) {
    masked = masked.replace(pattern, (match) => {
      if (match.startsWith('Bearer ')) {
        return 'Bearer [REDACTED_TOKEN]';
      }
      if (match.startsWith('key=')) {
        return 'key=[REDACTED_KEY]';
      }
      return `${match.slice(0, 6)}...[REDACTED]`;
    });
  }
  return masked;
}

function sanitizeData(data: unknown, depth = 0): unknown {
  if (depth > 5) return '[Truncated: Max Depth]';
  if (typeof data === 'string') {
    return maskSensitiveString(data);
  }
  if (data === null || data === undefined || typeof data !== 'object') {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map(item => sanitizeData(item, depth + 1));
  }
  if (data instanceof Error) {
    return {
      name: data.name,
      message: maskSensitiveString(data.message),
      stack: data.stack ? maskSensitiveString(data.stack) : undefined,
    };
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes('key') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('token') ||
      lowerKey.includes('password') ||
      lowerKey.includes('authorization')
    ) {
      sanitized[key] = '[REDACTED_SECRET]';
    } else {
      sanitized[key] = sanitizeData(val, depth + 1);
    }
  }
  return sanitized;
}

// Styling badges for browser console
const SCOPE_STYLES: Record<LogScope, { bg: string; fg: string }> = {
  AI: { bg: '#312e81', fg: '#c7d2fe' },
  FS: { bg: '#064e3b', fg: '#6ee7b7' },
  SEARCH: { bg: '#451a03', fg: '#fcd34d' },
  UI: { bg: '#27272a', fg: '#d4d4d8' },
  APP: { bg: '#4c1d95', fg: '#ddd6fe' },
  SYNC: { bg: '#164e63', fg: '#67e8f9' },
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  trace: '#71717a',
  debug: '#a1a1aa',
  info: '#38bdf8',
  warn: '#fbbf24',
  error: '#f87171',
};

class LoggerEngine {
  private buffer: LogEntry[] = [];
  private maxEntries = 1000;
  private listeners: Set<LogListener> = new Set();
  private timers: Map<string, number> = new Map();

  constructor() {
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
    }
  }

  private emit(entry: LogEntry): void {
    // Add to buffer
    this.buffer.push(entry);
    if (this.buffer.length > this.maxEntries) {
      this.buffer.shift();
    }

    // Print to browser console with styled badges
    this.printToConsole(entry);

    // Notify in-app subscribers
    this.listeners.forEach((listener) => {
      try {
        listener(entry);
      } catch (err) {
        console.error('Error in log listener:', err);
      }
    });
  }

  private printToConsole(entry: LogEntry): void {
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
      consoleMethod(entry.data);
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
    const sanitizedData = data !== undefined ? sanitizeData(data) : undefined;

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
      trace: (msg: string, data?: unknown) => this.trace(scope, msg, data),
      debug: (msg: string, data?: unknown) => this.debug(scope, msg, data),
      info: (msg: string, data?: unknown) => this.info(scope, msg, data),
      warn: (msg: string, data?: unknown) => this.warn(scope, msg, data),
      error: (msg: string, data?: unknown) => this.error(scope, msg, data),
      time: (label: string) => this.time(scope, label),
      trackAsync: <T>(label: string, fn: () => Promise<T>) => this.trackAsync(scope, label, fn),
    };
  }

  public getEntries(): LogEntry[] {
    return [...this.buffer];
  }

  public clear(): void {
    this.buffer = [];
    // Notify with a sentinel or just trigger listeners with dummy entry or re-render
    this.log('info', 'APP', 'Log buffer cleared');
  }

  public subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public exportAsJson(): string {
    return JSON.stringify(this.buffer, null, 2);
  }

  public exportAsMarkdown(): string {
    const now = new Date().toISOString();
    const total = this.buffer.length;
    const errors = this.buffer.filter(e => e.level === 'error').length;
    const warns = this.buffer.filter(e => e.level === 'warn').length;

    const lines: string[] = [
      `# SLAG v2 — Application Diagnostics Report`,
      `**Generated:** ${now}`,
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
