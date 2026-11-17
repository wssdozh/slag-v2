// Inline `![[file]]` embeds in the fullscreen editor: the token is replaced by a thumbnail or
// a file chip while the selection is away from it, and shows as raw text when it is not — the
// same reveal Obsidian does.
import { Prec, RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import type { SlagAttachment } from '../../../types';
import {
  attachmentEmbedSrc,
  findAttachmentEmbeds,
  resolveAttachmentEmbeds,
  type AttachmentEmbed,
} from '../../../lib/text/attachmentEmbed';
import { formatBytes } from '../../../lib/text/formatBytes';

/**
 * Mutable bridge between React state and the plugin. The CM6 view is created once, so the
 * extension cannot see new props: the owner writes fresh values here and bumps `version`,
 * then dispatches an empty transaction to make the plugin rebuild.
 */
export interface AttachmentEmbedDeps {
  attachments: SlagAttachment[];
  srcs: Readonly<Record<string, string>>;
  version: number;
}

/**
 * Hands fresh files to the live plugin. The fields are written here rather than at the call
 * site so the React render path never mutates a state value directly.
 */
export function syncAttachmentEmbedDeps(
  deps: AttachmentEmbedDeps,
  attachments: SlagAttachment[],
  srcs: Readonly<Record<string, string>>,
): void {
  deps.attachments = attachments;
  deps.srcs = srcs;
  deps.version += 1;
}

const PAPERCLIP_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 shrink-0">' +
  '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>' +
  '</svg>';

/** One token, painted as the file itself. `from` is where the caret lands when it is clicked. */
class AttachmentEmbedWidget extends WidgetType {
  readonly embed: AttachmentEmbed;
  /** Absolute document position of the leading `!`; `embed.from` is relative to its line. */
  readonly from: number;
  readonly attachment: SlagAttachment | undefined;
  readonly src: string | undefined;

  constructor(
    embed: AttachmentEmbed,
    from: number,
    attachment: SlagAttachment | undefined,
    src: string | undefined,
  ) {
    super();
    this.embed = embed;
    this.from = from;
    this.attachment = attachment;
    this.src = src;
  }

  eq(other: AttachmentEmbedWidget): boolean {
    return (
      other.from === this.from &&
      other.embed.name === this.embed.name &&
      other.embed.label === this.embed.label &&
      other.attachment?.id === this.attachment?.id &&
      other.attachment?.size === this.attachment?.size &&
      other.src === this.src
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const root = document.createElement('span');
    root.dataset.testid = 'attachment-embed-widget';
    root.dataset.attachmentKind = this.attachment?.type ?? 'unknown';
    root.className = 'cm-attachment-embed inline-flex max-w-full align-middle font-mono text-2xs';

    if (this.attachment?.type === 'image' && this.src) {
      root.classList.add(
        'my-1', 'overflow-hidden', 'rounded-lg', 'border', 'border-tint-10',
        'bg-scrim-40', 'cursor-zoom-in',
      );
      root.title = this.attachment.name;
      const img = document.createElement('img');
      img.src = this.src;
      img.alt = this.attachment.name;
      img.loading = 'lazy';
      img.className = 'block max-h-64 max-w-full object-contain';
      root.append(img);
    } else {
      root.classList.add(
        'items-center', 'gap-1.5', 'px-2', 'py-0.5', 'rounded-md', 'bg-tint-6',
        'border', 'border-tint-8', 'text-fg-tertiary', 'cursor-pointer',
        'hover:bg-tint-8', 'hover:text-fg-soft', 'transition-colors',
      );
      root.title = this.attachment
        ? `${this.attachment.name} — нажмите, чтобы показать разметку`
        : `Вложение «${this.embed.name}» не найдено`;
      root.innerHTML = PAPERCLIP_SVG;
      const name = document.createElement('span');
      name.className = 'truncate max-w-[16rem]';
      name.textContent = this.attachment?.name ?? this.embed.label;
      root.append(name);
      const size = formatBytes(this.attachment?.size);
      if (size) {
        const meta = document.createElement('span');
        meta.className = 'shrink-0 text-fg-muted';
        meta.textContent = size;
        root.append(meta);
      }
    }

    const revealSource = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      view.focus();
      view.dispatch({ selection: { anchor: this.from }, scrollIntoView: false });
    };
    root.addEventListener('mousedown', revealSource);
    return root;
  }

  // The listener above owns the caret placement; CM6 must not also map the click to a doc pos.
  ignoreEvent(event: Event): boolean {
    return event.type === 'mousedown' || event.type === 'click';
  }
}

function buildDecorations(view: EditorView, deps: AttachmentEmbedDeps): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const { selection } = view.state;
  // Count the whole document, including tokens hidden by the caret or outside the viewport.
  const resolved = new Map(
    resolveAttachmentEmbeds(view.state.doc.toString(), deps.attachments)
      .map(({ embed, attachment }) => [embed.from, attachment]),
  );
  for (const visible of view.visibleRanges) {
    const lastLine = view.state.doc.lineAt(visible.to).number;
    for (let number = view.state.doc.lineAt(visible.from).number; number <= lastLine; number += 1) {
      const line = view.state.doc.line(number);
      if (!line.text.includes('![[')) continue;
      for (const embed of findAttachmentEmbeds(line.text)) {
        const from = line.from + embed.from;
        const to = line.from + embed.to;
        const isTouched = selection.ranges.some(
          (range) => range.from <= to && range.to >= from,
        );
        if (isTouched) continue;
        const attachment = resolved.get(from);
        const src = attachmentEmbedSrc(attachment, deps.srcs);
        builder.add(
          from,
          to,
          Decoration.replace({ widget: new AttachmentEmbedWidget(embed, from, attachment, src) }),
        );
      }
    }
  }
  return builder.finish();
}

class AttachmentEmbedPlugin {
  decorations: DecorationSet;
  private readonly deps: AttachmentEmbedDeps;
  private version: number;

  constructor(view: EditorView, deps: AttachmentEmbedDeps) {
    this.deps = deps;
    this.version = deps.version;
    this.decorations = buildDecorations(view, deps);
  }

  update(update: ViewUpdate): void {
    const isStale = this.deps.version !== this.version;
    if (isStale) this.version = this.deps.version;
    if (update.docChanged || update.selectionSet || update.viewportChanged || isStale) {
      this.decorations = buildDecorations(update.view, this.deps);
    }
  }
}

/**
 * The extension itself. Pass the same deps object for the lifetime of the editor: the plugin
 * reads it on every rebuild, and `version` is what tells it the files changed.
 */
export function attachmentEmbeds(deps: AttachmentEmbedDeps) {
  const plugin = ViewPlugin.define<AttachmentEmbedPlugin>(
    (view) => new AttachmentEmbedPlugin(view, deps),
    { decorations: (value) => value.decorations },
  );
  // `Prec.highest` is what makes the whole-token replacement win over the inline-preview
  // decorations for the characters inside it, which would otherwise hide the token on their own.
  return Prec.highest(plugin);
}
