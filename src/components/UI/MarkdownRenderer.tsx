// Renders markdown with GFM and turns Obsidian [[wiki links]] into in-app jumps.
import React, { useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CheckCircle2, Circle } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  onWikiLinkClick?: (target: string) => void;
  className?: string;
  inline?: boolean;
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
    return /^(?:https?:|mailto:|wiki:)/i.test(probe) ? value : '';
  }
  return value;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  onWikiLinkClick,
  className = '',
  inline = false,
}) => {
  const transformed = useMemo(() => transformWikiLinks(content), [content]);

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
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-blue-400 hover:text-blue-300 hover:underline break-all"
            {...props}
          >
            {children}
          </a>
        );
      },
      h1: ({ children }) => (
        <h1 className="text-sm font-bold text-zinc-100 my-1 first:mt-0 tracking-tight">{children}</h1>
      ),
      h2: ({ children }) => (
        <h2 className="text-xs font-bold text-zinc-100 my-1 first:mt-0 tracking-tight">{children}</h2>
      ),
      h3: ({ children }) => (
        <h3 className="text-xs font-semibold text-zinc-200 my-0.5 first:mt-0">{children}</h3>
      ),
      h4: ({ children }) => (
        <h4 className="text-xs font-medium text-zinc-300 my-0.5 first:mt-0">{children}</h4>
      ),
      p: ({ children }) =>
        inline ? (
          <span className="inline leading-normal whitespace-pre-line">{children}</span>
        ) : (
          <p className="mb-1.5 last:mb-0 leading-relaxed whitespace-pre-line">{children}</p>
        ),
      strong: ({ children }) => <strong className="font-semibold text-zinc-100">{children}</strong>,
      em: ({ children }) => <em className="italic text-zinc-300">{children}</em>,
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
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5 inline-block" />
          ) : (
            <Circle className="w-3.5 h-3.5 text-zinc-600 shrink-0 mt-0.5 inline-block" />
          );
        }
        return null;
      },
      code: ({ children, className, ...props }) => {
        const isInline = !className?.includes('language-');
        if (isInline) {
          return (
            <code
              className="px-1 py-0.5 rounded bg-white/[0.06] text-zinc-300 font-mono text-[11px]"
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
        <pre className="p-2 my-1.5 rounded bg-black/40 border border-white/[0.06] font-mono text-[11px] text-zinc-300 overflow-x-auto leading-normal">
          {children}
        </pre>
      ),
      blockquote: ({ children }) => (
        <blockquote className="border-l-2 border-zinc-700 pl-2.5 my-1.5 text-zinc-400 italic">
          {children}
        </blockquote>
      ),
      table: ({ children }) => (
        <div className="overflow-x-auto my-1.5">
          <table className="min-w-full border-collapse border border-white/[0.08] text-xs">
            {children}
          </table>
        </div>
      ),
      th: ({ children }) => (
        <th className="border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-left font-medium text-zinc-200">
          {children}
        </th>
      ),
      td: ({ children }) => (
        <td className="border border-white/[0.08] px-2 py-1 text-zinc-300">{children}</td>
      ),
      hr: () => <hr className="my-2 border-white/[0.08]" />,
    }),
    [onWikiLinkClick, inline]
  );

  if (inline) {
    return (
      <span className={`slag-markdown inline text-xs ${className}`}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={components}
          urlTransform={safeMarkdownUrl}
        >
          {transformed}
        </ReactMarkdown>
      </span>
    );
  }

  return (
    <div className={`slag-markdown text-xs text-zinc-300 font-normal ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
        urlTransform={safeMarkdownUrl}
      >
        {transformed}
      </ReactMarkdown>
    </div>
  );
};
