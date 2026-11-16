// «Тихие часы»: a mode that holds reminders back, and the window it holds them in.
import React, { useState } from 'react';
import { SettingsDivider, SettingsGroup, SettingsRow, SettingsSwitch } from '../SettingsUI';
import { TimePicker } from '../../UI/TimePicker';

interface QuietHoursGroupProps {
  /** The "не беспокоить" mode itself. The window below stays stored while it is off. */
  enabled: boolean;
  quietFrom: string;
  quietTo: string;
  onEnabledChange: (value: boolean) => void;
  onQuietFromChange: (value: string) => void;
  onQuietToChange: (value: string) => void;
}

type QuietEdge = 'from' | 'to';

export const QuietHoursGroup: React.FC<QuietHoursGroupProps> = ({
  enabled,
  quietFrom,
  quietTo,
  onEnabledChange,
  onQuietFromChange,
  onQuietToChange,
}) => {
  const [openEdge, setOpenEdge] = useState<QuietEdge | null>(null);

  /** A time is a value, not a form field: the row shows it and the dialog edits it. */
  const timeButton = (value: string, edge: QuietEdge) => (
    <button
      type="button"
      data-testid={`quiet-hours-${edge}`}
      aria-label={edge === 'from' ? 'начало тихих часов' : 'конец тихих часов'}
      onClick={() => setOpenEdge(edge)}
      className="px-2.5 py-1.5 rounded-md font-mono text-xs text-fg-secondary hover:bg-surface-hover hover:text-fg-primary cursor-pointer"
    >
      {value}
    </button>
  );

  return (
    <>
      <SettingsGroup title="Тихие часы">
        <SettingsRow
          label="Не беспокоить"
          testId="quiet-hours-toggle"
          right={
            <SettingsSwitch
              label="Не беспокоить"
              checked={enabled}
              onChange={onEnabledChange}
            />
          }
        />
        {enabled && (
          <>
            <SettingsDivider />
            <SettingsRow label="Начало" right={timeButton(quietFrom, 'from')} />
            <SettingsDivider />
            <SettingsRow label="Конец" right={timeButton(quietTo, 'to')} />
          </>
        )}
      </SettingsGroup>

      <TimePicker
        isOpen={openEdge === 'from'}
        title="начало тихих часов"
        value={quietFrom}
        onApply={(value) => {
          onQuietFromChange(value);
          setOpenEdge(null);
        }}
        onClose={() => setOpenEdge(null)}
      />
      <TimePicker
        isOpen={openEdge === 'to'}
        title="конец тихих часов"
        value={quietTo}
        onApply={(value) => {
          onQuietToChange(value);
          setOpenEdge(null);
        }}
        onClose={() => setOpenEdge(null)}
      />
    </>
  );
};
