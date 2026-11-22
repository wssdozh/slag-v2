// Markdown utilities: history, styles, lists, inline formatting, links, attachments, AI.
import React from 'react';
import { Icon } from '../UI/icons/Icon';
import { MenuDropdown } from '../UI/MenuDropdown';
import { FOLDED_QUOTE_PREFIX, SPOILER_MARKER } from '../../lib/text/noteDisclosure';
import type { MarkdownPaletteProps } from './editorToolbarParts';

export const MarkdownPalette: React.FC<MarkdownPaletteProps> = ({
  onUndo,
  onRedo,
  onInsertMarkdown,
  onInsertTable,
  onAttachClick,
  activeDropdown,
  onActiveDropdownChange,
}) => {
  return (
    <div className="relative z-50 hidden min-w-0 flex-1 items-center justify-start gap-1 overflow-x-auto scrollbar-none md:flex">
      <div className="flex items-center gap-1 text-xs text-fg-tertiary">
        {/* Left Edge Divider */}
        <div className="h-4 w-px bg-tint-8 shrink-0" />

        {/* History: Undo / Redo */}
        <button
          type="button"
          onClick={onUndo}
          className="p-1.5 rounded-md hover:text-white hover:bg-tint-6 motion-press cursor-pointer text-fg-secondary"
          data-hint="Отменить (Ctrl+Z)" aria-label="Отменить (Ctrl+Z)"
        >
          <Icon name="action.undo" size="md" tone="inherit" />
        </button>
        <button
          type="button"
          onClick={onRedo}
          className="p-1.5 rounded-md hover:text-white hover:bg-tint-6 motion-press cursor-pointer text-fg-secondary"
          data-hint="Повторить (Ctrl+Y)" aria-label="Повторить (Ctrl+Y)"
        >
          <Icon name="action.redo" size="md" tone="inherit" />
        </button>

        <div className="h-3.5 w-px bg-tint-8 mx-0.5 shrink-0" />

        {/* Aa Text Styles Dropdown */}
        <MenuDropdown
          isOpen={activeDropdown === 'style'}
          onOpenChange={open => onActiveDropdownChange(open ? 'style' : null)}
          minWidth={176}
          dropdownClassName="text-xs flex flex-col gap-0.5 [&>*]:shrink-0"
          trigger={
            <button
              type="button"
              aria-expanded={activeDropdown === 'style'}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeDropdown === 'style' ? 'bg-tint-10 text-white' : 'text-fg-tertiary hover:text-white hover:bg-tint-6'
              }`}
              data-hint="Стили текста (Aa)" aria-label="Стили текста (Aa)"
            >
              <span className="font-semibold text-sm leading-none">Aa</span>
              <Icon name="nav.down" size="sm" tone="muted" />
            </button>
          }
        >
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
        </MenuDropdown>

        {/* Lists & Alignment Dropdown (≡ ▾) */}
        <MenuDropdown
          isOpen={activeDropdown === 'list'}
          onOpenChange={open => onActiveDropdownChange(open ? 'list' : null)}
          minWidth={192}
          dropdownClassName="text-xs flex flex-col gap-0.5 [&>*]:shrink-0"
          trigger={
            <button
              type="button"
              aria-expanded={activeDropdown === 'list'}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeDropdown === 'list' ? 'bg-tint-10 text-white' : 'text-fg-tertiary hover:text-white hover:bg-tint-6'
              }`}
              data-hint="Списки и структуры (≡)" aria-label="Списки и структуры (≡)"
            >
              <Icon name="format.list" size="md" tone="inherit" />
              <Icon name="nav.down" size="sm" tone="muted" />
            </button>
          }
        >
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
        </MenuDropdown>

        <div className="h-3.5 w-px bg-tint-8 mx-0.5 shrink-0" />

        {/* Inline Formatting: B, I, S, Inline Code */}
        <button
          type="button"
          onClick={() => onInsertMarkdown('**', '**')}
          className="p-1.5 rounded-md hover:text-white hover:bg-tint-6 motion-press cursor-pointer font-bold"
          data-hint="Жирный (Ctrl+B)" aria-label="Жирный (Ctrl+B)"
        >
          <Icon name="format.bold" size="md" tone="inherit" />
        </button>
        <button
          type="button"
          onClick={() => onInsertMarkdown('*', '*')}
          className="p-1.5 rounded-md hover:text-white hover:bg-tint-6 motion-press cursor-pointer italic"
          data-hint="Курсив (Ctrl+I)" aria-label="Курсив (Ctrl+I)"
        >
          <Icon name="format.italic" size="md" tone="inherit" />
        </button>
        <button
          type="button"
          onClick={() => onInsertMarkdown('~~', '~~')}
          className="p-1.5 rounded-md hover:text-white hover:bg-tint-6 motion-press cursor-pointer"
          data-hint="Зачёркнутый" aria-label="Зачёркнутый"
        >
          <Icon name="format.strike" size="md" tone="inherit" />
        </button>
        <button
          type="button"
          onClick={() => onInsertMarkdown('`', '`')}
          className="p-1.5 rounded-md hover:text-white hover:bg-tint-6 motion-press cursor-pointer"
          data-hint="Инлайн-код" aria-label="Инлайн-код"
        >
          <Icon name="format.code" size="md" tone="inherit" />
        </button>

        <div className="h-3.5 w-px bg-tint-8 mx-0.5 shrink-0" />

        {[
          ['Сворачиваемая цитата', FOLDED_QUOTE_PREFIX, '\n\n'],
          ['Спойлер', SPOILER_MARKER, SPOILER_MARKER],
        ].map(([label, prefix, suffix]) => (
          <button key={label} type="button" data-hint={label} aria-label={label}
            onClick={() => onInsertMarkdown(prefix, suffix)}
            className="p-1.5 rounded-md hover:text-white hover:bg-tint-6 focus-visible:bg-tint-8 motion-press cursor-pointer"
          >
            {prefix === SPOILER_MARKER ? <span className="font-mono text-xs">||</span> : <Icon name="format.quote" size="md" />}
          </button>
        ))}

        {/* Anchor / Link (⚓) */}
        <button
          type="button"
          onClick={() => onInsertMarkdown('[[', ']]')}
          className="p-1.5 rounded-md hover:text-white hover:bg-tint-6 motion-press cursor-pointer"
          data-hint="Ссылка [[заметка]]" aria-label="Ссылка [[заметка]]"
        >
          <Icon name="action.link" size="md" tone="inherit" />
        </button>

        {/* Attachments / Paperclip */}
        <button
          type="button"
          onClick={onAttachClick}
          className="p-1.5 rounded-md hover:text-white hover:bg-tint-6 motion-press cursor-pointer"
          data-hint="Прикрепить файл, фото или медиа" aria-label="Прикрепить файл, фото или медиа"
        >
          <Icon name="action.attach" size="md" />
        </button>
      </div>
    </div>
  );
};
