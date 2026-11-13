// The owner's own words for the assistant: a prompt and an optional persona, kept in the vault
// so every device answers the same way instead of each install having its own voice.
import { useCallback, useState } from 'react';
import type { WorkspaceState } from '../types';
import { storage } from '../lib/storage';

export interface AiPromptDraft {
  prompt: string;
  persona: string;
  personaEnabled: boolean;
}

export interface AiPromptOverrides {
  draft: AiPromptDraft;
  isDirty: boolean;
  /** Re-reads the vault: a sync may have changed the prompt while the dialog was closed. */
  reload: () => void;
  setPrompt: (value: string) => void;
  setPersona: (value: string) => void;
  setPersonaEnabled: (value: boolean) => void;
  save: () => void;
}

function readDraft(): AiPromptDraft {
  const workspace = storage.getWorkspaceState();
  return {
    prompt: workspace.aiPrompt ?? '',
    persona: workspace.aiPersona ?? '',
    personaEnabled: workspace.aiPersonaEnabled === true,
  };
}

function sameDraft(left: AiPromptDraft, right: AiPromptDraft): boolean {
  return left.prompt === right.prompt
    && left.persona === right.persona
    && left.personaEnabled === right.personaEnabled;
}

export function useAiPromptOverrides(): AiPromptOverrides {
  const [draft, setDraft] = useState<AiPromptDraft>(readDraft);
  const [saved, setSaved] = useState<AiPromptDraft>(readDraft);

  const reload = useCallback(() => {
    const fresh = readDraft();
    setDraft(fresh);
    setSaved(fresh);
  }, []);

  const save = useCallback(() => {
    const patch: Pick<WorkspaceState, 'aiPrompt' | 'aiPersona' | 'aiPersonaEnabled'> = {
      aiPrompt: draft.prompt.trim(),
      aiPersona: draft.persona.trim(),
      aiPersonaEnabled: draft.personaEnabled,
    };
    storage.saveWorkspaceState(patch);
    setSaved(draft);
  }, [draft]);

  return {
    draft,
    isDirty: !sameDraft(draft, saved),
    reload,
    setPrompt: (prompt) => setDraft((current) => ({ ...current, prompt })),
    setPersona: (persona) => setDraft((current) => ({ ...current, persona })),
    setPersonaEnabled: (personaEnabled) => setDraft((current) => ({ ...current, personaEnabled })),
    save,
  };
}
