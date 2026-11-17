// The composer's text surface, rebuilt on the same CodeMirror editor the fullscreen view uses:
// the caret line stays raw markdown, every other line renders its formatting. All composer
// wiring (autocomplete, slash commands, files, drafts) talks to it through `ComposerFieldHandle`.
import React, { useEffect, useRef, useState } from 'react';
import { Compartment, Prec, type Extension } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { AtomicCodeMirrorEditor } from '@atomic-editor/editor';
import { composerHighlightExtensions, setComposerHighlights } from './composerDecorations';
import type { ComposerHighlight } from './composerHighlights';

export interface ComposerEditorKeyEvent {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  preventDefault: () => void;
}

export interface ComposerEditorFieldProps {
  value: string;
  /** Swapping it remounts the document (draft reset / restore). */
  documentId: string;
  placeholder: string;
  minHeight?: number;
  maxHeight?: number;
  isMobile: boolean;
  onChange: (text: string) => void;
  /** Composer keymap (autocomplete, slash commands, Escape, Enter-to-send). */
  onKeyDown: (event: ComposerEditorKeyEvent) => void;
  /** The host element: the field handle resolves the live view from it. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Files pasted into the field: the clipbord is the platform's, not CodeMirror's. */
  onPaste?: (event: React.ClipboardEvent<HTMLDivElement>) => void;
  /** Ranges the parser understood: date, tags, priority. Painted, not edited. */
  highlights?: ComposerHighlight[];
}

export const ComposerEditorField: React.FC<ComposerEditorFieldProps> = ({
  value,
  documentId,
  placeholder: placeholderText,
  minHeight = 24,
  maxHeight = 220,
  isMobile,
  onChange,
  onKeyDown,
  containerRef,
  highlights = [],
  onPaste,
}) => {
  // The keymap extensions are captured once at mount, so they read the latest handlers
  // through this box instead of closing over the first render's props.
  const handlersRef = useRef({ onChange, onKeyDown, isMobile });
  useEffect(() => {
    handlersRef.current = { onChange, onKeyDown, isMobile };
  }, [onChange, onKeyDown, isMobile]);

  const [placeholderCompartment] = useState(() => new Compartment());

  // The composer keymap runs before CodeMirror's own defaults, so Enter can send the draft
  // instead of inserting a newline. Returning true means the composer consumed the key.
  const fire = (key: string, shiftKey: boolean): boolean => {
    let prevented = false;
    handlersRef.current.onKeyDown({
      key,
      shiftKey,
      ctrlKey: false,
      metaKey: false,
      preventDefault: () => { prevented = true; },
    });
    return prevented;
  };

  // oxlint-disable-next-line react-hooks/refs -- the keymap only reads the box from an event
  const [extensions] = useState<readonly Extension[]>(() => [
    EditorView.lineWrapping,
    composerHighlightExtensions,
    placeholderCompartment.of(placeholder(placeholderText)),
    EditorView.theme({
      '&': {
        height: 'auto',
        backgroundColor: 'transparent',
        color: 'var(--color-fg-primary)',
        fontSize: '14px',
      },
      '&.cm-focused': { outline: 'none' },
      '.cm-scroller': {
        maxHeight: 'none',
        minHeight: `${minHeight}px`,
        overflowY: 'auto',
        fontFamily: 'inherit',
        lineHeight: '1.45',
      },
      '.cm-content': { padding: '0', minHeight: `${minHeight}px`, caretColor: 'var(--color-fg-primary)' },
      '.cm-line': { padding: '0' },
      '.cm-placeholder': { color: 'var(--color-fg-dim)' },
      '.cm-gutters': { display: 'none' },
    }),
    Prec.highest(
      keymap.of([
        { key: 'Enter', run: () => fire('Enter', false) },
        { key: 'Shift-Enter', run: () => fire('Enter', true) },
        { key: 'Escape', run: () => fire('Escape', false) },
        { key: 'ArrowDown', run: () => fire('ArrowDown', false) },
        { key: 'ArrowUp', run: () => fire('ArrowUp', false) },
        { key: 'Tab', run: () => fire('Tab', false) },
      ]),
    ),
  ]);

  // The placeholder depends on the record type (note / task / article), and the editor
  // already exists, so it is reconfigured instead of remounted.
  useEffect(() => {
    const element = containerRef.current;
    const view = element ? EditorView.findFromDOM(element) : null;
    if (!view) return;
    view.dispatch({ effects: placeholderCompartment.reconfigure(placeholder(placeholderText)) });
  }, [placeholderText, placeholderCompartment, containerRef]);

  // Painted ranges follow the parser: every render that produced new offsets repaints them.
  // The editor may still be mounting on the first pass, so a missing view is retried next frame.
  useEffect(() => {
    const element = containerRef.current;
    const view = element ? EditorView.findFromDOM(element) : null;
    if (!view) {
      const frame = requestAnimationFrame(() => {
        const late = element ? EditorView.findFromDOM(element) : null;
        late?.dispatch({ effects: setComposerHighlights.of(highlights) });
      });
      return () => cancelAnimationFrame(frame);
    }
    view.dispatch({ effects: setComposerHighlights.of(highlights) });
  }, [highlights, containerRef]);

  return (
    <div
      ref={containerRef}
      className="composer-editor-field min-w-0 flex-1"
      style={{ ['--composer-editor-max-height' as string]: `${maxHeight}px` }}
      data-composer-editor=""
      // CodeMirror pastes text itself and never mentions the file on the clipboard, so the
      // wrapper looks first: a pasted screenshot becomes an attachment, not nothing.
      onPasteCapture={onPaste}
    >
      <AtomicCodeMirrorEditor
        markdownSource={value}
        documentId={documentId}
        extensions={extensions}
        onMarkdownChange={(text) => handlersRef.current.onChange(text)}
        blurEditorOnMount
      />
    </div>
  );
};
