import { useLayoutEffect, useState } from 'react';

export interface EditorPaneRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The dockview pane the note was opened from, as a viewport rect.
 *
 * The editor is a fixed overlay, so a docked editor cannot be anchored in CSS: a sash drag
 * moves the pane without touching the note, and the surface would stay behind. Measured
 * before paint so the editor never flashes full-window first, then followed on resize.
 */
export function useEditorPaneRect(itemId: string, enabled: boolean): EditorPaneRect | null {
  const [rect, setRect] = useState<EditorPaneRect | null>(null);

  useLayoutEffect(() => {
    if (!enabled) return;

    // Opened from a card: dock into the pane that card lives in. Opened from search or the
    // composer there is no card, and the focused pane is the only truthful answer.
    const group =
      document
        .querySelector<HTMLElement>(`[data-flip-id="${CSS.escape(itemId)}"]`)
        ?.closest<HTMLElement>('.dv-groupview') ??
      document.querySelector<HTMLElement>('.dv-groupview.dv-active-group') ??
      document.querySelector<HTMLElement>('.dv-groupview');

    // The tab strip stays visible: the editor fills the pane's content, so tabs remain usable.
    const pane = group?.querySelector<HTMLElement>('.dv-content-container') ?? group;
    if (!pane) return;

    const measure = () => {
      const box = pane.getBoundingClientRect();
      setRect((prev) =>
        prev && prev.left === box.left && prev.top === box.top && prev.width === box.width && prev.height === box.height
          ? prev
          : { left: box.left, top: box.top, width: box.width, height: box.height },
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    window.addEventListener('resize', measure);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [enabled, itemId]);

  return enabled ? rect : null;
}
