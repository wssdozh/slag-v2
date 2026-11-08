import { useCallback, useEffect, useRef } from 'react';

export interface AppLayer {
  isOpen: boolean;
  close: () => void;
  /** How many history entries this layer owns. Defaults to 1. */
  depth?: number;
}

/**
 * LIFO dismiss stack shared by Escape, Android back, browser back and mouse back.
 * Keeps window.history in sync with the number of open layers on mobile.
 */
export function useLayerStack(layers: AppLayer[], isMobile: boolean) {
  const layersRef = useRef(layers);
  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  const historyDepthRef = useRef(0);
  const isProgrammaticNavRef = useRef(false);

  const totalLayerDepth = layers.reduce(
    (sum, layer) => sum + (layer.isOpen ? (layer.depth ?? 1) : 0),
    0
  );

  const dismissTopLayer = useCallback((): boolean => {
    const top = layersRef.current.find(layer => layer.isOpen);
    if (!top) return false;
    top.close();
    return true;
  }, []);

  // Initialize base history state on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.history.replaceState({ slagRoot: true, depth: 0 }, '');
    } catch {
      // Ignore
    }
  }, []);

  // Sync totalLayerDepth with window.history (mobile Android back gesture only)
  useEffect(() => {
    if (typeof window === 'undefined' || !isMobile) return;

    const targetDepth = totalLayerDepth;
    const currentHistDepth = historyDepthRef.current;

    if (targetDepth > currentHistDepth) {
      const diff = targetDepth - currentHistDepth;
      for (let i = 0; i < diff; i++) {
        try {
          window.history.pushState({ slagLayer: true, depth: currentHistDepth + i + 1 }, '');
        } catch {
          // Ignore
        }
      }
      historyDepthRef.current = targetDepth;
    } else if (targetDepth < currentHistDepth) {
      const diff = currentHistDepth - targetDepth;
      historyDepthRef.current = targetDepth;
      isProgrammaticNavRef.current = true;
      try {
        window.history.go(-diff);
      } catch {
        // Ignore
      }
      const timer = setTimeout(() => {
        isProgrammaticNavRef.current = false;
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [totalLayerDepth, isMobile]);

  // Handle hardware back / browser back / swipe gestures via popstate
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = () => {
      if (isProgrammaticNavRef.current) {
        isProgrammaticNavRef.current = false;
        return;
      }

      if (historyDepthRef.current > 0) {
        historyDepthRef.current -= 1;
      }
      dismissTopLayer();
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [dismissTopLayer]);

  // Handle Mouse Back button (Mouse button 4 / Back / e.button === 3)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleMouseBack = (e: MouseEvent) => {
      if (e.button === 3) {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'mouseup') {
          dismissTopLayer();
        }
      }
    };

    window.addEventListener('mouseup', handleMouseBack, true);
    window.addEventListener('auxclick', handleMouseBack, true);
    return () => {
      window.removeEventListener('mouseup', handleMouseBack, true);
      window.removeEventListener('auxclick', handleMouseBack, true);
    };
  }, [dismissTopLayer]);

  return { dismissTopLayer, totalLayerDepth };
}
