import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import type { FolderMeta } from '../../types';
import { Folder, X, Sparkles, Trash2 } from 'lucide-react';

export const FolderModal: React.FC = () => {
  const {
    isFolderModalOpen,
    editingFolder,
    closeFolderModal,
    saveFolder,
    deleteFolder,
    folders
  } = useApp();

  const [name, setName] = useState('');
  const [parentFolder, setParentFolder] = useState<string>('');
  const [description, setDescription] = useState('');

  const isEditing = Boolean(editingFolder && editingFolder.name);

  useEffect(() => {
    if (editingFolder) {
      setName(editingFolder.name || '');
      setDescription(editingFolder.description || '');
      const parts = editingFolder.path.split('/');
      if (parts.length > 1) {
        setParentFolder(parts.slice(0, -1).join('/'));
      } else {
        setParentFolder('');
      }
    } else {
      setName('');
      setDescription('');
      setParentFolder('');
    }
  }, [editingFolder, isFolderModalOpen]);

  if (!isFolderModalOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const cleanName = name.trim().replace(/[\\/:*?"<>|]/g, '-');
    const finalPath = parentFolder ? `${parentFolder}/${cleanName}` : cleanName;

    const folderMeta: FolderMeta = {
      path: finalPath,
      name: cleanName,
      description: description.trim(),
      icon: 'Folder',
    };

    saveFolder(folderMeta);
  };

  const eligibleParentFolders = folders.filter(f => f.path !== 'Входящие' && f.path !== editingFolder?.path);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl bg-[#141416] border border-white/[0.08] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white">
              <Folder className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white">
              {isEditing ? 'Настройки папки' : 'Создать новую папку'}
            </h3>
          </div>
          <button
            onClick={closeFolderModal}
            className="p-1 rounded text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-5 flex flex-col gap-4">
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

          {!isEditing && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-400">Родительская папка (опционально)</label>
              <select
                value={parentFolder}
                onChange={(e) => setParentFolder(e.target.value)}
                className="w-full bg-black/40 border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white"
              >
                <option value="">Корневой уровень (без родителя)</option>
                {eligibleParentFolders.map(f => (
                  <option key={f.path} value={f.path}>
                    {f.path}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-zinc-400" />
                Описание для ИИ-сортировки
              </label>
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Опишите темы и содержание папки, чтобы Gemini Flash мог безошибочно сортировать сюда входящие заметки..."
              rows={3}
              className="w-full bg-black/40 border border-white/[0.08] rounded-lg p-3 text-xs text-white placeholder-zinc-600 resize-none leading-relaxed"
            />
            <span className="text-[11px] text-zinc-500">
              ИИ читает это описание при нажатии кнопки «AI Triage» во «Входящих».
            </span>
          </div>

          {/* Footer Controls */}
          <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] mt-1">
            {isEditing && editingFolder?.path !== 'Входящие' ? (
              <button
                type="button"
                onClick={() => {
                  deleteFolder(editingFolder!.path);
                  closeFolderModal();
                }}
                className="flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Удалить папку</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={closeFolderModal}
                className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white transition-colors"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={!name.trim()}
                className="px-4 py-1.5 rounded-lg bg-white text-black font-semibold text-xs hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Сохранить
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
