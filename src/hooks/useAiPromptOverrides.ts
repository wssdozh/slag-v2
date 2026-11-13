// The owner's own words for the assistant: a prompt and an optional persona, kept in the vault
// so every device answers the same way instead of each install having its own voice.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkspaceState } from '../types';
import { storage } from '../lib/storage';

const SAVE_DELAY_MS = 400;

type PromptState = Pick<WorkspaceState, 'aiPrompt' | 'aiPersona' | 'aiPersonaEnabled'>;

export interface AiPromptOverrides {
  prompt: string;
  persona: string;
  personaEnabled: boolean;
  setPrompt: (value: string) => void;
  setPersona: (value: string) => void;
  setPersonaEnabled: (value: boolean) => void;
}

function readState(): PromptState {
  const workspace = storage.getWorkspaceState();
  return {
    aiPrompt: workspace.aiPrompt ?? '',
    aiPersona: workspace.aiPersona ?? '',
    aiPersonaEnabled: workspace.aiPersonaEnabled === true,
  };
}

export function useAiPromptOverrides(): AiPromptOverrides {
  const [state, setState] = useState<PromptState>(readState);
  // One write per pause, not per keystroke: every save also queues a sync change, and a prompt
  // is typed, not pasted in one go.
  const timer = useRef<number | null>(null);
  const pending = useRef<PromptState | null>(null);

  const flush = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const patch = pending.current;
    pending.current = null;
    if (patch) storage.saveWorkspaceState(patch);
  }, []);

  const queue = useCallback((patch: PromptState) => {
    pending.current = patch;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, SAVE_DELAY_MS);
  }, [flush]);

  // A settings tab closed mid-typing keeps what was typed: nothing is more annoying than a
  // prompt that reverts because the last keystroke was 200 ms before the click.
  useEffect(() => () => flush(), [flush]);

  const update = useCallback((patch: Partial<PromptState>) => {
    setState((current) => {
      const next = { ...current, ...patch };
      queue(next);
      return next;
    });
  }, [queue]);

  return {
    prompt: state.aiPrompt ?? '',
    persona: state.aiPersona ?? '',
    personaEnabled: state.aiPersonaEnabled === true,
    setPrompt: (value) => update({ aiPrompt: value }),
    setPersona: (value) => update({ aiPersona: value }),
    setPersonaEnabled: (value) => update({ aiPersonaEnabled: value }),
  };
}
