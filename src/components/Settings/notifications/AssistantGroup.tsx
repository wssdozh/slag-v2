// «Ассистент в telegram»: what the bot may answer, and how much of the vault it may read.
import React from 'react';
import type { AssistantSetting } from '../../../types';
import { SettingsGroup, SettingsSelect } from '../SettingsUI';

interface AssistantGroupProps {
  mode: AssistantSetting;
  /** No live channel, or the vault/account is locked. */
  disabled: boolean;
  onModeChange: (mode: AssistantSetting) => void;
}

/** One line under the row: the promise the chosen mode makes, in plain words. */
const MODE_HINT: Record<AssistantSetting, string> = {
  off: 'бот молчит на вопросы, напоминания остаются',
  minimal: 'отвечает только про задачи, заметки не читает',
  risky: 'читает хранилище: включай, только если понимаешь риск',
};

export const AssistantGroup: React.FC<AssistantGroupProps> = ({ mode, disabled, onModeChange }) => (
  <SettingsGroup
    title="Ассистент в telegram"
    action={<span className="text-2xs font-mono text-fg-dim">опытное</span>}
  >
    <SettingsSelect
      label="Отвечать на вопросы из бота"
      value={mode}
      onChange={(next) => onModeChange(next as AssistantSetting)}
      options={[
        { value: 'off', label: 'выключено' },
        { value: 'minimal', label: 'только задачи' },
        { value: 'risky', label: 'всё хранилище' },
      ]}
      disabled={disabled}
      testId="assistant-mode"
    />
    <p className="px-3 pb-3 text-2xs leading-relaxed text-fg-muted">{MODE_HINT[mode]}</p>
  </SettingsGroup>
);
