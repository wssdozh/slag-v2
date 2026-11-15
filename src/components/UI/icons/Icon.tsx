// One icon element for the whole app: the glyph comes from the config, the size and
// the tone come from here, so call sites stop inventing `w-3.5 h-3.5 text-fg-secondary`.
import React from 'react';
import type { SVGProps } from 'react';
import { ICONS, ICON_TONE_CLASS, type GlyphComponent, type IconEntry, type IconName } from './icons';

/** 12 / 14 / 16 / 20 — the four sizes the interface actually uses. */
export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'none';

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

const SIZE_CLASS: Record<IconSize, string> = {
  xs: 'w-3 h-3',
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
  none: '',
};

/**
 * Iconoir is drawn on a 24px grid at 1.5. At our 12–20px sizes that reads a touch thin;
 * 2 is Lucide's weight. One number, the whole app follows. Call sites may still override.
 */
const STROKE_WIDTH = 2;

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  name: IconName;
  size?: IconSize;
  tone?: IconTone;
  className?: string;
}

/** An entry carrying its own classes (a spinner) versus a bare glyph. */
function isWrappedEntry(entry: IconEntry): entry is { icon: GlyphComponent; className: string } {
  return typeof entry === 'object' && entry !== null && 'icon' in entry;
}

export const Icon: React.FC<IconProps> = ({
  name,
  size = 'sm',
  tone = 'secondary',
  className = '',
  ...rest
}) => {
  const entry = ICONS[name];
  const wrapped = isWrappedEntry(entry) ? entry : null;
  const Glyph: GlyphComponent = wrapped ? wrapped.icon : (entry as GlyphComponent);
  const ownClass = wrapped ? wrapped.className : '';
  const classes = [SIZE_CLASS[size], ICON_TONE_CLASS[tone], ownClass, className]
    .filter(Boolean)
    .join(' ');

  // A glyph that carries its own label is content; a bare one is decoration.
  const decorative = rest['aria-label'] === undefined && rest['aria-labelledby'] === undefined;

  return <Glyph className={classes} strokeWidth={STROKE_WIDTH} aria-hidden={decorative || undefined} {...rest} />;
};
