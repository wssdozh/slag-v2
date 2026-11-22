import { useId } from 'react';
import { useApp } from '../../context/AppContext';
import type { FolderViewTarget } from '../../context/appContext.types';
import { hasFeedFilters } from '../../context/feed/feedView';
import { Icon } from '../UI/icons/Icon';

export function FolderViewButton({ mode, changeLocalMode, mobile }: Omit<FolderViewTarget, 'anchor'> & { mobile?: boolean }) {
  const app = useApp();
  const id = useId();
  const filtered = hasFeedFilters(app);
  return (
    <button id={id} type="button" aria-label="Вид и фильтры папки" aria-haspopup="dialog"
      aria-expanded={app.folderViewTarget?.anchor.id === id}
      aria-description={filtered ? 'Фильтры включены' : undefined} data-filtered={filtered}
      onClick={(event) => app.openFolderViewModal({ anchor: event.currentTarget, mode, changeLocalMode })}
      title="Вид и фильтры папки"
      className={`relative grid shrink-0 place-items-center rounded-md transition-colors hover:bg-tint-6 focus-visible:bg-tint-10 aria-expanded:bg-tint-10 ${mobile ? 'size-11' : 'size-8'} ${filtered ? 'text-fg-primary' : 'text-fg-secondary'}`}>
      <Icon name="action.more" size="md" tone="inherit" />
      {filtered && <span className="absolute top-1 right-1 size-1.5 rounded-full bg-accent" aria-hidden="true" />}
    </button>
  );
}
