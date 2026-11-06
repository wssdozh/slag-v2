import React, { useState, useEffect, useRef } from 'react';
import { usePresence } from '../../hooks/usePresence';
import { useApp } from '../../context/AppContext';
import { SecretKeyField } from '../Settings/SecretKeyField';
import { storage } from '../../lib/storage';
import { logger } from '../../lib/logger';
import { openAppFolder } from '../../lib/folderOpener';
import { getPlatformInfo, setupSystemHotkey, removeSystemHotkey, type PlatformInfo } from '../../lib/platform';
import type { AiProvider } from '../../types';
import {
  Settings,
  X,
  Sparkles,
  Download,
  Upload,
  ExternalLink,
  Database,
  Sliders,
  Keyboard,
  RotateCcw,
  Terminal,
  ArrowLeft,
  FolderOpen,
  FileText,
  Archive,
  Trash2,
  Clock,
  HardDrive,
  RefreshCw,
  Laptop
} from 'lucide-react';
import { LogViewer } from '../Logs/LogViewer';
import { Select } from '../UI/Select';
import { Checkbox } from '../UI/Checkbox';
import { NumberInput } from '../UI/NumberInput';
import { BaseModal } from './BaseModal';
import { SyncSettingsTab } from '../Settings/SyncSettingsTab';
import { DevicesSettingsTab } from '../Settings/DevicesSettingsTab';
import { syncEngine } from '../../lib/sync/syncEngine';
import type { AiSourceMode, SubscriptionAiTier } from '../../types';
import { APP_COMMANDS, formatShortcut } from '../../lib/commands';
import { FONT_SCALE_OPTIONS, FONT_FAMILY_OPTIONS } from '../../config/typography';

export const SettingsModal: React.FC = () => {
  const {
    isSettingsOpen,
    setIsSettingsOpen,
    settingsTab: activeTab,
    setSettingsTab: setActiveTab,
    aiSettings,
    saveAiSettings,
    setSidebarWidth,
    setRightPanelWidth,
    refreshData,
    addToast,
    revealVaultInExplorer,
    uiConfig,
    updateUiConfig,
    isMobile,
    backupSnapshots,
    backupSettings,
    createManualBackup,
    restoreSnapshot,
    deleteSnapshot,
    downloadSnapshot,
    downloadVaultZip,
    restoreFromZipFile,
    updateBackupSettings,
  } = useApp();

  const presence = usePresence(isSettingsOpen);

  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<'desktop' | 'mobile'>(isMobile ? 'mobile' : 'desktop');

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
  const [platformInfo, setPlatformInfo] = useState<PlatformInfo | null>(null);
  const [isUpdatingHotkey, setIsUpdatingHotkey] = useState(false);

  useEffect(() => {
    if (isSettingsOpen && activeTab === 'shortcuts') {
      void getPlatformInfo().then(setPlatformInfo);
    }
  }, [activeTab, isSettingsOpen]);

  const handleSetupHotkey = async () => {
    setIsUpdatingHotkey(true);
    try {
      const updated = await setupSystemHotkey();
      if (updated) {
        setPlatformInfo(updated);
        addToast('Системный хоткей успешно привязан!', 'success');
      }
    } catch {
      addToast('Не удалось привязать хоткей', 'error');
    } finally {
      setIsUpdatingHotkey(false);
    }
  };

  const handleRemoveHotkey = async () => {
    setIsUpdatingHotkey(true);
    try {
      const updated = await removeSystemHotkey();
      if (updated) {
        setPlatformInfo(updated);
        addToast('Системный хоткей отключен', 'info');
      }
    } catch {
      addToast('Не удалось отключить хоткей', 'error');
    } finally {
      setIsUpdatingHotkey(false);
    }
  };

  // Держим активную вкладку видимой: при возврате в настройки полоса оставалась
  // на прежней позиции, и выбранный раздел оказывался за правым краем.
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isSettingsOpen) return;
    const box = tabsRef.current;
    const el = box?.querySelector<HTMLElement>(`[data-tab="${activeTab}"]`);
    if (!box || !el || box.scrollWidth <= box.clientWidth) return;
    box.scrollTo({ left: el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2 });
  }, [activeTab, isSettingsOpen]);

  // Desktop dialog keeps its DOM through the exit; the mobile branch unmounts itself.
  if (!isMobile && !presence.isPresent) return null;

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
    if (activeTab !== 'ai') return;
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
      tagCaseStyle: tagCaseStyle as any,
      customTagRules: customTagRules.trim(),
    });
    setIsSettingsOpen(false);
  };

  const handleCreateSnapshot = async () => {
    setIsCreatingSnapshot(true);
    try {
      await createManualBackup();
    } finally {
      setIsCreatingSnapshot(false);
    }
  };

  const handleRestoreSnapshot = async (id: string) => {
    if (!window.confirm('Восстановить хранилище из этого снимка? Текущие несохраненные данные будут заменены.')) {
      return;
    }
    setIsRestoring(true);
    try {
      await restoreSnapshot(id);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleExportZip = async () => {
    await downloadVaultZip();
  };

  const handleExportJson = () => {
    const jsonStr = storage.exportVaultAsJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `slag_vault_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addToast('Резервная копия экспортирована в JSON', 'success');
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.endsWith('.zip')) {
      if (!window.confirm(`Восстановить хранилище из архива "${file.name}"? Текущие данные будут заменены.`)) {
        e.target.value = '';
        return;
      }
      setIsRestoring(true);
      try {
        await restoreFromZipFile(file);
      } finally {
        setIsRestoring(false);
      }
    } else if (file.name.endsWith('.json')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        const success = storage.importVaultFromJson(content);
        if (success) {
          refreshData();
          addToast('Хранилище восстановлено из JSON', 'success');
        } else {
          addToast('Ошибка формата файла', 'error');
        }
      };
      reader.readAsText(file);
    } else {
      addToast('Поддерживаются только архивы .zip и файлы .json', 'error');
    }
    e.target.value = '';
  };

  const handleOpenNotesFolder = async () => {
    await revealVaultInExplorer();
  };

  const handleOpenBackupsFolder = async () => {
    const res = await openAppFolder('backups');
    addToast(res.message, res.success ? 'success' : 'info');
  };

  const handleOpenLogsFolder = async () => {
    const res = await openAppFolder('logs');
    addToast(res.message, res.success ? 'success' : 'info');
  };

  const handleDownloadLogFile = () => {
    try {
      const filename = logger.downloadLog('log');
      if (filename) {
        addToast(`Лог сохранён (${filename})`, 'success');
      }
    } catch {
      addToast('Ошибка выгрузки лога', 'error');
    }
  };

  const resetPanelSizes = () => {
    setSidebarWidth(256);
    setRightPanelWidth(288);
    addToast('Размеры панелей сброшены', 'info');
  };

  const settingsBody = (
    <div className="flex-1 flex flex-col md:flex-row min-h-0">
      {/* Tabs Nav: Horizontal scroll on mobile, vertical left column on desktop */}
      <div
        ref={tabsRef}
        className="flex md:flex-col overflow-x-auto md:overflow-visible md:w-48 border-b md:border-b-0 md:border-r border-white/[0.06] bg-panel p-2 gap-1 select-none shrink-0 scrollbar-none"
      >
        <button
          type="button"
          data-tab="ai"
          onClick={() => setActiveTab('ai')}
          className={`shrink-0 flex items-center gap-2 px-3 py-1.5 md:py-2 rounded-xl text-xs transition-colors text-left whitespace-nowrap cursor-pointer motion-press ${
            activeTab === 'ai'
              ? 'bg-white/10 text-white font-medium'
              : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <span>ИИ & Провайдеры</span>
        </button>

        <button
          type="button"
          data-tab="vault"
          onClick={() => setActiveTab('vault')}
          className={`shrink-0 flex items-center gap-2 px-3 py-1.5 md:py-2 rounded-xl text-xs transition-colors text-left whitespace-nowrap cursor-pointer motion-press ${
            activeTab === 'vault'
              ? 'bg-white/10 text-white font-medium'
              : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          <Database className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <span>Хранилище & Бэкап</span>
        </button>

        <button
          type="button"
          data-tab="devices"
          onClick={() => setActiveTab('devices')}
          data-testid="settings-tab-devices"
          className={`shrink-0 flex items-center gap-2 px-3 py-1.5 md:py-2 rounded-xl text-xs transition-colors text-left whitespace-nowrap cursor-pointer motion-press ${
            activeTab === 'devices'
              ? 'bg-white/10 text-white font-medium'
              : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          <Laptop className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <span>Устройства</span>
        </button>

        <button
          type="button"
          data-tab="sync"
          onClick={() => setActiveTab('sync')}
          data-testid="settings-tab-sync"
          className={`shrink-0 flex items-center gap-2 px-3 py-1.5 md:py-2 rounded-xl text-xs transition-colors text-left whitespace-nowrap cursor-pointer motion-press ${
            activeTab === 'sync'
              ? 'bg-white/10 text-white font-medium'
              : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          <RefreshCw className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <span>Синхронизация</span>
        </button>

        <button
          type="button"
          data-tab="ui"
          onClick={() => setActiveTab('ui')}
          className={`shrink-0 flex items-center gap-2 px-3 py-1.5 md:py-2 rounded-xl text-xs transition-colors text-left whitespace-nowrap cursor-pointer motion-press ${
            activeTab === 'ui'
              ? 'bg-white/10 text-white font-medium'
              : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          <Sliders className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <span>Интерфейс & Панели</span>
        </button>

        <button
          type="button"
          data-tab="shortcuts"
          onClick={() => setActiveTab('shortcuts')}
          className={`shrink-0 flex items-center gap-2 px-3 py-1.5 md:py-2 rounded-xl text-xs transition-colors text-left whitespace-nowrap cursor-pointer motion-press ${
            activeTab === 'shortcuts'
              ? 'bg-white/10 text-white font-medium'
              : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          <Keyboard className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <span>Горячие клавиши</span>
        </button>

        <button
          type="button"
          data-tab="logs"
          onClick={() => setActiveTab('logs')}
          data-testid="settings-tab-logs"
          className={`shrink-0 flex items-center gap-2 px-3 py-1.5 md:py-2 rounded-xl text-xs transition-colors text-left whitespace-nowrap cursor-pointer motion-press ${
            activeTab === 'logs'
              ? 'bg-white/10 text-white font-medium'
              : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          <Terminal className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <span>Логи & Диагностика</span>
        </button>
      </div>

          {/* Right Tab Content */}
          <form onSubmit={handleSave} className="flex-1 flex flex-col min-h-0 bg-surface">
            <div className="flex-1 overflow-y-auto p-4 pb-8 sm:pb-4">
              {activeTab === 'ai' && (
                <div className="flex flex-col gap-3">
                  {/* Top Switcher: Подписка vs Свой ключ */}
                  <div className="bg-panel border border-white/[0.06] rounded-xl p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-200">Источник моделей</span>
                      {isFreePlan ? (
                        <span className="text-[11px] font-mono text-zinc-500">Free · только свой ключ</span>
                      ) : (
                        <span className="text-[11px] font-mono text-emerald-400">Тариф {syncStatus.subscription.planLabel}</span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 bg-canvas-subtle p-1 rounded-lg border border-white/[0.06]">
                      <button
                        type="button"
                        data-testid="ai-source-subscription"
                        disabled={isFreePlan}
                        onClick={() => setSourceMode('subscription')}
                        className={`py-1.5 px-2 sm:px-3 rounded-md text-[11px] sm:text-xs font-medium motion-surface cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap ${
                          sourceMode === 'subscription' && !isFreePlan
                            ? 'bg-white/10 text-white shadow-sm border border-white/[0.08]'
                            : isFreePlan
                            ? 'opacity-40 text-zinc-600 cursor-not-allowed border border-transparent'
                            : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                        }`}
                        title={
                          isFreePlan
                            ? 'На тарифе Free облачный ИИ релея недоступен. Используйте свои ключи.'
                            : 'Использовать ИИ из подписки SLAG'
                        }
                      >
                        <span>Подписка SLAG</span>
                        {isFreePlan && (
                          <span className="text-[10px] font-mono text-zinc-500">
                            (заблокировано)
                          </span>
                        )}
                      </button>

                      <button
                        type="button"
                        data-testid="ai-source-byok"
                        onClick={() => setSourceMode('byok')}
                        className={`py-1.5 px-2 sm:px-3 rounded-md text-[11px] sm:text-xs font-medium motion-surface cursor-pointer flex items-center justify-center whitespace-nowrap ${
                          sourceMode === 'byok' || isFreePlan
                            ? 'bg-white/10 text-white shadow-sm font-semibold border border-white/[0.08]'
                            : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                        }`}
                      >
                        <span>Свой API-ключ</span>
                      </button>
                    </div>

                    {isFreePlan && (
                      <span className="text-2xs text-zinc-500">
                        На бесплатном тарифе доступен ввод личных ключей Groq или KIE.
                      </span>
                    )}
                  </div>

                  {/* Mode A: Subscription Gateway Mode (No API keys needed) */}
                  {sourceMode === 'subscription' && !isFreePlan ? (
                    <div className="bg-panel border border-white/[0.06] rounded-xl p-3.5 flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-200">Режим обработки</span>
                        <span className="text-[11px] font-mono text-zinc-500">
                          Шлюз: {syncEngine.getConfig().serverUrl.replace(/https?:\/\//, '')}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-1 bg-canvas-subtle p-1 rounded-lg border border-white/[0.06]">
                        <button
                          type="button"
                          onClick={() => setSubscriptionModel('fast')}
                          className={`py-1.5 text-xs font-medium rounded-md motion-surface cursor-pointer ${
                            subscriptionModel === 'fast'
                              ? 'bg-white/10 text-white shadow-sm border border-white/[0.08]'
                              : 'text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          Flash (быстрый)
                        </button>
                        <button
                          type="button"
                          onClick={() => setSubscriptionModel('smart')}
                          className={`py-1.5 text-xs font-medium rounded-md motion-surface cursor-pointer ${
                            subscriptionModel === 'smart'
                              ? 'bg-white/10 text-white shadow-sm border border-white/[0.08]'
                              : 'text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          Smart (умный)
                        </button>
                        <button
                          type="button"
                          onClick={() => setSubscriptionModel('deep')}
                          className={`py-1.5 text-xs font-medium rounded-md motion-surface cursor-pointer ${
                            subscriptionModel === 'deep'
                              ? 'bg-white/10 text-white shadow-sm border border-white/[0.08]'
                              : 'text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          Deep (логика)
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Mode B: BYOK (Bring Your Own Key) Settings */
                    <>
                      {/* Section 1: Выбор провайдера ИИ (Groq & KIE.AI) */}
                      <div className="bg-panel border border-white/[0.06] rounded-xl p-3 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-zinc-200">Провайдер</span>
                          <span className="text-[11px] font-mono text-zinc-500">
                            {provider === 'groq'
                              ? (groqApiKey ? '● Groq подключен' : '○ Ключ не указан')
                              : (kieApiKey ? '● KIE подключен' : '○ Ключ не указан')}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5 bg-canvas-subtle p-1 rounded-lg border border-white/[0.06]">
                          <button
                            type="button"
                            onClick={() => handleProviderChange('groq')}
                            className={`py-1.5 rounded-md text-xs font-medium motion-surface cursor-pointer ${
                              provider === 'groq'
                                ? 'bg-white/10 text-white shadow-sm border border-white/[0.08]'
                                : 'text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            Groq
                          </button>

                          <button
                            type="button"
                            onClick={() => handleProviderChange('kie')}
                            className={`py-1.5 rounded-md text-xs font-medium motion-surface cursor-pointer ${
                              provider === 'kie'
                                ? 'bg-white/10 text-white shadow-sm border border-white/[0.08]'
                                : 'text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            KIE.AI
                          </button>
                        </div>
                      </div>

                      {/* Section 2: Настройки Groq */}
                      {provider === 'groq' && (
                        <div className="bg-panel border border-white/[0.06] rounded-xl p-3.5 flex flex-col gap-3">
                          <div className="flex items-center justify-between pb-1.5 border-b border-white/[0.04]">
                            <span className="text-xs font-semibold text-zinc-100">Groq Cloud API</span>
                            <a
                              href="https://console.groq.com/keys"
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1 transition-colors"
                            >
                              <span>Получить ключ</span>
                              <ExternalLink className="w-3 h-3 text-zinc-500" />
                            </a>
                          </div>

                          <SecretKeyField
                            value={groqApiKey}
                            onChange={setGroqApiKey}
                            placeholder="gsk_..."
                          />

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[11px] font-medium text-zinc-300">Модель</label>
                              <Select
                                value={model}
                                onChange={(val) => setModel(val)}
                                options={[
                                  { value: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B (LPU)' },
                                  { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile' },
                                  { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant' },
                                ]}
                              />
                            </div>

                            <div className="flex flex-col gap-1.5">
                              <label className="text-[11px] font-medium text-zinc-300">Глубина рассуждений</label>
                              <Select
                                value={reasoningEffort}
                                onChange={(val) => setReasoningEffort(val as any)}
                                options={[
                                  { value: 'none', label: 'Отключено' },
                                  { value: 'low', label: 'Низкая' },
                                  { value: 'medium', label: 'Средняя' },
                                  { value: 'high', label: 'Высокая' },
                                ]}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Section 2: Настройки KIE.AI */}
                      {provider === 'kie' && (
                        <div className="bg-panel border border-white/[0.06] rounded-xl p-3.5 flex flex-col gap-3">
                          <div className="flex items-center justify-between pb-1.5 border-b border-white/[0.04]">
                            <span className="text-xs font-semibold text-zinc-100">KIE Cloud API</span>
                            <a
                              href="https://kie.ai/api-key"
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1 transition-colors"
                            >
                              <span>Получить ключ</span>
                              <ExternalLink className="w-3 h-3 text-zinc-500" />
                            </a>
                          </div>

                          <SecretKeyField
                            value={kieApiKey}
                            onChange={setKieApiKey}
                            placeholder="sk-kie-... или Bearer токен"
                          />

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[11px] font-medium text-zinc-300">Модель</label>
                              <Select
                                value={model}
                                onChange={(val) => setModel(val)}
                                options={[
                                  { value: 'deepseek-v4-1-flash', label: 'DeepSeek V4.1 Flash' },
                                  { value: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
                                ]}
                              />
                            </div>

                            <div className="flex flex-col gap-1.5">
                              <label className="text-[11px] font-medium text-zinc-300">Глубина рассуждений</label>
                              <Select
                                value={reasoningEffort}
                                onChange={(val) => setReasoningEffort(val as any)}
                                options={[
                                  { value: 'none', label: 'Отключено' },
                                  { value: 'low', label: 'Низкая' },
                                  { value: 'medium', label: 'Средняя' },
                                  { value: 'high', label: 'Высокая' },
                                ]}
                              />
                            </div>

                            <div className="flex flex-col gap-1.5">
                              <label className="text-[11px] font-medium text-zinc-300">Base URL</label>
                              <input
                                type="text"
                                value={kieBaseUrl}
                                onChange={(e) => setKieBaseUrl(e.target.value)}
                                placeholder="https://api.kie.ai"
                                className="w-full bg-black/50 border border-white/[0.08] focus:border-white/20 rounded-lg px-2.5 py-2 text-xs text-white placeholder-zinc-600 font-mono transition-colors"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Section 3: Автоматизация и интеллектуальные сервисы */}
                  <div className="bg-panel border border-white/[0.06] rounded-xl p-3.5 flex flex-col gap-3">
                    <div className="flex items-center justify-between pb-1.5 border-b border-white/[0.04]">
                      <span className="text-xs font-semibold text-zinc-100">
                        Автоматизация
                      </span>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Checkbox
                        checked={autoTagging}
                        onChange={setAutoTagging}
                        label="Автотегирование новых заметок"
                      />

                      <Checkbox
                        checked={autoTriage}
                        onChange={setAutoTriage}
                        label="AI-триаж (папки, задачи, приоритеты)"
                      />

                      <Checkbox
                        checked={webSearchEnabled}
                        onChange={setWebSearchEnabled}
                        label="Веб-поиск при ответах"
                      />
                    </div>
                  </div>

                  {/* Section 4: Норма таксономии и правила тегирования */}
                  <div className="bg-panel border border-white/[0.06] rounded-xl p-3.5 flex flex-col gap-3">
                    <div className="flex items-center justify-between pb-1.5 border-b border-white/[0.04]">
                      <span className="text-xs font-semibold text-zinc-100">
                        Правила тегов
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-medium text-zinc-300">Лимит тегов на запись</label>
                        <NumberInput
                          min={1}
                          max={8}
                          value={maxTags}
                          onChange={setMaxTags}
                          aria-label="Лимит тегов на запись"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-medium text-zinc-300">Стиль регистра тегов</label>
                        <Select
                          value={tagCaseStyle}
                          onChange={(val) => setTagCaseStyle(val as any)}
                          options={[
                            { value: 'lowercase', label: 'lowercase (#дизайн)' },
                            { value: 'kebab-case', label: 'kebab-case (#ui-ux)' },
                          ]}
                        />
                      </div>
                    </div>

                    <Checkbox
                      checked={allowNewTags}
                      onChange={setAllowNewTags}
                      label="Разрешить ИИ создавать новые теги"
                      className="pt-1"
                    />

                    <div className="flex flex-col gap-1.5 pt-1">
                      <label className="text-[11px] font-medium text-zinc-300">Пользовательские правила промпта</label>
                      <textarea
                        rows={2}
                        value={customTagRules}
                        onChange={(e) => setCustomTagRules(e.target.value)}
                        placeholder="Например: Не использовать тег #general. Для задач по коду предпочитать #frontend или #backend."
                        className="bg-black/50 border border-white/[0.08] focus:border-white/20 rounded-lg p-2.5 text-xs text-white placeholder-zinc-600 resize-none transition-colors"
                      />
                    </div>
                  </div>
                </div>
              )}

            {activeTab === 'vault' && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-zinc-200">
                    Резервное копирование и точки отката
                  </span>
                </div>

                {/* Auto-backup settings card */}
                <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.05] flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Clock className="w-4 h-4 text-zinc-400 shrink-0" />
                      <div className="flex flex-col">
                        <span className="text-xs font-medium text-zinc-200">Автобэкап раз в сутки</span>
                        <span className="text-[10px] text-zinc-500">Хранятся последние 7 снимков с автоудалением старых</span>
                      </div>
                    </div>
                    <Checkbox
                      checked={backupSettings.autoBackupEnabled}
                      onChange={(checked) => updateBackupSettings({ autoBackupEnabled: checked })}
                      aria-label="Автобэкап раз в сутки"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-white/[0.04]">
                    <span className="text-[11px] font-mono text-zinc-500">
                      {backupSettings.lastBackupAt
                        ? `Последний снимок: ${new Date(backupSettings.lastBackupAt).toLocaleString('ru-RU', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}`
                        : 'Снимков пока нет'}
                    </span>
                    <button
                      type="button"
                      data-testid="btn-create-snapshot"
                      onClick={handleCreateSnapshot}
                      disabled={isCreatingSnapshot}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white bg-white/10 hover:bg-white/15 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isCreatingSnapshot ? 'animate-spin' : ''}`} />
                      <span>{isCreatingSnapshot ? 'Создание...' : 'Создать снимок'}</span>
                    </button>
                  </div>
                </div>

                {/* Snapshots list */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-zinc-400">
                      Точки восстановления ({backupSnapshots.length})
                    </span>
                  </div>

                  {backupSnapshots.length === 0 ? (
                    <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.05] text-center text-xs text-zinc-500">
                      Точек восстановления пока нет. Создайте первый снимок или дождитесь автобэкапа.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1">
                      {backupSnapshots.map((snap) => {
                        const dateStr = new Date(snap.createdAt).toLocaleString('ru-RU', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        });
                        const sizeKb = Math.round(snap.sizeBytes / 1024);
                        return (
                          <div
                            key={snap.id}
                            data-testid={`snapshot-item-${snap.id}`}
                            className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Archive className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                              <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium text-zinc-200 truncate">{dateStr}</span>
                                  <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-white/[0.04] text-zinc-400 border border-white/[0.06]">
                                    {snap.trigger === 'auto' ? 'Авто' : 'Ручной'}
                                  </span>
                                </div>
                                <div className="text-[11px] font-mono text-zinc-500">
                                  {snap.notesCount} зам. · {snap.attachmentsCount} мед. · {sizeKb} КБ
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                data-testid={`btn-restore-snapshot-${snap.id}`}
                                onClick={() => handleRestoreSnapshot(snap.id)}
                                disabled={isRestoring}
                                className="px-2 py-1 rounded text-xs font-medium text-zinc-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] transition-colors disabled:opacity-50 cursor-pointer"
                                title="Восстановить хранилище из этого снимка"
                              >
                                Восстановить
                              </button>
                              <button
                                type="button"
                                onClick={() => downloadSnapshot(snap.id)}
                                className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                                title="Скачать ZIP архива"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteSnapshot(snap.id)}
                                className="p-1.5 rounded text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                title="Удалить снимок"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Export & Import actions */}
                <div className="flex flex-col gap-2 pt-2 border-t border-white/[0.04]">
                  <span className="text-[11px] font-medium text-zinc-400">Экспорт и импорт</span>

                  <button
                    type="button"
                    data-testid="btn-export-zip"
                    onClick={handleExportZip}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-xs text-zinc-200 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Download className="w-4 h-4 text-zinc-400 shrink-0" />
                      <span className="font-medium">Экспорт в ZIP (заметки и медиа)</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportJson}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-xs text-zinc-200 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Download className="w-4 h-4 text-zinc-400 shrink-0" />
                      <span className="font-medium">Экспорт структуры в JSON</span>
                    </div>
                  </button>

                  <label className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-xs text-zinc-200 transition-colors cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Upload className="w-4 h-4 text-zinc-400 shrink-0" />
                      <span className="font-medium">Восстановить из файла (.zip / .json)</span>
                    </div>
                    <input
                      type="file"
                      accept=".zip,.json"
                      className="hidden"
                      onChange={handleFileImport}
                    />
                  </label>
                </div>

                {/* System folders (Desktop Only) */}
                {!isMobile && (
                  <div className="flex flex-col gap-2 pt-2 border-t border-white/[0.04]">
                    <span className="text-[11px] font-medium text-zinc-400">Системные каталоги</span>

                    <button
                      type="button"
                      onClick={handleOpenNotesFolder}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-xs text-zinc-200 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <FolderOpen className="w-4 h-4 text-zinc-400 shrink-0" />
                        <span className="font-medium">Открыть папку заметок на диске</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={handleOpenBackupsFolder}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-xs text-zinc-200 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <HardDrive className="w-4 h-4 text-zinc-400 shrink-0" />
                        <span className="font-medium">Открыть папку бэкапов на диске</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={handleOpenLogsFolder}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-xs text-zinc-200 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-zinc-400 shrink-0" />
                        <span className="font-medium">Открыть папку системных логов</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadLogFile}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-xs text-zinc-200 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-zinc-400 shrink-0" />
                        <span className="font-medium">Скачать системный лог (.log)</span>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'devices' && (
              <DevicesSettingsTab addToast={addToast} />
            )}

            {activeTab === 'sync' && (
              <SyncSettingsTab addToast={addToast} />
            )}

            {activeTab === 'ui' && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-200">
                    Внешний вид, масштабы и плотность
                  </span>
                  {/* Device profile switcher */}
                  {!isMobile && (
                    <div className="flex items-center h-ctrl-sm bg-canvas p-0.5 rounded-lg border border-white/[0.08]">
                      <button
                        type="button"
                        onClick={() => setSelectedDevice('desktop')}
                        className={`h-full px-2.5 rounded-md text-xs font-medium motion-surface cursor-pointer ${
                          selectedDevice === 'desktop'
                            ? 'bg-white/10 text-white shadow-sm border border-white/[0.08]'
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent'
                        }`}
                      >
                        Десктоп
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedDevice('mobile')}
                        className={`h-full px-2.5 rounded-md text-xs font-medium motion-surface cursor-pointer ${
                          selectedDevice === 'mobile'
                            ? 'bg-white/10 text-white shadow-sm border border-white/[0.08]'
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent'
                        }`}
                      >
                        Смартфон
                      </button>
                    </div>
                  )}
                </div>

                {/* Font Scale Control */}
                <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-300">Масштаб шрифтов и типографики:</span>
                    <span className="text-2xs font-mono text-zinc-400">
                      {FONT_SCALE_OPTIONS[uiConfig[selectedDevice].fontScale]?.label} ({FONT_SCALE_OPTIONS[uiConfig[selectedDevice].fontScale]?.percentage})
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {(Object.keys(FONT_SCALE_OPTIONS) as Array<keyof typeof FONT_SCALE_OPTIONS>).map((scaleKey) => {
                      const opt = FONT_SCALE_OPTIONS[scaleKey];
                      const isSelected = uiConfig[selectedDevice].fontScale === scaleKey;
                      return (
                        <button
                          key={scaleKey}
                          type="button"
                          onClick={() => updateUiConfig(selectedDevice, { fontScale: scaleKey })}
                          className={`h-ctrl-md px-2 rounded-lg text-xs font-medium motion-surface cursor-pointer border ${
                            isSelected
                              ? 'bg-white/10 text-white border-white/20 shadow-sm'
                              : 'bg-white/[0.02] text-zinc-400 border-white/[0.04] hover:bg-white/[0.06]'
                          }`}
                        >
                          {opt.label} ({opt.percentage})
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Font Family Control */}
                <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-300">Гарнитура шрифта (Семейство):</span>
                    <span className="text-2xs font-mono text-zinc-400">
                      {FONT_FAMILY_OPTIONS[uiConfig[selectedDevice].fontFamily || 'inter']?.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(Object.keys(FONT_FAMILY_OPTIONS) as Array<keyof typeof FONT_FAMILY_OPTIONS>).map((famKey) => {
                      const opt = FONT_FAMILY_OPTIONS[famKey];
                      const isSelected = (uiConfig[selectedDevice].fontFamily || 'inter') === famKey;
                      return (
                        <button
                          key={famKey}
                          type="button"
                          onClick={() => updateUiConfig(selectedDevice, { fontFamily: famKey })}
                          className={`h-ctrl-md px-2 rounded-lg text-xs font-medium motion-surface cursor-pointer border ${
                            isSelected
                              ? 'bg-white/10 text-white border-white/20 shadow-sm'
                              : 'bg-white/[0.02] text-zinc-400 border-white/[0.04] hover:bg-white/[0.06]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-2xs text-zinc-500 leading-relaxed">
                    {FONT_FAMILY_OPTIONS[uiConfig[selectedDevice].fontFamily || 'inter']?.description}
                  </span>
                </div>

                {/* Live Interactive Hierarchy Preview Card (Desktop Only) */}
                {!isMobile && (
                  <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-surface border border-white/[0.08] shadow-inner select-none">
                    <div className="flex items-center justify-between border-b border-white/[0.05] pb-2">
                      <span className="text-2xs font-mono uppercase tracking-wider text-zinc-500">
                        Интерактивный образец иерархии внимания
                      </span>
                      <span className="text-2xs font-mono text-blue-400/90">
                        Live Preview
                      </span>
                    </div>

                    {/* Sample Card */}
                    <div className="flex flex-col gap-1.5 pt-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-base font-medium text-zinc-100 tracking-tight">
                          Заголовок заметки или ключевая задача
                        </span>
                      </div>
                      <p className="text-sm text-zinc-300 leading-relaxed font-normal">
                        Основной текст заметки с комфортным размером и межстрочным интервалом для чтения.
                      </p>
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/[0.04]">
                        <span className="text-xs text-zinc-400">
                          Входящие • #дизайн #типографика
                        </span>
                        <span className="text-2xs font-mono text-zinc-500">
                          14:30 • Статья
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Density Control */}
                <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-300">Плотность сетки и хитбоксов:</span>
                    <span className="text-2xs font-mono text-zinc-500 uppercase">
                      {uiConfig[selectedDevice].density}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => updateUiConfig(selectedDevice, { density: 'compact' })}
                      className={`h-ctrl-md px-2 rounded-lg text-xs font-medium motion-surface cursor-pointer border ${
                        uiConfig[selectedDevice].density === 'compact'
                          ? 'bg-white/10 text-white border-white/20'
                          : 'bg-white/[0.02] text-zinc-400 border-white/[0.04] hover:bg-white/[0.06]'
                      }`}
                    >
                      Компактный
                    </button>
                    <button
                      type="button"
                      onClick={() => updateUiConfig(selectedDevice, { density: 'normal' })}
                      className={`h-ctrl-md px-2 rounded-lg text-xs font-medium motion-surface cursor-pointer border ${
                        uiConfig[selectedDevice].density === 'normal'
                          ? 'bg-white/10 text-white border-white/20'
                          : 'bg-white/[0.02] text-zinc-400 border-white/[0.04] hover:bg-white/[0.06]'
                      }`}
                    >
                      Стандарт
                    </button>
                    <button
                      type="button"
                      onClick={() => updateUiConfig(selectedDevice, { density: 'spacious' })}
                      className={`h-ctrl-md px-2 rounded-lg text-xs font-medium motion-surface cursor-pointer border ${
                        uiConfig[selectedDevice].density === 'spacious'
                          ? 'bg-white/10 text-white border-white/20'
                          : 'bg-white/[0.02] text-zinc-400 border-white/[0.04] hover:bg-white/[0.06]'
                      }`}
                    >
                      Просторный / Тач
                    </button>
                  </div>
                </div>

                {/* Panel Resizing Reset (Desktop Only) */}
                {!isMobile && (
                  <div className="flex flex-col gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-300">Размеры панелей:</span>
                      <button
                        type="button"
                        onClick={resetPanelSizes}
                        className="h-ctrl-sm flex items-center gap-1 px-2.5 rounded-md bg-white/[0.06] hover:bg-white/[0.1] text-zinc-200 text-xs transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Сбросить размеры</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'shortcuts' && (
              <div className="flex flex-col gap-4">
                {/* System-level OS Integration Card (Desktop Only) */}
                {!isMobile && platformInfo && (
                  <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-zinc-200">
                          Глобальный вызов в операционной системе
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-mono uppercase bg-white/5 border border-white/[0.08] text-zinc-400">
                          {platformInfo.os} • {platformInfo.desktopEnvironment} ({platformInfo.sessionType})
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            platformInfo.isHotkeyRegistered ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                          }`}
                        />
                        <span className="text-[11px] font-mono text-zinc-300">
                          {platformInfo.shortcut}
                        </span>
                      </div>
                    </div>

                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      {platformInfo.details}
                    </p>

                    {platformInfo.hotkeyBackend === 'gnome_gsettings' && (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          disabled={isUpdatingHotkey}
                          onClick={handleSetupHotkey}
                          className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-zinc-200 transition-colors cursor-pointer motion-press disabled:opacity-50"
                        >
                          {platformInfo.isHotkeyRegistered ? 'Актуализировать путь' : 'Привязать хоткей в GNOME'}
                        </button>
                        {platformInfo.isHotkeyRegistered && (
                          <button
                            type="button"
                            disabled={isUpdatingHotkey}
                            onClick={handleRemoveHotkey}
                            className="px-2.5 py-1 rounded-lg hover:bg-red-500/10 text-xs text-red-400 hover:text-red-300 transition-colors cursor-pointer motion-press disabled:opacity-50"
                          >
                            Отвязать
                          </button>
                        )}
                      </div>
                    )}

                    {platformInfo.hotkeyBackend === 'custom_launcher' && (
                      <div className="flex flex-col gap-1.5 pt-1">
                        <span className="text-[10px] text-zinc-500 font-mono">
                          Команда для вызова в конфиге вашего WM (Hyprland / Sway / i3):
                        </span>
                        <code className="text-[11px] font-mono p-1.5 rounded bg-black/40 text-emerald-400 border border-white/[0.05] select-all">
                          {platformInfo.executablePath} --quick
                        </code>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-zinc-200">
                    Глобальные команды и шорткаты
                  </span>
                  <span className="text-[11px] text-zinc-500">
                    Работают в любом месте приложения (одиночные клавиши срабатывают вне полей ввода)
                  </span>
                </div>

                <div className="flex flex-col gap-1 text-xs">
                  {APP_COMMANDS.filter(c => c.shortcut).map(cmd => {
                    const shortcuts = [cmd.shortcut, ...(cmd.aliases || [])]
                      .filter(Boolean)
                      .map(s => formatShortcut(s!))
                      .join(' / ');
                    return (
                      <div key={cmd.id} className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
                        <div className="flex flex-col">
                          <span className="text-zinc-300 font-medium">{cmd.title}</span>
                          {!isMobile && cmd.description && (
                            <span className="text-[10px] text-zinc-500">{cmd.description}</span>
                          )}
                        </div>
                        <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px] text-zinc-200 border border-white/[0.06] shrink-0 ml-3">
                          {shortcuts}
                        </kbd>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-col gap-1 pt-2">
                  <span className="text-xs font-semibold text-zinc-200">
                    Редактор, модальные окна и ввод
                  </span>
                </div>

                <div className="flex flex-col gap-1 text-xs">
                  <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
                    <span className="text-zinc-400">Сохранить запись (редактор)</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px] text-zinc-200 border border-white/[0.06]">
                      {formatShortcut('mod+s')}
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
                    <span className="text-zinc-400">Применить AI Diff</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px] text-zinc-200 border border-white/[0.06]">
                      {formatShortcut('mod+enter')}
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
                    <span className="text-zinc-400">Отправить запись (композер)</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px] text-zinc-200 border border-white/[0.06]">Enter</kbd>
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
                    <span className="text-zinc-400">Перенос строки</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px] text-zinc-200 border border-white/[0.06]">Shift + Enter</kbd>
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
                    <span className="text-zinc-400">Закрыть окно / Esc</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px] text-zinc-200 border border-white/[0.06]">Esc</kbd>
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
                    <span className="text-zinc-400">Контекстное меню</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px] text-zinc-200 border border-white/[0.06]">ПКМ</kbd>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'logs' && (
              <div className="h-[490px] -m-5 flex flex-col">
                <LogViewer variant="dock" />
              </div>
            )}
            </div>

            {/* Bottom Form Actions */}
            <div
              className="flex justify-end gap-2 px-5 py-3 border-t border-white/[0.06] bg-panel shrink-0"
              style={{ paddingBottom: 'max(var(--sab), 0.75rem)' }}
            >
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                Закрыть
              </button>
              {activeTab !== 'logs' && activeTab !== 'shortcuts' && activeTab !== 'devices' && (
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-white text-black font-semibold text-xs hover:bg-zinc-200 transition-colors cursor-pointer shadow-sm motion-press"
                >
                  Сохранить
                </button>
              )}
            </div>
          </form>
        </div>
  );

  if (isMobile) {
    // Fullscreen navigation, not an overlay: unmount on close so the settings root
    // underneath is not duplicated while a fading copy of this screen lingers.
    if (!isSettingsOpen) return null;
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Настройки"
        className="fixed inset-0 z-50 bg-canvas flex flex-col select-none motion-fade overflow-hidden"
      >
        {/* Top Header */}
        <div
          className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between shrink-0 bg-panel"
          style={{ paddingTop: 'max(var(--sat), 0.75rem)' }}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="p-1.5 -ml-1 text-zinc-400 hover:text-white cursor-pointer motion-press"
              title="Назад"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h3 className="text-sm font-semibold text-white">
              Настройки
              <span className="text-zinc-500 font-normal ml-2">
                / {
                  activeTab === 'ai' ? 'ИИ & Провайдеры' :
                  activeTab === 'vault' ? 'Хранилище & Бэкап' :
                  activeTab === 'devices' ? 'Устройства' :
                  activeTab === 'sync' ? 'Синхронизация' :
                  activeTab === 'ui' ? 'Интерфейс & Панели' :
                  activeTab === 'shortcuts' ? 'Горячие клавиши' :
                  'Логи & Диагностика'
                }
              </span>
            </h3>
          </div>
        </div>

        {/* Form Body */}
        {settingsBody}
      </div>
    );
  }

  return (
    <BaseModal
      presence={presence}
      isOpen={isSettingsOpen}
      onClose={() => setIsSettingsOpen(false)}
      hideHeader
      maxWidth="md:max-w-[740px]"
      maxHeight="h-full md:h-[720px] md:max-h-[88vh]"
      contentClassName="flex flex-col h-full overflow-hidden"
      containerClassName="rounded-none md:rounded-2xl border-0 md:border md:border-white/[0.08]"
    >
      {/* Top Header */}
      <div
        className="px-4 md:px-5 py-3 border-b border-white/[0.06] flex items-center justify-between shrink-0 bg-panel"
        style={{ paddingTop: 'max(var(--sat), 0.75rem)' }}
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center text-white hidden md:flex">
            <Settings className="w-3.5 h-3.5" />
          </div>
          <h3 className="text-sm font-semibold text-white">
            Настройки
          </h3>
        </div>
        <button
          onClick={() => setIsSettingsOpen(false)}
          className="p-1 rounded text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors hidden md:block cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {settingsBody}
    </BaseModal>
  );
};
