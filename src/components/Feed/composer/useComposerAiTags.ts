import { useState } from 'react';
import type React from 'react';
import type { AiSettings, FolderMeta } from '../../../types';
import { categorizeDraft } from '../../../lib/ai/aiService';

type Toast = (text: string, type?: 'info' | 'success' | 'error') => void;

export interface UseComposerAiTagsOptions {
  content: string;
  /** Attachments count as content: a voice note has no text to classify. */
  attachmentCount: number;
  currentFolder: string;
  folders: FolderMeta[];
  aiSettings: AiSettings;
  setContent: React.Dispatch<React.SetStateAction<string>>;
  setTargetFolder: (folder: string | null) => void;
  addToast: Toast;
}

/**
 * The +AI button: ask the model for a folder and tags, then write them into the
 * text as the same `@папка` / `#тег` tokens the user would type.
 */
export function useComposerAiTags({
  content,
  attachmentCount,
  currentFolder,
  folders,
  aiSettings,
  setContent,
  setTargetFolder,
  addToast,
}: UseComposerAiTagsOptions) {
  const [isGeneratingAiTags, setIsGeneratingAiTags] = useState(false);

  const generateAiTags = async () => {
    if (!content.trim() && attachmentCount === 0) {
      addToast('Введите текст заметки для ИИ', 'info');
      return;
    }

    setIsGeneratingAiTags(true);
    try {
      const res = await categorizeDraft(content, currentFolder, folders, aiSettings);
      const folderToken = res.targetFolder && res.targetFolder !== currentFolder
        ? `@${folders.find(f => f.path === res.targetFolder)?.name ?? res.targetFolder}`
        : '';
      const tokens = [folderToken, ...res.tags.map(t => `#${t}`)].filter(Boolean).join(' ');
      if (tokens) {
        setContent(prev => `${prev.trimEnd()}${prev.trim() ? ' ' : ''}${tokens} `);
      }
      if (res.targetFolder && res.targetFolder !== currentFolder) {
        setTargetFolder(res.targetFolder);
        addToast(`Папка «${res.targetFolder}» · ${res.tags.map(t => '#' + t).join(' ')}`, 'success');
      } else if (res.tags.length > 0) {
        addToast(`Теги: ${res.tags.map(t => '#' + t).join(' ')}`, 'success');
      } else {
        addToast('ИИ не нашел подходящих тегов', 'info');
      }
    } catch {
      addToast('Ошибка запроса к ИИ', 'error');
    } finally {
      setIsGeneratingAiTags(false);
    }
  };

  return { isGeneratingAiTags, generateAiTags };
}
