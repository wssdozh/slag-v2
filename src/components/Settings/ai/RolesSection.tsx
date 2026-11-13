// Who does what: answer, vision and speech, each picking one connection.
import React from 'react';
import type { AiRole, AiSettings } from '../../../types';
import { availableConnectionsFor } from '../../../lib/ai/connections/resolve';
import { isConnectionReady } from '../../../lib/ai/connections/settings';
import { SettingsDivider, SettingsGroup, SettingsSelect } from '../SettingsUI';

const ROLE_LABELS: Record<AiRole, string> = {
  chat: 'Ответы',
  vision: 'Картинки и OCR',
  stt: 'Расшифровка аудио',
};

const ROLE_ORDER: AiRole[] = ['chat', 'vision', 'stt'];

interface RolesSectionProps {
  settings: AiSettings;
  onChange: (role: AiRole, connectionId: string | null) => void;
}

export const RolesSection: React.FC<RolesSectionProps> = ({ settings, onChange }) => (
  <SettingsGroup title="Роли">
    {ROLE_ORDER.map((role, index) => {
      const options = [
        { value: 'off', label: 'Отключено' },
        ...availableConnectionsFor(settings, role).map((connection) => {
          const ready = isConnectionReady(connection);
          return {
            value: connection.id,
            label: ready ? connection.label : `${connection.label} · нет ключа`,
            disabled: !ready,
          };
        }),
      ];

      return (
        <React.Fragment key={role}>
          {index > 0 && <SettingsDivider />}
          <SettingsSelect
            label={ROLE_LABELS[role]}
            testId={`ai-role-${role}`}
            value={settings.roles[role] ?? 'off'}
            onChange={(value) => onChange(role, value === 'off' ? null : value)}
            options={options}
          />
        </React.Fragment>
      );
    })}
    <p className="px-3.5 pb-3 text-2xs leading-relaxed text-fg-muted">
      Роли живут независимо: дешёвая модель отвечает, мультимодальная смотрит картинки,
      whisper расшифровывает. Одно подключение может обслуживать несколько ролей.
    </p>
  </SettingsGroup>
);
