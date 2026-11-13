// The assistant's input row: model picker, send, and a nudge to connect when no key.
import React from 'react';
import { Globe } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { BaseComposer } from '../BaseComposer';
import { Select } from '../../UI/Select';
import type { AiSettings } from '../../../types';
import { connectionModel } from '../../../lib/ai/connections/presets';
import {
  isChatConfigured,
  isSubscriptionMode,
  resolveRoleConnection,
} from '../../../lib/ai/connections/resolve';

interface AssistantComposerProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: () => void;
  isSubmitDisabled: boolean;
  isSidebar: boolean;
  isMobile: boolean;
  isInbox: boolean;
  folderLabel: string;
}

export const AssistantComposer: React.FC<AssistantComposerProps> = ({
  textareaRef,
  value,
  onChange,
  onSubmit,
  isSubmitDisabled,
  isSidebar,
  isMobile,
  isInbox,
  folderLabel,
}) => {
  const { aiSettings, saveAiSettings, setIsSettingsOpen } = useApp();

  const isConnected = isChatConfigured(aiSettings);
  const isRelay = isSubscriptionMode(aiSettings);
  const chatConnection = resolveRoleConnection(aiSettings, 'chat');
  const providerLabel = isRelay ? 'SLAG Relay' : chatConnection?.label ?? 'Локальный';
  const providerModel = isRelay
    ? aiSettings.subscriptionModel || 'fast'
    : chatConnection
      ? connectionModel(chatConnection, 'chat')
      : '';

  return (
    <div className="p-2.5 shrink-0 flex justify-center">
      <div className={`w-full ${isSidebar ? '' : 'max-w-2xl'}`}>
        <BaseComposer
          textareaRef={textareaRef}
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          disabled={false}
          isSubmitDisabled={isSubmitDisabled}
          submitTitle="Отправить сообщение (Enter)"
          maxHeight={isSidebar ? 120 : 180}
          placeholder={
            isSidebar
              ? 'Спросите ассистента...'
              : isMobile
              ? 'Спросите ассистента...'
              : isInbox
              ? 'Спросите ассистента по всем заметкам...'
              : `Спросите о «${folderLabel.length > 20 ? folderLabel.slice(0, 18) + '…' : folderLabel}»...`
          }
          leftControls={
            <div className="composer-toolbar-group flex min-w-0 flex-1 flex-wrap items-center gap-1">
              {/* Provider badge - Embedded Linear Monochrome */}
              {isConnected ? (
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(true)}
                  className="composer-toolbar-control inline-flex h-ctrl-md min-w-0 max-w-full items-center gap-1.5 rounded-md px-2 text-xs font-mono text-fg-secondary outline-none ring-0 transition-colors hover:bg-surface-hover hover:text-fg-primary cursor-pointer"
                  title={`${providerLabel}${providerModel ? ` · ${providerModel}` : ''} — настройки (⌘,)`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  <span className="min-w-0 truncate">{providerLabel}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(true)}
                  className="composer-toolbar-control inline-flex h-ctrl-md min-w-0 max-w-full items-center gap-1.5 rounded-md px-2 text-xs font-mono text-fg-muted outline-none ring-0 transition-colors hover:bg-surface-hover hover:text-fg-secondary cursor-pointer"
                  title="Локальный режим без ключа. Нажмите, чтобы настроить API-ключ (⌘,)"
                  aria-label="Локальный режим, открыть настройки API-ключа"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0" />
                  <span className="min-w-0 truncate">Локальный</span>
                </button>
              )}

              {/* Reasoning Selector - Embedded ghost */}
              <div
                className="flex shrink-0 items-center gap-0.5 text-xs font-mono text-fg-secondary"
                role="group"
                aria-label="Глубина рассуждений модели"
                title="Глубина рассуждений модели: Off / Low / Med / High"
              >
                <span className="text-zinc-500 pl-0.5" aria-hidden="true">R:</span>
                <Select
                  size="md"
                  variant="ghost"
                  direction="up"
                  triggerClassName="composer-toolbar-control h-ctrl-md rounded-md outline-none ring-0"
                  value={aiSettings.reasoningEffort || 'low'}
                  onChange={(val) => saveAiSettings({ reasoningEffort: val as AiSettings['reasoningEffort'] })}
                  options={[
                    { value: 'none', label: 'Off' },
                    { value: 'low', label: 'Low' },
                    { value: 'medium', label: 'Med' },
                    { value: 'high', label: 'High' },
                  ]}
                />
              </div>

              {/* Web search toggle - Embedded ghost */}
              <button
                type="button"
                onClick={() => saveAiSettings({ webSearchEnabled: !aiSettings.webSearchEnabled })}
                className={`composer-toolbar-control flex h-ctrl-md shrink-0 items-center justify-center gap-1 rounded-md px-2 text-xs font-mono outline-none ring-0 transition-colors cursor-pointer ${
                  aiSettings.webSearchEnabled
                    ? 'text-sky-400 bg-sky-500/10 hover:bg-sky-500/15 font-medium'
                    : 'text-fg-secondary hover:text-fg-primary hover:bg-surface-hover'
                }`}
                title={aiSettings.webSearchEnabled ? 'Поиск в интернете включён' : 'Поиск в интернете выключен'}
                aria-label="Поиск в интернете"
                aria-pressed={aiSettings.webSearchEnabled}
              >
                <Globe className="w-4 h-4" />
                <span className="hidden sm:inline">Сеть</span>
              </button>
            </div>
          }
        />
      </div>
    </div>
  );
};
