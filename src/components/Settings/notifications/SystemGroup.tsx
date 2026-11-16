// системные уведомления устройства: одна кнопка проверки.
import React from 'react';
import { SettingsGroup, SettingsRow } from '../SettingsUI';

interface SystemGroupProps {
  onTest: () => void;
}

export const SystemGroup: React.FC<SystemGroupProps> = ({ onTest }) => (
  <SettingsGroup title="На этом устройстве">
    <SettingsRow
      label="Проверка"
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
