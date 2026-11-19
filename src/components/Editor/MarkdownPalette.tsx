// Markdown utilities: history, styles, lists, inline formatting, links, attachments, AI.
import React from 'react';
import { Icon } from '../UI/icons/Icon';
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
        <div className="flex items-center gap-1.5 text-xs text-fg-tertiary">
          <div className="h-4 w-px bg-tint-8 shrink-0" />

          <span className="flex items-center gap-1.5 text-fg-soft font-mono text-xs max-w-[180px] truncate pl-0.5">
            <span className="text-sm">
              {selectedAttachment.type === 'image' ? '🖼' : selectedAttachment.type === 'audio' ? '🎙' : '📎'}
            </span>
            <span className="truncate font-medium">{selectedAttachment.name}</span>
          </span>

          <div className="h-4 w-px bg-tint-8 mx-0.5 shrink-0" />

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
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-fg-tertiary hover:text-white hover:bg-tint-8 transition-colors cursor-pointer"
              title="Открыть изображение (Lightbox)"
            >
              <Icon name="action.preview" size="md" tone="accent" />
              <span>Просмотр</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onInsertAttachmentMarkdown(selectedAttachment.name)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-fg-tertiary hover:text-white hover:bg-tint-8 text-xs font-mono transition-colors cursor-pointer"
            title="Вставить ссылку ![[файл]] в курсор текста"
          >
            <Icon name="action.link" size="md" tone="success" />
            <span>Вставить</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onRemoveAttachment(selectedAttachment.id);
              onSelectAttachment(null);
            }}
            className="p-1.5 rounded-lg text-fg-secondary hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
            title="Удалить файл"
          >
            <Icon name="action.delete" size="md" tone="inherit" />
          </button>

          <div className="h-4 w-px bg-tint-8 mx-0.5 shrink-0" />

          <button
            type="button"
            onClick={() => onSelectAttachment(null)}
            className="p-1.5 rounded-lg text-fg-muted hover:text-fg-soft hover:bg-tint-8 transition-colors cursor-pointer"
            title="Снять выбор (вернуть текст)"
          >
            <Icon name="action.close" size="md" tone="inherit" />
          </button>

          <div className="h-4 w-px bg-tint-8 shrink-0" />
        </div>
      ) : (
        /* Teletype Text Context Bar - Scaled, Centered, No Podlozhka, Edge Dividers */
        <div className="flex items-center gap-1 text-xs text-fg-tertiary">
          {/* Left Edge Divider */}
          <div className="h-4 w-px bg-tint-8 shrink-0" />

          {/* History: Undo / Redo */}
          <button
            type="button"
            onClick={onUndo}
            className="p-1.5 rounded-md hover:text-white hover:bg-tint-6 motion-press cursor-pointer text-fg-secondary"
            title="Отменить (Ctrl+Z)"
          >
            <Icon name="action.undo" size="md" tone="inherit" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            className="p-1.5 rounded-md hover:text-white hover:bg-tint-6 motion-press cursor-pointer text-fg-secondary"
            title="Повторить (Ctrl+Y)"
          >
            <Icon name="action.redo" size="md" tone="inherit" />
          </button>

          <div className="h-3.5 w-px bg-tint-8 mx-0.5 shrink-0" />

          {/* Aa Text Styles Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => onActiveDropdownChange(activeDropdown === 'style' ? null : 'style')}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeDropdown === 'style' ? 'bg-tint-10 text-white' : 'text-fg-tertiary hover:text-white hover:bg-tint-6'
              }`}
              title="Стили текста (Aa)"
            >
              <span className="font-semibold text-sm leading-none">Aa</span>
              <Icon name="nav.down" size="sm" tone="muted" />
            </button>

            {activeDropdown === 'style' && (
              <div className="absolute top-full mt-1.5 left-0 w-44 rounded-xl bg-surface-elevated border border-tint-10 shadow-2xl p-1 z-50 text-xs flex flex-col gap-0.5 motion-popover">
                <button
                  type="button"
                  onClick={() => {
                    onInsertMarkdown('# ', '');
                    onActiveDropdownChange(null);
                  }}
                  className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-fg-soft hover:bg-tint-8 transition-colors cursor-pointer"
                >
                  <Icon name="format.h1" size="md" />
                  <span>Заголовок 1</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onInsertMarkdown('## ', '');
                    onActiveDropdownChange(null);
                  }}
                  className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-fg-soft hover:bg-tint-8 transition-colors cursor-pointer"
                >
                  <Icon name="format.h2" size="md" />
                  <span>Заголовок 2</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onInsertMarkdown('### ', '');
                    onActiveDropdownChange(null);
                  }}
                  className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-fg-soft hover:bg-tint-8 transition-colors cursor-pointer"
                >
                  <span className="font-mono text-xs text-fg-secondary font-bold px-0.5">H3</span>
                  <span>Заголовок 3</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onInsertMarkdown('> ', '');
                    onActiveDropdownChange(null);
                  }}
                  className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-fg-soft hover:bg-tint-8 transition-colors cursor-pointer"
                >
                  <Icon name="format.quote" size="md" />
                  <span>Цитата</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onInsertMarkdown('```\n', '\n```');
                    onActiveDropdownChange(null);
                  }}
                  className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-fg-soft hover:bg-tint-8 transition-colors cursor-pointer"
                >
                  <Icon name="format.code" size="md" />
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
                activeDropdown === 'list' ? 'bg-tint-10 text-white' : 'text-fg-tertiary hover:text-white hover:bg-tint-6'
              }`}
              title="Списки и структуры (≡)"
            >
              <Icon name="format.list" size="md" tone="inherit" />
              <Icon name="nav.down" size="sm" tone="muted" />
            </button>

            {activeDropdown === 'list' && (
              <div className="absolute top-full mt-1.5 left-0 w-48 rounded-xl bg-surface-elevated border border-tint-10 shadow-2xl p-1 z-50 text-xs flex flex-col gap-0.5 motion-popover">
                <button
                  type="button"
                  onClick={() => {
                    onInsertMarkdown('- ', '');
                    onActiveDropdownChange(null);
                  }}
                  className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-fg-soft hover:bg-tint-8 transition-colors cursor-pointer"
                >
                  <Icon name="format.list" size="md" />
                  <span>Маркированный список</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onInsertMarkdown('1. ', '');
                    onActiveDropdownChange(null);
                  }}
                  className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-fg-soft hover:bg-tint-8 transition-colors cursor-pointer"
                >
                  <span className="font-mono text-xs text-fg-secondary font-bold px-0.5">1.</span>
                  <span>Нумерованный список</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onInsertMarkdown('- [ ] ', '');
                    onActiveDropdownChange(null);
                  }}
                  className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-fg-soft hover:bg-tint-8 transition-colors cursor-pointer"
                >
                  <Icon name="entity.task" size="md" />
                  <span>Чек-лист задач</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onInsertTable();
                    onActiveDropdownChange(null);
                  }}
                  className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-fg-soft hover:bg-tint-8 transition-colors cursor-pointer"
                >
                  <Icon name="format.table" size="md" />
                  <span>Таблица Markdown</span>
                </button>
              </div>
            )}
          </div>

          <div className="h-3.5 w-px bg-tint-8 mx-0.5 shrink-0" />

          {/* Inline Formatting: B, I, S, Inline Code */}
          <button
            type="button"
            onClick={() => onInsertMarkdown('**', '**')}
            className="p-1.5 rounded-md hover:text-white hover:bg-tint-6 motion-press cursor-pointer font-bold"
            title="Жирный (Ctrl+B)"
          >
            <Icon name="format.bold" size="md" tone="inherit" />
          </button>
          <button
            type="button"
            onClick={() => onInsertMarkdown('*', '*')}
            className="p-1.5 rounded-md hover:text-white hover:bg-tint-6 motion-press cursor-pointer italic"
            title="Курсив (Ctrl+I)"
          >
            <Icon name="format.italic" size="md" tone="inherit" />
          </button>
          <button
            type="button"
            onClick={() => onInsertMarkdown('~~', '~~')}
            className="p-1.5 rounded-md hover:text-white hover:bg-tint-6 motion-press cursor-pointer"
            title="Зачёркнутый"
          >
            <Icon name="format.strike" size="md" tone="inherit" />
          </button>
          <button
            type="button"
            onClick={() => onInsertMarkdown('`', '`')}
            className="p-1.5 rounded-md hover:text-white hover:bg-tint-6 motion-press cursor-pointer"
            title="Инлайн-код"
          >
            <Icon name="format.code" size="md" tone="inherit" />
          </button>

          <div className="h-3.5 w-px bg-tint-8 mx-0.5 shrink-0" />

          {/* Anchor / Link (⚓) */}
          <button
            type="button"
            onClick={() => onInsertMarkdown('[[', ']]')}
            className="p-1.5 rounded-md hover:text-white hover:bg-tint-6 motion-press cursor-pointer"
            title="Ссылка [[заметка]]"
          >
            <Icon name="action.link" size="md" tone="inherit" />
          </button>

          {/* Attachments / Paperclip */}
          <button
            type="button"
            onClick={onAttachClick}
            className="p-1.5 rounded-md hover:text-white hover:bg-tint-6 motion-press cursor-pointer"
            title="Прикрепить файл, фото или медиа"
          >
            <Icon name="action.attach" size="md" />
          </button>

          <div className="h-3.5 w-px bg-tint-8 mx-0.5 shrink-0" />

          {/* Right Edge Divider */}
          <div className="h-4 w-px bg-tint-8 shrink-0" />
        </div>
      )}
    </div>
  );
};
