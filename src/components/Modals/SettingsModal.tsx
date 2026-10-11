import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { storage } from '../../lib/storage';
import {
  Settings,
  X,
  Sparkles,
  Download,
  Upload,
  Eye,
  EyeOff,
  ExternalLink
} from 'lucide-react';

export const SettingsModal: React.FC = () => {
  const {
    isSettingsOpen,
    setIsSettingsOpen,
    aiSettings,
    saveAiSettings,
    refreshData,
    addToast
  } = useApp();

  const [apiKey, setApiKey] = useState(aiSettings.geminiApiKey || '');
  const [model, setModel] = useState(aiSettings.model || 'gemini-2.0-flash');
  const [showKey, setShowKey] = useState(false);

  if (!isSettingsOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveAiSettings({
      geminiApiKey: apiKey.trim(),
      model,
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
    addToast('Резервная копия Vault экспортирована', 'success');
  };

  const handleExportMarkdownFiles = () => {
    const files = storage.exportObsidianBundle();
    // Export each or generate multi-file download
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
      }, idx * 100);
    });
    addToast(`Экспортировано ${files.length} Markdown-файлов для Obsidian`, 'success');
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
        addToast('Хранилище успешно восстановлено из бэкапа', 'success');
      } else {
        addToast('Ошибка формата файла бэкапа', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-2xl bg-[#141416] border border-white/[0.08] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white">
              <Settings className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white">Настройки SLAG v2</h3>
          </div>
          <button
            onClick={() => setIsSettingsOpen(false)}
            className="p-1 rounded text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 flex flex-col gap-6">
          {/* Gemini AI Settings */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-zinc-400" />
                Интеграция с Google Gemini
              </span>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1 transition-colors"
              >
                <span>Получить бесплатный ключ</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-zinc-400">Gemini API Key</label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
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
                Используется для молниеносного подбора тегов и умного распределения заметок из Входящих. Если ключ не указан, работает локальный эвристический алгоритм.
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-zinc-400">Модель</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="bg-black/40 border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-zinc-200"
              >
                <option value="gemini-2.0-flash">Gemini 2.0 Flash (Самая быстрая, рекомендуется)</option>
                <option value="gemini-1.5-flash">Gemini 1.5 Flash (Стабильная)</option>
              </select>
            </div>
          </div>

          {/* Obsidian Vault & Data Storage */}
          <div className="flex flex-col gap-3 pt-2 border-t border-white/[0.06]">
            <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
              Совместимость с Obsidian и Резервные копии
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
                    <div className="text-[10px] text-zinc-500">Все заметки в чистом Markdown с YAML Frontmatter</div>
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
                    <div className="text-[10px] text-zinc-500">Экспорт структуры хранилища, заметок и настроек</div>
                  </div>
                </div>
              </button>

              <label className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-xs text-zinc-200 transition-colors cursor-pointer">
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4 text-zinc-400" />
                  <div className="text-left">
                    <div className="font-medium">Восстановить из бэкапа JSON</div>
                    <div className="text-[10px] text-zinc-500">Загрузить ранее сохраненный файл</div>
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

          {/* Footer Controls */}
          <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.06]">
            <button
              type="button"
              onClick={() => setIsSettingsOpen(false)}
              className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg bg-white text-black font-semibold text-xs hover:bg-zinc-200 transition-colors"
            >
              Сохранить настройки
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
