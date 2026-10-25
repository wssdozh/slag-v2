import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import type { FolderMeta } from '../../types';
import { FOLDER_ICONS } from '../Sidebar/folderIcons';
import { Folder, Trash2 } from 'lucide-react';
import { Select } from '../UI/Select';
import { BaseModal } from './BaseModal';
import { Button } from '../UI/Button';

const FolderModalDialog: React.FC = () => {
  const {
    editingFolder,
    closeFolderModal,
    saveFolder,
    deleteFolder,
    folders
  } = useApp();

  const isEditing = Boolean(editingFolder && editingFolder.name);

  const [name, setName] = useState(() => editingFolder?.name || '');
  const [parentFolder, setParentFolder] = useState<string>(() => {
    if (editingFolder) {
      const parts = editingFolder.path.split('/');
      if (parts.length > 1) {
        return parts.slice(0, -1).join('/');
      }
    }
    return '';
  });
  const [description, setDescription] = useState(() => editingFolder?.description || '');
  const [selectedIcon, setSelectedIcon] = useState<string>(() => editingFolder?.icon || 'Folder');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const cleanName = name.trim().replace(/[\\/:*?"<>|]/g, '-');
    const finalPath = parentFolder ? `${parentFolder}/${cleanName}` : cleanName;

    const folderMeta: FolderMeta = {
      path: finalPath,
      name: cleanName,
      description: description.trim(),
      icon: selectedIcon,
    };

    saveFolder(folderMeta);
  };

  const eligibleParentFolders = folders.filter(f => f.path !== 'Входящие' && f.path !== editingFolder?.path);

  const CurrentIconComp = FOLDER_ICONS[selectedIcon] || Folder;

  const footer = (
    <div className="flex items-center justify-between">
      {isEditing && editingFolder?.path !== 'Входящие' ? (
        <button
          type="button"
          onClick={() => {
            deleteFolder(editingFolder!.path);
            closeFolderModal();
          }}
          className="flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Удалить папку</span>
        </button>
      ) : (
        <div />
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={closeFolderModal}
        >
          Отмена
        </Button>
        <Button
          type="submit"
          form="folder-modal-form"
          variant="primary"
          size="sm"
          disabled={!name.trim()}
        >
          Сохранить
        </Button>
      </div>
    </div>
  );

  return (
    <BaseModal
      isOpen={true}
      onClose={closeFolderModal}
      title={isEditing ? 'Настройки папки' : 'Создать новую папку'}
      icon={<CurrentIconComp className="w-4 h-4" />}
      maxWidth="max-w-md"
      footer={footer}
    >
      {/* Form Body */}
      <form id="folder-modal-form" onSubmit={handleSave} className="p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-zinc-400">Название папки</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например: Проекты, Финансы, Идеи..."
            autoFocus
            className="w-full bg-black/40 border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600"
          />
        </div>

        {/* Folder Icon Selector Grid */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-zinc-400">Иконка папки</label>
          <div className="grid grid-cols-8 gap-1.5 p-2 rounded-lg bg-black/30 border border-white/[0.06]">
            {Object.entries(FOLDER_ICONS).map(([key, IconComponent]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedIcon(key)}
                className={`p-1.5 rounded-md flex items-center justify-center transition-all cursor-pointer ${
                  selectedIcon === key
                    ? 'bg-white text-black font-medium'
                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
                }`}
                title={key}
              >
                <IconComponent className="w-4 h-4" />
              </button>
            ))}
          </div>
        </div>

        {!isEditing && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-400">Родительская папка (опционально)</label>
            <Select
              value={parentFolder}
              onChange={setParentFolder}
              options={[
                { value: '', label: 'Корневой уровень (без родителя)' },
                ...eligibleParentFolders.map(f => ({ value: f.path, label: f.path })),
              ]}
            />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-zinc-400">
            Описание для ИИ-сортировки
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Опишите темы и содержание папки, чтобы ИИ сортировал сюда входящие заметки..."
            rows={2}
            className="w-full bg-black/40 border border-white/[0.08] rounded-lg p-2.5 text-xs text-white placeholder-zinc-600 resize-none leading-relaxed"
          />
        </div>
      </form>
    </BaseModal>
  );
};

export const FolderModal: React.FC = () => {
  const { isFolderModalOpen, editingFolder } = useApp();

  if (!isFolderModalOpen) return null;

  return <FolderModalDialog key={editingFolder?.path || 'new-folder'} />;
};
