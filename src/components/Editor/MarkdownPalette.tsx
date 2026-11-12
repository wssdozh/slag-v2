// Markdown utilities: history, styles, lists, inline formatting, links, attachments, AI.
import React from 'react';
import {
  Undo2,
  Redo2,
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
  Sparkles,
  Table,
  ChevronDown,
  Strikethrough,
  X,
  Trash2,
  Eye,
} from 'lucide-react';
import { storage } from '../../lib/storage';
import type { MarkdownPaletteProps } from './editorToolbarParts';

export const MarkdownPalette: React.FC<MarkdownPaletteProps> = ({
  itemId,
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
  activeDropdown,
  onActiveDropdownChange,
}) => {
  return (
    /* Teletype Center Utilities: Context-Aware for Selected Object (Text, Image, Audio, File).
        In flow, not absolutely centred: a docked editor is as narrow as its pane, and a floating
        cluster would sit on top of the right-hand actions. */
    /* Above the dropdown backdrop (z-40), or the trigger cannot close its own panel. */
    <div className="relative z-50 hidden md:flex min-w-0 flex-1 items-center justify-start gap-1 overflow-x-auto scrollbar-none">
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
                void storage
                  .getAttachmentUrl(selectedAttachment.id, selectedAttachment.relativePath, selectedAttachment.mimeType)
                  .then((url) => {
                    if (!url) return;
                    onOpenLightbox([{
                      id: selectedAttachment.id,
                      name: selectedAttachment.name,
                      url,
                      itemId,
                    }], 0);
                  });
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
              onClick={() => onActiveDropdownChange(activeDropdown === 'style' ? null : 'style')}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeDropdown === 'style' ? 'bg-white/10 text-white' : 'text-zinc-300 hover:text-white hover:bg-white/[0.06]'
              }`}
              title="Стили текста (Aa)"
            >
              <span className="font-semibold text-sm leading-none">Aa</span>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
            </button>

            {activeDropdown === 'style' && (
              <div className="absolute top-full mt-1.5 left-0 w-44 rounded-xl bg-surface-elevated border border-white/[0.1] shadow-2xl p-1 z-50 text-xs flex flex-col gap-0.5 motion-popover">
                <button
                  type="button"
                  onClick={() => {
                    onInsertMarkdown('# ', '');
                    onActiveDropdownChange(null);
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
                    onActiveDropdownChange(null);
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
                    onActiveDropdownChange(null);
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
                    onActiveDropdownChange(null);
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
                    onActiveDropdownChange(null);
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
              onClick={() => onActiveDropdownChange(activeDropdown === 'list' ? null : 'list')}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeDropdown === 'list' ? 'bg-white/10 text-white' : 'text-zinc-300 hover:text-white hover:bg-white/[0.06]'
              }`}
              title="Списки и структуры (≡)"
            >
              <List className="w-4 h-4" />
              <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
            </button>

            {activeDropdown === 'list' && (
              <div className="absolute top-full mt-1.5 left-0 w-48 rounded-xl bg-surface-elevated border border-white/[0.1] shadow-2xl p-1 z-50 text-xs flex flex-col gap-0.5 motion-popover">
                <button
                  type="button"
                  onClick={() => {
                    onInsertMarkdown('- ', '');
                    onActiveDropdownChange(null);
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
                    onActiveDropdownChange(null);
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
                    onActiveDropdownChange(null);
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
                    onActiveDropdownChange(null);
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
  );
};
