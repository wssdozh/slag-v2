// «Ассистент в telegram»: what the bot may answer, and how much of the vault it may read.
import React from 'react';
import type { AssistantSetting } from '../../../types';
import { SettingsGroup } from '../SettingsUI';

interface AssistantGroupProps {
  mode: AssistantSetting;
  /** No live channel, or the vault/account is locked. */
  disabled: boolean;
  onModeChange: (mode: AssistantSetting) => void;
}

/** One line under the row: the promise the chosen mode makes, in plain words. */
const MODE_HINT: Record<AssistantSetting, string> = {
  off: 'бот молчит на вопросы, напоминания остаются',
  minimal: 'задачи и напоминания: отвечает и создаёт, заметки не читает',
  read: 'плюс поиск и чтение заметок — их текст уходит в модель',
  risky: 'всё, включая правку заметок: включай, только если понимаешь риск',
};

/** The ladder in the order it widens: each step sees more of the vault than the one before. */
const MODE_OPTIONS: Array<{ value: AssistantSetting; label: string }> = [
  { value: 'off', label: 'выкл' },
  { value: 'minimal', label: 'задачи' },
  { value: 'read', label: 'и заметки' },
  { value: 'risky', label: 'всё' },
];

export const AssistantGroup: React.FC<AssistantGroupProps> = ({ mode, disabled, onModeChange }) => (
  <SettingsGroup
    title="Ассистент в telegram"
    action={<span className="text-2xs font-mono text-fg-dim">опытное</span>}
  >
    {/* A ladder of four states is read at a glance, and a dropdown hid three of them. */}
    <div
      role="radiogroup"
      aria-label="Уровень доступа бота"
      className="flex flex-wrap gap-1 px-3 pt-3 pb-2"
    >
      {MODE_OPTIONS.map((option) => {
        const active = mode === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            data-testid={`assistant-mode-${option.value}`}
            disabled={disabled}
            onClick={() => onModeChange(option.value)}
            className={[
              'px-2.5 py-1 text-xs rounded-md border transition-colors outline-none ring-0',
              active
                ? 'border-hover bg-surface-hover text-fg-primary'
                : 'border-subtle text-fg-muted hover:text-fg-secondary hover:border-hover',
              disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
            ].join(' ')}
          >
            {option.label}
          </button>
        );
      })}
    </div>
    <p className="px-3 pb-3 text-2xs leading-relaxed text-fg-muted">{MODE_HINT[mode]}</p>
  </SettingsGroup>
);
