// «Что приходит»: which reminders reach this device.
import React from 'react';
import { SettingsDivider, SettingsGroup, SettingsRow, SettingsSwitch } from '../SettingsUI';

interface ContentGroupProps {
  tasks: boolean;
  overdue: boolean;
  onTasksChange: (value: boolean) => void;
  onOverdueChange: (value: boolean) => void;
}

export const ContentGroup: React.FC<ContentGroupProps> = ({
  tasks,
  overdue,
  onTasksChange,
  onOverdueChange,
}) => (
  <SettingsGroup title="Что приходит">
    <SettingsRow
      label="Напоминания задач"
      right={<SettingsSwitch label="Напоминания задач" checked={tasks} onChange={onTasksChange} />}
    />
    <SettingsDivider />
    <SettingsRow
      label="Просроченные задачи"
      right={<SettingsSwitch label="Просроченные задачи" checked={overdue} onChange={onOverdueChange} />}
    />
  </SettingsGroup>
);
