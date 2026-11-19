// React wrapper for the field handle: the DOM is read lazily inside callbacks, never during
// render, and the handle stays stable for the whole composer lifetime.
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import type { EditorView } from '@codemirror/view';
import { codeMirrorFieldHandle, textareaFieldHandle, type ComposerFieldHandle } from './field';

export type ComposerEngine = 'textarea' | 'markdown';

/** Mutable holder shared across hook instances; read by getView at call time. */
const cmModule: { viewClass?: typeof EditorView; started: boolean } = { viewClass: undefined, started: false };

/**
 * One handle for whichever surface the composer renders: the plain textarea (assistant, and the
 * emergency fallback) or the CodeMirror view that brings the editor's inline preview.
 *
 * The CodeMirror runtime (~600 kB) is lazy-loaded on first focus so it does not hit
 * the startup bundle.
 */
export function useComposerField(
  ref: RefObject<HTMLTextAreaElement | null>,
  containerRef: RefObject<HTMLDivElement | null>,
  engine: ComposerEngine,
): ComposerFieldHandle {
  // eslint-disable-next-line react-compiler/retaining-shared-object-references
  const cmRef = useRef(cmModule);

  // Kick off download before the user could possibly need it.
  useEffect(() => {
    if (engine !== 'markdown' || cmModule.started) return;
    cmModule.started = true;
    void import('@codemirror/view').then(({ EditorView }) => {
      cmModule.viewClass = EditorView;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const getElement = useCallback(() => ref.current, [ref]);
  const getView = useCallback((): EditorView | null => {
    if (engine !== 'markdown') return null;
    const VC = cmRef.current.viewClass;
    if (!VC || !containerRef.current) return null;
    return VC.findFromDOM(containerRef.current);
  }, [containerRef, engine]);
  // oxlint-disable-next-line react-hooks/refs -- the getters are only called from event handlers
  return useMemo(
    // oxlint-disable-next-line react-hooks/refs -- the getters are only called from event handlers
    () => (engine === 'markdown' ? codeMirrorFieldHandle(getView) : textareaFieldHandle(getElement)),
    [engine, getElement, getView],
  );
}
