// «Тихие часы»: the window where a reminder waits instead of pinging.
import React from 'react';
import { SettingsDivider, SettingsGroup, SettingsInput } from '../SettingsUI';

interface QuietHoursGroupProps {
  quietFrom: string;
  quietTo: string;
  onQuietFromChange: (value: string) => void;
  onQuietToChange: (value: string) => void;
}

export const QuietHoursGroup: React.FC<QuietHoursGroupProps> = ({
  quietFrom,
  quietTo,
  onQuietFromChange,
  onQuietToChange,
}) => (
  <SettingsGroup title="Тихие часы">
    <SettingsInput
      label="Не беспокоить с"
      value={quietFrom}
      onChange={onQuietFromChange}
      placeholder="23:00"
      mono
    />
    <SettingsDivider />
    <SettingsInput
      label="Не беспокоить до"
      value={quietTo}
      onChange={onQuietToChange}
      placeholder="08:00"
      description="Если попадёт в окно — уедет на его конец"
      mono
    />
  </SettingsGroup>
);
