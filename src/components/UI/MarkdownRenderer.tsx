// Renders markdown with GFM, Obsidian [[wiki links]] as in-app jumps and ![[files]] as embeds.
import React, { useMemo, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Icon } from './icons/Icon';
import type { SlagAttachment } from '../../types';
import { formatBytes } from '../../lib/text/formatBytes';
import { isNativeWebview, openExternalUrl } from '../../lib/platform/openExternal';
import { protectSpoilers, remarkNoteDisclosure } from '../../lib/text/noteDisclosure';
import {
  attachmentEmbedSrc,
  attachmentNameFromHref,
  markdownWithAttachmentEmbeds,
  resolveAttachmentByName,
} from '../../lib/text/attachmentEmbed';

/** Attachment ids to the object URLs `useAttachmentSrcs` has resolved so far. */
export type MarkdownAttachmentSrcs = Readonly<Record<string, string>>;

interface MarkdownRendererProps {
  content: string;
  onWikiLinkClick?: (target: string) => void;
  className?: string;
  inline?: boolean;
  /** Files of the note being rendered; `![[name]]` resolves against them. */
  attachments?: SlagAttachment[];
  /** Resolved bytes per attachment id; the embed falls back to the attachment's own dataUrl. */
  attachmentSrcs?: MarkdownAttachmentSrcs;
  /** A click on an image embed or a non-downloadable file chip. */
  onAttachmentClick?: (attachment: SlagAttachment) => void;
}

// Convert Obsidian-style [[Target|Label]] and [[Target]] into markdown links [Label](wiki:Target)
function transformWikiLinks(raw: string): string {
  if (!raw) return '';
  return raw.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, alias) => {
    const text = (alias || target).trim();
    return `[${text}](wiki:${encodeURIComponent(target.trim())})`;
  });
}

/**
 * Only the schemes the app actually opens. React-markdown's default transform is close,
 * but the wiki links need `wiki:` and the identity transform that used to be here let
 * `javascript:`/`data:` through into an `<a href>` — a one-click XSS from any note.
 * Control characters are stripped before the scheme check because `java\nscript:` is
 * normalized by the browser into `javascript:`.
 */
function safeMarkdownUrl(url: string): string {
  const value = (url || '').trim();
  if (!value) return '';
  let probe = '';
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code > 32 && code !== 127) probe += char;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(probe)) {
    return /^(?:https?:|mailto:|wiki:|attachment:)/i.test(probe) ? value : '';
  }
  return value;
}

const EMBED_CHIP_CLASS =
  'inline-flex items-center gap-1.5 align-middle max-w-full px-2 py-0.5 rounded-md bg-tint-6 border border-tint-8 font-mono text-2xs text-fg-tertiary';

interface AttachmentEmbedViewProps {
  name: string;
  attachment?: SlagAttachment;
  srcs?: MarkdownAttachmentSrcs;
  onAttachmentClick?: (attachment: SlagAttachment) => void;
}

/**
 * One `![[file]]` in the feed. A known picture becomes the picture itself, a known file becomes
 * a chip that downloads when its bytes are there, and an unknown name stays a neutral chip with
 * the name on it — never an `<img>` pointed at a scheme nothing can fetch.
 */
const AttachmentEmbedView: React.FC<AttachmentEmbedViewProps> = ({
  name,
  attachment,
  srcs,
  onAttachmentClick,
}) => {
  const src = attachmentEmbedSrc(attachment, srcs);
  const label = attachment?.name ?? name;
  const size = attachment ? formatBytes(attachment.size) : '';

  if (attachment?.type === 'image' && src) {
    return (
      <button
        type="button"
        data-testid="attachment-embed"
        data-attachment-kind="image"
        title={label}
        draggable={false}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onAttachmentClick?.(attachment);
        }}
        className="inline-flex max-w-full my-1 align-middle outline-none ring-0 cursor-zoom-in overflow-hidden rounded-lg border border-tint-10 bg-scrim-40"
      >
        <img
          src={src}
          alt={label}
          loading="lazy"
          draggable={false}
          className="block max-h-64 max-w-full object-contain"
        />
      </button>
    );
  }

  const chip = (
    <>
      <Icon name="action.attach" size="sm" tone="muted" className="shrink-0" />
      <span className="truncate max-w-[16rem]">{label}</span>
      {size && <span className="shrink-0 text-fg-muted normal-case">{size}</span>}
    </>
  );

  // A file with bytes downloads straight from the card; audio and video open the note's rail,
  // where they have a player. An unresolved name is a label, not an action.
  if (attachment?.type === 'file' && src) {
    return (
      <a
        href={src}
        download={attachment.name}
        data-testid="attachment-embed"
        data-attachment-kind="file"
        title={`Скачать ${attachment.name}`}
        onClick={(e) => e.stopPropagation()}
        className={`${EMBED_CHIP_CLASS} no-underline hover:bg-tint-8 hover:text-fg-soft transition-colors`}
      >
        {chip}
      </a>
    );
  }

  if (attachment && onAttachmentClick) {
    return (
      <button
        type="button"
        data-testid="attachment-embed"
        data-attachment-kind={attachment.type}
        title={`Открыть ${attachment.name}`}
        draggable={false}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onAttachmentClick(attachment);
        }}
        className={`${EMBED_CHIP_CLASS} cursor-pointer hover:bg-tint-8 hover:text-fg-soft transition-colors`}
      >
        {chip}
      </button>
    );
  }

  return (
    <span
      data-testid="attachment-embed"
      data-attachment-kind={attachment?.type ?? 'unknown'}
      title={attachment ? label : `Вложение «${name}» не найдено`}
      className={EMBED_CHIP_CLASS}
    >
      {chip}
    </span>
  );
};

function NoteSpoiler({ children }: React.PropsWithChildren) {
  const [revealed, setRevealed] = useState(false);
  return (
    <span
      role="button"
      tabIndex={0}
      aria-expanded={revealed}
      aria-label={revealed ? undefined : 'Раскрыть спойлер'}
      className={`box-decoration-clone rounded-md cursor-pointer focus-visible:outline focus-visible:outline-accent ${revealed ? 'select-text' : 'bg-fg-secondary/30 select-none'}`}
      onClick={(event) => {
        event.stopPropagation();
        if (window.getSelection()?.isCollapsed !== false) setRevealed(!revealed);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        setRevealed(!revealed);
      }}
    >
      <span className={revealed ? undefined : 'invisible'}>{children}</span>
    </span>
  );
}

function FoldedQuote({ children }: React.PropsWithChildren) {
  const [expanded, setExpanded] = useState(false);
  const contentId = React.useId();
  return (
    <blockquote className="relative my-1.5 rounded-lg bg-accent/8 py-2 pl-4 pr-10 text-fg-tertiary leading-relaxed before:absolute before:inset-y-2 before:left-1.5 before:w-0.5 before:bg-accent/60">
      <div id={contentId} inert={!expanded} className={expanded ? undefined : 'max-h-[2lh] overflow-clip'}>
        {children}
      </div>
      <button
        type="button"
        aria-label={expanded ? 'Свернуть цитату' : 'Раскрыть цитату'}
        aria-expanded={expanded}
        aria-controls={contentId}
        className="absolute right-1.5 bottom-1.5 grid size-7 cursor-pointer place-items-center rounded-md text-fg-secondary hover:bg-tint-6 focus-visible:outline focus-visible:outline-accent"
        onClick={(event) => {
          event.stopPropagation();
          setExpanded(!expanded);
        }}
      >
        <Icon name="nav.down" size="sm" tone="inherit" className={expanded ? 'rotate-180' : undefined} />
      </button>
    </blockquote>
  );
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  onWikiLinkClick,
  className = '',
  inline = false,
  attachments,
  attachmentSrcs,
  onAttachmentClick,
}) => {
  // Embeds are pulled out first: the wiki transform would otherwise eat the inner `[[name]]`.
  const { transformed, plugins } = useMemo(() => {
    const { markdown, spoilers } = protectSpoilers(content);
    const transformed = transformWikiLinks(markdownWithAttachmentEmbeds(markdown, attachments));
    return { transformed, plugins: [remarkGfm, () => remarkNoteDisclosure(spoilers)] };
  }, [content, attachments]);

  const components: Components = useMemo(
    () => ({
      a: ({ href, children, ...props }) => {
        if (href?.startsWith('wiki:')) {
          const target = decodeURIComponent(href.slice(5));
          return (
            <span
              role="button"
              tabIndex={0}
              draggable={false}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onWikiLinkClick?.(target);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onWikiLinkClick?.(target);
                }
              }}
              className="text-blue-400 hover:text-blue-300 hover:underline cursor-pointer font-medium select-text"
              title={`Перейти к «${target}»`}
            >
              {children}
            </span>
          );
        }
        const embedName = href ? attachmentNameFromHref(href) : null;
        if (embedName !== null) {
          // The name is resolved against the note's own files; the scheme itself is never fetched.
          return (
            <AttachmentEmbedView
              name={embedName}
              attachment={resolveAttachmentByName(attachments, embedName)}
              srcs={attachmentSrcs}
              onAttachmentClick={onAttachmentClick}
            />
          );
        }
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              e.stopPropagation();
              if (href && /^https?:\/\//i.test(href) && isNativeWebview()) {
                e.preventDefault();
                void openExternalUrl(href);
              }
            }}
            className="text-blue-400 hover:text-blue-300 hover:underline break-all"
            {...props}
          >
            {children}
          </a>
        );
      },
      h1: ({ children }) => (
        <h1 className="text-sm font-bold text-fg-primary my-1 first:mt-0 tracking-tight">{children}</h1>
      ),
      h2: ({ children }) => (
        <h2 className="text-xs font-bold text-fg-primary my-1 first:mt-0 tracking-tight">{children}</h2>
      ),
      h3: ({ children }) => (
        <h3 className="text-xs font-semibold text-fg-soft my-0.5 first:mt-0">{children}</h3>
      ),
      h4: ({ children }) => (
        <h4 className="text-xs font-medium text-fg-tertiary my-0.5 first:mt-0">{children}</h4>
      ),
      p: ({ children }) =>
        inline ? (
          <span className="inline leading-normal whitespace-pre-line">{children}</span>
        ) : (
          <p className="mb-1.5 last:mb-0 leading-relaxed whitespace-pre-line">{children}</p>
        ),
      strong: ({ children }) => <strong className="font-semibold text-fg-primary">{children}</strong>,
      em: ({ children }) => <em className="italic text-fg-tertiary">{children}</em>,
      ul: ({ children }) => <ul className="list-disc list-inside my-1 space-y-0.5 pl-1">{children}</ul>,
      ol: ({ children }) => <ol className="list-decimal list-inside my-1 space-y-0.5 pl-1">{children}</ol>,
      li: ({ children, className }) => {
        if (className?.includes('task-list-item')) {
          return <li className="list-none flex items-start gap-1.5 my-0.5">{children}</li>;
        }
        return <li className="leading-relaxed [&>p]:inline [&>p]:mb-0">{children}</li>;
      },
      input: ({ type, checked }) => {
        if (type === 'checkbox') {
          return checked ? (
            <Icon name="status.done" size="sm" tone="success" className="shrink-0 mt-0.5 inline-block" />
          ) : (
            <Icon name="status.todo" size="sm" tone="dim" className="shrink-0 mt-0.5 inline-block" />
          );
        }
        return null;
      },
      code: ({ children, className, ...props }) => {
        const isInline = !className?.includes('language-');
        if (isInline) {
          return (
            <code
              className="px-1 py-0.5 rounded bg-tint-6 text-fg-tertiary font-mono text-2xs"
              {...props}
            >
              {children}
            </code>
          );
        }
        return (
          <code className={className} {...props}>
            {children}
          </code>
        );
      },
      pre: ({ children }) => (
        <pre className="p-2 my-1.5 rounded bg-scrim-40 border border-tint-6 font-mono text-2xs text-fg-tertiary overflow-x-auto leading-normal">
          {children}
        </pre>
      ),
      span: ({ children, node }) => 'data-note-spoiler' in (node?.properties ?? {})
        ? <NoteSpoiler>{children}</NoteSpoiler> : <span>{children}</span>,
      details: ({ children }) => <FoldedQuote>{children}</FoldedQuote>,
      blockquote: ({ children }) => (
        <blockquote className="border-l-2 border-tint-14 pl-2.5 my-1.5 text-fg-secondary italic">
          {children}
        </blockquote>
      ),
      table: ({ children }) => (
        <div className="overflow-x-auto my-1.5">
          <table className="min-w-full border-collapse border border-tint-8 text-xs">
            {children}
          </table>
        </div>
      ),
      th: ({ children }) => (
        <th className="border border-tint-8 bg-tint-4 px-2 py-1 text-left font-medium text-fg-soft">
          {children}
        </th>
      ),
      td: ({ children }) => (
        <td className="border border-tint-8 px-2 py-1 text-fg-tertiary">{children}</td>
      ),
      hr: () => <hr className="my-2 border-tint-8" />,
    }),
    [onWikiLinkClick, inline, attachments, attachmentSrcs, onAttachmentClick]
  );

  if (inline) {
    return (
      <span className={`slag-markdown inline text-xs ${className}`}>
        <ReactMarkdown
          remarkPlugins={plugins}
          components={components}
          urlTransform={safeMarkdownUrl}
        >
          {transformed}
        </ReactMarkdown>
      </span>
    );
  }

  return (
    <div className={`slag-markdown text-xs text-fg-tertiary font-normal ${className}`}>
      <ReactMarkdown
        remarkPlugins={plugins}
        components={components}
        urlTransform={safeMarkdownUrl}
      >
        {transformed}
      </ReactMarkdown>
    </div>
  );
};
