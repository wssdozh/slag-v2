// One dialog per prompt field: instructions and persona are edited apart, and saved apart.
// The dialog is mounted only while it is open, so its first render reads the vault — that is
// also how a prompt synced from another device shows up without an effect.
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../UI/icons/Icon';
import { BaseModal } from '../Modals/BaseModal';
import { IconButton } from '../UI/IconButton';
import { SettingsSwitch } from './SettingsUI';
import { storage } from '../../lib/storage';
import { useIsMobile } from '../../hooks/layout/useIsMobile';

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
const HINTS: Record<PromptField, string> = {
  prompt: 'Правила для ответов: тон, длина, формат. Едут с хранилищем на все устройства.',
  persona: 'От чьего лица говорит ассистент. Поверх правил, но не вместо них.',
};
/** Desktop only: a long prompt is read like a document, not like a field. */
const SIZE_KEY = 'slag_ai_prompt_modal_wide';

function readField(field: PromptField): string {
  const workspace = storage.getWorkspaceState();
  return field === 'prompt' ? workspace.aiPrompt ?? '' : workspace.aiPersona ?? '';
}

export const AiPromptModal: React.FC<AiPromptModalProps> = ({ field, isOpen, onClose }) => {
  const isMobile = useIsMobile();
  const [value, setValue] = useState(() => readField(field));
  const [initial] = useState(value);
  const [enabled, setEnabled] = useState(() => storage.getWorkspaceState().aiPersonaEnabled === true);
  const [enabledInitial] = useState(enabled);
  const [wide, setWide] = useState(() => localStorage.getItem(SIZE_KEY) === '1');

  const save = () => {
    // The timestamp is what lets another device lose an old copy instead of overwriting this one.
    const at = Date.now();
    if (field === 'prompt') {
      storage.saveWorkspaceState({ aiPrompt: value.trim(), aiPromptAt: at });
    } else {
      storage.saveWorkspaceState({ aiPersona: value.trim(), aiPersonaEnabled: enabled, aiPersonaAt: at });
    }
    onClose();
  };

  const toggleWide = () => {
    setWide((previous) => {
      localStorage.setItem(SIZE_KEY, previous ? '0' : '1');
      return !previous;
    });
  };

  const personaOff = field === 'persona' && !enabled;
  const dirty = value !== initial || (field === 'persona' && enabled !== enabledInitial);

  const hint = <span className="text-xs leading-relaxed text-fg-muted">{HINTS[field]}</span>;

  const switchRow = field === 'persona' && (
    <div data-testid="ai-persona-switch-row" className="flex items-center justify-between gap-3 shrink-0">
      <span className="min-w-0 flex flex-col gap-0.5">
        <span className="text-sm font-medium text-fg-primary">Персона включена</span>
        <span className="text-xs leading-relaxed text-fg-muted">
          {enabled ? 'ассистент говорит от её лица' : 'выключено — только правила промпта'}
        </span>
      </span>
      <SettingsSwitch checked={enabled} onChange={setEnabled} label="Персона включена" />
    </div>
  );

  const editor = (
    <textarea
      rows={isMobile ? 10 : 16}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      placeholder={PLACEHOLDERS[field]}
      aria-label={TITLES[field]}
      data-testid={`ai-${field}-text`}
      disabled={personaOff}
      className="w-full flex-1 min-h-24 rounded-md bg-surface-elevated border border-subtle px-3 py-2 text-xs leading-relaxed text-fg-primary placeholder:text-fg-dim outline-none ring-0 resize-none disabled:opacity-50"
    />
  );

  const actions = (
    <div className="flex items-center justify-end gap-2">
      <span className="mr-auto text-2xs font-mono text-fg-dim">{value.length}</span>
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
        disabled={!dirty}
        className="px-3 py-1.5 rounded-md text-xs font-medium bg-accent text-white hover:bg-accent-strong disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
      >
        Сохранить
      </button>
    </div>
  );

  if (isMobile) {
    // A full-screen surface of its own, not a dialog inside the settings screen: that screen
    // carries `translate`, which makes it a containing block for `fixed` and clipped this sheet
    // to its box. Portal + its own layer keeps the editor above everything, full height.
    if (!isOpen) return null;
    return createPortal(
      <div className="fixed inset-0 z-[60] flex flex-col bg-canvas motion-fade">
        <div
          className="flex items-center gap-2 px-3 py-2.5 border-b border-border-subtle shrink-0 bg-panel"
          style={{ paddingTop: 'max(var(--sat), 0.625rem)' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 -ml-1 text-fg-muted hover:text-fg-primary cursor-pointer motion-press"
            title="Назад"
          >
            <Icon name="nav.back" size="lg" tone="inherit" />
          </button>
          <span className="text-sm font-semibold text-fg-primary">{TITLES[field]}</span>
        </div>
        <div className="flex-1 min-h-0 flex flex-col gap-2.5 p-3">
          {switchRow}
          {hint}
          {editor}
        </div>
        <div
          className="px-3 py-2.5 border-t border-border-subtle bg-panel shrink-0"
          style={{ paddingBottom: 'max(var(--sab), 0.625rem)' }}
        >
          {actions}
        </div>
      </div>,
      document.body,
    );
  }

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      portal
      title={TITLES[field]}
      subtitle="едет с хранилищем на все устройства"
      maxWidth={wide ? 'max-w-6xl' : 'max-w-3xl'}
      maxHeight={wide ? 'h-[92dvh]' : 'h-[70dvh]'}
      ariaLabel={TITLES[field]}
      headerRightSlot={(
        <IconButton
          size="md"
          variant="ghost"
          onClick={toggleWide}
          title={wide ? 'Свернуть' : 'Развернуть'}
          aria-label={wide ? 'Свернуть' : 'Развернуть'}
        >
          {wide ? <Icon name="action.collapse" size="md" tone="inherit" /> : <Icon name="action.expand" size="md" tone="inherit" />}
        </IconButton>
      )}
      footer={actions}
      contentClassName="flex flex-col"
    >
      <div className="flex flex-col gap-2.5 flex-1 min-h-0 p-4 md:p-5">
        {switchRow}
        {hint}
        {editor}
      </div>
    </BaseModal>
  );
};
