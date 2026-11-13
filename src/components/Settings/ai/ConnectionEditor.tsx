// One connection's fields: label, endpoint, key, protocol and the per-role models.
import React from 'react';
import type { AiConnection, AiRole, AiWireProtocol } from '../../../types';
import { connectionCapabilities, presetFor } from '../../../lib/ai/connections/presets';
import { SettingsDivider, SettingsInput, SettingsSelect } from '../SettingsUI';
import { SecretKeyField } from '../SecretKeyField';

const ROLE_MODEL_LABELS: Record<AiRole, string> = {
  chat: 'Модель · ответы',
  vision: 'Модель · картинки',
  stt: 'Модель · аудио',
};

const PROTOCOL_OPTIONS: Array<{ value: AiWireProtocol; label: string }> = [
  { value: 'chat', label: 'OpenAI Chat' },
  { value: 'responses', label: 'OpenAI Responses' },
  { value: 'anthropic', label: 'Anthropic' },
];

interface ConnectionEditorProps {
  connection: AiConnection;
  onChange: (changes: Partial<AiConnection>) => void;
  onModelChange: (role: AiRole, model: string) => void;
  onRemove: () => void;
}

export const ConnectionEditor: React.FC<ConnectionEditorProps> = ({
  connection,
  onChange,
  onModelChange,
  onRemove,
}) => {
  const preset = presetFor(connection);
  const capabilities = connectionCapabilities(connection);

  return (
    <>
      <SettingsInput
        label="Название"
        value={connection.label}
        onChange={(label) => onChange({ label })}
      />
      {preset.editableBaseUrl && (
        <>
          <SettingsDivider />
          <SettingsInput
            label="Base URL"
            value={connection.baseUrl}
            onChange={(baseUrl) => onChange({ baseUrl })}
            placeholder={preset.kind === 'custom' ? 'https://host/v1' : preset.defaultBaseUrl}
            mono
          />
        </>
      )}
      <SettingsDivider />
      <SecretKeyField
        value={connection.apiKey}
        onChange={(apiKey) => onChange({ apiKey })}
        placeholder={preset.keyHint}
      />
      {preset.protocols.length > 1 && (
        <>
          <SettingsDivider />
          <SettingsSelect
            label="Протокол"
            value={connection.protocol}
            onChange={(protocol) => onChange({ protocol: protocol as AiWireProtocol })}
            options={PROTOCOL_OPTIONS.filter((option) => preset.protocols.includes(option.value))}
          />
        </>
      )}
      {capabilities.map((role) => (
        <React.Fragment key={role}>
          <SettingsDivider />
          <SettingsInput
            label={ROLE_MODEL_LABELS[role]}
            value={connection.models[role] || ''}
            onChange={(model) => onModelChange(role, model)}
            placeholder={preset.defaultModels[role] || 'например, gpt-4o-mini'}
            mono
          />
        </React.Fragment>
      ))}
      <SettingsDivider />
      <button
        type="button"
        onClick={onRemove}
        className="w-full text-left px-3.5 py-3 text-xs text-danger hover:bg-danger/10 transition-colors cursor-pointer"
      >
        Удалить подключение
      </button>
    </>
  );
};
