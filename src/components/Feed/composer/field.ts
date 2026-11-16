// The composer's text surface, abstracted away from the <textarea> it used to be.
// Every piece of composer logic (autocomplete, slash commands, files, drafts) talks to this
// handle instead of reaching into `HTMLTextAreaElement`, so the surface can grow into a
// CodeMirror view without touching those hooks again.
// CodeMirror view, typed only: the handle reads the live document through it.
import type { EditorView } from '@codemirror/view';

export interface FieldSelection {
  from: number;
  to: number;
}

export interface ComposerFieldHandle {
  /** Current text, exactly as the person sees it. */
  getValue(): string;
  /** Caret/anchor in document offsets (not screen coordinates). */
  getSelection(): FieldSelection;
  /**
   * Replace `[from, to)` with `text` and, when `caret` is given, put the caret there.
   * The surface dispatches its own change event, so React state follows.
   */
  replaceRange(from: number, to: number, text: string, caret?: number): void;
  /** Replace the whole document (draft restore, `/clear`, +AI tags). */
  setValue(text: string): void;
  /** Put the caret at `offset` (and collapse the selection). */
  setCaret(offset: number): void;
  focus(): void;
  isFocused(): boolean;
}

/**
 * The <textarea> implementation. React owns the value, so writes go through the DOM and a
 * synthetic `input` event: that is what makes a controlled field pick up the new text.
 */
export function textareaFieldHandle(getElement: () => HTMLTextAreaElement | null): ComposerFieldHandle {
  const emitChange = (element: HTMLTextAreaElement) => {
    element.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const placeCaret = (element: HTMLTextAreaElement, caret: number) => {
    element.focus({ preventScroll: true });
    element.setSelectionRange(caret, caret);
  };

  return {
    getValue: () => getElement()?.value ?? '',
    getSelection: () => {
      const element = getElement();
      if (!element) return { from: 0, to: 0 };
      return { from: element.selectionStart ?? 0, to: element.selectionEnd ?? 0 };
    },
    replaceRange: (from, to, text, caret) => {
      const element = getElement();
      if (!element) return;
      element.setRangeText(text, from, to, 'end');
      emitChange(element);
      if (caret !== undefined) placeCaret(element, caret);
    },
    setValue: (text) => {
      const element = getElement();
      if (!element) return;
      element.value = text;
      emitChange(element);
    },
    setCaret: (offset) => {
      const element = getElement();
      if (!element) return;
      placeCaret(element, offset);
    },
    focus: () => {
      getElement()?.focus({ preventScroll: true });
    },
    isFocused: () => getElement() === document.activeElement,
  };
}

/**
 * The CodeMirror implementation. The view owns the document, so every write is a transaction;
 * the view itself is resolved lazily because it only exists after the editor mounts.
 */
export function codeMirrorFieldHandle(getView: () => EditorView | null): ComposerFieldHandle {
  const view = () => getView();

  return {
    getValue: () => view()?.state.doc.toString() ?? '',
    getSelection: () => {
      const main = view()?.state.selection.main;
      return { from: main?.from ?? 0, to: main?.to ?? 0 };
    },
    replaceRange: (from, to, text, caret) => {
      const current = view();
      if (!current) return;
      current.dispatch({
        changes: { from, to, insert: text },
        selection: caret !== undefined ? { anchor: caret } : undefined,
      });
    },
    setValue: (text) => {
      const current = view();
      if (!current) return;
      current.dispatch({ changes: { from: 0, to: current.state.doc.length, insert: text } });
    },
    setCaret: (offset) => {
      const current = view();
      if (!current) return;
      const anchor = Math.max(0, Math.min(offset, current.state.doc.length));
      current.dispatch({ selection: { anchor } });
    },
    focus: () => {
      view()?.focus();
    },
    isFocused: () => view()?.hasFocus ?? false,
  };
}
