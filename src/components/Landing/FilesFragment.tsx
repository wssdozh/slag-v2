// The vault as a still: the `~/vault` tree with four .md files and the metadata of the open one.
// Rows are `Sidebar/FolderTree` markup, the right pane is `FolderProfile` + `FolderStats` — the
// only thing a folder of files has in the app. Selection, counts and sizes are props-constants.
import React from 'react';
import { Icon } from '../UI/icons/Icon';
import { TagChip } from '../UI/TagChip';

interface VaultFile {
  name: string;
  size: string;
  isSelected?: boolean;
}

const FILES: VaultFile[] = [
  { name: 'карьера.md', size: '1,4 КБ', isSelected: true },
  { name: 'проекты.md', size: '2,8 КБ' },
  { name: 'личное.md', size: '1,1 КБ' },
  { name: 'архив.md', size: '640 Б' },
];

const SELECTED = FILES.find(file => file.isSelected) ?? FILES[0];

const FILE_PROPERTIES = [
  { key: 'size', label: 'Размер', icon: 'entity.file', value: SELECTED.size },
  { key: 'changed', label: 'Изменён', icon: 'time.date', value: '09:12' },
  { key: 'created', label: 'Создан', icon: 'time.time', value: '08:40' },
  { key: 'format', label: 'Формат', icon: 'entity.tag', value: 'md · utf-8' },
  { key: 'folder', label: 'Папка', icon: 'entity.folder', value: 'vault' },
] as const;

/** A tree row: the same paddings, radius and selected tone the sidebar gives a folder row. */
const FileRow: React.FC<{ file: VaultFile }> = ({ file }) => (
  <div
    data-beat={file.isSelected ? 'row-selected' : undefined}
    className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
      file.isSelected
        ? 'bg-tint-8 text-white font-medium'
        : 'text-fg-secondary hover:text-fg-soft hover:bg-tint-4'
    }`}
    style={{ paddingLeft: '22px' }}
  >
    <div className="flex items-center gap-1.5 min-w-0 flex-1">
      <span className="w-3.5 shrink-0" />
      <Icon
        name="entity.file"
        size="none"
        tone="inherit"
        className={`w-3.5 h-3.5 shrink-0 ${
          file.isSelected ? 'text-fg-soft' : 'text-fg-muted group-hover:text-fg-secondary'
        }`}
      />
      <span className="truncate">{file.name}</span>
    </div>

    <span className="text-2xs font-mono text-fg-muted group-hover:text-fg-secondary px-1 shrink-0">
      {file.size}
    </span>
  </div>
);

/** 960×600 of the vault: the file tree on the left, the open file's metadata on the right. */
export const FilesFragment: React.FC = () => (
  <div
    data-landing-canvas="files"
    className="flex overflow-hidden bg-canvas font-sans antialiased leading-normal text-fg-primary select-none"
    style={{ width: 960 }}
  >
    <aside className="w-[360px] shrink-0 flex flex-col bg-panel select-none text-fg-secondary overflow-hidden border-r border-tint-6">
      <div className="flex items-center gap-2 px-3 py-3 border-b border-tint-6">
        <Icon name="entity.vault" size="sm" tone="tertiary" />
        <span className="text-2xs font-mono text-fg-muted truncate">~/vault</span>
        <span className="ml-auto text-2xs font-mono text-fg-dim shrink-0">4 файла</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-3 flex flex-col gap-3">
        <div>
          <div className="flex items-center justify-between px-2.5 py-1 text-2xs font-mono font-medium text-fg-muted tracking-wider uppercase">
            <span>Файлы</span>
            <span>4</span>
          </div>

          <div className="flex flex-col gap-0.5 py-1" data-beat="tree">
            <div
              className="group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors text-fg-secondary hover:text-fg-soft hover:bg-tint-4"
              style={{ paddingLeft: '8px' }}
            >
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <button
                  type="button"
                  aria-expanded="true"
                  aria-label="Свернуть папку vault"
                  className="p-0.5 text-fg-muted hover:text-fg-tertiary transition-colors shrink-0"
                >
                  <Icon
                    name="nav.next"
                    size="none"
                    tone="inherit"
                    className="w-3.5 h-3.5 transition-transform duration-200 ease-out rotate-90 text-fg-tertiary"
                  />
                </button>
                <Icon
                  name="entity.folder"
                  size="none"
                  tone="inherit"
                  className="w-3.5 h-3.5 shrink-0 text-fg-soft"
                />
                <span className="truncate">vault</span>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <span className="text-2xs font-mono text-fg-muted group-hover:text-fg-secondary px-1">
                  4
                </span>
                <button
                  type="button"
                  title="Действия с папкой"
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-fg-muted hover:text-fg-soft hover:bg-tint-10 transition-opacity"
                >
                  <Icon name="action.more" size="sm" tone="inherit" />
                </button>
              </div>
            </div>

            {FILES.map(file => (
              <FileRow key={file.name} file={file} />
            ))}
          </div>
        </div>
      </div>

      <div className="p-2 border-t border-tint-6 flex items-center justify-between gap-1 relative bg-panel">
        <div className="flex-1 min-w-0">
          <button
            type="button"
            className="w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs text-fg-tertiary hover:text-white hover:bg-tint-4 transition-colors truncate"
          >
            <div className="flex items-center gap-2 truncate">
              <Icon name="entity.vault" size="sm" className="shrink-0" />
              <span className="truncate text-xs font-medium">SLAG Vault</span>
            </div>
            <Icon name="nav.down" size="xs" tone="muted" className="shrink-0 ml-1" />
          </button>
        </div>

        <button
          type="button"
          className="p-1.5 rounded text-fg-secondary hover:text-fg-soft hover:bg-tint-6 transition-colors shrink-0 cursor-pointer relative group"
          title="Синхронизация активна"
        >
          <Icon name="action.refresh" size="md" tone="inherit" />
          <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
        </button>
      </div>
    </aside>

    <section
      data-beat="meta"
      className="flex-1 min-w-0 flex flex-col gap-5 px-6 py-5 bg-panel overflow-hidden"
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center border border-tint-8 bg-tint-3 text-fg-secondary">
          <Icon name="entity.file" size="none" tone="inherit" className="w-4 h-4" />
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <div className="text-sm font-semibold text-fg-primary truncate">{SELECTED.name}</div>
          <span className="text-2xs font-mono text-fg-muted truncate">~/vault/{SELECTED.name}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-2xs font-mono font-medium text-fg-muted tracking-wider uppercase">
          Свойства
        </span>

        <div className="flex flex-col text-xs">
          {FILE_PROPERTIES.map(property => (
            <div
              key={property.key}
              className="flex items-center justify-between py-1.5 border-b border-subtle last:border-b-0"
            >
              <span className="flex items-center gap-2 text-fg-secondary">
                <Icon
                  name={property.icon}
                  size="none"
                  tone="inherit"
                  className="w-3.5 h-3.5 shrink-0 text-fg-muted"
                />
                <span>{property.label}</span>
              </span>
              <span className="font-mono text-xs text-fg-primary font-medium">{property.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-2xs font-mono font-medium text-fg-muted tracking-wider uppercase">
          Теги
        </span>
        <div className="flex flex-wrap gap-1.5">
          {['карьера', 'сервис', 'звонок'].map(tag => (
            <TagChip key={tag} tag={tag} variant="pill" />
          ))}
        </div>
      </div>
    </section>
  </div>
);
