// The phone's folder view: header, active surface, and the shared composer position.
import { useId, useLayoutEffect, useMemo, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useApp } from '../../context/AppContext';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { useComposerInset } from '../../hooks/layout/useComposerInset';
import { materialsInFolder } from '../../lib/vault/folderItems';
import { folderName as nameFromPath } from '../../lib/vault/folderTree';
import { ActiveFilterBadges } from '../Feed/ActiveFilterBadges';
import { Composer } from '../Feed/Composer';
import { FeedList } from '../Feed/FeedList';
import { FolderViewButton } from '../Feed/FolderViewButton';
import { SyncStatusButton } from '../Sidebar/SyncStatusButton';
import { Icon } from '../UI/icons/Icon';
import { KanbanBoard } from '../Views/KanbanBoard';
import { FolderOverlay } from './folders/FolderOverlay';
import { MobileSubfolders } from './folders/MobileSubfolders';
import { MobileCalendarView } from './MobileCalendarView';
import { MobileScreenHeader } from './MobileScreenHeader';

export function MobileFoldersView() {
  const {
    vault, folders, items, currentFolder, navigateToFolder, goBackFromMobileFolder,
    openCreateFolderModal, openSettingsModal, feedViewMode, isKanbanMaterialsOpen,
    setIsKanbanMaterialsOpen, setIsTriageModalOpen, isMobileFolderPickerOpen,
    setIsMobileFolderPickerOpen,
  } = useApp();
  const isInbox = currentFolder === DEFAULT_INBOX_FOLDER;
  const folderName = folders.find(folder => folder.path === currentFolder)?.name ?? nameFromPath(currentFolder);
  const parent = currentFolder.slice(0, Math.max(0, currentFolder.lastIndexOf('/')));
  const canTriageInbox = useMemo(() => isInbox && items.some(item => item.folder === DEFAULT_INBOX_FOLDER), [isInbox, items]);
  const materialsCount = useMemo(
    () => feedViewMode === 'kanban' ? materialsInFolder(items, currentFolder).length : 0,
    [feedViewMode, items, currentFolder],
  );
  const [attachComposerDock, composerInset] = useComposerInset();
  const titleRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerWasOpen = useRef(false);
  const listId = useId();

  useLayoutEffect(() => {
    if (pickerWasOpen.current && !isMobileFolderPickerOpen) titleRef.current?.focus({ preventScroll: true });
    pickerWasOpen.current = isMobileFolderPickerOpen;
  }, [isMobileFolderPickerOpen]);

  function closePicker() {
    setIsMobileFolderPickerOpen(false);
  }

  function togglePicker() {
    if (isMobileFolderPickerOpen) {
      closePicker();
      return;
    }
    // Android must see the focus inside the trusted tap, not after an animation.
    flushSync(() => setIsMobileFolderPickerOpen(true));
    inputRef.current?.focus({ preventScroll: true });
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas text-fg-primary select-none">
      <MobileScreenHeader
        onBack={isInbox ? undefined : isMobileFolderPickerOpen ? closePicker : goBackFromMobileFolder}
        iconOnlyBack
        backLabel={parent ? `Назад: ${nameFromPath(parent)}` : 'Назад во Входящие'}
        leadingAction={isInbox && <div inert={isMobileFolderPickerOpen}><SyncStatusButton mobile onSettings={() => openSettingsModal('sync')} /></div>}
        centerSlot={(
          <button ref={titleRef} type="button" onClick={togglePicker} aria-label={`Переключить папку: ${folderName}`}
            aria-haspopup="listbox" aria-expanded={isMobileFolderPickerOpen} aria-controls={isMobileFolderPickerOpen ? listId : undefined}
            className="motion-press flex min-h-12 min-w-0 max-w-full items-center gap-1.5 rounded-lg px-2 text-start active:bg-tint-6 focus-visible:bg-tint-8">
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{folderName}</span>
              {parent && <span className="block truncate text-2xs text-fg-secondary">{currentFolder}</span>}
            </span>
            <Icon name="nav.down" size="sm" className={`shrink-0 transition-transform ${isMobileFolderPickerOpen ? 'rotate-180' : ''}`} />
          </button>
        )}
        rightSlot={(
          <div inert={isMobileFolderPickerOpen} className="flex items-center gap-0.5">
            {feedViewMode === 'kanban' && (
              <button type="button" aria-label="Материалы папки" aria-pressed={isKanbanMaterialsOpen}
                title={`${isKanbanMaterialsOpen ? 'Скрыть' : 'Показать'} материалы (${materialsCount})`}
                onClick={() => setIsKanbanMaterialsOpen(prev => !prev)}
                className="motion-press grid size-12 place-items-center rounded-lg text-fg-secondary active:bg-tint-6 aria-pressed:bg-tint-10">
                <Icon name="entity.materials" size="md" tone="inherit" />
              </button>
            )}
            {canTriageInbox && (
              <button type="button" onClick={() => setIsTriageModalOpen(true)}
                title="ИИ-Сортировка" aria-label="Запустить ИИ-Сортировку"
                className="motion-press grid size-12 place-items-center rounded-lg text-fg-secondary active:bg-tint-6">
                <Icon name="action.sort" size="sm" tone="inherit" />
              </button>
            )}
            <FolderViewButton mobile />
          </div>
        )}
      />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div inert={isMobileFolderPickerOpen} className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
          style={{ '--composer-inset': composerInset ? `${composerInset}px` : undefined } as React.CSSProperties}>
          <ActiveFilterBadges className="z-10 shrink-0 border-b border-tint-4 bg-panel/40 px-3 py-1" />
          <MobileSubfolders folders={folders} items={items} currentFolder={currentFolder} onSelect={navigateToFolder} onCreate={openCreateFolderModal} />
          {feedViewMode === 'kanban' ? <KanbanBoard /> : feedViewMode === 'calendar' ? <MobileCalendarView embedded /> : (
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
              <FeedList />
              <div ref={attachComposerDock} data-testid="composer-dock"
                className={`pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col items-center ${isMobileFolderPickerOpen ? 'invisible' : ''}`}
                style={{
                  paddingBottom: 'calc(var(--sab) + 8px)',
                  paddingLeft: 'calc(var(--sal) + 12px)',
                  paddingRight: 'calc(var(--sar) + 12px)',
                }}>
                <div className="h-6 w-full bg-gradient-to-t from-canvas to-transparent" aria-hidden="true" />
                <div className="pointer-events-auto w-full">
                  <Composer key={JSON.stringify([vault.id, currentFolder])} />
                </div>
              </div>
            </div>
          )}
        </div>
        {isMobileFolderPickerOpen && (
          <FolderOverlay folders={folders} currentFolder={currentFolder} inputRef={inputRef}
            onSelect={path => path === currentFolder ? closePicker() : navigateToFolder(path)} onClose={closePicker} listId={listId} />
        )}
      </div>
    </div>
  );
}
