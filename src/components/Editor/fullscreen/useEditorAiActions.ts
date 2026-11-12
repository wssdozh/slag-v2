// The editor's two AI actions: file the draft into a folder plus tags, or pick tags only.
import { useCallback } from 'react';
import type React from 'react';
import type { AiSettings, FolderMeta } from '../../../types';
import { categorizeDraft, generateSmartTags } from '../../../lib/ai/aiService';
import { DEFAULT_INBOX_FOLDER } from '../../../config';

type Toast = (text: string, type?: 'info' | 'success' | 'error') => void;

export interface EditorAiActionsOptions {
  title: string;
  content: string;
  folder: string;
  folders: FolderMeta[];
  aiSettings: AiSettings;
  addToast: Toast;
  setFolder: React.Dispatch<React.SetStateAction<string>>;
  setTags: React.Dispatch<React.SetStateAction<string[]>>;
}

/**
 * The two inline AI actions of the fullscreen editor: sort the note into a folder and tags,
 * or only pick tags. They move the draft's own state, so the note stays open while they run.
 */
export function useEditorAiActions({
  title,
  content,
  folder,
  folders,
  aiSettings,
  addToast,
  setFolder,
  setTags,
}: EditorAiActionsOptions) {
  const handleAiDecomposeInline = useCallback(async () => {
    addToast('ИИ определяет папку и теги...', 'info');
    try {
      const fullText = `${title ? title + '\n' : ''}${content}`.trim();
      const res = await categorizeDraft(fullText, folder || DEFAULT_INBOX_FOLDER, folders, aiSettings);
      if (res.targetFolder && res.targetFolder !== folder) {
        setFolder(res.targetFolder);
      }
      if (res.tags && res.tags.length > 0) {
        setTags(prev => Array.from(new Set([...prev, ...res.tags])));
      }
      const folderNotice = res.targetFolder && res.targetFolder !== folder ? `папка: ${res.targetFolder}` : '';
      const tagsNotice = res.tags.length > 0 ? `теги: #${res.tags.join(' #')}` : '';
      const details = [folderNotice, tagsNotice].filter(Boolean).join(', ');
      addToast(`Запись разобрана${details ? ` (${details})` : ''}: ${res.reason}`, 'success');
    } catch {
      addToast('Не удалось разобрать запись через ИИ', 'error');
    }
  }, [title, content, folder, folders, aiSettings, addToast, setFolder, setTags]);

  const handleAiTagsInline = useCallback(async () => {
    addToast('Подбор тегов...', 'info');
    try {
      const newTags = await generateSmartTags(content || title, aiSettings);
      if (newTags.length > 0) {
        setTags(prev => Array.from(new Set([...prev, ...newTags])));
        addToast(`Добавлены теги: #${newTags.join(' #')}`, 'success');
      } else {
        addToast('Новых подходящих тегов не найдено', 'info');
      }
    } catch {
      addToast('Ошибка генерации тегов', 'error');
    }
  }, [content, title, aiSettings, addToast, setTags]);

  return { handleAiDecomposeInline, handleAiTagsInline };
}
