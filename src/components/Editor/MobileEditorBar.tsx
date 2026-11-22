// The phone formatting bar: style, list and AI popovers above a single save button.
import React from 'react';
import { Icon } from '../UI/icons/Icon';
import { SendButton } from '../UI/SendButton';
import { FOLDED_QUOTE_PREFIX, SPOILER_MARKER } from '../../lib/text/noteDisclosure';

export interface MobileEditorBarProps {
  ref?: React.Ref<HTMLDivElement>;
  isDraft: boolean;
  activePopover: 'formatting' | 'lists' | 'ai' | null;
  onSetActivePopover: (popover: 'formatting' | 'lists' | 'ai' | null) => void;
  onInsertMarkdown: (prefix: string, suffix?: string) => void;
  onInsertTable: () => void;
  onAttachClick: () => void;
  onAiDecompose: () => void;
  onAiTags: () => void;
  onSave: () => void;
}

export const MobileEditorBar: React.FC<MobileEditorBarProps> = ({
  ref,
  isDraft,
  activePopover,
  onSetActivePopover,
  onInsertMarkdown,
  onInsertTable,
  onAttachClick,
  onAiDecompose,
  onAiTags,
  onSave,
}) => {
  return (
    <div ref={ref} data-testid="mobile-editor-bar" className="md:hidden absolute bottom-0 inset-x-0 z-30 select-none pointer-events-auto">
      {/* Invisible Backdrop to dismiss active popover */}
      {activePopover && (
        <div
          className="fixed inset-0 z-35 bg-scrim-20"
          onClick={() => onSetActivePopover(null)}
        />
      )}

      {/* Floating Popovers */}
      {activePopover === 'formatting' && (
        <div className="motion-rise relative z-40 px-3 pb-2">
          <div className="max-w-xs mx-auto rounded-2xl bg-surface-elevated border border-tint-10 shadow-2xl p-1.5 flex flex-col gap-0.5 motion-popover">
            <div className="px-3 py-1 text-xs text-fg-secondary font-medium border-b border-tint-6 mb-0.5 flex items-center justify-between">
              <span>Стили текста</span>
              <span className="font-mono text-3xs text-fg-muted">Aa</span>
            </div>
            <button
              type="button"
              onClick={() => {
                onInsertMarkdown('# ', '');
                onSetActivePopover(null);
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-fg-soft hover:bg-tint-8 motion-press text-left"
            >
              <Icon name="format.h1" size="md" />
              <span>Заголовок 1</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onInsertMarkdown('## ', '');
                onSetActivePopover(null);
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-fg-soft hover:bg-tint-8 motion-press text-left"
            >
              <Icon name="format.h2" size="md" />
              <span>Заголовок 2</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onInsertMarkdown('**', '**');
                onSetActivePopover(null);
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-fg-soft hover:bg-tint-8 motion-press text-left font-bold"
            >
              <Icon name="format.bold" size="md" />
              <span>Жирный</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onInsertMarkdown('*', '*');
                onSetActivePopover(null);
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-fg-soft hover:bg-tint-8 motion-press text-left italic"
            >
              <Icon name="format.italic" size="md" />
              <span>Курсив</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onInsertMarkdown('~~', '~~');
                onSetActivePopover(null);
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-fg-soft hover:bg-tint-8 motion-press text-left line-through"
            >
              <span className="font-mono text-xs text-fg-secondary">S</span>
              <span>Зачёркнутый</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onInsertMarkdown('`', '`');
                onSetActivePopover(null);
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-fg-soft hover:bg-tint-8 motion-press text-left font-mono"
            >
              <Icon name="format.code" size="md" />
              <span>Моноширинный</span>
            </button>
            {[
              ['Сворачиваемая цитата', FOLDED_QUOTE_PREFIX, '\n\n'],
              ['Спойлер', SPOILER_MARKER, SPOILER_MARKER],
            ].map(([label, prefix, suffix]) => (
              <button key={label} type="button"
                onClick={() => {
                  onInsertMarkdown(prefix, suffix);
                  onSetActivePopover(null);
                }}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-fg-soft hover:bg-tint-8 motion-press text-left"
              >
                {prefix === SPOILER_MARKER ? <span className="font-mono">||</span> : <Icon name="format.quote" size="md" />}
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {activePopover === 'lists' && (
        <div className="motion-rise relative z-40 px-3 pb-2">
          <div className="max-w-xs mx-auto rounded-2xl bg-surface-elevated border border-tint-10 shadow-2xl p-1.5 flex flex-col gap-0.5 motion-popover">
            <div className="px-3 py-1 text-xs text-fg-secondary font-medium border-b border-tint-6 mb-0.5 flex items-center justify-between">
              <span>Списки и блоки</span>
              <span className="font-mono text-3xs text-fg-muted">:=</span>
            </div>
            <button
              type="button"
              onClick={() => {
                onInsertMarkdown('- ', '');
                onSetActivePopover(null);
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-fg-soft hover:bg-tint-8 motion-press text-left"
            >
              <Icon name="format.list" size="md" />
              <span>Список с маркерами</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onInsertMarkdown('1. ', '');
                onSetActivePopover(null);
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-fg-soft hover:bg-tint-8 motion-press text-left"
            >
              <span className="font-mono text-xs text-fg-secondary font-bold">1=</span>
              <span>Список с номерами</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onInsertMarkdown('- [ ] ', '');
                onSetActivePopover(null);
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-fg-soft hover:bg-tint-8 motion-press text-left"
            >
              <Icon name="entity.task" size="md" />
              <span>Чек-лист</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onInsertMarkdown('> ', '');
                onSetActivePopover(null);
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-fg-soft hover:bg-tint-8 motion-press text-left"
            >
              <Icon name="format.quote" size="md" />
              <span>Цитата</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onInsertMarkdown('```\n', '\n```');
                onSetActivePopover(null);
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-fg-soft hover:bg-tint-8 motion-press text-left"
            >
              <Icon name="format.code" size="md" />
              <span>Блок кода</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onInsertMarkdown('[[', ']]');
                onSetActivePopover(null);
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-fg-soft hover:bg-tint-8 motion-press text-left"
            >
              <Icon name="action.link" size="md" />
              <span>Ссылка [[заметка]]</span>
            </button>
          </div>
        </div>
      )}

      {activePopover === 'ai' && (
        <div className="motion-rise relative z-40 px-3 pb-2">
          <div className="max-w-xs mx-auto rounded-2xl bg-surface-elevated border border-tint-10 shadow-2xl p-1.5 flex flex-col gap-0.5 motion-popover">
            <div className="px-3 py-1 text-xs text-fg-secondary font-medium border-b border-tint-6 mb-0.5 flex items-center justify-between">
              <span>ИИ-Помощник</span>
              <span className="font-mono text-3xs text-fg-secondary">AI</span>
            </div>
            <button
              type="button"
              onClick={() => {
                onAiDecompose();
                onSetActivePopover(null);
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-fg-soft hover:bg-tint-8 motion-press text-left"
            >
              <Icon name="system.ai" size="md" />
              <span>Разобрать (папка и теги)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onAiTags();
                onSetActivePopover(null);
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-fg-soft hover:bg-tint-8 motion-press text-left"
            >
              <Icon name="entity.tag" size="md" />
              <span>Подобрать теги</span>
            </button>
          </div>
        </div>
      )}

      {/* Bottom Bar Container */}
      <div
        className="relative z-40 bg-surface border-t border-tint-8 px-3 py-2 flex items-center justify-between"
        style={{ paddingBottom: 'max(var(--sab), 0.5rem)' }}
      >
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* AI Button */}
          <button
            type="button"
            onClick={() => onSetActivePopover(activePopover === 'ai' ? null : 'ai')}
            className={`p-2 rounded-xl transition-colors cursor-pointer ${
              activePopover === 'ai'
                ? 'bg-tint-15 text-white'
                : 'text-fg-secondary hover:text-white hover:bg-tint-6'
            }`}
            title="ИИ-инструменты"
          >
            <div className="flex items-center gap-0.5">
              <Icon name="system.ai" size="md" />
              <span className="text-xs font-semibold">Ai</span>
            </div>
          </button>

          {/* Aa Text Styles Button */}
          <button
            type="button"
            onClick={() => onSetActivePopover(activePopover === 'formatting' ? null : 'formatting')}
            className={`p-2 rounded-xl transition-colors cursor-pointer ${
              activePopover === 'formatting'
                ? 'bg-tint-15 text-white'
                : 'text-fg-secondary hover:text-white hover:bg-tint-6'
            }`}
            title="Форматирование текста"
          >
            <span className="font-semibold text-sm leading-none px-0.5">Aa</span>
          </button>

          {/* Lists Button */}
          <button
            type="button"
            onClick={() => onSetActivePopover(activePopover === 'lists' ? null : 'lists')}
            className={`p-2 rounded-xl transition-colors cursor-pointer ${
              activePopover === 'lists'
                ? 'bg-tint-15 text-white'
                : 'text-fg-secondary hover:text-white hover:bg-tint-6'
            }`}
            title="Списки и чек-листы"
          >
            <Icon name="format.list" size="md" tone="inherit" />
          </button>

          {/* Table Button */}
          <button
            type="button"
            onClick={onInsertTable}
            className="p-2 rounded-xl text-fg-secondary hover:text-white hover:bg-tint-6 transition-colors cursor-pointer"
            title="Вставить таблицу"
          >
            <Icon name="format.table" size="md" tone="inherit" />
          </button>

          {/* Attachments (Paperclip) */}
          <button
            type="button"
            onClick={onAttachClick}
            className="p-2 rounded-xl text-fg-secondary hover:text-white hover:bg-tint-6 transition-colors cursor-pointer"
            title="Прикрепить файл"
          >
            <Icon name="action.attach" size="md" tone="inherit" />
          </button>
        </div>

        {/* Кнопка отправки: та же плашка, что у композера */}
        <SendButton
          onClick={onSave}
          label={isDraft ? 'Создать заметку' : 'Сохранить и закрыть'}
          title="Сохранить и закрыть (Ctrl+S)"
          className="ml-2"
        />
      </div>
    </div>
  );
};
