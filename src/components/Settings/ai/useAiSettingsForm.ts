// The AI settings form's one state: connections, roles and the flags, with their mutations.
import { useCallback, useState } from 'react';
import type {
  AiConnection,
  AiConnectionKind,
  AiRole,
  AiSettings,
  AiSourceMode,
  SubscriptionAiTier,
} from '../../../types';
import { useApp } from '../../../context/AppContext';
import { connectionSupports, createConnection } from '../../../lib/ai/connections/presets';

function cloneSettings(settings: AiSettings): AiSettings {
  return {
    ...settings,
    connections: settings.connections.map((connection) => ({
      ...connection,
      models: { ...connection.models },
    })),
    roles: { ...settings.roles },
  };
}

/** A role pointing at a connection that can no longer serve it must not survive a save. */
function pruneRoles(
  roles: Record<AiRole, string | null>,
  connections: AiConnection[]
): Record<AiRole, string | null> {
  const result = { ...roles };
  for (const role of Object.keys(result) as AiRole[]) {
    const id = result[role];
    if (!id) continue;
    const connection = connections.find((candidate) => candidate.id === id);
    if (!connection || !connectionSupports(connection, role)) result[role] = null;
  }
  return result;
}

export interface AiSettingsForm {
  draft: AiSettings;
  patch: (partial: Partial<AiSettings>) => void;
  addConnection: (kind: AiConnectionKind) => void;
  removeConnection: (id: string) => void;
  updateConnection: (id: string, changes: Partial<AiConnection>) => void;
  setConnectionModel: (id: string, role: AiRole, model: string) => void;
  setRole: (role: AiRole, connectionId: string | null) => void;
  setSourceMode: (mode: AiSourceMode) => void;
  setSubscriptionModel: (tier: SubscriptionAiTier) => void;
  submit: (overrides?: Partial<AiSettings>) => void;
}

export function useAiSettingsForm(): AiSettingsForm {
  const { aiSettings, saveAiSettings, setIsSettingsOpen } = useApp();
  const [draft, setDraft] = useState<AiSettings>(() => cloneSettings(aiSettings));

  const patch = useCallback((partial: Partial<AiSettings>) => {
    setDraft((current) => ({ ...current, ...partial }));
  }, []);

  const addConnection = useCallback((kind: AiConnectionKind) => {
    setDraft((current) => {
      const connection = createConnection(current.connections, kind);
      return {
        ...current,
        connections: [...current.connections, connection],
        // The first connection should be usable without a second trip to the role selectors.
        roles: current.roles.chat ? current.roles : { ...current.roles, chat: connection.id },
      };
    });
  }, []);

  const removeConnection = useCallback((id: string) => {
    setDraft((current) => {
      const connections = current.connections.filter((connection) => connection.id !== id);
      return { ...current, connections, roles: pruneRoles(current.roles, connections) };
    });
  }, []);

  const updateConnection = useCallback((id: string, changes: Partial<AiConnection>) => {
    setDraft((current) => {
      const connections = current.connections.map((connection) =>
        connection.id === id ? { ...connection, ...changes } : connection
      );
      return { ...current, connections, roles: pruneRoles(current.roles, connections) };
    });
  }, []);

  const setConnectionModel = useCallback((id: string, role: AiRole, model: string) => {
    setDraft((current) => ({
      ...current,
      connections: current.connections.map((connection) =>
        connection.id === id
          ? { ...connection, models: { ...connection.models, [role]: model } }
          : connection
      ),
    }));
  }, []);

  const setRole = useCallback((role: AiRole, connectionId: string | null) => {
    setDraft((current) => ({ ...current, roles: { ...current.roles, [role]: connectionId } }));
  }, []);

  const setSourceMode = useCallback((mode: AiSourceMode) => patch({ sourceMode: mode }), [patch]);

  const setSubscriptionModel = useCallback(
    (tier: SubscriptionAiTier) => patch({ subscriptionModel: tier }),
    [patch]
  );

  const submit = useCallback((overrides?: Partial<AiSettings>) => {
    saveAiSettings({ ...draft, ...overrides });
    setIsSettingsOpen(false);
  }, [draft, saveAiSettings, setIsSettingsOpen]);

  return {
    draft,
    patch,
    addConnection,
    removeConnection,
    updateConnection,
    setConnectionModel,
    setRole,
    setSourceMode,
    setSubscriptionModel,
    submit,
  };
}
