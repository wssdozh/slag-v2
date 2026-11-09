import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Height of the dock the composer sits in.
 *
 * The feed scrolls under that dock, so the list needs its real height: the composer grows with
 * attachments and task controls, and a constant leaves the last note either hidden underneath or
 * a gap short of it. The value is published as the `--composer-inset` custom property by whoever
 * owns both the list and the dock, so the list never measures the DOM itself.
 *
 * Returns an attach callback, not a ref object: the dock is not mounted on every screen (the
 * phone shows the folder list before any composer exists), and an effect keyed on a ref object
 * would never see it appear.
 */
export function useComposerInset(): readonly [(element: HTMLElement | null) => void, number] {
  const [inset, setInset] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);

  const attach = useCallback((element: HTMLElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!element) {
      setInset(0);
      return;
    }

    const measure = () => setInset(Math.round(element.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observerRef.current = observer;
  }, []);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return [attach, inset] as const;
}
