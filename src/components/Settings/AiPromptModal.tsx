// The prompt and the persona, edited in a dialog: two long texts do not belong in a settings list.
import React, { useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { BaseModal } from '../Modals/BaseModal';
import { SettingsSwitch } from './SettingsUI';
import { useAiPromptOverrides } from '../../hooks/useAiPromptOverrides';

interface AiPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AiPromptModal: React.FC<AiPromptModalProps> = ({ isOpen, onClose }) => {
  const overrides = useAiPromptOverrides();
  const { draft, reload } = overrides;

  // Opening the dialog is the moment to pick up what another device synced in the meantime.
  useEffect(() => {
    if (isOpen) reload();
  }, [isOpen, reload]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    overrides.save();
    onClose();
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Промпт и персона"
      subtitle="Едет с хранилищем: бот и приложение отвечают одинаково"
      icon={<Sparkles className="w-4 h-4" />}
      maxWidth="max-w-xl"
      ariaLabel="Промпт и персона ассистента"
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
            type="submit"
            form="ai-prompt-form"
            data-testid="ai-prompt-save"
            disabled={!overrides.isDirty}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-accent text-white hover:bg-accent-strong disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            Сохранить
          </button>
        </div>
      )}
    >
      <form id="ai-prompt-form" onSubmit={handleSubmit} className="flex flex-col gap-3 p-4 md:p-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ai-prompt-text" className="text-xs font-medium text-fg-primary">
            Инструкции
          </label>
          <p className="text-2xs leading-relaxed text-fg-muted">
            Дописываются к основному промпту. Тон, привычки, чего не делать — здесь.
          </p>
          <textarea
            id="ai-prompt-text"
            rows={6}
            value={draft.prompt}
            onChange={(event) => overrides.setPrompt(event.target.value)}
            placeholder="Например: отвечай коротко, без вступлений. Списки — по пункту на строку."
            className="w-full rounded-md bg-surface-elevated border border-subtle px-3 py-2 text-xs leading-relaxed text-fg-primary placeholder:text-fg-dim outline-none ring-0 resize-none"
          />
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="min-w-0">
            <p className="text-xs font-medium text-fg-primary">Своя персона</p>
            <p className="text-2xs leading-relaxed text-fg-muted">
              Кем представляется ассистент. Дописывается после инструкций.
            </p>
          </div>
          <SettingsSwitch
            checked={draft.personaEnabled}
            onChange={overrides.setPersonaEnabled}
            label="Своя персона"
          />
        </div>

        <textarea
          rows={4}
          value={draft.persona}
          onChange={(event) => overrides.setPersona(event.target.value)}
          disabled={!draft.personaEnabled}
          aria-label="Персона ассистента"
          placeholder="Имя, характер, манера речи"
          className="w-full rounded-md bg-surface-elevated border border-subtle px-3 py-2 text-xs leading-relaxed text-fg-primary placeholder:text-fg-dim outline-none ring-0 resize-none disabled:opacity-50"
        />

        <p className="text-2xs leading-relaxed text-fg-dim">
          Форматы и запреты промпта сильнее характера: персона меняет голос, а не правила.
        </p>
      </form>
    </BaseModal>
  );
};
