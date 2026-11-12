// Editor toolbar assembly: top row, markdown palette, save/zen actions.
import React from 'react';
import { ArrowUp, Eye, Maximize, Minimize, Maximize2, Minimize2 } from 'lucide-react';
import { startDraggingWindow, toggleMaximizeWindow } from '../../lib/platform/windowControls';
import { EditorTopBar } from './EditorTopBar';
import { MarkdownPalette } from './MarkdownPalette';
import type { EditorToolbarProps, MarkdownDropdown } from './editorToolbarParts';

export type { EditorToolbarProps } from './editorToolbarParts';

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
  isExpanded = false,
  onToggleExpanded,
}) => {
  const [activeTopDropdown, setActiveTopDropdown] = React.useState<MarkdownDropdown | null>(null);

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
        <EditorTopBar
          folder={folder}
          onFolderChange={onFolderChange}
          folderOptions={folderOptions}
          type={type}
          onTypeChange={onTypeChange}
          onClose={onClose}
        />

        <MarkdownPalette
          itemId={item.id}
          selectedAttachment={selectedAttachment}
          onSelectAttachment={onSelectAttachment}
          onRemoveAttachment={onRemoveAttachment}
          onInsertAttachmentMarkdown={onInsertAttachmentMarkdown}
          onOpenLightbox={onOpenLightbox}
          onUndo={onUndo}
          onRedo={onRedo}
          onInsertMarkdown={onInsertMarkdown}
          onInsertTable={onInsertTable}
          onAttachClick={onAttachClick}
          onAiDecompose={onAiDecompose}
          activeDropdown={activeTopDropdown}
          onActiveDropdownChange={setActiveTopDropdown}
        />

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

          {/* Pane / window detent. Only desktop has a pane to return to. */}
          {onToggleExpanded && (
            <button
              type="button"
              onClick={onToggleExpanded}
              className={`hidden md:flex p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                isExpanded
                  ? 'text-white bg-white/10 border border-white/10'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
              }`}
              title={isExpanded ? 'Вернуть в панель (Esc)' : 'Развернуть на всё окно'}
            >
              {isExpanded ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          )}

          {/* Reading measure / width toggle. Desktop dropped it; the phone keeps it as the sheet detent. */}
          {onToggleFullWidth && (
            <button
              type="button"
              onClick={onToggleFullWidth}
              className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                isFullWidth
                  ? 'text-white bg-white/10 border border-white/10'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
              }`}
              title={isFullWidth ? 'Свернуть лист' : 'Развернуть лист'}
            >
              {isFullWidth ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          )}

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

          {/* Send, the same plate the composer sends with: it is the one commit action here. */}
          <button
            onClick={onSave}
            className="hidden md:flex w-ctrl-sm h-ctrl-sm items-center justify-center rounded-full bg-accent-strong text-white hover:bg-accent-strong/90 shadow-sm cursor-pointer motion-press"
            title="Сохранить изменения (Ctrl+S / ⌘S)"
            aria-label={item.id.startsWith('draft_') ? 'Создать' : 'Готово'}
          >
            <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </header>
  );
};
