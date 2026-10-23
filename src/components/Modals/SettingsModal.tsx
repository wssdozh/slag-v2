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
  Terminal
} from 'lucide-react';
import { LogViewer } from '../Logs/LogViewer';

export const SettingsModal: React.FC = () => {
  const {
    isSettingsOpen,
    setIsSettingsOpen,
    aiSettings,
    saveAiSettings,
    setSidebarWidth,
    setRightPanelWidth,
    refreshData,
    addToast
  } = useApp();

  const [activeTab, setActiveTab] = useState<'ai' | 'vault' | 'ui' | 'shortcuts' | 'logs'>('ai');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-[720px] rounded-2xl bg-[#141416] border border-white/[0.08] shadow-2xl flex flex-col overflow-hidden h-[670px] max-h-[94vh]">
        {/* Top Header */}
        <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center text-white">
              <Settings className="w-3.5 h-3.5" />
            </div>
            <h3 className="text-sm font-semibold text-white">Настройки</h3>
          </div>
          <button
            onClick={() => setIsSettingsOpen(false)}
            className="p-1 rounded text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 2-Column Body: Tabs Navigation on Left, Tab Content on Right */}
        <div className="flex-1 flex min-h-0">
          {/* Left Tabs Nav */}
          <div className="w-48 border-r border-white/[0.06] bg-[#0c0c0e] p-2 flex flex-col gap-1 select-none shrink-0">
            <button
              onClick={() => setActiveTab('ai')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors text-left ${
                activeTab === 'ai'
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <span>ИИ & Провайдеры</span>
            </button>

            <button
              onClick={() => setActiveTab('vault')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors text-left ${
                activeTab === 'vault'
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Database className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <span>Хранилище & Бэкап</span>
            </button>

            <button
              onClick={() => setActiveTab('ui')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors text-left ${
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
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors text-left ${
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
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors text-left ${
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
                        <span>⚡ Groq (Рекомендуется)</span>
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
                        <span>🧠 KIE.AI</span>
                      </button>
                    </div>
                  </div>

                  {/* Section 2: Настройки Groq */}
                  {provider === 'groq' && (
                    <div className="bg-[#101114] border border-white/[0.06] rounded-xl p-3.5 flex flex-col gap-3.5">
                      <div className="flex items-center justify-between pb-2 border-b border-white/[0.04]">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-zinc-100">Groq Cloud API</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                            500+ t/s LPU
                          </span>
                        </div>
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

                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-medium text-zinc-300">Модель</label>
                          <select
                            value={model}
                            onChange={(e) => setModel(e.target.value)}
                            className="bg-black/50 border border-white/[0.08] focus:border-white/20 rounded-lg px-3 py-2 text-xs text-zinc-200 transition-colors"
                          >
                            <option value="openai/gpt-oss-120b">OpenAI GPT-OSS 120B (500 t/s, 128K, Рекомендуется)</option>
                            <option value="llama-3.3-70b-versatile">Llama 3.3 70B Versatile (280 t/s, 128K)</option>
                            <option value="llama-3.1-8b-instant">Llama 3.1 8B Instant (560 t/s, 128K)</option>
                            <option value="llama-3.3-70b-specdec">Llama 3.3 70B SpecDec</option>
                          </select>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-medium text-zinc-300">Глубина рассуждений (Reasoning)</label>
                          <select
                            value={reasoningEffort}
                            onChange={(e) => setReasoningEffort(e.target.value as any)}
                            className="bg-black/50 border border-white/[0.08] focus:border-white/20 rounded-lg px-3 py-2 text-xs text-zinc-200 transition-colors"
                          >
                            <option value="none">Отключено (быстрый ответ)</option>
                            <option value="low">Низкая (low effort)</option>
                            <option value="medium">Средняя (сбалансированная)</option>
                            <option value="high">Высокая (глубокий анализ)</option>
                          </select>
                        </div>
                      </div>
                      <span className="text-[11px] text-zinc-500 leading-relaxed">
                        Аппаратное LPU ускорение с поддержкой многошагового вызова инструментов и рассуждений.
                      </span>
                    </div>
                  )}

                  {/* Section 2: Настройки KIE.AI (с Gemini 4 Argon) */}
                  {provider === 'kie' && (
                    <div className="bg-[#101114] border border-white/[0.06] rounded-xl p-3.5 flex flex-col gap-3.5">
                      <div className="flex items-center justify-between pb-2 border-b border-white/[0.04]">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-zinc-100">KIE.AI Unified Gateway</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20">
                            Gemini 4 Argon
                          </span>
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

                      <div className="grid grid-cols-3 gap-2.5">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-medium text-zinc-300">Модель</label>
                          <select
                            value={model}
                            onChange={(e) => setModel(e.target.value)}
                            className="bg-black/50 border border-white/[0.08] focus:border-white/20 rounded-lg px-2.5 py-2 text-xs text-zinc-200 transition-colors"
                          >
                            <option value="gemini-4-argon-openai">Gemini 4 Argon (OpenAI, Рекомендуется)</option>
                            <option value="gpt-5-2">GPT 5.2</option>
                            <option value="claude-sonnet-4-5">Claude Sonnet 4.5</option>
                            <option value="deepseek-v4-1-flash">DeepSeek V4.1 Flash</option>
                            <option value="grok-4-5">Grok 4.5</option>
                            <option value="openai/gpt-oss-120b">OpenAI GPT-OSS 120B</option>
                          </select>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-medium text-zinc-300">Глубина рассуждений</label>
                          <select
                            value={reasoningEffort}
                            onChange={(e) => setReasoningEffort(e.target.value as any)}
                            className="bg-black/50 border border-white/[0.08] focus:border-white/20 rounded-lg px-2.5 py-2 text-xs text-zinc-200 transition-colors"
                          >
                            <option value="none">Отключено (быстро, экономия)</option>
                            <option value="low">Низкая (low effort)</option>
                            <option value="medium">Средняя (сбалансированная)</option>
                            <option value="high">Высокая (high effort)</option>
                          </select>
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

                      <span className="text-[11px] text-zinc-500 leading-relaxed">
                        Маршрут Gemini 4 Argon: /gemini-4-argon-openai/v1/chat/completions с поддержкой Google Search и цепочек мыслей.
                      </span>
                    </div>
                  )}

                  {/* Section 3: Автоматизация и интеллектуальные сервисы */}
                  <div className="bg-[#101114] border border-white/[0.06] rounded-xl p-3.5 flex flex-col gap-3">
                    <div className="flex items-center justify-between pb-2 border-b border-white/[0.04]">
                      <span className="text-xs font-semibold text-zinc-100">
                        Автоматизация и поиск
                      </span>
                      <span className="text-[10px] font-mono text-zinc-500">
                        Smart Services
                      </span>
                    </div>

                    <div className="flex flex-col gap-2.5">
                      <label className="flex items-start gap-2.5 text-xs text-zinc-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={autoTagging}
                          onChange={(e) => setAutoTagging(e.target.checked)}
                          className="mt-0.5 rounded border-white/20 bg-black/40 text-blue-500"
                        />
                        <div className="flex flex-col">
                          <span className="font-medium text-zinc-200">Автоматический подбор тегов</span>
                          <span className="text-[11px] text-zinc-500">При сохранении заметки без тегов ИИ подбирает их по таксономии базы</span>
                        </div>
                      </label>

                      <label className="flex items-start gap-2.5 text-xs text-zinc-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={autoTriage}
                          onChange={(e) => setAutoTriage(e.target.checked)}
                          className="mt-0.5 rounded border-white/20 bg-black/40 text-blue-500"
                        />
                        <div className="flex flex-col">
                          <span className="font-medium text-zinc-200">Интеллектуальная диспетчеризация (AI Triage)</span>
                          <span className="text-[11px] text-zinc-500">Автоматически сопоставляет неразобранные записи с подходящими папками</span>
                        </div>
                      </label>

                      <label className="flex items-start gap-2.5 text-xs text-zinc-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={webSearchEnabled}
                          onChange={(e) => setWebSearchEnabled(e.target.checked)}
                          className="mt-0.5 rounded border-white/20 bg-black/40 text-blue-500"
                        />
                        <div className="flex flex-col">
                          <span className="font-medium text-zinc-200">Поиск в реальном времени (Web Search)</span>
                          <span className="text-[11px] text-zinc-500">Включает Google Search в Gemini 4 Argon или веб-поиск в Groq</span>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Section 4: Норма таксономии и правила тегирования */}
                  <div className="bg-[#101114] border border-white/[0.06] rounded-xl p-3.5 flex flex-col gap-3">
                    <div className="flex items-center justify-between pb-2 border-b border-white/[0.04]">
                      <span className="text-xs font-semibold text-zinc-100">
                        Норма таксономии и правила тегирования
                      </span>
                      <span className="text-[10px] font-mono text-zinc-500">
                        Zero-Slop Taxonomy
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-medium text-zinc-300">Максимум тегов на запись</label>
                        <input
                          type="number"
                          min={1}
                          max={8}
                          value={maxTags}
                          onChange={(e) => setMaxTags(Number(e.target.value))}
                          className="bg-black/50 border border-white/[0.08] focus:border-white/20 rounded-lg px-3 py-1.5 text-xs text-white transition-colors"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-medium text-zinc-300">Стиль регистра тегов</label>
                        <select
                          value={tagCaseStyle}
                          onChange={(e) => setTagCaseStyle(e.target.value as any)}
                          className="bg-black/50 border border-white/[0.08] focus:border-white/20 rounded-lg px-3 py-1.5 text-xs text-zinc-200 transition-colors"
                        >
                          <option value="lowercase">lowercase (#дизайн)</option>
                          <option value="kebab-case">kebab-case (#ui-ux)</option>
                        </select>
                      </div>
                    </div>

                    <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={allowNewTags}
                        onChange={(e) => setAllowNewTags(e.target.checked)}
                        className="rounded border-white/20 bg-black/40 text-blue-500"
                      />
                      <span>Разрешить ИИ создавать новые теги (если выкл — строгий выбор из имеющихся)</span>
                    </label>

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
                <span className="text-xs font-semibold text-zinc-200">
                  Внешний вид и панели
                </span>

                <div className="flex flex-col gap-2 p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-300">Размеры панелей:</span>
                    <button
                      type="button"
                      onClick={resetPanelSizes}
                      className="flex items-center gap-1 px-2 py-1 rounded bg-white/[0.06] hover:bg-white/[0.1] text-zinc-200 text-[11px] transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Сбросить размеры</span>
                    </button>
                  </div>
                  <span className="text-[11px] text-zinc-500">
                    Панели можно перетаскивать за разделители левой и правой границы.
                  </span>
                </div>

                <div className="flex flex-col gap-1 text-[11px] text-zinc-500">
                  <div>• Цветовая схема: Linear Dark Monochrome (#09090b)</div>
                  <div>• Скругления: согласованная сетка (6px кнопки, 10px карточки, 14px модалки)</div>
                  <div>• Рамки фокуса: полностью отключены</div>
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
                  className="px-4 py-1.5 rounded-lg bg-white text-black font-semibold text-xs hover:bg-zinc-200 transition-colors"
                >
                  Сохранить
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
