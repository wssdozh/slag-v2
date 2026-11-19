// Settings' shared building blocks: group cards, rows, dividers, switches, selects.
import React from 'react';
import { Icon } from '../UI/icons/Icon';
import { Select, type SelectOption } from '../UI/Select';
import { NumberInput } from '../UI/NumberInput';

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
 * - Icons identify navigation or homogeneous entity lists, not parameters or
 *   commands. Keep one label edge per group; never add icon plates.
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
          <span className="text-2xs font-mono uppercase tracking-wider text-fg-muted">
            {title}
          </span>
        )}
        {action}
      </div>
    )}
    <div className="rounded-2xl bg-surface/80 border border-tint-6 overflow-hidden">
      {children}
    </div>
  </section>
);

/** A divider between rows. Inset to the label column when the rows carry icons. */
export const SettingsDivider: React.FC<{ inset?: boolean }> = ({ inset = false }) => (
  <div className={`h-px bg-border-subtle ${inset ? 'ml-12' : ''}`} />
);

interface SettingsRowProps {
  /** A glyph, rendered bare. No background plate. */
  icon?: React.ReactNode;
  /** An avatar or cover that takes the icon slot and keeps its own size. */
  leading?: React.ReactNode;
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
  className?: string;
  testId?: string;
}

export const SettingsRow: React.FC<SettingsRowProps> = ({
  icon,
  leading,
  label,
  description,
  value,
  right,
  chevron = false,
  external = false,
  onClick,
  danger = false,
  disabled = false,
  className = '',
  testId,
}) => {
  const interactive = Boolean(onClick);
  const Element = interactive ? 'button' : 'div';

  return (
    <Element
      data-testid={testId}
      {...(interactive
        ? { type: 'button' as const, onClick, disabled, 'aria-disabled': disabled }
        : {})}
      className={`w-full flex items-center gap-3 p-3.5 text-left ${
        interactive ? 'cursor-pointer transition-colors hover:bg-surface-hover active:bg-tint-10 active:duration-0' : ''
      } ${disabled ? 'opacity-40' : ''} ${className}`}
    >
      {leading ? (
        <span className="shrink-0">{leading}</span>
      ) : (
        icon && (
          <span
            className={`w-5 h-5 shrink-0 flex items-center justify-center ${
              danger ? 'text-danger' : 'text-fg-secondary'
            }`}
          >
            {icon}
          </span>
        )
      )}
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className={`text-sm font-medium ${danger ? 'text-danger' : 'text-fg-soft'}`}>
          {label}
        </span>
        {description && (
          <span className="text-xs leading-relaxed text-fg-muted break-words">{description}</span>
        )}
      </span>
      {value !== undefined && (
        <span className="max-w-[50%] min-w-0 text-right text-xs text-fg-muted break-words">{value}</span>
      )}
      {right && <span className="shrink-0">{right}</span>}
      {chevron && <Icon name="nav.next" size="md" tone="dim" className="shrink-0" />}
      {external && <Icon name="nav.open" size="md" tone="dim" className="shrink-0" />}
    </Element>
  );
};

interface SettingsSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  testId?: string;
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
  testId,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    data-testid={testId}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative w-9 h-5 rounded-full shrink-0 cursor-pointer transition-colors ${
      checked ? 'bg-accent' : 'bg-switch-off'
    } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
  >
    <span
      className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-fg-primary shadow-sm transition-transform"
      style={{ transform: checked ? 'translateX(16px)' : 'none' }}
    />
  </button>
);

interface SettingsSelectProps {
  label: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Only for a caveat the label cannot carry. Prefer no description. */
  description?: React.ReactNode;
  disabled?: boolean;
  testId?: string;
}

/**
 * A choice reads as `label [value ⌄]` on one line, never as a stack of options
 * under the label. The whole point of the row is that the eye scans the left
 * column for a name and the right column for its current value.
 */
export const SettingsSelect: React.FC<SettingsSelectProps> = ({
  label,
  value,
  onChange,
  options,
  description,
  disabled = false,
  testId,
}) => (
  <SettingsRow
    label={label}
    description={description}
    disabled={disabled}
    right={
      <span data-testid={testId}>
        <Select
          variant="ghost"
          size="sm"
          value={value}
          onChange={onChange}
          options={options}
          disabled={disabled}
          aria-label={typeof label === 'string' ? label : undefined}
        />
      </span>
    }
  />
);

interface SettingsNumberProps {
  label: React.ReactNode;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  description?: React.ReactNode;
  disabled?: boolean;
}

/** A number is a value, not a form field: it lives in the right column. */
export const SettingsNumber: React.FC<SettingsNumberProps> = ({
  label,
  value,
  onChange,
  min,
  max,
  description,
  disabled = false,
}) => (
  <SettingsRow
    label={label}
    description={description}
    disabled={disabled}
    right={
      <span className="w-28">
        <NumberInput
          value={value}
          onChange={onChange}
          min={min}
          max={max}
          disabled={disabled}
          aria-label={typeof label === 'string' ? label : undefined}
        />
      </span>
    }
  />
);

interface SettingsInputProps {
  label: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  description?: React.ReactNode;
  mono?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
}

/** Free text, right-aligned in the value column, so rows stay one list. */
export const SettingsInput: React.FC<SettingsInputProps> = ({
  label,
  value,
  onChange,
  placeholder,
  description,
  mono = false,
  disabled = false,
  'aria-label': ariaLabel,
}) => (
  <SettingsRow
    label={label}
    description={description}
    disabled={disabled}
    right={
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
        disabled={disabled}
        spellCheck={false}
        autoComplete="off"
        className={`w-40 bg-transparent text-right text-2xs text-fg-secondary placeholder:text-fg-dim outline-none truncate ${
          mono ? 'font-mono' : ''
        }`}
      />
    }
  />
);
