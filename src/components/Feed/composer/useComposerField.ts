// React wrapper for the field handle: the DOM is read lazily inside callbacks, never during
// render, and the handle stays stable for the whole composer lifetime.
import { useCallback, useMemo } from 'react';
import type { RefObject } from 'react';
import { EditorView } from '@codemirror/view';
import { codeMirrorFieldHandle, textareaFieldHandle, type ComposerFieldHandle } from './field';

export type ComposerEngine = 'textarea' | 'markdown';

/**
 * One handle for whichever surface the composer renders: the plain textarea (assistant, and the
 * emergency fallback) or the CodeMirror view that brings the editor's inline preview.
 */
export function useComposerField(
  ref: RefObject<HTMLTextAreaElement | null>,
  containerRef: RefObject<HTMLDivElement | null>,
  engine: ComposerEngine,
): ComposerFieldHandle {
  const getElement = useCallback(() => ref.current, [ref]);
  const getView = useCallback(() => {
    const element = containerRef.current;
    return element ? EditorView.findFromDOM(element) : null;
  }, [containerRef]);
  // oxlint-disable-next-line react-hooks/refs -- the getters are only called from event handlers
  return useMemo(
    // oxlint-disable-next-line react-hooks/refs -- the getters are only called from event handlers
    () => (engine === 'markdown' ? codeMirrorFieldHandle(getView) : textareaFieldHandle(getElement)),
    [engine, getElement, getView],
  );
}
