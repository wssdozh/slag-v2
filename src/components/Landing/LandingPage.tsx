import { navigatePage } from '../../lib/navigation';
import React, { useState } from 'react';
import {
  Download,
  Shield,
  FileCode,
  Search,
  Check,
  ExternalLink,
  Terminal,
  Server,
} from 'lucide-react';

interface LandingPageProps {
  onNavigateToAccount?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigateToAccount }) => {
  const [downloadStarted, setDownloadStarted] = useState(false);

  const handleDownload = () => {
    setDownloadStarted(true);
    // In production this triggers direct file download
    const link = document.createElement('a');
    link.href = '#';
    link.download = 'SLAG_Setup_x64.exe';
    // Fallback notification
    setTimeout(() => setDownloadStarted(false), 3000);
  };

  const navigateToAccount = () => {
    if (onNavigateToAccount) {
      onNavigateToAccount();
    } else {
      navigatePage('account');
    }
  };

  return (
    <div className="min-h-screen bg-[#08090a] text-zinc-100 selection:bg-white/20 selection:text-white font-sans antialiased">
      {/* 1. Header */}
      <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-[#08090a]/80 border-b border-white/[0.05]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-md bg-white/[0.06] border border-white/[0.08] flex items-center justify-center overflow-hidden">
              <img src="/mascot-blueberry.svg" alt="SLAG" className="w-5 h-5 object-contain" />
            </div>
            <span className="text-sm font-semibold tracking-tight text-white">SLAG</span>
            <span className="font-mono text-[10px] text-zinc-500 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.04]">
              v0.1.0
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-xs text-zinc-400">
            <a href="#architecture" className="hover:text-zinc-200 transition-colors">Архитектура</a>
            <a href="#comparison" className="hover:text-zinc-200 transition-colors">Сравнение</a>
            <a href="#pricing" className="hover:text-zinc-200 transition-colors">Тарифы</a>
            <a
              href="https://github.com/wssdozh/slag-v2"
              target="_blank"
              rel="noreferrer"
              className="hover:text-zinc-200 transition-colors flex items-center gap-1"
            >
              <span>GitHub</span>
              <ExternalLink className="w-3 h-3 text-zinc-500" />
            </a>
          </nav>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={navigateToAccount}
              className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              Кабинет
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white text-black font-semibold text-xs rounded-lg hover:bg-zinc-200 active:scale-[0.96] transition-all cursor-pointer shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{downloadStarted ? 'Скачивание...' : 'Скачать .exe'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. Hero Section */}
      <section className="relative pt-20 pb-16 px-6 max-w-4xl mx-auto text-center flex flex-col items-center">
        {/* Release tag */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.08] text-2xs font-mono text-zinc-400 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>Релиз SLAG v2 · Windows 10/11 x64</span>
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white max-w-3xl leading-[1.12]">
          Заметки со скоростью чата. <br />
          <span className="text-zinc-400">Локально на вашем диске.</span>
        </h1>

        <p className="mt-5 text-sm sm:text-base text-zinc-400 max-w-xl leading-relaxed">
          Поток мыслей как в Telegram, визуальная тишина Linear и прозрачные файлы Markdown для Obsidian.
          Сквозное шифрование релея без логинов, паролей и сбора телеметрии.
        </p>

        {/* Primary CTA Block */}
        <div className="mt-8 flex flex-col sm:flex-row items-center gap-3">
          <button
            type="button"
            onClick={handleDownload}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-white text-black font-semibold text-sm rounded-xl hover:bg-zinc-200 active:scale-[0.96] transition-all cursor-pointer shadow-lg shadow-white/5"
          >
            <Download className="w-4 h-4" />
            <span>Скачать для Windows (.exe)</span>
          </button>
          <a
            href="https://github.com/wssdozh/slag-v2"
            target="_blank"
            rel="noreferrer"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-zinc-300 hover:text-white text-sm font-medium rounded-xl transition-all active:scale-[0.96] cursor-pointer"
          >
            <Terminal className="w-4 h-4 text-zinc-500" />
            <span>Исходный код</span>
          </a>
        </div>

        <span className="mt-3 text-2xs font-mono text-zinc-500">
          Standalone бинарник · 17 МБ · Работает оффлайн без Node.js
        </span>

        {/* Interactive App Mockup Preview */}
        <div className="mt-14 w-full rounded-2xl border border-white/[0.08] bg-[#0c0c0e] p-2 shadow-2xl overflow-hidden text-left">
          <div className="h-7 border-b border-white/[0.06] px-3 flex items-center justify-between bg-[#08090a] rounded-t-xl">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
              <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
              <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
            </div>
            <span className="font-mono text-[11px] text-zinc-500">SLAG — Входящие</span>
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded">
              E2EE онлайн
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 min-h-[320px] bg-[#08090a]">
            {/* Sidebar mock */}
            <div className="hidden md:flex flex-col border-r border-white/[0.06] p-3 gap-1 text-xs">
              <div className="text-[10px] font-mono uppercase text-zinc-500 px-2 py-1">Папки</div>
              <div className="px-2.5 py-1.5 rounded-lg bg-white/10 text-white font-medium flex items-center justify-between">
                <span>Входящие</span>
                <span className="font-mono text-zinc-400">4</span>
              </div>
              <div className="px-2.5 py-1.5 text-zinc-400 hover:text-white flex items-center justify-between">
                <span>Проекты</span>
                <span className="font-mono text-zinc-600">8</span>
              </div>
              <div className="px-2.5 py-1.5 text-zinc-400 hover:text-white flex items-center justify-between">
                <span>База знаний</span>
                <span className="font-mono text-zinc-600">12</span>
              </div>
            </div>

            {/* Chat feed mock */}
            <div className="md:col-span-3 p-4 flex flex-col justify-between gap-4">
              <div className="flex flex-col gap-2.5">
                <div className="max-w-lg bg-[#141417] border border-white/[0.06] rounded-xl p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between text-zinc-500 text-[10px] font-mono">
                    <span>#архитектура</span>
                    <span>10:42 PM</span>
                  </div>
                  <p className="text-zinc-200">
                    Собрать синхронизацию на сжатых пакетах дельт. Сервер только ретранслирует и удаляет сразу по ACK.
                  </p>
                </div>

                <div className="max-w-lg bg-[#141417] border border-white/[0.06] rounded-xl p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between text-zinc-500 text-[10px] font-mono">
                    <span className="text-emerald-400 font-medium">✓ Таска выполнена</span>
                    <span>10:45 PM</span>
                  </div>
                  <p className="text-zinc-300">
                    Настроить сопряжение устройств по 4-значному SAS коду без слива модели телефона.
                  </p>
                </div>
              </div>

              {/* Composer input mock */}
              <div className="p-2.5 rounded-xl bg-[#141417] border border-white/[0.08] flex items-center justify-between text-xs text-zinc-500 font-mono">
                <span>Напишите мысль или задачу... (Enter для отправки)</span>
                <span className="text-[10px] bg-white/[0.06] px-2 py-0.5 rounded text-zinc-400">⌘K меню</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Architecture & Pillars Section */}
      <section id="architecture" className="py-20 px-6 max-w-6xl mx-auto border-t border-white/[0.05]">
        <div className="max-w-2xl mb-12">
          <span className="text-xs font-mono uppercase tracking-wider text-zinc-500">Архитектура</span>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-2">
            Локальные файлы и сквозной релей
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-2">
            Никаких проприетарных баз данных и привязки к чужим серверам.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-[#141417] border border-white/[0.06] flex flex-col gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-zinc-200">
              <FileCode className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white">Markdown на диске</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Все заметки хранятся обычными файлами <code>.md</code> с YAML Frontmatter в локальной папке.
              Открывайте их в Obsidian, Logseq или VS Code в любой момент.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-[#141417] border border-white/[0.06] flex flex-col gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-zinc-200">
              <Shield className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white">Zero-Knowledge Relay</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Сервер не хранит историю ваших заметок. Дельта шифруется на клиенте через AES-256-GCM,
              передается за 20 мс и уничтожается с сервера сразу после подтверждения доставки.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-[#141417] border border-white/[0.06] flex flex-col gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-zinc-200">
              <Search className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white">Orama BM25 поиск</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Полнотекстовый поиск с исправлением опечаток прямо в оперативной памяти.
              Поиск по 10 000 заметок срабатывает быстрее 2 миллисекунд по нажатию <code>Cmd+K</code>.
            </p>
          </div>
        </div>
      </section>

      {/* 4. Comparison Table Section */}
      <section id="comparison" className="py-20 px-6 max-w-6xl mx-auto border-t border-white/[0.05]">
        <div className="max-w-2xl mb-12">
          <span className="text-xs font-mono uppercase tracking-wider text-zinc-500">Сравнение</span>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-2">
            Отличия от Obsidian, Telegram и Notion
          </h2>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-white/[0.06] bg-[#0c0c0e]">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="bg-[#141417] text-zinc-400 font-mono text-[11px] border-b border-white/[0.06]">
              <tr>
                <th className="py-3 px-4 font-normal">Возможность</th>
                <th className="py-3 px-4 font-semibold text-white">SLAG v2</th>
                <th className="py-3 px-4 font-normal">Obsidian</th>
                <th className="py-3 px-4 font-normal">Telegram Избранное</th>
                <th className="py-3 px-4 font-normal">Notion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              <tr>
                <td className="py-3 px-4 text-zinc-200 font-medium">Эргономика чата (поток мыслей)</td>
                <td className="py-3 px-4 text-emerald-400 font-semibold">✓ Встроена</td>
                <td className="py-3 px-4 text-zinc-500">Только через плагины</td>
                <td className="py-3 px-4 text-emerald-400 font-semibold">✓ Встроена</td>
                <td className="py-3 px-4 text-zinc-500">Нет</td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-zinc-200 font-medium">Прозрачные .md файлы на диске</td>
                <td className="py-3 px-4 text-emerald-400 font-semibold">✓ Да</td>
                <td className="py-3 px-4 text-emerald-400 font-semibold">✓ Да</td>
                <td className="py-3 px-4 text-rose-400 font-mono">✗ В облаке Telegram</td>
                <td className="py-3 px-4 text-rose-400 font-mono">✗ В облаке AWS</td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-zinc-200 font-medium">E2EE-синхронизация дельт</td>
                <td className="py-3 px-4 text-emerald-400 font-semibold">✓ Zero-Knowledge</td>
                <td className="py-3 px-4 text-zinc-400">$4–8 в месяц</td>
                <td className="py-3 px-4 text-rose-400 font-mono">✗ Нет шифрования</td>
                <td className="py-3 px-4 text-rose-400 font-mono">✗ Нет шифрования</td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-zinc-200 font-medium">Сопряжение без почты и паролей</td>
                <td className="py-3 px-4 text-emerald-400 font-semibold">✓ 6 цифр / PIN</td>
                <td className="py-3 px-4 text-zinc-500">Требуется email</td>
                <td className="py-3 px-4 text-zinc-500">Номер телефона</td>
                <td className="py-3 px-4 text-zinc-500">Email + OAuth</td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-zinc-200 font-medium">Скорость поиска по 10k заметок</td>
                <td className="py-3 px-4 text-emerald-400 font-mono">1.2 мс (Orama)</td>
                <td className="py-3 px-4 text-zinc-400 font-mono">~40 мс</td>
                <td className="py-3 px-4 text-zinc-500">Зависит от сети</td>
                <td className="py-3 px-4 text-zinc-500 font-mono">~800 мс</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 5. Pricing / Plans Section */}
      <section id="pricing" className="py-20 px-6 max-w-6xl mx-auto border-t border-white/[0.05]">
        <div className="max-w-2xl mb-12">
          <span className="text-xs font-mono uppercase tracking-wider text-zinc-500">Тарифы</span>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-2">
            Прозрачные тарифы под любые задачи
          </h2>
          <p className="text-xs text-zinc-400 mt-2">
            Кеш недоставленных пакетов автоматически удаляется с сервера сразу после синхронизации устройств.
          </p>
        </div>

        {/* 3 Tiers Grid: Free / Smile / Angry */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 1. Free */}
          <div className="p-6 rounded-2xl bg-[#141417] border border-white/[0.06] flex flex-col justify-between gap-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-white">Free</span>
                <span className="font-mono text-xs text-zinc-400">0 ₽ навсегда</span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Для текстовых заметок на телефоне и компьютере. Без вложений и лишней нагрузки.
              </p>
              <ul className="space-y-2 text-xs text-zinc-300">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-zinc-400" />
                  <span>2 устройства (ПК + Телефон)</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-zinc-400" />
                  <span>1 ГБ кеша заметок на релее</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Только текст (без медиа-файлов)</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Сквозное E2EE шифрование</span>
                </li>
              </ul>
            </div>
            <a
              href="#download"
              className="w-full py-2.5 text-center text-xs font-medium text-zinc-200 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl transition-all cursor-pointer active:scale-[0.96]"
            >
              Начать бесплатно
            </a>
          </div>

          {/* 2. Smile (Hit / Former Pro) */}
          <div className="p-6 rounded-2xl bg-[#141417] border border-emerald-500/30 flex flex-col justify-between gap-6 relative overflow-hidden shadow-lg shadow-emerald-950/20">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">Smile</span>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded">
                    Популярный
                  </span>
                </div>
                <span className="font-mono text-xs text-white">199 ₽ / мес</span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Полноценная синхронизация со всеми медиа-файлами, умным ИИ-разбором и скоростным релеем.
              </p>
              <ul className="space-y-2 text-xs text-zinc-300">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>До 5 устройств на аккаунт</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>10 ГБ кеша заметок, картинок и аудио</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>AI-триаж и межплатформенный Lease</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Окно хранения кеша 7 дней</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Скорость передачи &lt; 20 мс</span>
                </li>
              </ul>
            </div>
            <button
              type="button"
              data-testid="landing-btn-choose-smile"
              onClick={navigateToAccount}
              className="w-full py-2.5 text-center text-xs font-semibold text-black bg-white hover:bg-zinc-200 rounded-xl transition-all cursor-pointer active:scale-[0.96] shadow-sm"
            >
              Выбрать Smile
            </button>
          </div>

          {/* 3. Angry */}
          <div className="p-6 rounded-2xl bg-[#141417] border border-amber-500/20 flex flex-col justify-between gap-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">Angry</span>
                  <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded">
                    Максимум
                  </span>
                </div>
                <span className="font-mono text-xs text-white">499 ₽ / мес</span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Для массивных баз знаний, десятков устройств и непрерывной фоновой репликации.
              </p>
              <ul className="space-y-2 text-xs text-zinc-300">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-amber-400" />
                  <span>До 15 устройств</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-amber-400" />
                  <span>50 ГБ кеша под любые вложения</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-amber-400" />
                  <span>Приоритетный выделенный AI Lease</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-amber-400" />
                  <span>Расширенное окно кеша (30 дней)</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-amber-400" />
                  <span>Приоритетные каналы релея</span>
                </li>
              </ul>
            </div>
            <button
              type="button"
              data-testid="landing-btn-choose-angry"
              onClick={navigateToAccount}
              className="w-full py-2.5 text-center text-xs font-medium text-zinc-200 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl transition-all cursor-pointer active:scale-[0.96]"
            >
              Выбрать Angry
            </button>
          </div>
        </div>

        {/* Self-hosted Option Banner */}
        <div className="mt-6 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-zinc-300">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-semibold text-white">Self-hosted релей — 0 ₽ навсегда</span>
              <p className="text-2xs text-zinc-400">
                Запускайте собственный релей на домашнем сервере или VPS в одну команду через Docker без лимитов.
              </p>
            </div>
          </div>
          <a
            href="https://github.com/wssdozh/slag-v2"
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-lg transition-all text-center whitespace-nowrap active:scale-[0.96]"
          >
            Docker на GitHub ↗
          </a>
        </div>
      </section>

      {/* 6. Footer */}
      <footer className="border-t border-white/[0.05] py-8 px-6 text-xs text-zinc-500">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-zinc-400 font-medium">SLAG v2</span>
            <span>·</span>
            <span>Local-First Notes</span>
          </div>

          <div className="flex items-center gap-6">
            <button type="button" onClick={navigateToAccount} className="hover:text-zinc-300 transition-colors cursor-pointer">
              Личный кабинет
            </button>
            <a href="https://github.com/wssdozh/slag-v2" target="_blank" rel="noreferrer" className="hover:text-zinc-300 transition-colors">
              GitHub
            </a>
            <span>MIT License</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
