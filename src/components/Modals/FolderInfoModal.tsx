import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import type { FolderMeta } from '../../types';
import { BaseModal } from './BaseModal';
import { Button } from '../UI/Button';
import { FOLDER_ICONS } from '../Sidebar/folderIcons';
import { useFolderMedia } from '../RightPanel/useFolderMedia';
import { FolderMediaTabs } from '../RightPanel/FolderMediaTabs';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import {
  Folder,
  Inbox,
  Sparkles,
  Edit2,
  Trash2,
  StickyNote,
  CheckSquare,
  FileText,
  Image as ImageIcon,
  Mic,
  Link as LinkIcon,
  ArrowUpDown,
  Plus
} from 'lucide-react';

interface FolderInfoModalDialogProps {
  targetFolder: string;
}

const FolderInfoModalDialog: React.FC<FolderInfoModalDialogProps> = ({ targetFolder }) => {
  const {
    closeFolderInfoModal,
    folders,
    items,
    saveFolder,
    renameFolder,
    deleteFolder,
    openLightbox,
    setActiveTagFilter,
    setIsTriageModalOpen,
    openComposerModal,
    addToast,
  } = useApp();

  const isInbox = targetFolder === DEFAULT_INBOX_FOLDER;
  const folderMeta = useMemo(() => folders.find(f => f.path === targetFolder), [folders, targetFolder]);

  // Mode: View (Profile & Media tabs) vs Edit (Rename, Icon, Description, Delete)
  const [isEditMode, setIsEditMode] = useState(false);

  // Inline AI description editing in view mode
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState(() => folderMeta?.description || '');

  // Edit mode form fields
  const [editName, setEditName] = useState(() => folderMeta?.name || targetFolder);
  const [editIcon, setEditIcon] = useState(() => folderMeta?.icon || (isInbox ? 'Inbox' : 'Folder'));
  const [editDescription, setEditDescription] = useState(() => folderMeta?.description || '');
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  // Filter items in this folder (Inbox includes all inbox items, other folders include exact & descendants)
  const folderItems = useMemo(() => {
    if (targetFolder === DEFAULT_INBOX_FOLDER) {
      return items.filter(it => it.folder === DEFAULT_INBOX_FOLDER);
    }
    return items.filter(it => it.folder === targetFolder || it.folder.startsWith(targetFolder + '/'));
  }, [items, targetFolder]);

  const mediaData = useFolderMedia(folderItems);
  const { allImages, allAudio, allLinks, notesCount, tasksCount, articlesCount } = mediaData;

  const metrics = [
    { label: 'Заметки', count: notesCount, icon: StickyNote },
    { label: 'Таски', count: tasksCount, icon: CheckSquare },
    { label: 'Статьи', count: articlesCount, icon: FileText },
    { label: 'Медиа', count: allImages.length, icon: ImageIcon },
    { label: 'Аудио', count: allAudio.length, icon: Mic },
    { label: 'Ссылки', count: allLinks.length, icon: LinkIcon },
  ];

  const CurrentIcon = (editIcon && FOLDER_ICONS[editIcon]) ||
    (folderMeta?.icon && FOLDER_ICONS[folderMeta.icon]) ||
    (isInbox ? Inbox : Folder);

  // Save inline description in view mode
  const handleSaveInlineDescription = () => {
    if (!folderMeta) {
      saveFolder({
        path: targetFolder,
        name: targetFolder,
        description: descriptionDraft.trim(),
        icon: isInbox ? 'Inbox' : 'Folder',
      });
    } else {
      saveFolder({
        ...folderMeta,
        description: descriptionDraft.trim(),
      });
    }
    setIsEditingDescription(false);
    addToast('Описание для ИИ сохранено', 'success');
  };

  // Save changes in full edit mode
  const handleSaveEditMode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;

    const cleanName = editName.trim().replace(/[\\/:*?"<>|]/g, '-');
    const oldPath = folderMeta?.path || targetFolder;

    // Calculate new path if parent folder existed
    let newPath = cleanName;
    if (!isInbox && oldPath.includes('/')) {
      const parts = oldPath.split('/');
      parts[parts.length - 1] = cleanName;
      newPath = parts.join('/');
    }

    const updated: FolderMeta = {
      path: isInbox ? DEFAULT_INBOX_FOLDER : newPath,
      name: isInbox ? DEFAULT_INBOX_FOLDER : cleanName,
      icon: editIcon,
      description: editDescription.trim(),
    };

    if (!isInbox && oldPath !== newPath) {
      renameFolder(oldPath, updated);
    } else {
      saveFolder(updated);
    }

    setIsEditMode(false);
  };

  const handleDeleteFolder = () => {
    if (isInbox) return;
    deleteFolder(folderMeta?.path || targetFolder);
    closeFolderInfoModal();
  };

  const headerRightSlot = (
    <button
      type="button"
      onClick={() => {
        setIsEditMode(prev => !prev);
        setIsConfirmingDelete(false);
      }}
      className={`h-7 px-2.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
        isEditMode
          ? 'bg-white/10 text-white'
          : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
      }`}
      title={isEditMode ? 'Вернуться к информации' : 'Редактировать параметры папки'}
    >
      <Edit2 className="w-3.5 h-3.5" />
      <span>{isEditMode ? 'Инфо' : 'Изменить'}</span>
    </button>
  );

  const editFooter = (
    <div className="flex items-center justify-between w-full">
      {!isInbox ? (
        isConfirmingDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-rose-400">Удалить папку?</span>
            <button
              type="button"
              onClick={handleDeleteFolder}
              className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-medium transition-colors cursor-pointer"
            >
              Да, удалить
            </button>
            <button
              type="button"
              onClick={() => setIsConfirmingDelete(false)}
              className="px-2 py-1 rounded text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              Отмена
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsConfirmingDelete(true)}
            className="flex items-center gap-1.5 text-xs text-rose-400/80 hover:text-rose-300 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Удалить папку</span>
          </button>
        )
      ) : (
        <div />
      )}

      <div className="flex items-center gap-2 ml-auto">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setIsEditMode(false);
            setIsConfirmingDelete(false);
          }}
        >
          Отмена
        </Button>
        <Button
          type="submit"
          form="folder-edit-form"
          variant="primary"
          size="sm"
          disabled={!editName.trim()}
        >
          Сохранить
        </Button>
      </div>
    </div>
  );

  return (
    <BaseModal
      isOpen={true}
      onClose={closeFolderInfoModal}
      title={isEditMode ? 'Редактирование папки' : (folderMeta?.name || targetFolder)}
      subtitle={
        isEditMode
          ? isInbox
            ? 'Системная папка для входящих записей'
            : folderMeta?.path || targetFolder
          : `${folderItems.length} ${
              folderItems.length === 1 ? 'запись' : folderItems.length < 5 ? 'записи' : 'записей'
            } • ${isInbox ? DEFAULT_INBOX_FOLDER : folderMeta?.path || targetFolder}`
      }
      icon={<CurrentIcon className="w-4 h-4" />}
      maxWidth="max-w-xl"
      maxHeight="max-h-[85vh]"
      headerRightSlot={headerRightSlot}
      footer={isEditMode ? editFooter : undefined}
    >
      {isEditMode ? (
        /* Edit Mode: Rename, Icon Selector, AI Description, Delete */
        <form
          id="folder-edit-form"
          onSubmit={handleSaveEditMode}
          className="p-4 sm:p-5 flex flex-col gap-4"
        >
          {/* Name Field */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-400">Название папки</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              disabled={isInbox}
              placeholder="Например: Проекты, Финансы, Идеи..."
              autoFocus={!isInbox}
              className={`w-full bg-black/40 border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 outline-none ring-0 focus:border-white/20 transition-colors ${
                isInbox ? 'opacity-60 cursor-not-allowed' : ''
              }`}
            />
            {isInbox && (
              <span className="text-[11px] text-zinc-500">
                Системная папка «Входящие» не может быть переименована
              </span>
            )}
          </div>

          {/* Icon Selector Grid */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-400">Иконка папки</label>
            <div className="grid grid-cols-8 gap-1.5 p-2 rounded-lg bg-black/30 border border-white/[0.06] max-h-44 overflow-y-auto scrollbar-thin">
              {Object.entries(FOLDER_ICONS).map(([key, IconComponent]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setEditIcon(key)}
                  className={`p-2 rounded-md flex items-center justify-center transition-all cursor-pointer ${
                    editIcon === key
                      ? 'bg-white text-black font-medium shadow-sm scale-105'
                      : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
                  }`}
                  title={key}
                >
                  <IconComponent className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>

          {/* AI Description */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-400">
              Описание для ИИ-сортировки
            </label>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Опишите темы и содержание папки, чтобы ИИ сортировал сюда входящие заметки..."
              rows={3}
              className="w-full bg-black/40 border border-white/[0.08] rounded-lg p-2.5 text-xs text-white placeholder-zinc-600 resize-none leading-relaxed outline-none ring-0 focus:border-white/20 transition-colors"
            />
            <span className="text-[11px] text-zinc-500">
              Используется алгоритмом триажа при автоматическом распределении мыслей и задач.
            </span>
          </div>
        </form>
      ) : (
        /* View Mode: AI Description + Dashboard Metrics + Quick Actions + Media Tabs */
        <div className="p-4 sm:p-5 flex flex-col gap-4">
          {/* AI Description (Flat, zero-box) */}
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[11px] font-medium text-zinc-500">
              <span className="flex items-center gap-1.5 text-zinc-300">
                <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span>Описание для ИИ</span>
              </span>
              {!isEditingDescription && (
                <button
                  type="button"
                  onClick={() => {
                    setDescriptionDraft(folderMeta?.description || '');
                    setIsEditingDescription(true);
                  }}
                  className="text-[11px] text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  Изменить
                </button>
              )}
            </div>

            {isEditingDescription ? (
              <div className="flex flex-col gap-2 pt-1">
                <textarea
                  value={descriptionDraft}
                  onChange={(e) => setDescriptionDraft(e.target.value)}
                  placeholder="Опишите, какие заметки и темы должны попадать в эту папку..."
                  rows={3}
                  autoFocus
                  className="w-full bg-black/40 border border-white/[0.08] focus:border-white/20 rounded-lg p-2 text-xs text-white placeholder-zinc-500 resize-none leading-relaxed outline-none ring-0 transition-colors"
                />
                <div className="flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIsEditingDescription(false)}
                    className="px-2 py-0.5 rounded text-[11px] text-zinc-400 hover:text-white cursor-pointer"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveInlineDescription}
                    className="px-2.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white text-[11px] font-medium cursor-pointer transition-colors"
                  >
                    Сохранить
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-zinc-300 leading-relaxed font-normal">
                {folderMeta?.description || (
                  <span className="italic text-zinc-600">
                    Описание не задано. Нажмите «Изменить», чтобы ИИ понимал, какие заметки направлять в эту папку.
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Metrics Grid (Compact Dashboard) */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {metrics.map(({ label, count, icon: Icon }) => (
              <div
                key={label}
                className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] flex flex-col items-center justify-center gap-1 text-center"
              >
                <Icon className={`w-3.5 h-3.5 ${count > 0 ? 'text-zinc-300' : 'text-zinc-600'}`} />
                <span className={`text-sm font-bold font-mono ${count > 0 ? 'text-white' : 'text-zinc-600'}`}>
                  {count}
                </span>
                <span className="text-[10px] text-zinc-500 font-medium truncate max-w-full">
                  {label}
                </span>
              </div>
            ))}
          </div>

          {/* Quick Actions Row */}
          <div className="flex items-center gap-2 flex-wrap">
            {isInbox && (
              <button
                type="button"
                onClick={() => {
                  closeFolderInfoModal();
                  setIsTriageModalOpen(true);
                }}
                className="flex-1 py-1.5 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-xs text-zinc-200 hover:text-white flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-98"
              >
                <ArrowUpDown className="w-3.5 h-3.5 text-blue-400" />
                <span>ИИ-Сортировка входящих</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                closeFolderInfoModal();
                openComposerModal({ folder: targetFolder });
              }}
              className="flex-1 py-1.5 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-xs text-zinc-200 hover:text-white flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-98"
            >
              <Plus className="w-3.5 h-3.5 text-zinc-400" />
              <span>Создать запись</span>
            </button>
          </div>

          {/* Media / Files / Links / Tags Tabs */}
          <div className="pt-1 border-t border-white/[0.06]">
            <FolderMediaTabs
              mediaData={mediaData}
              onOpenLightbox={(imgs, idx) => openLightbox(imgs, idx)}
              onSelectTag={(tag) => {
                setActiveTagFilter(tag);
                closeFolderInfoModal();
              }}
              variant="desktop"
            />
          </div>
        </div>
      )}
    </BaseModal>
  );
};

export const FolderInfoModal: React.FC = () => {
  const { isFolderInfoModalOpen, folderInfoTarget, currentFolder } = useApp();

  if (!isFolderInfoModalOpen) return null;

  const target = folderInfoTarget || currentFolder || DEFAULT_INBOX_FOLDER;
  return <FolderInfoModalDialog key={target} targetFolder={target} />;
};
