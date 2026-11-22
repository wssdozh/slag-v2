// The folder's layout is one click away; detailed choices stay on their own page.
import { useCallback, useLayoutEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { hasFeedFilters } from '../../context/feed/feedView';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { usePresence } from '../../hooks/ui/usePresence';
import { Icon, type IconProps } from '../UI/icons/Icon';
import { AnchoredPopover } from '../UI/AnchoredPopover';
import { Button } from '../UI/Button';

const modes = [
  ['feed', 'Лента', 'entity.layers'], ['kanban', 'Канбан', 'entity.kanban'],
  ['calendar', 'Календарь', 'time.date'],
] as const satisfies ReadonlyArray<readonly [string, string, IconProps['name']]>;
const sorts = { createdAt: 'По созданию', updatedAt: 'По изменению', title: 'По названию', dueDate: 'По сроку' } as const;
const types = [['all', 'Все записи'], ['note', 'Заметки'], ['task', 'Таски'], ['article', 'Статьи']] as const;
const inboxModes = [['all', 'Все'], ['sorted', 'Разобранные'], ['unsorted', 'Неразобранные']] as const;
const row = 'flex min-h-9 w-full items-center justify-between gap-2 rounded-md px-2 text-start hover:bg-tint-6 focus-visible:bg-tint-10';

function Choice({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`${row} ${selected ? 'bg-tint-10 font-medium text-fg-primary' : 'text-fg-secondary'}`} aria-pressed={selected} onClick={onClick}>
      {label}
      {selected && <Icon name="action.check" size="sm" tone="inherit" className="text-accent" />}
    </button>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" className={row} role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
      {label}
      <span aria-hidden="true" className={`flex h-4 w-7 shrink-0 items-center rounded-full px-0.5 transition-colors ${checked ? 'bg-accent' : 'bg-switch-off'}`}>
        <span className={`size-3 rounded-full bg-fg-primary transition-transform ${checked ? 'translate-x-3' : ''}`} />
      </span>
    </button>
  );
}

export function FolderViewModal() {
  const app = useApp();
  const { isFolderViewModalOpen, closeFolderViewModal, folderViewTarget: target,
    folderViewSection: section, setFolderViewSection: setSection, updateCurrentFolderViewSettings: update,
    sortBy, sortOrder, currentFolder } = app;
  const { ref, phase, isPresent, onTransitionEnd } = usePresence(isFolderViewModalOpen);
  const getAnchor = useCallback(() => target?.anchor ?? null, [target]);
  const isInbox = currentFolder === DEFAULT_INBOX_FOLDER;
  const activeMode = target?.changeLocalMode ? target.mode : app.feedViewMode;
  const direction = sortBy === 'title' ? (sortOrder === 'asc' ? 'А → Я' : 'Я → А')
    : sortBy === 'dueDate' ? (sortOrder === 'asc' ? 'Ближайшие' : 'Дальние')
    : sortOrder === 'asc' ? 'Старые' : 'Новые';

  useLayoutEffect(() => {
    if (isFolderViewModalOpen) ref.current?.querySelector<HTMLElement>('[data-initial-focus]')?.focus({ preventScroll: true });
  }, [isFolderViewModalOpen, section, ref]);

  if (!isPresent) return null;

  return (
    <>
      {isFolderViewModalOpen && <div className="fixed inset-0 z-50" onClick={closeFolderViewModal} />}
      <AnchoredPopover surfaceRef={ref} getAnchor={getAnchor} isOpen={isFolderViewModalOpen} align="end"
        role="dialog" aria-label="Вид и фильтры" aria-modal="true" data-motion-state={phase} onTransitionEnd={onTransitionEnd}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const buttons = event.currentTarget.querySelectorAll('button');
          const first = buttons[0];
          const last = buttons[buttons.length - 1];
          if (event.shiftKey ? event.target === first : event.target === last) {
            event.preventDefault();
            (event.shiftKey ? last : first)?.focus();
          }
        }}
        className="z-50 w-72 select-none rounded-xl border border-tint-8 bg-surface-elevated p-2 text-xs text-fg-soft shadow-xl shadow-scrim-90 motion-popover">
        {section === 'main' ? (
          <>
            <div role="group" aria-label="Режим отображения" className="mb-1 flex gap-0.5">
              {modes.map(([id, label, icon]) => (
                <button key={id} type="button" aria-pressed={activeMode === id} data-initial-focus={activeMode === id ? '' : undefined}
                  className={`flex min-h-9 flex-1 items-center justify-center gap-1 rounded-md px-1 font-medium hover:bg-tint-6 focus-visible:bg-tint-10 ${activeMode === id ? 'bg-tint-10 text-fg-primary' : 'text-fg-secondary'}`}
                  onClick={() => {
                    if (target?.changeLocalMode) {
                      target.changeLocalMode(id);
                      app.openFolderViewModal({ ...target, mode: id });
                    } else update({ viewMode: id });
                  }}>
                  <Icon name={icon} size="sm" tone="inherit" className="shrink-0" />{label}
                </button>
              ))}
            </div>
            <button type="button" className={row} aria-label="Сортировка" onClick={() => setSection('sort')}>
              Сортировка
              <span className="flex items-center gap-1 text-2xs text-fg-secondary">
                {sorts[sortBy]}
                <Icon name={sortOrder === 'asc' ? 'action.sortAsc' : 'action.sortDesc'} size="xs" tone="inherit" />
                <Icon name="nav.next" size="xs" tone="inherit" />
              </span>
            </button>
            <button type="button" className={row} aria-description={hasFeedFilters(app) ? 'Фильтры включены' : undefined} onClick={() => setSection('filters')}>
              Фильтры
              <span className="flex items-center gap-1.5 text-fg-secondary">
                {hasFeedFilters(app) && <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />}
                <Icon name="nav.next" size="xs" tone="inherit" />
              </span>
            </button>
            <div className="mt-1 border-t border-tint-6 pt-2">
              <Button variant="secondary" size="sm" className="w-full focus-visible:border-accent" onClick={() => {
                app.resetCurrentFolderViewSettings();
                target?.changeLocalMode?.('feed');
                closeFolderViewModal();
              }}>Сбросить вид</Button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-1 flex items-center gap-1 border-b border-tint-6 pb-1">
              <button type="button" data-initial-focus aria-label="Назад" onClick={() => setSection('main')}
                className="grid size-9 shrink-0 place-items-center rounded-md hover:bg-tint-6 focus-visible:bg-tint-10">
                <Icon name="nav.next" size="sm" tone="inherit" className="rotate-180" />
              </button>
              <h2 className="font-semibold">{section === 'sort' ? 'Сортировка' : 'Фильтры'}</h2>
            </div>
            {section === 'sort' ? (
              <>
                {(Object.keys(sorts) as (keyof typeof sorts)[]).map((id) => (
                  <Choice key={id} label={sorts[id]} selected={sortBy === id} onClick={() => update({ sortBy: id })} />
                ))}
                <button type="button" className={`${row} mt-1 border-t border-tint-6`} onClick={() => update({ sortOrder: sortOrder === 'asc' ? 'desc' : 'asc' })}>
                  Направление
                  <span className="flex items-center gap-1 text-fg-secondary">
                    {direction}<Icon name={sortOrder === 'asc' ? 'action.sortAsc' : 'action.sortDesc'} size="sm" tone="inherit" />
                  </span>
                </button>
              </>
            ) : (
              <>
                <div role="group" aria-label="Тип записи">
                  {types.map(([id, label]) => <Choice key={id} label={label} selected={app.activeTypeFilter === id} onClick={() => update({ typeFilter: id })} />)}
                </div>
                {isInbox && <div role="group" aria-label="Разбор входящих" className="my-1 flex gap-0.5">
                  {inboxModes.map(([id, label]) => (
                    <button key={id} type="button" aria-pressed={app.inboxMode === id} onClick={() => update({ inboxMode: id })}
                      className={`min-h-9 flex-1 rounded-md px-1 text-2xs hover:bg-tint-6 focus-visible:bg-tint-10 ${app.inboxMode === id ? 'bg-tint-10 text-fg-primary' : 'text-fg-secondary'}`}>{label}</button>
                  ))}
                </div>}
                <div className="mt-1 border-t border-tint-6 pt-1">
                  <Toggle label="Скрыть выполненные" checked={app.hideCompletedTasks} onChange={app.setHideCompletedTasks} />
                  <Toggle label="Только закрепленные" checked={app.isPinnedOnlyFilter} onChange={app.setIsPinnedOnlyFilter} />
                </div>
              </>
            )}
          </>
        )}
      </AnchoredPopover>
    </>
  );
}
