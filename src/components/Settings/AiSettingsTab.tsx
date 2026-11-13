// Where the model comes from — subscription or your own connections — and what it is told to do.
import React from 'react';
import { syncEngine } from '../../lib/sync/syncEngine';
import type { AiSettings, AiSourceMode, SubscriptionAiTier } from '../../types';
import { useAiSettingsForm } from './ai/useAiSettingsForm';
import { AiPromptModal } from './AiPromptModal';
import { ConnectionsSection } from './ai/ConnectionsSection';
import { RolesSection } from './ai/RolesSection';
import { MemoryList } from './MemoryList';
import {
  SettingsDivider,
  SettingsGroup,
  SettingsNumber,
  SettingsRow,
  SettingsSelect,
  SettingsSwitch,
} from './SettingsUI';

export const AiSettingsTab: React.FC = () => {
  const form = useAiSettingsForm();
  const { draft } = form;
  const [editing, setEditing] = React.useState<null | 'prompt' | 'persona'>(null);

  // Read once: the plan arrives from the relay's health check, and subscribing here made the
  // lock re-render mid-interaction. A stale lock while the tab is open is a known gap, not a
  // regression from this line — fixing it means owning the plan state one level up.
  const syncStatus = syncEngine.getStatus();
  const isFreePlan = syncStatus.subscription.plan === 'free';

  // Free plan means BYOK only; the form still carries whatever mode was stored, so the
  // effective mode is forced here and forced again on save.
  const sourceMode: AiSourceMode = isFreePlan ? 'byok' : draft.sourceMode || 'subscription';

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    form.submit(isFreePlan ? { sourceMode: 'byok' } : undefined);
  };

  return (
    <>
    <form id="ai-settings-form" onSubmit={handleSubmit} className="flex flex-col gap-3">
      <SettingsGroup title="Источник моделей">
        <SettingsSelect
          label="Использовать"
          value={sourceMode}
          onChange={(mode) => form.setSourceMode(mode as AiSourceMode)}
          testId="ai-source-mode"
          options={[
            {
              value: 'subscription',
              label: isFreePlan ? 'Подписка — недоступна' : 'Подписка SLAG',
              disabled: isFreePlan,
              testId: 'ai-source-subscription',
            },
            { value: 'byok', label: 'Свой API-ключ', testId: 'ai-source-byok' },
          ]}
        />
        {isFreePlan && (
          <p className="px-3 pb-3 text-2xs leading-relaxed text-fg-muted">
            На тарифе Free доступны только свои ключи.
          </p>
        )}
      </SettingsGroup>

      {sourceMode === 'subscription' ? (
        <SettingsGroup title="Режим обработки">
          <SettingsSelect
            label="Модель"
            value={draft.subscriptionModel || 'fast'}
            onChange={(tier) => form.setSubscriptionModel(tier as SubscriptionAiTier)}
            options={[
              { value: 'fast', label: 'Flash — быстрый' },
              { value: 'smart', label: 'Smart — умный' },
              { value: 'deep', label: 'Deep — логика' },
            ]}
          />
          <p className="px-3 pb-2 text-2xs leading-relaxed text-fg-muted">
            Картинки и аудио тоже идут через подписку — отдельный ключ Groq не нужен.
          </p>
        </SettingsGroup>
      ) : (
        <>
          <ConnectionsSection
            connections={draft.connections}
            onAdd={form.addConnection}
            onRemove={form.removeConnection}
            onUpdate={form.updateConnection}
            onModelChange={form.setConnectionModel}
          />
          <RolesSection settings={draft} onChange={form.setRole} />
        </>
      )}

      <SettingsGroup title="Автоматизация">
        <SettingsRow
          label="Автотегирование новых заметок"
          right={
            <SettingsSwitch
              checked={draft.autoTagging}
              onChange={(autoTagging) => form.patch({ autoTagging })}
              label="Автотегирование новых заметок"
            />
          }
        />
        <SettingsDivider />
        <SettingsRow
          label="AI-триаж"
          right={
            <SettingsSwitch
              checked={draft.autoTriage}
              onChange={(autoTriage) => form.patch({ autoTriage })}
              label="AI-триаж"
            />
          }
        />
        <SettingsDivider />
        <SettingsRow
          label="Веб-поиск при ответах"
          right={
            <SettingsSwitch
              checked={draft.webSearchEnabled}
              onChange={(webSearchEnabled) => form.patch({ webSearchEnabled })}
              label="Веб-поиск при ответах"
            />
          }
        />
        <SettingsDivider />
        <SettingsSelect
          label="Рассуждения"
          value={draft.reasoningEffort}
          onChange={(effort) =>
            form.patch({ reasoningEffort: effort as AiSettings['reasoningEffort'] })
          }
          options={[
            { value: 'none', label: 'Отключены' },
            { value: 'low', label: 'Низкие' },
            { value: 'medium', label: 'Средние' },
            { value: 'high', label: 'Высокие' },
          ]}
        />
      </SettingsGroup>

      <SettingsGroup title="Правила тегов">
        <SettingsNumber
          label="Лимит тегов"
          min={1}
          max={8}
          value={draft.maxTagsPerNote}
          onChange={(maxTagsPerNote) => form.patch({ maxTagsPerNote })}
        />
        <SettingsDivider />
        <SettingsSelect
          label="Стиль регистра"
          testId="tag-case-select"
          value={draft.tagCaseStyle}
          onChange={(style) =>
            form.patch({ tagCaseStyle: style as AiSettings['tagCaseStyle'] })
          }
          options={[
            { value: 'lowercase', label: 'lowercase (#дизайн)' },
            { value: 'kebab-case', label: 'kebab-case (#ui-ux)' },
          ]}
        />
        <SettingsDivider />
        <SettingsRow
          label="Разрешить ИИ создавать новые теги"
          right={
            <SettingsSwitch
              checked={draft.allowNewTags}
              onChange={(allowNewTags) => form.patch({ allowNewTags })}
              label="Разрешить ИИ создавать новые теги"
            />
          }
        />
        <SettingsDivider />
        <div className="px-3 py-3 sm:px-4">
          <textarea
            rows={2}
            value={draft.customTagRules || ''}
            onChange={(event) => form.patch({ customTagRules: event.target.value })}
            aria-label="Пользовательские правила промпта"
            placeholder="Пользовательские правила промпта: чего не тегировать, что предпочитать"
            className="w-full bg-transparent text-xs text-fg-primary placeholder:text-fg-dim resize-none outline-none"
          />
        </div>
      </SettingsGroup>

      {/* слова владельца: два поля, две модалки, оба едут с хранилищем */}
      <SettingsGroup title="Промпт">
        <SettingsRow
          label="Инструкции"
          right={
            <button
              type="button"
              onClick={() => setEditing('prompt')}
              data-testid="ai-prompt-open"
              className="px-2.5 py-1 rounded-md text-xs text-fg-secondary hover:text-fg-primary hover:bg-surface-hover transition-colors cursor-pointer"
            >
              Изменить
            </button>
          }
        />
        <SettingsDivider />
        <SettingsRow
          label="Персона"
          right={
            <button
              type="button"
              onClick={() => setEditing('persona')}
              data-testid="ai-persona-open"
              className="px-2.5 py-1 rounded-md text-xs text-fg-secondary hover:text-fg-primary hover:bg-surface-hover transition-colors cursor-pointer"
            >
              Изменить
            </button>
          }
        />
      </SettingsGroup>

      {/* что ассистент запомнил о человеке */}
      <MemoryList />
    </form>
    {/* The dialogs live outside the settings form: a form inside a form is not a form at all. */}
    {editing && (
      <AiPromptModal key={editing} field={editing} isOpen onClose={() => setEditing(null)} />
    )}
    </>
  );
};
