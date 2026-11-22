import { folderColorCss } from '../../lib/vault/folderColor';
import type { FolderMeta } from '../../types';
import { Icon, type IconSize } from '../UI/icons/Icon';
import { folderIconName } from '../UI/icons/icons';
import { MenuDropdown } from '../UI/MenuDropdown';
import { FolderIconGrid } from './FolderIconGrid';

export function FolderAppearancePicker({ folder, onSave, size, className }: {
  folder?: FolderMeta;
  onSave: (folder: FolderMeta) => void;
  size: IconSize;
  className: string;
}) {
  const icon = <Icon name={folderIconName(folder?.icon)} size={size} tone="inherit" />;
  const style = `shrink-0 inline-flex items-center justify-center ${className}`;
  if (!folder) return <span className={style}>{icon}</span>;

  return (
    <div className="shrink-0" onClick={(event) => event.stopPropagation()} onDragStart={(event) => { event.preventDefault(); event.stopPropagation(); }}>
      <MenuDropdown ariaLabel="Иконка папки" minWidth={196} trigger={
        <button type="button" title="Сменить иконку папки" aria-label="Сменить иконку папки"
          data-folder-color={folder.color}
          style={{ color: folderColorCss(folder.color) }}
          className={`${style} cursor-pointer hover:bg-tint-6 focus-visible:bg-tint-12`}
        >
          {icon}
        </button>
      }>
        <FolderIconGrid value={folder.icon} color={folder.color}
          onSelect={(icon) => onSave({ ...folder, icon })}
          onColor={(color) => {
            const next = { ...folder };
            if (color) next.color = color;
            else delete next.color;
            onSave(next);
          }}
        />
      </MenuDropdown>
    </div>
  );
}
