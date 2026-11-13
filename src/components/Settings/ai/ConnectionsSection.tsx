// The list of connections: a row per provider, expanding into its editor.
import React, { useState } from 'react';
import type { AiConnection, AiConnectionKind, AiRole } from '../../../types';
import { PROVIDER_PRESETS, connectionModel } from '../../../lib/ai/connections/presets';
import { isConnectionReady } from '../../../lib/ai/connections/settings';
import { SettingsDivider, SettingsGroup, SettingsRow } from '../SettingsUI';
import { Select } from '../../UI/Select';
import { ConnectionEditor } from './ConnectionEditor';

interface ConnectionsSectionProps {
  connections: AiConnection[];
  onAdd: (kind: AiConnectionKind) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, changes: Partial<AiConnection>) => void;
  onModelChange: (id: string, role: AiRole, model: string) => void;
}

export const ConnectionsSection: React.FC<ConnectionsSectionProps> = ({
  connections,
  onAdd,
  onRemove,
  onUpdate,
  onModelChange,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const addOptions = Object.values(PROVIDER_PRESETS).map((preset) => ({
    value: preset.kind,
    label: preset.label,
  }));

  return (
    <SettingsGroup
      title="Подключения"
      action={
        <span data-testid="ai-connection-add">
          <Select
            variant="ghost"
            size="sm"
            value=""
            placeholder="+ Добавить"
            aria-label="Добавить подключение"
            options={addOptions}
            onChange={(value) => onAdd(value as AiConnectionKind)}
          />
        </span>
      }
    >
      {connections.length === 0 ? (
        <p className="px-3.5 py-3 text-xs leading-relaxed text-fg-muted">
          Пока пусто. Добавьте провайдера — свой ключ или OpenAI-совместимый endpoint
          (CPA, OpenRouter, ollama).
        </p>
      ) : (
        connections.map((connection, index) => {
          const ready = isConnectionReady(connection);
          const preset = PROVIDER_PRESETS[connection.kind];
          const isExpanded = expandedId === connection.id;

          return (
            <React.Fragment key={connection.id}>
              {index > 0 && <SettingsDivider />}
              <SettingsRow
                testId={`ai-connection-${connection.id}`}
                icon={
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${ready ? 'bg-emerald-400' : 'bg-zinc-600'}`}
                  />
                }
                label={connection.label}
                description={`${preset.label} · ${connectionModel(connection, 'chat') || 'модель не задана'}`}
                value={isExpanded ? 'Свернуть' : 'Изменить'}
                onClick={() => setExpandedId(isExpanded ? null : connection.id)}
              />
              {isExpanded && (
                <ConnectionEditor
                  connection={connection}
                  onChange={(changes) => onUpdate(connection.id, changes)}
                  onModelChange={(role, model) => onModelChange(connection.id, role, model)}
                  onRemove={() => {
                    onRemove(connection.id);
                    setExpandedId(null);
                  }}
                />
              )}
            </React.Fragment>
          );
        })
      )}
    </SettingsGroup>
  );
};
