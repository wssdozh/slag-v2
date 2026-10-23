import { useState, useEffect } from 'react';

/**
 * Hook to reactively track visual viewport height and virtual keyboard insets.
 * Updates CSS variable `--keyboard-inset-bottom` for seamless fluid positioning.
 */
export function useVisualViewport() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const vv = window.visualViewport;

    const handleViewportChange = () => {
      // Calculate how much the visual viewport is offset or shrunk by virtual keyboard
      const currentHeight = vv.height;
      const windowHeight = window.innerHeight;
      const offsetTop = vv.offsetTop;

      // Virtual keyboard height in pixels
      const insetBottom = Math.max(0, windowHeight - (currentHeight + offsetTop));
      setKeyboardHeight(insetBottom);

      document.documentElement.style.setProperty(
        '--keyboard-inset-bottom',
        `${Math.round(insetBottom)}px`
      );
    };

    vv.addEventListener('resize', handleViewportChange);
    vv.addEventListener('scroll', handleViewportChange);
    handleViewportChange();

    return () => {
      vv.removeEventListener('resize', handleViewportChange);
      vv.removeEventListener('scroll', handleViewportChange);
      document.documentElement.style.setProperty('--keyboard-inset-bottom', '0px');
    };
  }, []);

  return { keyboardHeight };
}
