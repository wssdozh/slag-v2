import { useCallback, useEffect, useState } from 'react';
import type React from 'react';
import type { SlagAttachment } from '../../../types';
import { processFileListToAttachments } from '../../../lib/media/fileDropHelper';

type Toast = (text: string, type?: 'info' | 'success' | 'error') => void;

interface ComposerFilesOptions {
  addToast: Toast;
  setAttachments: React.Dispatch<React.SetStateAction<SlagAttachment[]>>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  /** A composer that lives in its own window is the only one that listens on `window`. */
  isModal: boolean;
  isActive: boolean;
}

/**
 * Getting files into the composer: picker, drop, paste.
 *
 * One reason to change — how the platform hands us bytes. It knows about drag
 * events and the clipboard, and nothing about titles, tags or folders.
 */
export function useComposerFiles({ addToast, setAttachments, textareaRef, isModal, isActive }: ComposerFilesOptions) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const attachFiles = useCallback(async (files: FileList | File[]) => {
    try {
      const processed = await processFileListToAttachments(files);
      if (processed.length > 0) {
        setAttachments((prev) => [...prev, ...processed]);
        addToast(`Прикреплено: ${processed.length === 1 ? processed[0].name : `${processed.length} файла`}`, 'success');
        requestAnimationFrame(() => {
          textareaRef.current?.focus({ preventScroll: true });
        });
      }
    } catch {
      addToast('Не удалось обработать прикрепленные файлы', 'error');
    }
  }, [addToast, setAttachments, textareaRef]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        await attachFiles(e.dataTransfer.files);
      }
    }
  }, [attachFiles]);

  // Window-level drag & drop and paste support when running as a dedicated modal/window island
  useEffect(() => {
    if (!isModal || !isActive) return;

    const onWindowDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
        setIsDraggingOver(true);
      }
    };

    const onWindowDragLeave = (e: DragEvent) => {
      if (!e.relatedTarget || e.relatedTarget === document.documentElement) {
        setIsDraggingOver(false);
      }
    };

    const onWindowDrop = async (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
        setIsDraggingOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          await attachFiles(e.dataTransfer.files);
        }
      }
    };

    const onWindowPaste = async (e: ClipboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      const clipboardFiles: File[] = [];
      if (e.clipboardData?.items) {
        for (let i = 0; i < e.clipboardData.items.length; i++) {
          const item = e.clipboardData.items[i];
          if (item.kind === 'file') {
            const file = item.getAsFile();
            if (file) clipboardFiles.push(file);
          }
        }
      }
      if (clipboardFiles.length > 0) {
        e.preventDefault();
        await attachFiles(clipboardFiles);
      }
    };

    window.addEventListener('dragover', onWindowDragOver);
    window.addEventListener('dragleave', onWindowDragLeave);
    window.addEventListener('drop', onWindowDrop);
    window.addEventListener('paste', onWindowPaste);

    return () => {
      window.removeEventListener('dragover', onWindowDragOver);
      window.removeEventListener('dragleave', onWindowDragLeave);
      window.removeEventListener('drop', onWindowDrop);
      window.removeEventListener('paste', onWindowPaste);
    };
  }, [isModal, isActive, attachFiles]);

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardFiles: File[] = [];
    if (e.clipboardData.items) {
      for (let i = 0; i < e.clipboardData.items.length; i++) {
        const item = e.clipboardData.items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) clipboardFiles.push(file);
        }
      }
    }

    if (clipboardFiles.length > 0) {
      e.preventDefault();
      await attachFiles(clipboardFiles);
    }
  };

  return {
    isDraggingOver,
    attachFiles,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handlePaste,
  };
}
