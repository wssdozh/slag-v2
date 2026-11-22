// One dialog per prompt field: instructions and persona are edited apart, and saved apart.
// The dialog outlives its answer by one exit, so it leaves like the rest of the overlays; a new
// field opened inside that window reuses the surface but starts from the stored text again.
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../UI/icons/Icon';
import { BaseModal } from '../Modals/BaseModal';
import { IconButton } from '../UI/IconButton';
import { SettingsSwitch } from './SettingsUI';
import { storage } from '../../lib/storage';
import { getPref, setPref } from '../../lib/storage/prefs';
import { useIsMobile } from '../../hooks/layout/useIsMobile';
import { usePresence } from '../../hooks/ui/usePresence';

export type PromptField = 'prompt' | 'persona';

interface AiPromptModalProps {
  field: PromptField | null;
  isOpen: boolean;
  onClose: () => void;
}

interface PromptDraft {
  field: PromptField;
  session: number;
  value: string;
  initial: string;
  enabled: boolean;
  enabledInitial: boolean;
  saveFailed: boolean;
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

/** A fresh draft reads the vault: a prompt synced from another device shows up without an effect. */
function createDraft(field: PromptField, session: number): PromptDraft {
  const workspace = storage.getWorkspaceState();
  const value = field === 'prompt' ? workspace.aiPrompt ?? '' : workspace.aiPersona ?? '';
  const enabled = workspace.aiPersonaEnabled === true;
  return { field, session, value, initial: value, enabled, enabledInitial: enabled, saveFailed: false };
}

interface PromptDialogProps {
  field: PromptField;
  session: number;
  isOpen: boolean;
  onClose: () => void;
  presence: ReturnType<typeof usePresence>;
}

const PromptDialog: React.FC<PromptDialogProps> = ({ field, session, isOpen, onClose, presence }) => {
  const isMobile = useIsMobile();
  const [draft, setDraft] = useState(() => createDraft(field, session));
  // Every opening starts from the stored text, even when the surface is still fading the previous
  // field out: the draft is component state here, not a remount, so the exit is not cut short.
  if (draft.session !== session || draft.field !== field) setDraft(createDraft(field, session));

  const [wide, setWide] = useState(() => getPref(SIZE_KEY) === '1');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setDraft((previous) => ({ ...previous, saveFailed: false }));
    try {
      const at = Date.now(); // Legacy rooms still carry the timestamp; registry rooms use revisions.
      await storage.saveWorkspaceState(field === 'prompt' ? { aiPrompt: draft.value.trim(), aiPromptAt: at }
        : { aiPersona: draft.value.trim(), aiPersonaEnabled: draft.enabled, aiPersonaAt: at });
      onClose();
    } catch {
      setDraft((previous) => ({ ...previous, saveFailed: true }));
    } finally {
      setSaving(false);
    }
  };

  const toggleWide = () => {
    setWide((previous) => {
      setPref(SIZE_KEY, previous ? '0' : '1');
      return !previous;
    });
  };

  const personaOff = field === 'persona' && !draft.enabled;
  const dirty = draft.value !== draft.initial
    || (field === 'persona' && draft.enabled !== draft.enabledInitial);

  const hint = <span className="text-xs leading-relaxed text-fg-muted">{HINTS[field]}</span>;

  const switchRow = field === 'persona' && (
    <div data-testid="ai-persona-switch-row" className="flex items-center justify-between gap-3 shrink-0">
      <span className="min-w-0 flex flex-col gap-0.5">
        <span className="text-sm font-medium text-fg-primary">Персона включена</span>
        <span className="text-xs leading-relaxed text-fg-muted">
          {draft.enabled ? 'ассистент говорит от её лица' : 'выключено — только правила промпта'}
        </span>
      </span>
      <SettingsSwitch
        checked={draft.enabled}
        onChange={(next) => { if (!saving) setDraft((previous) => ({ ...previous, enabled: next })); }}
        label="Персона включена"
      />
    </div>
  );

  const editor = (
    <textarea
      rows={isMobile ? 10 : 16}
      value={draft.value}
      onChange={(event) => setDraft((previous) => ({ ...previous, value: event.target.value }))}
      placeholder={PLACEHOLDERS[field]}
      aria-label={TITLES[field]}
      data-testid={`ai-${field}-text`}
      disabled={personaOff || saving}
      className="w-full flex-1 min-h-24 rounded-md bg-surface-elevated border border-subtle px-3 py-2 text-xs leading-relaxed text-fg-primary placeholder:text-fg-dim outline-none ring-0 resize-none disabled:opacity-50"
    />
  );

  const actions = (
    <div className="flex items-center justify-end gap-2">
      {draft.saveFailed ? <span role="alert" className="mr-auto text-xs text-fg-secondary">Не удалось сохранить. Текст остался в редакторе.</span>
        : <span className="mr-auto text-2xs font-mono text-fg-dim">{draft.value.length}</span>}
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
        disabled={!dirty || saving}
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
    const { ref: surfaceRef, phase, onTransitionEnd } = presence;
    return createPortal(
      <div
        ref={surfaceRef}
        data-motion-state={phase}
        onTransitionEnd={onTransitionEnd}
        inert={!isOpen}
        aria-hidden={!isOpen || undefined}
        className="fixed inset-0 z-[60] flex flex-col bg-canvas motion-fade"
      >
        <div
          className="flex items-center gap-2 px-3 py-2.5 border-b border-border-subtle shrink-0 bg-panel"
          style={{ paddingTop: 'max(var(--sat), 0.625rem)' }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Назад"
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
      presence={presence}
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

export const AiPromptModal: React.FC<AiPromptModalProps> = ({ field, isOpen, onClose }) => {
  const presence = usePresence(isOpen);
  const [snapshot, setSnapshot] = useState<{ open: boolean; field: PromptField | null }>({ open: isOpen, field });
  const [session, setSession] = useState(0);
  // The close keeps the field it is fading; the next open starts a session and reads the vault.
  // Compare against the shown field, not the prop: a closed modal has no field of its own.
  const shownField = field ?? snapshot.field;
  if (snapshot.open !== isOpen || snapshot.field !== shownField) {
    setSnapshot({ open: isOpen, field: shownField });
    if (isOpen) setSession(previous => previous + 1);
  }

  if (!presence.isPresent) return null;
  if (!shownField) return null;

  return (
    <PromptDialog
      field={shownField}
      session={session}
      isOpen={isOpen}
      onClose={onClose}
      presence={presence}
    />
  );
};
