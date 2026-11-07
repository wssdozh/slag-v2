import React from 'react';
import { ChevronRight, ArrowUpRight } from 'lucide-react';

/**
 * The one row/group language for every settings tab.
 *
 * Each tab used to hand-roll its own card: `bg-panel border rounded-xl p-3` in
 * one place, `p-3.5` in another, a checkbox here and a bare text button there.
 * The result read as several different screens stacked in one dialog. Everything
 * below is the single definition, so a tab composes rather than invents.
 *
 * Rules that hold across the whole surface:
 * - A group is one raised card on the panel background; rows inside it are
 *   separated by dividers, never by their own borders.
 * - An icon is a glyph, never a plate: no rounded background behind it.
 * - The right side carries a value in muted type, or a control, never both.
 * - Destructive rows are the only red thing in the panel.
 */

interface SettingsGroupProps {
  /** Small caps caption above the card. Omit for an uncaptioned group. */
  title?: React.ReactNode;
  /** Trailing text on the caption line, e.g. a scope or a reset action. */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const SettingsGroup: React.FC<SettingsGroupProps> = ({
  title,
  action,
  children,
  className = '',
}) => (
  <section className={`flex flex-col gap-1.5 ${className}`}>
    {(title || action) && (
      <div className="flex items-center justify-between gap-2 px-1">
        {title && (
          <span className="text-2xs font-medium uppercase tracking-wide text-fg-dim">
            {title}
          </span>
        )}
        {action}
      </div>
    )}
    <div className="rounded-xl bg-surface border border-white/[0.06] overflow-hidden">
      {children}
    </div>
  </section>
);

/** A divider between rows. Inset to the label column when the rows carry icons. */
export const SettingsDivider: React.FC<{ inset?: boolean }> = ({ inset = false }) => (
  <div className={`h-px bg-white/[0.06] ${inset ? 'ml-11' : ''}`} />
);

interface SettingsRowProps {
  /** A glyph, rendered bare. No background plate. */
  icon?: React.ReactNode;
  label: React.ReactNode;
  description?: React.ReactNode;
  /** Muted value on the right. Omit when `right` carries a control. */
  value?: React.ReactNode;
  /** A control (switch, segmented, button) on the right. */
  right?: React.ReactNode;
  /** Drill-down chevron. */
  chevron?: boolean;
  /** Opens elsewhere. */
  external?: boolean;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Renders below the row instead of beside the label. */
  children?: React.ReactNode;
  className?: string;
}

export const SettingsRow: React.FC<SettingsRowProps> = ({
  icon,
  label,
  description,
  value,
  right,
  chevron = false,
  external = false,
  onClick,
  danger = false,
  disabled = false,
  children,
  className = '',
}) => {
  const interactive = Boolean(onClick) && !disabled;
  const Element = interactive ? 'button' : 'div';

  return (
    <Element
      {...(interactive
        ? { type: 'button' as const, onClick, disabled, 'aria-disabled': disabled }
        : {})}
      className={`w-full flex items-start gap-3 px-3 py-2.5 sm:px-4 sm:py-3 text-left ${
        interactive ? 'cursor-pointer hover:bg-white/[0.03]' : ''
      } ${disabled ? 'opacity-40' : ''} ${className}`}
    >
      {icon && (
        <span
          className={`w-4 shrink-0 mt-0.5 flex items-center justify-center ${
            danger ? 'text-danger' : 'text-fg-muted'
          }`}
        >
          {icon}
        </span>
      )}
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className={`text-xs font-medium ${danger ? 'text-danger' : 'text-fg-primary'}`}>
          {label}
        </span>
        {description && (
          <span className="text-2xs leading-relaxed text-fg-muted">{description}</span>
        )}
      </span>
      {value !== undefined && (
        <span className="text-2xs text-fg-muted font-mono shrink-0 mt-0.5">{value}</span>
      )}
      {right && <span className="shrink-0 mt-0.5">{right}</span>}
      {chevron && <ChevronRight className="w-3.5 h-3.5 mt-0.5 shrink-0 text-fg-dim" />}
      {external && <ArrowUpRight className="w-3.5 h-3.5 mt-0.5 shrink-0 text-fg-dim" />}
      {children}
    </Element>
  );
};

interface SettingsSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
}

/**
 * A boolean. `Checkbox` is for picking things in a list; a setting is on or off,
 * and the reference language draws that as a track, not a tick.
 */
export const SettingsSwitch: React.FC<SettingsSwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  label,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative w-9 h-5 rounded-full shrink-0 cursor-pointer transition-colors ${
      checked ? 'bg-accent' : 'bg-white/[0.14]'
    } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
  >
    <span
      className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform"
      style={{ transform: checked ? 'translateX(16px)' : 'none' }}
    />
  </button>
);

interface SettingsSegmentedOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface SettingsSegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SettingsSegmentedOption<T>[];
}

/** The inline choice: one track, equal segments, the selected one raised. */
export function SettingsSegmented<T extends string>({
  value,
  onChange,
  options,
}: SettingsSegmentedProps<T>) {
  return (
    <div
      /* auto-fit rather than a fixed column count: four options stay four
         columns on a desktop and fold to two on a phone without the caller
         passing breakpoints, which is how every tab drifted apart. */
      className="grid gap-1 bg-canvas-subtle p-1 rounded-lg border border-white/[0.06]"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(76px, 1fr))' }}
    >
      {options.map(option => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={`py-1.5 px-2 rounded-md text-2xs font-medium whitespace-nowrap motion-surface ${
              selected
                ? 'bg-white/10 text-white border border-white/[0.08]'
                : 'text-fg-secondary hover:text-fg-primary border border-transparent'
            } ${option.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
