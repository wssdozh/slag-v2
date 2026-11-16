// Paints the tokens the parser understood right inside the CodeMirror composer field. The mirror
// painter in BaseComposer does the same for the plain textarea fallback; both share the ranges
// from `buildComposerHighlights`, so what counts as "understood" stays in one place.
import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import type { ComposerHighlight } from './composerHighlights';

/** Date and tag are one tone; a priority is a different statement and gets the danger tone. */
const CLASS_OF: Record<ComposerHighlight['kind'], string> = {
  date: 'cm-composer-hl-mention',
  tag: 'cm-composer-hl-mention',
  priority: 'cm-composer-hl-priority',
};

export const setComposerHighlights = StateEffect.define<ComposerHighlight[]>();

function paint(highlights: ComposerHighlight[], docLength: number): DecorationSet {
  const marks = [];
  for (const highlight of highlights) {
    const from = Math.max(0, Math.min(highlight.start, docLength));
    const to = Math.max(from, Math.min(highlight.end, docLength));
    if (to > from) marks.push(Decoration.mark({ class: CLASS_OF[highlight.kind] }).range(from, to));
  }
  return Decoration.set(marks, true);
}

const highlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    let next = value.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(setComposerHighlights)) {
        next = paint(effect.value, transaction.state.doc.length);
      }
    }
    return next;
  },
});

const highlightTheme = EditorView.theme({
  '.cm-composer-hl-mention': { color: 'var(--color-mention)' },
  '.cm-composer-hl-priority': { color: 'var(--color-danger)', fontWeight: '600' },
});

export const composerHighlightExtensions = [
  highlightField,
  EditorView.decorations.from(highlightField),
  highlightTheme,
];
