import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { storage } from '../../lib/storage';
import type { AiProvider } from '../../types';
import {
  Settings,
  X,
  Sparkles,
  Download,
  Upload,
  Eye,
  EyeOff,
  ExternalLink,
  Database,
  Sliders,
  Keyboard,
  RotateCcw,
  Terminal,
  ArrowLeft
} from 'lucide-react';
import { LogViewer } from '../Logs/LogViewer';
import { Select } from '../UI/Select';
import { Checkbox } from '../UI/Checkbox';
import { NumberInput } from '../UI/NumberInput';
import { BaseModal } from './BaseModal';

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
    uiConfig,
    updateUiConfig,
    isMobile
  } = useApp();

  const [selectedDevice, setSelectedDevice] = useState<'desktop' | 'mobile'>(isMobile ? 'mobile' : 'desktop');

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
  const [showKey, setShowKey] = useState(false);

  if (!isSettingsOpen) return null;

  const handleProviderChange = (newProvider: AiProvider) => {
    setProvider(newProvider);
    if (newProvider === 'groq') {
      setModel('openai/gpt-oss-120b');
    } else if (newProvider === 'kie') {
      setModel('gemini-4-argon-openai');
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveAiSettings({
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

  const handleExportJson = () => {
    const jsonStr = storage.exportVaultAsJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `slag_vault_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addToast('Резервная копия экспортирована', 'success');
  };

  const handleExportMarkdownFiles = () => {
    const files = storage.exportObsidianBundle();
    files.forEach((f, idx) => {
      setTimeout(() => {
        const blob = new Blob([f.content], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const cleanName = f.path.replace(/\//g, '_');
        a.download = cleanName;
        a.click();
        URL.revokeObjectURL(url);
      }, idx * 80);
    });
    addToast(`Экспортировано ${files.length} .md файлов`, 'success');
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const success = storage.importVaultFromJson(content);
      if (success) {
        refreshData();
        addToast('Хранилище восстановлено', 'success');
      } else {
        addToast('Ошибка формата файла', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const resetPanelSizes = () => {
    setSidebarWidth(256);
    setRightPanelWidth(288);
    addToast('Размеры панелей сброшены', 'info');
  };

  return (
    <BaseModal
      isOpen={isSettingsOpen}
      onClose={() => setIsSettingsOpen(false)}
      hideHeader
      maxWidth="md:max-w-[720px]"
      maxHeight="h-full md:h-[670px]"
      contentClassName="flex flex-col h-full overflow-hidden"
      containerClassName="rounded-none md:rounded-2xl border-0 md:border md:border-white/[0.08]"
    >
      {/* Top Header */}
      <div
        className="px-4 md:px-5 py-3 border-b border-white/[0.06] flex items-center justify-between shrink-0 bg-[#0c0c0e]"
        style={{ paddingTop: 'max(var(--sat), 0.75rem)' }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSettingsOpen(false)}
            className="md:hidden p-1.5 -ml-1 text-zinc-400 hover:text-white cursor-pointer active:scale-95"
            title="Назад"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center text-white hidden md:flex">
            <Settings className="w-3.5 h-3.5" />
          </div>
          <h3 className="text-sm font-semibold text-white">
            Настройки
            <span className="md:hidden text-zinc-500 font-normal ml-2">
              / {
                activeTab === 'ai' ? 'ИИ & Провайдеры' :
                activeTab === 'vault' ? 'Хранилище & Бэкап' :
                activeTab === 'ui' ? 'Интерфейс & Панели' :
                activeTab === 'shortcuts' ? 'Горячие клавиши' :
                'Логи & Диагностика'
              }
            </span>
          </h3>
        </div>
        <button
          onClick={() => setIsSettingsOpen(false)}
          className="p-1 rounded text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors hidden md:block cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

        {/* Responsive Body: Tabs Navigation on Left (Desktop) or Hidden (Mobile), Tab Content */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0">
          {/* Tabs Nav: Hidden on mobile (single section subview), vertical left column on desktop */}
          <div className="hidden md:flex md:flex-col md:w-48 border-r border-white/[0.06] bg-[#0c0c0e] p-2 gap-1 select-none shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('ai')}
              className={`shrink-0 flex items-center gap-2 px-3 py-1.5 md:py-2 rounded-xl text-xs transition-colors text-left whitespace-nowrap cursor-pointer active:scale-95 ${
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
              onClick={() => setActiveTab('vault')}
              className={`shrink-0 flex items-center gap-2 px-3 py-1.5 md:py-2 rounded-xl text-xs transition-colors text-left whitespace-nowrap cursor-pointer active:scale-95 ${
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
              onClick={() => setActiveTab('ui')}
              className={`shrink-0 flex items-center gap-2 px-3 py-1.5 md:py-2 rounded-xl text-xs transition-colors text-left whitespace-nowrap cursor-pointer active:scale-95 ${
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
              onClick={() => setActiveTab('shortcuts')}
              className={`shrink-0 flex items-center gap-2 px-3 py-1.5 md:py-2 rounded-xl text-xs transition-colors text-left whitespace-nowrap cursor-pointer active:scale-95 ${
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
              onClick={() => setActiveTab('logs')}
              data-testid="settings-tab-logs"
              className={`shrink-0 flex items-center gap-2 px-3 py-1.5 md:py-2 rounded-xl text-xs transition-colors text-left whitespace-nowrap cursor-pointer active:scale-95 ${
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
          <form onSubmit={handleSave} className="flex-1 flex flex-col min-h-0 bg-[#141416]">
            <div className="flex-1 overflow-y-auto p-4">
              {activeTab === 'ai' && (
                <div className="flex flex-col gap-3">
                  {/* Section 1: Выбор провайдера ИИ (Groq & KIE.AI) */}
                  <div className="bg-[#101114] border border-white/[0.06] rounded-xl p-3.5 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                        Провайдер ИИ
                      </span>
                      <span className="text-[10px] font-mono text-zinc-500">
                        {provider === 'groq'
                          ? (groqApiKey ? '● Подключен к LPU' : '○ Ключ не указан')
                          : (kieApiKey ? '● Подключен к KIE' : '○ Ключ не указан')}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 bg-black/40 p-1 rounded-lg border border-white/[0.04]">
                      <button
                        type="button"
                        onClick={() => handleProviderChange('groq')}
                        className={`py-2 px-3 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          provider === 'groq'
                            ? 'bg-white/10 text-white shadow-sm font-semibold'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <span>Groq</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleProviderChange('kie')}
                        className={`py-2 px-3 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          provider === 'kie'
                            ? 'bg-white/10 text-white shadow-sm font-semibold'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <span>KIE.AI</span>
                      </button>
                    </div>
                  </div>

                  {/* Section 2: Настройки Groq */}
                  {provider === 'groq' && (
                    <div className="bg-[#101114] border border-white/[0.06] rounded-xl p-3.5 flex flex-col gap-3.5">
                      <div className="flex items-center justify-between pb-2 border-b border-white/[0.04]">
                        <span className="text-xs font-semibold text-zinc-100">Groq Cloud API</span>
                        <a
                          href="https://console.groq.com/keys"
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1 transition-colors"
                        >
                          <span>Получить API ключ</span>
                          <ExternalLink className="w-3 h-3 text-zinc-500" />
                        </a>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-medium text-zinc-300">Groq API Key</label>
                        <div className="relative">
                          <input
                            type={showKey ? 'text' : 'password'}
                            value={groqApiKey}
                            onChange={(e) => setGroqApiKey(e.target.value)}
                            placeholder="gsk_..."
                            className="w-full bg-black/50 border border-white/[0.08] focus:border-white/20 rounded-lg px-3 py-2 pr-10 text-xs text-white placeholder-zinc-600 font-mono transition-colors"
                          />
                          <button
                            type="button"
                            onClick={() => setShowKey(!showKey)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                          >
                            {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-medium text-zinc-300">Модель</label>
                          <Select
                            value={model}
                            onChange={(val) => setModel(val)}
                            options={[
                              { value: 'openai/gpt-oss-120b', label: 'OpenAI GPT-OSS 120B' },
                              { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
                              { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B' },
                              { value: 'llama-3.3-70b-specdec', label: 'Llama 3.3 70B SpecDec' },
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
                    <div className="bg-[#101114] border border-white/[0.06] rounded-xl p-3.5 flex flex-col gap-3.5">
                      <div className="flex items-center justify-between pb-2 border-b border-white/[0.04]">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-zinc-100">KIE Cloud API</span>
                          <span className="text-[10px] text-zinc-500 font-mono">Anthropic & OpenAI</span>
                        </div>
                        <a
                          href="https://kie.ai/api-key"
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1 transition-colors"
                        >
                          <span>Получить API ключ</span>
                          <ExternalLink className="w-3 h-3 text-zinc-500" />
                        </a>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-medium text-zinc-300">KIE.AI API Key / Token</label>
                        <div className="relative">
                          <input
                            type={showKey ? 'text' : 'password'}
                            value={kieApiKey}
                            onChange={(e) => setKieApiKey(e.target.value)}
                            placeholder="sk-kie-... или Bearer токен"
                            className="w-full bg-black/50 border border-white/[0.08] focus:border-white/20 rounded-lg px-3 py-2 pr-10 text-xs text-white placeholder-zinc-600 font-mono transition-colors"
                          />
                          <button
                            type="button"
                            onClick={() => setShowKey(!showKey)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                          >
                            {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-medium text-zinc-300">Модель</label>
                          <Select
                            value={model}
                            onChange={(val) => setModel(val)}
                            options={[
                              { value: 'gemini-4-argon-openai', label: 'Gemini 4 Argon' },
                              { value: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 ($0.06/1M, 1M ctx)' },
                              { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (Anthropic)' },
                              { value: 'gemini-3-8-flash-openai', label: 'Gemini 3.8 Flash (Дешёвый)' },
                              { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5 (Anthropic)' },
                              { value: 'deepseek-v4-1-flash', label: 'DeepSeek V4.1 Flash' },
                              { value: 'gpt-5-2', label: 'GPT 5.2' },
                              { value: 'grok-4-5', label: 'Grok 4.5' },
                              { value: 'openai/gpt-oss-120b', label: 'OpenAI GPT-OSS 120B' },
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
                          <label className="text-[11px] font-medium text-zinc-300">Base URL эндпоинта</label>
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

                  {/* Section 3: Автоматизация и интеллектуальные сервисы */}
                  <div className="bg-[#101114] border border-white/[0.06] rounded-xl p-3.5 flex flex-col gap-3">
                    <div className="flex items-center justify-between pb-2 border-b border-white/[0.04]">
                      <span className="text-xs font-semibold text-zinc-100">
                        Автоматизация и поиск
                      </span>
                    </div>

                    <div className="flex flex-col gap-2.5">
                      <Checkbox
                        checked={autoTagging}
                        onChange={setAutoTagging}
                        label="Автоматический подбор тегов"
                      />

                      <Checkbox
                        checked={autoTriage}
                        onChange={setAutoTriage}
                        label="Интеллектуальная диспетчеризация (AI Triage)"
                      />

                      <Checkbox
                        checked={webSearchEnabled}
                        onChange={setWebSearchEnabled}
                        label="Поиск в реальном времени (Web Search)"
                      />
                    </div>
                  </div>

                  {/* Section 4: Норма таксономии и правила тегирования */}
                  <div className="bg-[#101114] border border-white/[0.06] rounded-xl p-3.5 flex flex-col gap-3">
                    <div className="flex items-center justify-between pb-2 border-b border-white/[0.04]">
                      <span className="text-xs font-semibold text-zinc-100">
                        Норма таксономии и правила тегирования
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 items-center">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-medium text-zinc-300">Максимум тегов на запись</label>
                        <NumberInput
                          min={1}
                          max={8}
                          value={maxTags}
                          onChange={setMaxTags}
                          aria-label="Максимум тегов на запись"
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
                      label="Разрешить ИИ создавать новые теги (если выкл — строгий выбор из имеющихся)"
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
              <div className="flex flex-col gap-3">
                <span className="text-xs font-semibold text-zinc-200">
                  Резервное копирование и Obsidian
                </span>

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleExportMarkdownFiles}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-xs text-zinc-200 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Download className="w-4 h-4 text-zinc-400" />
                      <div className="text-left">
                        <div className="font-medium">Экспорт в .md (Obsidian Vault)</div>
                        <div className="text-[10px] text-zinc-500">Заметки в чистом Markdown с YAML Frontmatter</div>
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportJson}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-xs text-zinc-200 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Download className="w-4 h-4 text-zinc-400" />
                      <div className="text-left">
                        <div className="font-medium">Полный бэкап в JSON</div>
                        <div className="text-[10px] text-zinc-500">Экспорт структуры, заметок и настроек</div>
                      </div>
                    </div>
                  </button>

                  <label className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-xs text-zinc-200 transition-colors cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Upload className="w-4 h-4 text-zinc-400" />
                      <div className="text-left">
                        <div className="font-medium">Восстановить из JSON</div>
                        <div className="text-[10px] text-zinc-500">Загрузить ранее сохраненный бэкап</div>
                      </div>
                    </div>
                    <input
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={handleImportJson}
                    />
                  </label>
                </div>
              </div>
            )}

            {activeTab === 'ui' && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-200">
                    Внешний вид, масштабы и плотность
                  </span>
                  {/* Device profile switcher */}
                  <div className="flex items-center h-ctrl-sm bg-[#09090b] p-0.5 rounded-lg border border-white/[0.08]">
                    <button
                      type="button"
                      onClick={() => setSelectedDevice('desktop')}
                      className={`h-full px-2.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
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
                      className={`h-full px-2.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                        selectedDevice === 'mobile'
                          ? 'bg-white/10 text-white shadow-sm border border-white/[0.08]'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent'
                      }`}
                    >
                      Смартфон
                    </button>
                  </div>
                </div>

                {/* Font Scale Control */}
                <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-300">Масштаб шрифтов и типографики:</span>
                    <span className="text-2xs font-mono text-zinc-500">
                      {uiConfig[selectedDevice].fontScale === 'small' ? '90%' : uiConfig[selectedDevice].fontScale === 'large' ? '115%' : '100%'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => updateUiConfig(selectedDevice, { fontScale: 'small' })}
                      className={`h-ctrl-md px-2 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
                        uiConfig[selectedDevice].fontScale === 'small'
                          ? 'bg-white/10 text-white border-white/20'
                          : 'bg-white/[0.02] text-zinc-400 border-white/[0.04] hover:bg-white/[0.06]'
                      }`}
                    >
                      Мелкий (90%)
                    </button>
                    <button
                      type="button"
                      onClick={() => updateUiConfig(selectedDevice, { fontScale: 'normal' })}
                      className={`h-ctrl-md px-2 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
                        uiConfig[selectedDevice].fontScale === 'normal'
                          ? 'bg-white/10 text-white border-white/20'
                          : 'bg-white/[0.02] text-zinc-400 border-white/[0.04] hover:bg-white/[0.06]'
                      }`}
                    >
                      Обычный (100%)
                    </button>
                    <button
                      type="button"
                      onClick={() => updateUiConfig(selectedDevice, { fontScale: 'large' })}
                      className={`h-ctrl-md px-2 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
                        uiConfig[selectedDevice].fontScale === 'large'
                          ? 'bg-white/10 text-white border-white/20'
                          : 'bg-white/[0.02] text-zinc-400 border-white/[0.04] hover:bg-white/[0.06]'
                      }`}
                    >
                      Крупный (115%)
                    </button>
                  </div>
                  <span className="text-2xs text-zinc-500 leading-relaxed">
                    Масштабирует базовый шрифт заметок, карточек и интерфейса без искажения пропорций.
                  </span>
                </div>

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
                      className={`h-ctrl-md px-2 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
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
                      className={`h-ctrl-md px-2 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
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
                      className={`h-ctrl-md px-2 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
                        uiConfig[selectedDevice].density === 'spacious'
                          ? 'bg-white/10 text-white border-white/20'
                          : 'bg-white/[0.02] text-zinc-400 border-white/[0.04] hover:bg-white/[0.06]'
                      }`}
                    >
                      Просторный / Тач
                    </button>
                  </div>
                  <span className="text-2xs text-zinc-500 leading-relaxed">
                    Регулирует высоту контролов (26px–34px), зону тапа и отступы между карточками в ленте.
                  </span>
                </div>

                {/* Panel Resizing Reset */}
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
                  <span className="text-2xs text-zinc-500">
                    Панели можно перетаскивать за разделители левой и правой границы.
                  </span>
                </div>
              </div>
            )}

            {activeTab === 'shortcuts' && (
              <div className="flex flex-col gap-3">
                <span className="text-xs font-semibold text-zinc-200">
                  Клавиатурные комбинации
                </span>

                <div className="flex flex-col gap-1 text-xs">
                  <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
                    <span className="text-zinc-400">Быстрый поиск</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px] text-zinc-200">Cmd / Ctrl + K</kbd>
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
                    <span className="text-zinc-400">Переключение Лента / Ассистент</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px] text-zinc-200">Cmd / Ctrl + J</kbd>
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
                    <span className="text-zinc-400">Системные логи & HUD</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px] text-zinc-200">Cmd / Ctrl + `</kbd>
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
                    <span className="text-zinc-400">Отправить запись</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px] text-zinc-200">Enter</kbd>
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
                    <span className="text-zinc-400">Перенос строки</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px] text-zinc-200">Shift + Enter</kbd>
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
                    <span className="text-zinc-400">Закрыть окно / Полноэкранный режим</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px] text-zinc-200">Esc</kbd>
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
                    <span className="text-zinc-400">Контекстное меню</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px] text-zinc-200">ПКМ (Правый клик)</kbd>
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
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-white/[0.06] bg-[#0c0c0e] shrink-0">
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white transition-colors"
              >
                Закрыть
              </button>
              {activeTab !== 'logs' && (
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-white text-black font-semibold text-xs hover:bg-zinc-200 transition-colors cursor-pointer"
                >
                  Сохранить
                </button>
              )}
            </div>
          </form>
        </div>
    </BaseModal>
  );
};
