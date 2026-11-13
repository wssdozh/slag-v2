// One dialog per prompt field: instructions and persona are edited apart, and saved apart.
// The dialog is mounted only while it is open, so its first render reads the vault — that is
// also how a prompt synced from another device shows up without an effect.
import React, { useState } from 'react';
import { BaseModal } from '../Modals/BaseModal';
import { SettingsSwitch } from './SettingsUI';
import { storage } from '../../lib/storage';

export type PromptField = 'prompt' | 'persona';

interface AiPromptModalProps {
  field: PromptField;
  isOpen: boolean;
  onClose: () => void;
}

const TITLES: Record<PromptField, string> = { prompt: 'Промпт', persona: 'Персона' };
const PLACEHOLDERS: Record<PromptField, string> = {
  prompt: 'Отвечай коротко. Списки — по пункту на строку.',
  persona: 'Виолетта, язвительная напарница.',
};

function readField(field: PromptField): string {
  const workspace = storage.getWorkspaceState();
  return field === 'prompt' ? workspace.aiPrompt ?? '' : workspace.aiPersona ?? '';
}

export const AiPromptModal: React.FC<AiPromptModalProps> = ({ field, isOpen, onClose }) => {
  const [value, setValue] = useState(() => readField(field));
  const [initial] = useState(value);
  const [enabled, setEnabled] = useState(() => storage.getWorkspaceState().aiPersonaEnabled === true);

  const save = () => {
    if (field === 'prompt') {
      storage.saveWorkspaceState({ aiPrompt: value.trim() });
    } else {
      storage.saveWorkspaceState({ aiPersona: value.trim(), aiPersonaEnabled: enabled });
    }
    onClose();
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={TITLES[field]}
      maxWidth="max-w-lg"
      ariaLabel={TITLES[field]}
      footer={(
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-xs text-fg-secondary hover:text-fg-primary transition-colors cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={save}
            data-testid={`ai-${field}-save`}
            disabled={value === initial}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-accent text-white hover:bg-accent-strong disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            Сохранить
          </button>
        </div>
      )}
    >
      <div className="flex flex-col gap-3 p-4 md:p-5">
        {field === 'persona' && (
          <div className="flex justify-end">
            <SettingsSwitch checked={enabled} onChange={setEnabled} label="Персона включена" />
          </div>
        )}
        <textarea
          rows={field === 'prompt' ? 8 : 5}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={PLACEHOLDERS[field]}
          aria-label={TITLES[field]}
          data-testid={`ai-${field}-text`}
          disabled={field === 'persona' && !enabled}
          className="w-full rounded-md bg-surface-elevated border border-subtle px-3 py-2 text-xs leading-relaxed text-fg-primary placeholder:text-fg-dim outline-none ring-0 resize-none disabled:opacity-50"
        />
      </div>
    </BaseModal>
  );
};
