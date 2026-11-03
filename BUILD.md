# BUILD.md — Регламент Сборки и Запуска SLAG v2

> Обязательное руководство для автономных ИИ-агентов и разработчиков.  
> Определяет, какую сборку запускать, когда пересобирать нативный Rust-слой, а когда ограничиться веб-бандлом.

---

## 1. Матрица Режимов Сборки

| Режим | Команда | Назначение | Время | Зависимость от портов |
|---|---|---|---|---|
| **Web Fast Check** | `npm run build`<br>`npm run lint` | Проверка TypeScript-типов, синтаксиса и сборки Vite. | ~2 сек | Нет |
| **E2E Testing** | `npx playwright test` | Прогон Playwright-тестов в headless Chromium (чистый View). | ~15–30 сек | Нет (Vite запускается тестом) |
| **Desktop Live (HMR)** | `npm run dev:desktop`<br>*(запускать через `tauri dev`, не обычный `cargo build`)* | **Основной режим разработки**: живое обновление UI в нативном окне без перезапуска. | ~1 сек | Требует `localhost:5173` |
| **Standalone Release** | `npm run build:desktop`<br>*(или `cargo build --release`)* | **Автономный бинарник**: файлы вшиты внутрь бинарника, работает оффлайн без Node.js. | ~1–3 мин | **Не использует порты** (0 сетевых зависимостей) |

---

## 2. Алгоритм Выбора Сборки для Агента

```text
                  Изменился только React / TS / CSS в src/?
                                  │
                 ┌────────────────┴────────────────┐
                 ▼                                 ▼
                ДА                                НЕТ (изменен src-tauri/)
                 │                                 │
     СНАЧАЛА ПРОВЕРИТЬ РЕЖИМ ОКНА                         │
     1. npm run lint                               │
     2. npm run build                              │
     3. При запущенном dev-сервере                 │
        HMR работает ТОЛЬКО в tauri dev              │
                                                   ▼
                                       Что изменилось в src-tauri?
                                                   │
                 ┌─────────────────────────────────┴─────────────────┐
                 ▼                                                   ▼
       Только логика / права                               Финальный релиз
       (lib.rs, capabilities, tauri.conf)                  или запрос на автономный .exe
                 │                                                   │
                 ▼                                                   ▼
       Быстрый debug-билд:                                Полный релизный билд:
       & "$env:USERPROFILE\.cargo\bin\cargo.exe" build    npm run build:desktop
```

---

## 3. Регламент Запуска Desktop Live (HMR)

Только `npm run dev:desktop` (`tauri dev`) гарантирует загрузку `http://localhost:5173` и HMR. Папка `target/debug` сама по себе этого НЕ гарантирует: в Cargo.toml по умолчанию включён `custom-protocol`, поэтому обычный `cargo build` вшивает `dist/` даже в debug-бинарник.

Для доставки embedded debug на каждую машину: `npm run build`, затем `cargo build --manifest-path src-tauri/Cargo.toml`, затем запуск свежего бинарника. После изменений frontend этот бинарник тоже нужно пересобрать. Наличие работающего Vite и HTTP 200 не доказывает актуальность окна.

### Чек-лист запуска в режиме HMR:
1. **Убедиться, что старый экземпляр SLAG закрыт** (завершить только подтверждённый процесс SLAG, не все Node):
   - **Linux**: `pkill -f 'src-tauri/target/debug/slag-v2'` (проверить командную строку перед завершением)
   - **Windows**: завершить только процесс с `Path` == `...\src-tauri\target\debug\slag-v2.exe`
2. **Запустить через Tauri** (он сам поднимет dev-сервер и подключит окно к нему):
   ```bash
   npm run dev:desktop
   ```
   Не запускать отдельный `pnpm dev`/`npm run dev` перед этим и не запускать debug-бинарник напрямую: при default `custom-protocol` обычный debug-бинарник вшивает `dist/`, поэтому без `tauri dev` HMR не будет.

### Чек-лист запуска автономного (embedded) окна:
1. `npm run build` — собрать свежий frontend.
2. `cargo build --manifest-path src-tauri/Cargo.toml` — вшить `dist/` в debug-бинарник.
3. Завершить только подтверждённый процесс SLAG, затем запустить свежий бинарник.
4. Профиль WebView, localStorage и сессии не удалять. После любых изменений frontend повторить шаги 1–3; наличие работающего Vite и HTTP 200 не доказывает актуальность окна.

---

## 4. Регламент Standalone Release

Релизный бинарник (`src-tauri/target/release/slag-v2` на Linux, `.exe` на Windows) полностью автономен:
- Все статические файлы (`dist/`) компилируются и вшиваются внутрь исполняемого файла.
- Протокол `tauri://localhost` обрабатывается локальным IPC Rust-рантайма.
- **Никаких открытых локальных портов, серверов Node.js или Edge/WebKit-ошибок.**

### Сборка:
```bash
npm run build:desktop
# либо вручную:
npm run build
cargo build --release --manifest-path src-tauri/Cargo.toml
```

---

## 5. Типичные Ошибки и Решения (Troubleshooting)

### Ошибка 1: WebView2 / WebKit «can't reach this page / localhost refused to connect»
- **Первопричина**: Окно в режиме dev URL не видит Vite на `http://localhost:5173`. Сначала выяснить режим сборки: обычный `cargo build` с default `custom-protocol` использует встроенный dist даже в debug.
- **Решение**: Для HMR запускать `npm run dev:desktop`; для автономного окна выполнить `npm run build` + `cargo build --manifest-path src-tauri/Cargo.toml` и запустить свежий debug-бинарник либо собрать release.

### Ошибка 2: «Port 5173 is in use, trying another one...»
- **Первопричина**: Предыдущий фоновый процесс Vite не был убит, и сервер перескочил на порт `5174`. Десктопное окно ищет `5173` и падает.
- **Решение**: В `vite.config.ts` зафиксирован `strictPort: true`. Проверить командную строку владельца порта и завершить только подтверждённый процесс SLAG Vite, затем перезапустить `npm run dev:desktop`. Не завершать все процессы Node: среди них могут быть DSH и MCP.

### Ошибка 3: «cargo: command not found»
- **Первопричина**: В текущей сессии переменная `PATH` может не содержать каталог Rust.
- **Решение**: На Linux установить через `sudo pacman -S --needed rust` (или `rustup`), на Windows использовать прямой путь: `& "$env:USERPROFILE\.cargo\bin\cargo.exe"`.

### Ошибка 4: «forbidden path: .../.trash» на Linux
- **Первопричина**: На Unix системы glob-шаблоны Tauri по умолчанию требуют явного совпадения точки (`requireLiteralLeadingDot: true`).
- **Решение**: В `tauri.conf.json` в секции `plugins.fs` настроено `"requireLiteralLeadingDot": false`.

---

## 6. Кроссплатформенная Адаптация и Системные Хоткеи

SLAG v2 автоматически определяет платформу при запуске и установке:

1. **Linux (Wayland + GNOME)**:
   - Из-за ограничений безопасности Wayland глобальные шорткаты регистрируются через системный демон GNOME Media Keys (`org.gnome.settings-daemon.plugins.media-keys`).
   - При первом запуске автоматически прописывается биндинг `Ctrl+Shift+Space` -> `<path_to_binary> --quick`.
   - Автоматически генерируется десктоп-файл `~/.local/share/applications/com.slag.notes.desktop` с Actions `QuickComposer` и устанавливается иконка `~/.local/share/icons/hicolor/128x128/apps/com.slag.notes.png`.
2. **Linux (Wayland non-GNOME / Hyprland / Sway)**:
   - В настройках («Горячие клавиши») отображается готовая строка биндинга для конфигурационного файла тайлингового менеджера (`bind = CTRL SHIFT, SPACE, exec, <path> --quick`).
3. **Windows / macOS / Linux X11**:
   - Автоматически используется нативный глобальный хук `tauri-plugin-global-shortcut`.

### Сервисные CLI-флаги бинарника:
- `./slag-v2 --quick`: мгновенно открывает окно быстрой мысли через IPC одиночного инстанса.
- `./slag-v2 --install-system`: генерирует `.desktop`-файл и привязывает хоткей в GNOME без запуска окна GUI (идеально для инсталляторов и пакетов).
- `./slag-v2 --uninstall-system`: отвязывает шорткат из GNOME.
