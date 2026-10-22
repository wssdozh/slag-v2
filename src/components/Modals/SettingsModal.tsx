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
  RotateCcw
} from 'lucide-react';

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

  const [activeTab, setActiveTab] = useState<'ai' | 'vault' | 'ui' | 'shortcuts'>('ai');
  const [provider, setProvider] = useState<AiProvider>(aiSettings.provider || 'groq');
  const [groqApiKey, setGroqApiKey] = useState(aiSettings.groqApiKey || '');
  const [geminiApiKey, setGeminiApiKey] = useState(aiSettings.geminiApiKey || '');
  const [model, setModel] = useState(aiSettings.model || 'openai/gpt-oss-120b');
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
    } else {
      setModel('gemini-2.0-flash');
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveAiSettings({
      provider,
      groqApiKey: groqApiKey.trim(),
      geminiApiKey: geminiApiKey.trim(),
      model,
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
      <div className="w-full max-w-2xl rounded-2xl bg-[#141416] border border-white/[0.08] shadow-2xl flex flex-col overflow-hidden h-[580px] max-h-[92vh]">
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
          </div>

          {/* Right Tab Content */}
          <form onSubmit={handleSave} className="flex-1 flex flex-col min-h-0 bg-[#141416]">
            <div className="flex-1 overflow-y-auto p-5">
              {activeTab === 'ai' && (
              <div className="flex flex-col gap-4">
                {/* Provider Selector */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-zinc-400">Провайдер ИИ</label>
                  <div className="grid grid-cols-2 gap-2 bg-black/40 p-1 rounded-xl border border-white/[0.06]">
                    <button
                      type="button"
                      onClick={() => handleProviderChange('groq')}
                      className={`py-1.5 px-3 rounded-lg text-xs font-medium transition-all ${
                        provider === 'groq'
                          ? 'bg-white/10 text-white shadow-sm'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      ⚡ Groq (Рекомендуется)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleProviderChange('gemini')}
                      className={`py-1.5 px-3 rounded-lg text-xs font-medium transition-all ${
                        provider === 'gemini'
                          ? 'bg-white/10 text-white shadow-sm'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      ✨ Google Gemini
                    </button>
                  </div>
                </div>

                {/* Groq Settings */}
                {provider === 'groq' && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-200">
                        Groq Cloud API
                      </span>
                      <a
                        href="https://console.groq.com/keys"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1 transition-colors"
                      >
                        <span>Получить API ключ</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-zinc-400">Groq API Key</label>
                      <div className="relative">
                        <input
                          type={showKey ? 'text' : 'password'}
                          value={groqApiKey}
                          onChange={(e) => setGroqApiKey(e.target.value)}
                          placeholder="gsk_..."
                          className="w-full bg-black/40 border border-white/[0.08] rounded-lg px-3 py-2 pr-10 text-xs text-white placeholder-zinc-600 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey(!showKey)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-300"
                        >
                          {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <span className="text-[11px] text-zinc-500">
                        Аппаратное ускорение LPU: 500+ токенов/сек, вызов инструментов и рассуждения.
                      </span>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-zinc-400">Модель</label>
                      <select
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        className="bg-black/40 border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-zinc-200"
                      >
                        <option value="openai/gpt-oss-120b">OpenAI GPT-OSS 120B (500 t/s, 128K, Рекомендуется)</option>
                        <option value="llama-3.3-70b-versatile">Llama 3.3 70B (280 t/s, универсальная)</option>
                        <option value="deepseek-r1-distill-llama-70b">DeepSeek R1 Distill 70B (Рассуждения)</option>
                      </select>
                    </div>
                  </>
                )}

                {/* Gemini Settings */}
                {provider === 'gemini' && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-200">
                        Google Gemini Flash
                      </span>
                      <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1 transition-colors"
                      >
                        <span>Бесплатный API ключ</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-zinc-400">Gemini API Key</label>
                      <div className="relative">
                        <input
                          type={showKey ? 'text' : 'password'}
                          value={geminiApiKey}
                          onChange={(e) => setGeminiApiKey(e.target.value)}
                          placeholder="AIzaSy..."
                          className="w-full bg-black/40 border border-white/[0.08] rounded-lg px-3 py-2 pr-10 text-xs text-white placeholder-zinc-600 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey(!showKey)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-300"
                        >
                          {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <span className="text-[11px] text-zinc-500">
                        Используется для быстрого подбора тегов и функции AI Triage.
                      </span>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-zinc-400">Модель</label>
                      <select
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        className="bg-black/40 border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-zinc-200"
                      >
                        <option value="gemini-2.0-flash">Gemini 2.0 Flash (Рекомендуется)</option>
                        <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                      </select>
                    </div>
                  </>
                )}

                {/* Tag Taxonomy Norm Section */}
                <div className="pt-3 border-t border-white/[0.06] flex flex-col gap-3">
                  <span className="text-xs font-semibold text-zinc-200">
                    Норма таксономии и правила тегирования
                  </span>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] text-zinc-400">Максимум тегов на запись</label>
                      <input
                        type="number"
                        min={1}
                        max={5}
                        value={maxTags}
                        onChange={(e) => setMaxTags(Number(e.target.value))}
                        className="bg-black/40 border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-white"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] text-zinc-400">Стиль регистра тегов</label>
                      <select
                        value={tagCaseStyle}
                        onChange={(e) => setTagCaseStyle(e.target.value as any)}
                        className="bg-black/40 border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-zinc-200"
                      >
                        <option value="lowercase">lowercase (#дизайн)</option>
                        <option value="kebab-case">kebab-case (#ui-ux)</option>
                      </select>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowNewTags}
                      onChange={(e) => setAllowNewTags(e.target.checked)}
                      className="rounded border-white/20 bg-black/40 text-blue-500"
                    />
                    <span>Разрешить ИИ создавать новые теги (если выкл — строгий выбор из имеющихся)</span>
                  </label>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-zinc-400">Пользовательские правила промпта</label>
                    <textarea
                      rows={2}
                      value={customTagRules}
                      onChange={(e) => setCustomTagRules(e.target.value)}
                      placeholder="Например: Не использовать тег #general. Для задач по коду предпочитать #frontend или #backend."
                      className="bg-black/40 border border-white/[0.08] rounded-lg p-2 text-xs text-white placeholder-zinc-600 resize-none"
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
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-white text-black font-semibold text-xs hover:bg-zinc-200 transition-colors"
              >
                Сохранить
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
