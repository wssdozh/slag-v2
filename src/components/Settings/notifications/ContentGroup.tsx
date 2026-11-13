// «Что приходит»: which reminders the channel carries, and how much of a note they show.
import React from 'react';
import { SettingsDivider, SettingsGroup, SettingsRow, SettingsSwitch } from '../SettingsUI';

interface ContentGroupProps {
  tasks: boolean;
  overdue: boolean;
  spoiler: boolean;
  onTasksChange: (value: boolean) => void;
  onOverdueChange: (value: boolean) => void;
  onSpoilerChange: (value: boolean) => void;
}

export const ContentGroup: React.FC<ContentGroupProps> = ({
  tasks,
  overdue,
  spoiler,
  onTasksChange,
  onOverdueChange,
  onSpoilerChange,
}) => (
  <SettingsGroup title="Что приходит">
    <SettingsRow
      label="Напоминания задач"
      right={<SettingsSwitch label="Напоминания задач" checked={tasks} onChange={onTasksChange} />}
    />
    <SettingsDivider />
    <SettingsRow
      label="Просроченные задачи"
      description="Раз в день в 10:00, пока не закрыта"
      right={<SettingsSwitch label="Просроченные задачи" checked={overdue} onChange={onOverdueChange} />}
    />
    <SettingsDivider />
    <SettingsRow
      label="Скрывать текст под спойлером"
      description="Видно после нажатия"
      right={<SettingsSwitch label="Скрывать текст под спойлером" checked={spoiler} onChange={onSpoilerChange} />}
    />
    <SettingsDivider />
    <SettingsRow
      label="В сообщении"
      description="Заголовок и первые ~200 символов: релей видит их при отправке"
    />
  </SettingsGroup>
);
