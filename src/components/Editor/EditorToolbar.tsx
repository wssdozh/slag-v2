import React from 'react';
import type { SlagAttachment, SlagItem, SlagItemType } from '../../types';
import { Select } from '../UI/Select';
import {
  ArrowLeft,
  Save,
  Trash2,
  Bold,
  Italic,
  Heading1,
  Heading2,
  List,
  CheckSquare,
  Code,
  Quote,
  Link2,
  Paperclip,
  Undo2,
  Redo2,
  Sparkles,
  Table,
  Maximize2,
  Minimize2,
  Eye,
  ChevronDown,
  Strikethrough,
  X,
} from 'lucide-react';
import { startDraggingWindow, toggleMaximizeWindow } from '../../lib/windowControls';

export interface EditorToolbarProps {
  item: SlagItem;
  folder: string;
  onFolderChange: (folder: string) => void;
  folderOptions: Array<{ value: string; label: string; dividerBefore?: boolean }>;
  type: SlagItemType;
  onTypeChange: (type: SlagItemType) => void;
  selectedAttachment: SlagAttachment | undefined;
  onSelectAttachment: (id: string | null) => void;
  onRemoveAttachment: (id: string) => void;
  onInsertAttachmentMarkdown: (name: string) => void;
  onOpenLightbox: (attachments: Array<{
    id: string;
    name: string;
    url: string;
    itemId?: string;
  }>, index: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onInsertMarkdown: (prefix: string, suffix?: string) => void;
  onInsertTable: () => void;
  onAttachClick: () => void;
  onAiDecompose: () => void;
  isZenMode: boolean;
  onToggleZenMode: () => void;
  isFullWidth: boolean;
  onToggleFullWidth: () => void;
  saveStatus: 'idle' | 'saving' | 'saved';
  onSave: () => void;
  onClose: () => void;
  /** Sheet mode: the toolbar sits inside the panel, not under the status bar. */
  isCompact?: boolean;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  item,
  folder,
  onFolderChange,
  folderOptions,
  type,
  onTypeChange,
  selectedAttachment,
  onSelectAttachment,
  onRemoveAttachment,
  onInsertAttachmentMarkdown,
  onOpenLightbox,
  onUndo,
  onRedo,
  onInsertMarkdown,
  onInsertTable,
  onAttachClick,
  onAiDecompose,
  isZenMode,
  onToggleZenMode,
  isFullWidth,
  onToggleFullWidth,
  saveStatus,
  onSave,
  onClose,
  isCompact = false,
}) => {
  const [activeTopDropdown, setActiveTopDropdown] = React.useState<'style' | 'list' | null>(null);

  return (
    <header
      onMouseDown={(e) => {
        if (e.button === 0 && !(e.target as HTMLElement).closest('button, input, [role="button"], [role="listbox"], a')) {
          startDraggingWindow();
        }
      }}
      onDoubleClick={(e) => {
        if (!(e.target as HTMLElement).closest('button, input, [role="button"], [role="listbox"], a')) {
          toggleMaximizeWindow();
        }
      }}
      className={`border-b border-white/[0.04] bg-surface shrink-0 sticky top-0 z-30 transition-opacity duration-200 select-none ${
        isCompact ? 'min-h-11' : 'min-h-14'
      } ${isZenMode ? 'opacity-0 hover:opacity-100' : 'opacity-100'}`}
      style={{ paddingTop: isCompact ? 0 : 'max(var(--sat), 0px)' }}
    >
      {/* Invisible Backdrop to dismiss active top dropdown */}
      {activeTopDropdown && (
        <div
          className="fixed inset-0 z-40 bg-transparent"
          onClick={() => setActiveTopDropdown(null)}
        />
      )}

      <div
        className={`relative w-full h-full flex items-center justify-between px-4 md:px-6 gap-2 md:gap-3 ${
          isCompact ? 'py-1.5' : 'py-2.5'
        }`}
      >
        <div className="flex items-center gap-2 md:gap-2.5 shrink-0 z-10">
          {/* Back Button: pure icon */}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] motion-press cursor-pointer"
            title="Назад к ленте (Escape)"
            aria-label="Назад к ленте"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="sr-only">Назад</span>
          </button>

          {/* Vertical Divider */}
          <div className="h-4 w-px bg-white/[0.08] shrink-0" />

          {/* Folder Selector: ghost droplist without podlozhka, showing full hierarchical path */}
          <Select
            size="sm"
            variant="ghost"
            value={folder}
            onChange={onFolderChange}
            options={folderOptions}
            className="max-w-[220px] md:max-w-[280px] h-7 text-xs font-mono"
          />

          {/* Vertical Divider */}
          <div className="h-4 w-px bg-white/[0.08] shrink-0 hidden sm:block" />

          {/* Item Type Switcher: flat radio buttons without container podlozhka */}
          <div className="hidden sm:flex items-center gap-0.5">
            {(['note', 'task', 'article'] as SlagItemType[]).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => onTypeChange(t)}
                className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                  type === t ? 'bg-white/10 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
                }`}
              >
                {t === 'note' ? 'Заметка' : t === 'task' ? 'Таска' : 'Статья'}
              </button>
            ))}
          </div>
        </div>

        {/* Teletype Center Utilities: Context-Aware for Selected Object (Text, Image, Audio, File) - Centered & Scaled */}
        <div className="hidden md:flex items-center justify-center absolute left-1/2 -translate-x-1/2 z-50">
          {selectedAttachment ? (
            /* Selected Object (Media / File) Action Bar */
            <div className="flex items-center gap-1.5 text-xs text-zinc-300">
              <div className="h-4 w-px bg-white/[0.08] shrink-0" />

              <span className="flex items-center gap-1.5 text-zinc-200 font-mono text-xs max-w-[180px] truncate pl-0.5">
                <span className="text-sm">
                  {selectedAttachment.type === 'image' ? '🖼' : selectedAttachment.type === 'audio' ? '🎙' : '📎'}
                </span>
                <span className="truncate font-medium">{selectedAttachment.name}</span>
              </span>

              <div className="h-4 w-px bg-white/[0.08] mx-0.5 shrink-0" />

              {selectedAttachment.type === 'image' && (
                <button
                  type="button"
                  onClick={() => {
                    if (selectedAttachment.dataUrl) {
                      onOpenLightbox([{
                        id: selectedAttachment.id,
                        name: selectedAttachment.name,
                        url: selectedAttachment.dataUrl,
                        itemId: item.id,
                      }], 0);
                    }
                  }}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-zinc-300 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                  title="Открыть изображение (Lightbox)"
                >
                  <Eye className="w-4 h-4 text-blue-400" />
                  <span>Просмотр</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => onInsertAttachmentMarkdown(selectedAttachment.name)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-zinc-300 hover:text-white hover:bg-white/[0.08] text-xs font-mono transition-colors cursor-pointer"
                title="Вставить ссылку ![[файл]] в курсор текста"
              >
                <Link2 className="w-4 h-4 text-emerald-400" />
                <span>Вставить</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onRemoveAttachment(selectedAttachment.id);
                  onSelectAttachment(null);
                }}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                title="Удалить файл"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <div className="h-4 w-px bg-white/[0.08] mx-0.5 shrink-0" />

              <button
                type="button"
                onClick={() => onSelectAttachment(null)}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.08] transition-colors cursor-pointer"
                title="Снять выбор (вернуть текст)"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="h-4 w-px bg-white/[0.08] shrink-0" />
            </div>
          ) : (
            /* Teletype Text Context Bar - Scaled, Centered, No Podlozhka, Edge Dividers */
            <div className="flex items-center gap-1 text-xs text-zinc-300">
              {/* Left Edge Divider */}
              <div className="h-4 w-px bg-white/[0.08] shrink-0" />

              {/* History: Undo / Redo */}
              <button
                type="button"
                onClick={onUndo}
                className="p-1.5 rounded-md hover:text-white hover:bg-white/[0.06] motion-press cursor-pointer text-zinc-400"
                title="Отменить (Ctrl+Z)"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onRedo}
                className="p-1.5 rounded-md hover:text-white hover:bg-white/[0.06] motion-press cursor-pointer text-zinc-400"
                title="Повторить (Ctrl+Y)"
              >
                <Redo2 className="w-4 h-4" />
              </button>

              <div className="h-3.5 w-px bg-white/[0.08] mx-0.5 shrink-0" />

              {/* Aa Text Styles Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setActiveTopDropdown(prev => prev === 'style' ? null : 'style')}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    activeTopDropdown === 'style' ? 'bg-white/10 text-white' : 'text-zinc-300 hover:text-white hover:bg-white/[0.06]'
                  }`}
                  title="Стили текста (Aa)"
                >
                  <span className="font-semibold text-sm leading-none">Aa</span>
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                </button>

                {activeTopDropdown === 'style' && (
                  <div className="absolute top-full mt-1.5 left-0 w-44 rounded-xl bg-surface-elevated border border-white/[0.1] shadow-2xl p-1 z-50 text-xs flex flex-col gap-0.5 motion-popover">
                    <button
                      type="button"
                      onClick={() => {
                        onInsertMarkdown('# ', '');
                        setActiveTopDropdown(null);
                      }}
                      className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-zinc-200 hover:bg-white/[0.08] transition-colors cursor-pointer"
                    >
                      <Heading1 className="w-4 h-4 text-zinc-400" />
                      <span>Заголовок 1</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onInsertMarkdown('## ', '');
                        setActiveTopDropdown(null);
                      }}
                      className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-zinc-200 hover:bg-white/[0.08] transition-colors cursor-pointer"
                    >
                      <Heading2 className="w-4 h-4 text-zinc-400" />
                      <span>Заголовок 2</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onInsertMarkdown('### ', '');
                        setActiveTopDropdown(null);
                      }}
                      className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-zinc-200 hover:bg-white/[0.08] transition-colors cursor-pointer"
                    >
                      <span className="font-mono text-xs text-zinc-400 font-bold px-0.5">H3</span>
                      <span>Заголовок 3</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onInsertMarkdown('> ', '');
                        setActiveTopDropdown(null);
                      }}
                      className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-zinc-200 hover:bg-white/[0.08] transition-colors cursor-pointer"
                    >
                      <Quote className="w-4 h-4 text-zinc-400" />
                      <span>Цитата</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onInsertMarkdown('```\n', '\n```');
                        setActiveTopDropdown(null);
                      }}
                      className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-zinc-200 hover:bg-white/[0.08] transition-colors cursor-pointer"
                    >
                      <Code className="w-4 h-4 text-zinc-400" />
                      <span>Блок кода</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Lists & Alignment Dropdown (≡ ▾) */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setActiveTopDropdown(prev => prev === 'list' ? null : 'list')}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    activeTopDropdown === 'list' ? 'bg-white/10 text-white' : 'text-zinc-300 hover:text-white hover:bg-white/[0.06]'
                  }`}
                  title="Списки и структуры (≡)"
                >
                  <List className="w-4 h-4" />
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                </button>

                {activeTopDropdown === 'list' && (
                  <div className="absolute top-full mt-1.5 left-0 w-48 rounded-xl bg-surface-elevated border border-white/[0.1] shadow-2xl p-1 z-50 text-xs flex flex-col gap-0.5 motion-popover">
                    <button
                      type="button"
                      onClick={() => {
                        onInsertMarkdown('- ', '');
                        setActiveTopDropdown(null);
                      }}
                      className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-zinc-200 hover:bg-white/[0.08] transition-colors cursor-pointer"
                    >
                      <List className="w-4 h-4 text-zinc-400" />
                      <span>Маркированный список</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onInsertMarkdown('1. ', '');
                        setActiveTopDropdown(null);
                      }}
                      className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-zinc-200 hover:bg-white/[0.08] transition-colors cursor-pointer"
                    >
                      <span className="font-mono text-xs text-zinc-400 font-bold px-0.5">1.</span>
                      <span>Нумерованный список</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onInsertMarkdown('- [ ] ', '');
                        setActiveTopDropdown(null);
                      }}
                      className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-zinc-200 hover:bg-white/[0.08] transition-colors cursor-pointer"
                    >
                      <CheckSquare className="w-4 h-4 text-zinc-400" />
                      <span>Чек-лист задач</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onInsertTable();
                        setActiveTopDropdown(null);
                      }}
                      className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-zinc-200 hover:bg-white/[0.08] transition-colors cursor-pointer"
                    >
                      <Table className="w-4 h-4 text-zinc-400" />
                      <span>Таблица Markdown</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="h-3.5 w-px bg-white/[0.08] mx-0.5 shrink-0" />

              {/* Inline Formatting: B, I, S, Inline Code */}
              <button
                type="button"
                onClick={() => onInsertMarkdown('**', '**')}
                className="p-1.5 rounded-md hover:text-white hover:bg-white/[0.06] motion-press cursor-pointer font-bold"
                title="Жирный (Ctrl+B)"
              >
                <Bold className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onInsertMarkdown('*', '*')}
                className="p-1.5 rounded-md hover:text-white hover:bg-white/[0.06] motion-press cursor-pointer italic"
                title="Курсив (Ctrl+I)"
              >
                <Italic className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onInsertMarkdown('~~', '~~')}
                className="p-1.5 rounded-md hover:text-white hover:bg-white/[0.06] motion-press cursor-pointer"
                title="Зачёркнутый"
              >
                <Strikethrough className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onInsertMarkdown('`', '`')}
                className="p-1.5 rounded-md hover:text-white hover:bg-white/[0.06] motion-press cursor-pointer"
                title="Инлайн-код"
              >
                <Code className="w-4 h-4" />
              </button>

              <div className="h-3.5 w-px bg-white/[0.08] mx-0.5 shrink-0" />

              {/* Anchor / Link (⚓) */}
              <button
                type="button"
                onClick={() => onInsertMarkdown('[[', ']]')}
                className="p-1.5 rounded-md hover:text-white hover:bg-white/[0.06] motion-press cursor-pointer"
                title="Ссылка [[заметка]]"
              >
                <Link2 className="w-4 h-4" />
              </button>

              {/* Attachments / Paperclip */}
              <button
                type="button"
                onClick={onAttachClick}
                className="p-1.5 rounded-md hover:text-white hover:bg-white/[0.06] motion-press cursor-pointer"
                title="Прикрепить файл, фото или медиа"
              >
                <Paperclip className="w-4 h-4 text-zinc-400" />
              </button>

              <div className="h-3.5 w-px bg-white/[0.08] mx-0.5 shrink-0" />

              {/* AI Sparkles */}
              <button
                type="button"
                onClick={onAiDecompose}
                className="p-1.5 rounded-md text-zinc-400 hover:text-purple-300 hover:bg-purple-500/10 motion-press cursor-pointer"
                title="Разобрать через ИИ (папка и теги)"
              >
                <Sparkles className="w-4 h-4" />
              </button>

              {/* Right Edge Divider */}
              <div className="h-4 w-px bg-white/[0.08] shrink-0" />
            </div>
          )}
        </div>

        {/* Stats & Actions */}
        <div className="flex items-center gap-2 md:gap-2.5 text-xs text-zinc-400 ml-auto shrink-0 z-10">
          {/* Live Autosave Status Indicator */}
          {saveStatus === 'saving' && (
            <span className="text-[11px] font-mono text-zinc-500 transition-opacity">
              сохранение...
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="text-[11px] font-mono text-emerald-500/80 transition-opacity">
              сохранено
            </span>
          )}

          {/* Reading measure / width toggle: Focus (768px) vs Wide (1024px) */}
          <button
            type="button"
            onClick={onToggleFullWidth}
            className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
              isFullWidth
                ? 'text-white bg-white/10 border border-white/10'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
            }`}
            title={isFullWidth ? 'Стандартная ширина фокуса (768px)' : 'Широкая область (1024px)'}
          >
            {isFullWidth ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Zen Mode Toggle */}
          <button
            type="button"
            onClick={onToggleZenMode}
            className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
              isZenMode
                ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
            }`}
            title={isZenMode ? 'Выйти из режима фокуса (Zen)' : 'Режим полного фокуса (Zen)'}
          >
            <Eye className="w-4 h-4" />
          </button>

          {/* Linear Dark Save Button (no kbd badge) */}
          <button
            onClick={onSave}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-zinc-100 text-xs font-medium border border-white/[0.08] hover:border-white/[0.16] shadow-sm cursor-pointer motion-press"
            title="Сохранить изменения (Ctrl+S / ⌘S)"
          >
            <Save className="w-4 h-4 text-zinc-300" />
            <span>{item.id.startsWith('draft_') ? 'Создать' : 'Готово'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
