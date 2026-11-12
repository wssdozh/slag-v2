import { useCallback, useEffect, useState } from 'react';
import type { AppUiConfig, DeviceUiConfig } from '../../types';
import { ACCENT_COLORS, STORAGE_KEYS } from '../../config';
import { getFontFamilyConfig, getFontScaleMultiplier } from '../../config/typography';

const UI_CONFIG_KEY = STORAGE_KEYS.UI_CONFIG;

const DEFAULT_UI_CONFIG: AppUiConfig = {
  desktop: {
    fontScale: 'normal',
    density: 'normal',
    fontFamily: 'inter',
    accent: 'blue',
  },
  mobile: {
    fontScale: 'normal',
    density: 'spacious',
    fontFamily: 'inter',
    accent: 'blue',
  },
};

/**
 * How the app looks: density, font, accent.
 *
 * One reason to change — appearance. The presets land in localStorage and then on the
 * document root as CSS variables, which is why the theme lives in one place instead of
 * per component.
 *
 * Panel widths used to live here as well, with a "reset sizes" button in settings. Nothing
 * ever read those values — dockview owns panel geometry and the splitter does the dragging —
 * so the state, the button and its two storage keys are gone rather than half-wired.
 */
export function useAppearance(isMobile: boolean) {
  const [uiConfig, setUiConfig] = useState<AppUiConfig>(() => {
    try {
      const saved = localStorage.getItem(UI_CONFIG_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          desktop: { ...DEFAULT_UI_CONFIG.desktop, ...parsed.desktop },
          mobile: { ...DEFAULT_UI_CONFIG.mobile, ...parsed.mobile },
        };
      }
      return DEFAULT_UI_CONFIG;
    } catch {
      return DEFAULT_UI_CONFIG;
    }
  });

  const updateUiConfig = useCallback((device: 'desktop' | 'mobile', updates: Partial<DeviceUiConfig>) => {
    setUiConfig(prev => {
      const next: AppUiConfig = {
        ...prev,
        [device]: {
          ...prev[device],
          ...updates,
        },
      };
      try {
        localStorage.setItem(UI_CONFIG_KEY, JSON.stringify(next));
      } catch {
        // Ignore
      }
      return next;
    });
  }, []);

  // Dynamically apply density, font and accent CSS properties to document root
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const currentDevice = isMobile ? 'mobile' : 'desktop';
    const cfg = uiConfig[currentDevice];

    document.documentElement.dataset.density = cfg.density;

    const scaleNum = getFontScaleMultiplier(cfg.fontScale);
    document.documentElement.style.setProperty('--slag-font-scale', String(scaleNum));

    const fontCfg = getFontFamilyConfig(cfg.fontFamily);
    document.documentElement.style.setProperty('--slag-font-sans', fontCfg.cssSans);
    document.documentElement.style.setProperty('--slag-font-mono', fontCfg.cssMono);

    // One hex repaints the whole accent family: theme.css derives strong/subtle/media from it.
    const accent = ACCENT_COLORS[cfg.accent] ?? ACCENT_COLORS.blue;
    document.documentElement.style.setProperty('--color-accent', accent.hex);
  }, [isMobile, uiConfig]);

  return {
    uiConfig,
    updateUiConfig,
  };
}
