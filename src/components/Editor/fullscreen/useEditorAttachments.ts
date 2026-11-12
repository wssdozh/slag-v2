import { useCallback, useState } from 'react';
import type React from 'react';
import type { EditorView } from '@codemirror/view';
import type { SlagAttachment } from '../../../types';
import { processFileListToAttachments } from '../../../lib/media/fileDropHelper';

type Toast = (text: string, type?: 'info' | 'success' | 'error') => void;

export interface EditorAttachmentsOptions {
  /** The live CodeMirror view, or null while the editor is still mounting. */
  getEditorView: () => EditorView | null;
  attachments: SlagAttachment[];
  setAttachments: React.Dispatch<React.SetStateAction<SlagAttachment[]>>;
  setContent: React.Dispatch<React.SetStateAction<string>>;
  setIsAttachmentsCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  addToast: Toast;
  openAttachSheet: (onAdd: (attachments: SlagAttachment[]) => void) => void;
}

/**
 * Getting files into the fullscreen editor: picker, drop, paste, and the `![[file]]` link
 * that points at them. It knows about drag events and the clipboard, and nothing about
 * titles, tags or folders.
 */
export function useEditorAttachments({
  getEditorView,
  attachments,
  setAttachments,
  setContent,
  setIsAttachmentsCollapsed,
  addToast,
  openAttachSheet,
}: EditorAttachmentsOptions) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const insertAttachmentMarkdown = useCallback((attName: string) => {
    const link = `![[${attName}]]\n`;
    const view = getEditorView();
    if (view) {
      const pos = view.state.selection.main.head;
      view.dispatch({
        changes: { from: pos, insert: link },
        selection: { anchor: pos + link.length },
      });
      view.focus();
      addToast(`Ссылка ![[${attName}]] добавлена в позицию курсора`, 'info');
    } else {
      setContent(prev => (prev.trim() ? prev + '\n\n' + link : link));
      addToast(`Ссылка ![[${attName}]] добавлена в текст`, 'info');
    }
  }, [getEditorView, addToast, setContent]);

  const handleAttachmentsAdded = useCallback((newAtts: SlagAttachment[]) => {
    setAttachments(prev => [...prev, ...newAtts]);
    setIsAttachmentsCollapsed(false);
    const links = newAtts.map(a => `![[${a.name}]]`).join('\n') + '\n';
    const view = getEditorView();
    if (view) {
      const pos = view.state.selection.main.head;
      view.dispatch({
        changes: { from: pos, insert: links },
        selection: { anchor: pos + links.length },
      });
      view.focus();
    } else {
      setContent(prev => (prev.trim() ? prev + '\n\n' + links : links));
    }
    addToast(`Добавлено медиа: ${newAtts.length} ${newAtts.length === 1 ? 'файл' : 'файла'}`, 'success');
  }, [getEditorView, addToast, setAttachments, setContent, setIsAttachmentsCollapsed]);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const files: File[] = [];
    if (e.clipboardData.items) {
      for (let i = 0; i < e.clipboardData.items.length; i++) {
        const it = e.clipboardData.items[i];
        if (it.kind === 'file') {
          const file = it.getAsFile();
          if (file) files.push(file);
        }
      }
    }

    if (files.length > 0) {
      e.preventDefault();
      try {
        const processed = await processFileListToAttachments(files);
        if (processed.length > 0) {
          handleAttachmentsAdded(processed);
        }
      } catch {
        addToast('Не удалось вставить медиа из буфера', 'error');
      }
    }
  }, [handleAttachmentsAdded, addToast]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        try {
          const processed = await processFileListToAttachments(e.dataTransfer.files);
          if (processed.length > 0) {
            handleAttachmentsAdded(processed);
          }
        } catch {
          addToast('Не удалось обработать файлы', 'error');
        }
      }
    }
  }, [handleAttachmentsAdded, addToast]);

  const handleAttachClick = useCallback(() => {
    openAttachSheet((attachments) => {
      if (attachments.length > 0) handleAttachmentsAdded(attachments);
    });
  }, [openAttachSheet, handleAttachmentsAdded]);

  const moveAttachment = useCallback((index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= attachments.length) return;
    const next = [...attachments];
    const it = next[index];
    next[index] = next[targetIdx];
    next[targetIdx] = it;
    setAttachments(next);
  }, [attachments, setAttachments]);

  const removeAttachment = useCallback((id: string) => {
    setAttachments(attachments.filter(a => a.id !== id));
  }, [attachments, setAttachments]);

  return {
    isDraggingOver,
    insertAttachmentMarkdown,
    handleAttachmentsAdded,
    handlePaste,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleAttachClick,
    moveAttachment,
    removeAttachment,
  };
}
