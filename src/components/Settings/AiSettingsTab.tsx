// Where the model comes from: the SLAG subscription or your own key, and what it is told to do.
import React, { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { syncEngine } from '../../lib/sync/syncEngine';
import type { AiProvider, AiSourceMode, SubscriptionAiTier } from '../../types';
import { SecretKeyField } from './SecretKeyField';
import { MemoryList } from './MemoryList';
import {
  SettingsDivider,
  SettingsGroup,
  SettingsInput,
  SettingsNumber,
  SettingsRow,
  SettingsSelect,
  SettingsSwitch,
} from './SettingsUI';

export const AiSettingsTab: React.FC = () => {
  const { aiSettings, saveAiSettings, setIsSettingsOpen } = useApp();

  // Read once: the plan arrives from the relay's health check, and subscribing here made the
  // lock re-render mid-interaction. A stale lock while the tab is open is a known gap, not a
  // regression from this line — fixing it means owning the plan state one level up.
  const syncStatus = syncEngine.getStatus();
  const isFreePlan = syncStatus.subscription.plan === 'free';

  const [sourceMode, setSourceMode] = useState<AiSourceMode>(() => {
    if (isFreePlan) return 'byok';
    return aiSettings.sourceMode || 'subscription';
  });
  const [subscriptionModel, setSubscriptionModel] = useState<SubscriptionAiTier>(
    aiSettings.subscriptionModel || 'fast'
  );

  const [provider, setProvider] = useState<AiProvider>(aiSettings.provider || 'groq');
  const [groqApiKey, setGroqApiKey] = useState(aiSettings.groqApiKey || '');
  const [kieApiKey, setKieApiKey] = useState(aiSettings.kieApiKey || '');
  const [kieBaseUrl, setKieBaseUrl] = useState(aiSettings.kieBaseUrl || 'https://api.kie.ai');
  const geminiApiKey = aiSettings.geminiApiKey || '';
  const [model, setModel] = useState(aiSettings.model || 'openai/gpt-oss-120b');
  const [reasoningEffort, setReasoningEffort] = useState<'none' | 'low' | 'medium' | 'high'>(aiSettings.reasoningEffort || 'low');
  const [autoTagging, setAutoTagging] = useState(aiSettings.autoTagging ?? true);
  const [autoTriage, setAutoTriage] = useState(aiSettings.autoTriage ?? true);
  const [webSearchEnabled, setWebSearchEnabled] = useState(aiSettings.webSearchEnabled ?? false);
  const [maxTags, setMaxTags] = useState(aiSettings.maxTagsPerNote ?? 3);
  const [allowNewTags, setAllowNewTags] = useState(aiSettings.allowNewTags ?? true);
  const [tagCaseStyle, setTagCaseStyle] = useState(aiSettings.tagCaseStyle || 'lowercase');
  const [customTagRules, setCustomTagRules] = useState(aiSettings.customTagRules || '');

  const handleProviderChange = (newProvider: AiProvider) => {
    setProvider(newProvider);
    if (newProvider === 'groq') {
      setModel('openai/gpt-oss-120b');
    } else if (newProvider === 'kie') {
      setModel('deepseek-v4-1-flash');
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveAiSettings({
      sourceMode,
      subscriptionModel,
      provider,
      groqApiKey: groqApiKey.trim(),
      kieApiKey: kieApiKey.trim(),
      kieBaseUrl: kieBaseUrl.trim() || 'https://api.kie.ai',
      geminiApiKey: geminiApiKey.trim(),
      model,
      reasoningEffort,
      autoTagging,
      autoTriage,
      webSearchEnabled,
      maxTagsPerNote: Number(maxTags) || 3,
      allowNewTags,
      tagCaseStyle,
      customTagRules: customTagRules.trim(),
    });
    setIsSettingsOpen(false);
  };

  return (
    <form id="ai-settings-form" onSubmit={handleSave} className="flex flex-col gap-3">
      {/* Top Switcher: Подписка vs Свой ключ */}
      <SettingsGroup title="Источник моделей">
        <SettingsSelect
          label="Использовать"
          value={isFreePlan ? 'byok' : sourceMode}
          onChange={(mode) => setSourceMode(mode as 'subscription' | 'byok')}
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

      {/* Mode A: Subscription Gateway Mode (No API keys needed) */}
      {sourceMode === 'subscription' && !isFreePlan ? (
        <SettingsGroup title="Режим обработки">
          <SettingsSelect
            label="Модель"
            value={subscriptionModel}
            onChange={(tier) => setSubscriptionModel(tier as typeof subscriptionModel)}
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
        /* Mode B: BYOK (Bring Your Own Key) Settings */
        <>
          {/* Section 1: Выбор провайдера ИИ (Groq & KIE.AI) */}
          <SettingsGroup title="Провайдер">
            <SettingsSelect
              label="Сервис"
              testId="ai-provider-select"
              value={provider}
              onChange={(next) => handleProviderChange(next as typeof provider)}
              options={[
                { value: 'groq', label: groqApiKey ? 'Groq · подключен' : 'Groq · нет ключа' },
                { value: 'kie', label: kieApiKey ? 'KIE.AI · подключен' : 'KIE.AI · нет ключа' },
              ]}
            />
          </SettingsGroup>

          {/* Section 2: Настройки Groq */}
          {provider === 'groq' && (
            <SettingsGroup
              title="Groq Cloud API"
              action={
                <a
                  href="https://console.groq.com/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-2xs text-fg-muted hover:text-fg-primary flex items-center gap-1 transition-colors"
                >
                  <span>Получить ключ</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              }
            >
              <SecretKeyField
                value={groqApiKey}
                onChange={setGroqApiKey}
                placeholder="API Key · gsk_..."
              />
              <SettingsDivider />
              <SettingsSelect
                label="Модель"
                value={model}
                onChange={setModel}
                options={[
                  { value: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B' },
                  { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
                  { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B' },
                ]}
              />
              <SettingsDivider />
              <SettingsSelect
                label="Рассуждения"
                value={reasoningEffort}
                onChange={(val) => setReasoningEffort(val as typeof reasoningEffort)}
                options={[
                  { value: 'none', label: 'Отключены' },
                  { value: 'low', label: 'Низкие' },
                  { value: 'medium', label: 'Средние' },
                  { value: 'high', label: 'Высокие' },
                ]}
              />
            </SettingsGroup>
          )}

          {/* Section 2: Настройки KIE.AI */}
          {provider === 'kie' && (
            <SettingsGroup
              title="KIE Cloud API"
              action={
                <a
                  href="https://kie.ai/api-key"
                  target="_blank"
                  rel="noreferrer"
                  className="text-2xs text-fg-muted hover:text-fg-primary flex items-center gap-1 transition-colors"
                >
                  <span>Получить ключ</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              }
            >
              <SecretKeyField
                value={kieApiKey}
                onChange={setKieApiKey}
                placeholder="API Key · sk-kie-..."
              />
              <SettingsDivider />
              <SettingsSelect
                label="Модель"
                value={model}
                onChange={setModel}
                options={[
                  { value: 'deepseek-v4-1-flash', label: 'DeepSeek V4.1 Flash' },
                  { value: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
                ]}
              />
              <SettingsDivider />
              <SettingsSelect
                label="Рассуждения"
                value={reasoningEffort}
                onChange={(val) => setReasoningEffort(val as typeof reasoningEffort)}
                options={[
                  { value: 'none', label: 'Отключены' },
                  { value: 'low', label: 'Низкие' },
                  { value: 'medium', label: 'Средние' },
                  { value: 'high', label: 'Высокие' },
                ]}
              />
              <SettingsDivider />
              <SettingsInput
                label="Base URL"
                value={kieBaseUrl}
                onChange={setKieBaseUrl}
                placeholder="https://api.kie.ai"
                mono
              />
            </SettingsGroup>
          )}
        </>
      )}

      {/* Section 3: Автоматизация и интеллектуальные сервисы */}
      <SettingsGroup title="Автоматизация">
        <SettingsRow
          label="Автотегирование новых заметок"
          right={<SettingsSwitch checked={autoTagging} onChange={setAutoTagging} label="Автотегирование новых заметок" />}
        />
        <SettingsDivider />
        <SettingsRow
          label="AI-триаж"
          right={<SettingsSwitch checked={autoTriage} onChange={setAutoTriage} label="AI-триаж" />}
        />
        <SettingsDivider />
        <SettingsRow
          label="Веб-поиск при ответах"
          right={<SettingsSwitch checked={webSearchEnabled} onChange={setWebSearchEnabled} label="Веб-поиск при ответах" />}
        />
      </SettingsGroup>

      {/* Section 4: Норма таксономии и правила тегирования */}
      <SettingsGroup title="Правила тегов">
        <SettingsNumber
          label="Лимит тегов"
          min={1}
          max={8}
          value={maxTags}
          onChange={setMaxTags}
        />
        <SettingsDivider />
        <SettingsSelect
          label="Стиль регистра"
          testId="tag-case-select"
          value={tagCaseStyle}
          onChange={(val) => setTagCaseStyle(val as typeof tagCaseStyle)}
          options={[
            { value: 'lowercase', label: 'lowercase (#дизайн)' },
            { value: 'kebab-case', label: 'kebab-case (#ui-ux)' },
          ]}
        />
        <SettingsDivider />
        <SettingsRow
          label="Разрешить ИИ создавать новые теги"
          right={<SettingsSwitch checked={allowNewTags} onChange={setAllowNewTags} label="Разрешить ИИ создавать новые теги" />}
        />
        <SettingsDivider />
        <div className="px-3 py-3 sm:px-4">
          <textarea
            rows={2}
            value={customTagRules}
            onChange={(e) => setCustomTagRules(e.target.value)}
            aria-label="Пользовательские правила промпта"
            placeholder="Пользовательские правила промпта: чего не тегировать, что предпочитать"
            className="w-full bg-transparent text-xs text-fg-primary placeholder:text-fg-dim resize-none outline-none"
          />
        </div>
      </SettingsGroup>

      {/* Section 5: что ассистент запомнил о человеке */}
      <MemoryList />
    </form>
  );
};
