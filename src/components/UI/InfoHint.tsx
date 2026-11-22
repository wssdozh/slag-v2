// One question mark for every explanation in the app.
//
// The short answer is a bubble on hover; the long one is a dialog on click. A settings row that
// has to explain itself in five lines under the label is a row that will be rewritten by the next
// person to touch it — this keeps the row a row and the story one click away.
import React, { useEffect, useId, useState } from 'react';
import { BaseModal } from '../Modals/BaseModal';
import { Icon } from './icons/Icon';

export function HintBubble({ className = '', ...props }: React.ComponentPropsWithoutRef<'span'>) {
  return <span role="tooltip" {...props}
    className={`block rounded-lg border border-border-subtle bg-surface-elevated px-2.5 py-2 text-[11px] leading-snug text-fg-secondary shadow-xl backdrop-blur-xl ${className}`} />;
}

export interface InfoHintProps {
  /** The one sentence on hover. Keep it a sentence, not a paragraph. */
  hint: string;
  /** Dialog heading: what is being explained. */
  title: string;
  /** The longer version: when it runs, what it does, what it costs. */
  children: React.ReactNode;
  testId?: string;
}

/**
 * The trigger is a plain icon button, not a link: it opens nothing on its own, and a person who
 * never presses it loses nothing but the detail.
 */
export const InfoHint: React.FC<InfoHintProps> = ({ hint, title, children, testId }) => {
  const [open, setOpen] = useState(false);
  // Unique per instance: two hints on one screen must not share a described-by target.
  const hintId = useId();

  /**
   * Escape closes this dialog and nothing else.
   *
   * The app keeps one stack of layers (`useLayerStack`) and this dialog is not on it: it lives
   * inside the settings modal, which the stack does know. Without a capture-phase listener here,
   * Escape would close the settings behind the explanation a person was reading.
   */
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open]);

  return (
    <>
      <span className="relative inline-flex shrink-0" aria-describedby={hintId}>
        <button
          type="button"
          data-testid={testId}
          aria-label={`Подробнее: ${title}`}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
          className="peer inline-flex items-center justify-center rounded-md p-0.5 text-fg-dim hover:text-fg-secondary transition-colors cursor-pointer outline-none focus-visible:text-fg-secondary"
        >
          <Icon name="action.help" size="xs" tone="inherit" />
        </button>

        {/* Hover and keyboard focus, both. No listeners: a CSS-only bubble cannot leak one. */}
        <HintBubble
          id={hintId}
          data-testid={testId ? `${testId}-hint` : undefined}
          className="pointer-events-none absolute right-0 top-full z-20 mt-1.5 w-60 opacity-0 transition-opacity duration-100 peer-hover:opacity-100 peer-focus-visible:opacity-100"
        >
          {hint}
        </HintBubble>
      </span>

      <BaseModal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={title}
        maxWidth="max-w-md"
        portal
      >
        <div className="flex flex-col gap-2.5 px-4 md:px-5 py-4 text-xs leading-relaxed text-fg-secondary">
          {children}
        </div>
      </BaseModal>
    </>
  );
};
