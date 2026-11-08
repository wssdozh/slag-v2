// ponytail: central command & hotkey engine for SLAG v2 without external dependencies.
// Provides unified shortcut normalization (code/key agnostic, layout immune),
// focus guards, command registry and formatting for UI/Settings.

export type CommandCategory = 'Поиск и навигация' | 'Создание' | 'Интерфейс' | 'Редактирование';

export interface AppCommandContext {
  openSearch: () => void;
  toggleAssistant: () => void;
  toggleLogs: () => void;
  openComposer: (options?: { type?: 'task' | 'note' | 'article' }) => void;
  openSettings: (tab?: 'ai' | 'vault' | 'ui' | 'shortcuts' | 'logs') => void;
  dismissTopLayer: () => boolean;
  isOverlayOpen: () => boolean;
  [key: string]: unknown;
}

export interface AppCommand {
  id: string;
  title: string;
  description?: string;
  category: CommandCategory;
  keywords?: string[];
  shortcut?: string;
  aliases?: string[];
  allowInInput?: boolean;
  run: (ctx: AppCommandContext) => void | boolean;
  isEnabled?: (ctx: AppCommandContext) => boolean;
}

/** Check if current operating system is macOS */
export function isMac(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const platform = (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || '';
  return /mac/i.test(platform);
}

/** Format shortcut string (e.g. "mod+f", "shift+enter") into human readable labels like "Ctrl+F" or "⌘F" */
export function formatShortcut(shortcut: string, mac = isMac()): string {
  if (!shortcut) return '';
  const parts = shortcut.toLowerCase().split('+').map(p => p.trim());
  return parts.map(part => {
    switch (part) {
      case 'mod':
        return mac ? '⌘' : 'Ctrl';
      case 'ctrl':
        return mac ? '⌃' : 'Ctrl';
      case 'meta':
        return mac ? '⌘' : 'Win';
      case 'alt':
        return mac ? '⌥' : 'Alt';
      case 'shift':
        return mac ? '⇧' : 'Shift';
      case 'escape':
      case 'esc':
        return 'Esc';
      case 'enter':
        return '↵ Enter';
      case 'backquote':
      case '`':
        return '`';
      case 'space':
        return 'Space';
      case 'arrowup':
        return '↑';
      case 'arrowdown':
        return '↓';
      case 'arrowleft':
        return '←';
      case 'arrowright':
        return '→';
      default:
        return part.toUpperCase();
    }
  }).join(mac ? '' : '+');
}

/** Determine whether event target represents an active editable input */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (target.isContentEditable || target.getAttribute('contenteditable') === 'true') return true;
  if (target.closest('.cm-editor') || target.closest('[contenteditable="true"]')) return true;
  return false;
}

interface ParsedShortcut {
  mod: boolean;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}

function parseShortcut(shortcut: string): ParsedShortcut {
  const parts = shortcut.toLowerCase().split('+').map(p => p.trim());
  let mod = false;
  let ctrl = false;
  let meta = false;
  let alt = false;
  let shift = false;
  let key = '';

  for (const part of parts) {
    if (part === 'mod') mod = true;
    else if (part === 'ctrl') ctrl = true;
    else if (part === 'meta') meta = true;
    else if (part === 'alt') alt = true;
    else if (part === 'shift') shift = true;
    else key = part;
  }

  return { mod, ctrl, meta, alt, shift, key };
}

/**
 * Check whether a KeyboardEvent satisfies a shortcut definition.
 * Uses both physical e.code and semantic e.key to be immune to layout switching.
 */
export function matchesShortcut(e: KeyboardEvent, shortcut: string): boolean {
  const parsed = parseShortcut(shortcut);
  const mac = isMac();

  // 1. Modifiers check
  const isModPressed = mac ? e.metaKey : e.ctrlKey;
  if (parsed.mod && !isModPressed) return false;
  if (!parsed.mod) {
    if (parsed.ctrl !== e.ctrlKey) return false;
    if (parsed.meta !== e.metaKey) return false;
  }
  if (parsed.alt !== e.altKey) return false;
  if (parsed.shift !== e.shiftKey) return false;

  // 2. Key matching
  const targetKey = parsed.key;
  if (!targetKey) return false;

  // Esc / Escape
  if (targetKey === 'escape' || targetKey === 'esc') {
    return e.key === 'Escape' || e.code === 'Escape';
  }

  // Enter
  if (targetKey === 'enter') {
    return e.key === 'Enter' || e.code === 'Enter';
  }

  // Space
  if (targetKey === 'space') {
    return e.key === ' ' || e.code === 'Space';
  }

  // Backquote / Tilde (tilde, ё, Ё, backquote)
  if (targetKey === '`' || targetKey === 'backquote' || targetKey === '~') {
    return (
      e.code === 'Backquote' ||
      e.key === '`' ||
      e.key === '~' ||
      e.key === 'ё' ||
      e.key === 'Ё'
    );
  }

  // Arrows
  if (targetKey === 'arrowup') return e.key === 'ArrowUp' || e.code === 'ArrowUp';
  if (targetKey === 'arrowdown') return e.key === 'ArrowDown' || e.code === 'ArrowDown';
  if (targetKey === 'arrowleft') return e.key === 'ArrowLeft' || e.code === 'ArrowLeft';
  if (targetKey === 'arrowright') return e.key === 'ArrowRight' || e.code === 'ArrowRight';

  // Single letters (a-z)
  if (/^[a-z]$/.test(targetKey)) {
    const codeMatch = e.code === `Key${targetKey.toUpperCase()}`;
    const keyMatch = e.key.toLowerCase() === targetKey;
    return codeMatch || keyMatch;
  }

  // Digits (0-9)
  if (/^[0-9]$/.test(targetKey)) {
    const codeMatch = e.code === `Digit${targetKey}` || e.code === `Numpad${targetKey}`;
    const keyMatch = e.key === targetKey;
    return codeMatch || keyMatch;
  }

  // General fallback
  return e.key.toLowerCase() === targetKey.toLowerCase();
}

/** Built-in application commands catalog */
export const APP_COMMANDS: AppCommand[] = [
  {
    id: 'search:open',
    title: 'Быстрый поиск и команды',
    description: 'Открыть окно поиска заметок, задач и команд',
    category: 'Поиск и навигация',
    keywords: ['поиск', 'найти', 'search', 'find'],
    shortcut: 'mod+f',
    aliases: ['mod+k'],
    allowInInput: true,
    run: (ctx) => {
      ctx.openSearch();
    },
  },
  {
    id: 'assistant:toggle',
    title: 'Переключить Ассистента',
    description: 'Открыть или скрыть панель ИИ-Копилота',
    category: 'Интерфейс',
    keywords: ['ассистент', 'ии', 'ai', 'копилот', 'copilot', 'чат', 'assistant'],
    shortcut: 'mod+j',
    allowInInput: true,
    run: (ctx) => {
      ctx.toggleAssistant();
    },
  },
  {
    id: 'logs:toggle',
    title: 'Системные логи & HUD',
    description: 'Открыть консоль диагностики и логов в реальном времени',
    category: 'Интерфейс',
    keywords: ['логи', 'hud', 'лог', 'консоль', 'диагностика', 'logs'],
    shortcut: 'mod+`',
    allowInInput: true,
    run: (ctx) => {
      ctx.toggleLogs();
    },
  },
  {
    id: 'composer:task',
    title: 'Создать таску',
    description: 'Открыть форму быстрого создания задачи',
    category: 'Создание',
    keywords: ['задача', 'задачи', 'таск', 'task', 'todo', 'дело'],
    shortcut: 'c',
    allowInInput: false,
    isEnabled: (ctx) => !ctx.isOverlayOpen(),
    run: (ctx) => {
      ctx.openComposer({ type: 'task' });
    },
  },
  {
    id: 'composer:note',
    title: 'Создать заметку',
    description: 'Открыть форму быстрого создания заметки',
    category: 'Создание',
    keywords: ['заметка', 'заметки', 'текст', 'note', 'memo'],
    shortcut: 'n',
    allowInInput: false,
    isEnabled: (ctx) => !ctx.isOverlayOpen(),
    run: (ctx) => {
      ctx.openComposer({ type: 'note' });
    },
  },
  {
    id: 'settings:open',
    title: 'Настройки приложения',
    description: 'Открыть параметры ИИ, хранилища и интерфейса',
    category: 'Интерфейс',
    keywords: ['настройки', 'параметры', 'settings', 'конфиг'],
    shortcut: 'mod+,',
    allowInInput: true,
    run: (ctx) => {
      ctx.openSettings();
    },
  },
  {
    id: 'settings:shortcuts',
    title: 'Справочник горячих клавиш',
    description: 'Посмотреть список всех клавиатурных комбинаций',
    category: 'Интерфейс',
    keywords: ['хоткеи', 'шорткаты', 'горячие клавиши', 'shortcuts', 'клавиши'],
    allowInInput: true,
    run: (ctx) => {
      ctx.openSettings('shortcuts');
    },
  },
];
