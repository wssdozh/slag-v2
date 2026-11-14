// системные уведомления устройства: что это и кнопка проверки.
import React from 'react';
import { SettingsDivider, SettingsGroup, SettingsRow } from '../SettingsUI';

interface SystemGroupProps {
  onTest: () => void;
}

export const SystemGroup: React.FC<SystemGroupProps> = ({ onTest }) => (
  <SettingsGroup title="На этом устройстве">
    <SettingsRow
      label="Системные напоминания"
      description="всплывают, только пока канал доставки не подключён: иначе он уже прислал"
    />
    <SettingsDivider />
    <SettingsRow
      label="Проверка"
      description="покажем тестовое уведомление"
      right={
        <button
          type="button"
          data-testid="system-notify-test"
          onClick={onTest}
          className="px-2 py-1.5 text-2xs text-fg-secondary rounded-md hover:bg-surface-hover hover:text-fg-primary cursor-pointer"
        >
          показать
        </button>
      }
    />
  </SettingsGroup>
);
