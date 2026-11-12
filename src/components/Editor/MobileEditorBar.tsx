// The phone formatting bar: style, list and AI popovers above a single save button.
import React from 'react';
import {
  Heading1,
  Heading2,
  Bold,
  Italic,
  Code,
  List,
  CheckSquare,
  Quote,
  Link2,
  Sparkles,
  Tag,
  Table,
  Paperclip,
} from 'lucide-react';
import { SendButton } from '../UI/SendButton';

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
          className="fixed inset-0 z-35 bg-black/20"
          onClick={() => onSetActivePopover(null)}
        />
      )}

      {/* Floating Popovers */}
      {activePopover === 'formatting' && (
        <div className="motion-rise relative z-40 px-3 pb-2">
          <div className="max-w-xs mx-auto rounded-2xl bg-surface-elevated border border-white/[0.1] shadow-2xl p-1.5 flex flex-col gap-0.5 motion-popover">
            <div className="px-3 py-1 text-xs text-zinc-400 font-medium border-b border-white/[0.06] mb-0.5 flex items-center justify-between">
              <span>Стили текста</span>
              <span className="font-mono text-[10px] text-zinc-500">Aa</span>
            </div>
            <button
              type="button"
              onClick={() => {
                onInsertMarkdown('# ', '');
                onSetActivePopover(null);
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/[0.08] motion-press text-left"
            >
              <Heading1 className="w-4 h-4 text-zinc-400" />
              <span>Заголовок 1</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onInsertMarkdown('## ', '');
                onSetActivePopover(null);
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/[0.08] motion-press text-left"
            >
              <Heading2 className="w-4 h-4 text-zinc-400" />
              <span>Заголовок 2</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onInsertMarkdown('**', '**');
                onSetActivePopover(null);
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/[0.08] motion-press text-left font-bold"
            >
              <Bold className="w-4 h-4 text-zinc-400" />
              <span>Жирный</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onInsertMarkdown('*', '*');
                onSetActivePopover(null);
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/[0.08] motion-press text-left italic"
            >
              <Italic className="w-4 h-4 text-zinc-400" />
              <span>Курсив</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onInsertMarkdown('~~', '~~');
                onSetActivePopover(null);
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/[0.08] motion-press text-left line-through"
            >
              <span className="font-mono text-xs text-zinc-400">S</span>
              <span>Зачёркнутый</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onInsertMarkdown('`', '`');
                onSetActivePopover(null);
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/[0.08] motion-press text-left font-mono"
            >
              <Code className="w-4 h-4 text-zinc-400" />
              <span>Моноширинный</span>
            </button>
          </div>
        </div>
      )}

      {activePopover === 'lists' && (
        <div className="motion-rise relative z-40 px-3 pb-2">
          <div className="max-w-xs mx-auto rounded-2xl bg-surface-elevated border border-white/[0.1] shadow-2xl p-1.5 flex flex-col gap-0.5 motion-popover">
            <div className="px-3 py-1 text-xs text-zinc-400 font-medium border-b border-white/[0.06] mb-0.5 flex items-center justify-between">
              <span>Списки и блоки</span>
              <span className="font-mono text-[10px] text-zinc-500">:=</span>
            </div>
            <button
              type="button"
              onClick={() => {
                onInsertMarkdown('- ', '');
                onSetActivePopover(null);
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/[0.08] motion-press text-left"
            >
              <List className="w-4 h-4 text-zinc-400" />
              <span>Список с маркерами</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onInsertMarkdown('1. ', '');
                onSetActivePopover(null);
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/[0.08] motion-press text-left"
            >
              <span className="font-mono text-xs text-zinc-400 font-bold">1=</span>
              <span>Список с номерами</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onInsertMarkdown('- [ ] ', '');
                onSetActivePopover(null);
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/[0.08] motion-press text-left"
            >
              <CheckSquare className="w-4 h-4 text-zinc-400" />
              <span>Чек-лист</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onInsertMarkdown('> ', '');
                onSetActivePopover(null);
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/[0.08] motion-press text-left"
            >
              <Quote className="w-4 h-4 text-zinc-400" />
              <span>Цитата</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onInsertMarkdown('```\n', '\n```');
                onSetActivePopover(null);
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/[0.08] motion-press text-left"
            >
              <Code className="w-4 h-4 text-zinc-400" />
              <span>Блок кода</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onInsertMarkdown('[[', ']]');
                onSetActivePopover(null);
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/[0.08] motion-press text-left"
            >
              <Link2 className="w-4 h-4 text-zinc-400" />
              <span>Ссылка [[заметка]]</span>
            </button>
          </div>
        </div>
      )}

      {activePopover === 'ai' && (
        <div className="motion-rise relative z-40 px-3 pb-2">
          <div className="max-w-xs mx-auto rounded-2xl bg-surface-elevated border border-white/[0.1] shadow-2xl p-1.5 flex flex-col gap-0.5 motion-popover">
            <div className="px-3 py-1 text-xs text-zinc-400 font-medium border-b border-white/[0.06] mb-0.5 flex items-center justify-between">
              <span>ИИ-Помощник</span>
              <span className="font-mono text-[10px] text-zinc-400">AI</span>
            </div>
            <button
              type="button"
              onClick={() => {
                onAiDecompose();
                onSetActivePopover(null);
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/[0.08] motion-press text-left"
            >
              <Sparkles className="w-4 h-4 text-zinc-400" />
              <span>Разобрать (папка и теги)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onAiTags();
                onSetActivePopover(null);
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/[0.08] motion-press text-left"
            >
              <Tag className="w-4 h-4 text-zinc-400" />
              <span>Подобрать теги</span>
            </button>
          </div>
        </div>
      )}

      {/* Bottom Bar Container */}
      <div
        className="relative z-40 bg-surface border-t border-white/[0.08] px-3 py-2 flex items-center justify-between"
        style={{ paddingBottom: 'max(var(--sab), 0.5rem)' }}
      >
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* AI Button */}
          <button
            type="button"
            onClick={() => onSetActivePopover(activePopover === 'ai' ? null : 'ai')}
            className={`p-2 rounded-xl transition-colors cursor-pointer ${
              activePopover === 'ai'
                ? 'bg-white/15 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
            }`}
            title="ИИ-инструменты"
          >
            <div className="flex items-center gap-0.5">
              <Sparkles className="w-4 h-4 text-zinc-400" />
              <span className="text-xs font-semibold">Ai</span>
            </div>
          </button>

          {/* Aa Text Styles Button */}
          <button
            type="button"
            onClick={() => onSetActivePopover(activePopover === 'formatting' ? null : 'formatting')}
            className={`p-2 rounded-xl transition-colors cursor-pointer ${
              activePopover === 'formatting'
                ? 'bg-white/15 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
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
                ? 'bg-white/15 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
            }`}
            title="Списки и чек-листы"
          >
            <List className="w-4 h-4" />
          </button>

          {/* Table Button */}
          <button
            type="button"
            onClick={onInsertTable}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
            title="Вставить таблицу"
          >
            <Table className="w-4 h-4" />
          </button>

          {/* Attachments (Paperclip) */}
          <button
            type="button"
            onClick={onAttachClick}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
            title="Прикрепить файл"
          >
            <Paperclip className="w-4 h-4" />
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
