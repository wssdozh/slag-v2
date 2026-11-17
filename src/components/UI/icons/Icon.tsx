// One icon element for the whole app: the glyph comes from the config, the size and
// the tone come from here, so call sites stop inventing `w-3.5 h-3.5 text-fg-secondary`.
//
// Tabler draws on a 24px grid at stroke 2, and the stroke scales with the size, so the
// scale below is the whole weight policy: 12 is legal only for a filled marker or a dot,
// everything that has to be recognised starts at 14.
import React from 'react';
import type { SVGProps } from 'react';
import { ICONS, ICON_TONE_CLASS, type GlyphComponent, type IconEntry, type IconName } from './icons';

/** 12 / 14 / 16 / 20 / 24 — the five sizes the interface uses. `none` is legacy. */
export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'none';

/**
 * `outline` is a noun (what a thing is), `filled` is a state (this one is on right now).
 * Filled survives only where the registry declares a filled twin for the key.
 */
export type IconVariant = 'outline' | 'filled';

/**
 * `inherit` paints nothing and lets the parent's colour through; every other tone is
 * one token from `theme.css`. Default is `secondary` — the muted grey most glyphs wear.
 */
export type IconTone =
  | 'inherit'
  | 'primary'
  | 'soft'
  | 'tertiary'
  | 'secondary'
  | 'muted'
  | 'dim'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

const SIZE_PX: Record<IconSize, number> = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
  none: 0,
};

/**
 * Tabler's own weight is 2 on a 24 grid. At 24px that reads heavier than at 16px, so the
 * big glyphs an empty state uses drop to 1.5 and keep the same optical density.
 */
const STROKE = 2;
const STROKE_XL = 1.5;

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'strokeWidth'> {
  name: IconName;
  size?: IconSize;
  tone?: IconTone;
  variant?: IconVariant;
  className?: string;
}

/** What a registry entry resolves to, whichever shape it was written in. */
interface ResolvedEntry {
  icon: GlyphComponent;
  filled?: GlyphComponent;
  className?: string;
}

/**
 * An entry carrying its own classes (a spinner) or a filled twin versus a bare glyph.
 * Tabler hands out `forwardRef` objects, not functions, so the test is the `icon` key:
 * `typeof entry === 'function'` would route every bare glyph into the wrong branch.
 */
function resolveEntry(entry: IconEntry): ResolvedEntry {
  return 'icon' in entry ? entry : { icon: entry };
}

export const Icon: React.FC<IconProps> = ({
  name,
  size = 'sm',
  tone = 'secondary',
  variant = 'outline',
  className = '',
  ...rest
}) => {
  const entry = resolveEntry(ICONS[name]);
  const Glyph = variant === 'filled' && entry.filled ? entry.filled : entry.icon;
  const px = SIZE_PX[size];
  // Lucide has no filled twins: a filled glyph is the same outline with its path painted,
  // which is how an active tab or a pinned note reads solid without a second file.
  const solidFill = variant === 'filled' && !entry.filled ? 'fill-current' : '';
  const classes = [ICON_TONE_CLASS[tone], entry.className, solidFill, className].filter(Boolean).join(' ');

  // A glyph that carries its own label is content; a bare one is decoration.
  const decorative = rest['aria-label'] === undefined && rest['aria-labelledby'] === undefined;

  return (
    <Glyph
      className={classes}
      data-icon={name}
      width={px || undefined}
      height={px || undefined}
      strokeWidth={px === 24 ? STROKE_XL : STROKE}
      aria-hidden={decorative || undefined}
      {...rest}
    />
  );
};
