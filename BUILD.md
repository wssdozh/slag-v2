# BUILD.md — Регламент Сборки и Запуска SLAG v2

> Обязательное руководство для автономных ИИ-агентов и разработчиков.  
> Определяет, какую сборку запускать, когда пересобирать нативный Rust-слой, а когда ограничиться веб-бандлом.

---

## 1. Матрица Режимов Сборки

| Режим | Команда | Назначение | Время | Зависимость от портов |
|---|---|---|---|---|
| **Web Fast Check** | `npm run build`<br>`npm run lint` | Проверка TypeScript-типов, синтаксиса и сборки Vite. | ~2 сек | Нет |
| **E2E Testing** | `npx playwright test` | Прогон Playwright-тестов в headless Chromium (чистый View). | ~15–30 сек | Нет (Vite запускается тестом) |
| **Desktop Live (HMR)** | `npm run dev:desktop`<br>*(или `pnpm dev` + `target/debug/slag-v2`)* | **Основной режим разработки**: живое обновление UI в нативном окне без перезапуска. | ~1 сек | Требует `localhost:5173` |
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
     НЕ ТРОГАТЬ RUST-СЛОЙ!                         │
     1. npm run lint                               │
     2. npm run build                              │
     3. При запущенном dev-сервере                 │
        HMR обновит окно сам за 100мс              │
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

В режиме разработки нативный десктопный бинарник (`target/debug/slag-v2` на Linux, `slag-v2.exe` на Windows) подключается к `http://localhost:5173`.

### Чек-лист запуска:
1. **Проверить свободность порта 5173**:
   - **Linux**: `ss -tulpn | grep 5173`
   - **Windows**: `Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue`
2. **Если порт занят зомби-процессом Node**:
   - **Linux**: `fuser -k 5173/tcp`
   - **Windows**: `Stop-Process -Id (Get-NetTCPConnection -LocalPort 5173 -State Listen).OwningProcess -Force`
3. **Запустить Vite dev-сервер в фоне**:
   ```bash
   pnpm dev   # или npm run dev
   ```
4. **Убедиться, что старый экземпляр SLAG закрыт**:
   - **Linux**: `killall -9 slag-v2 2>/dev/null || true`
   - **Windows**: `Stop-Process -Name "slag-v2" -Force -ErrorAction SilentlyContinue`
5. **Запустить debug-бинарник**:
   - **Linux**: `WAYLAND_DISPLAY=wayland-0 ./src-tauri/target/debug/slag-v2` (или `npm run dev:desktop`)
   - **Windows**: `Start-Process -FilePath "src-tauri\target\debug\slag-v2.exe"`

*Примечание: Любые последующие правки в `src/**/*.tsx` и `src/**/*.css` подхватываются на лету через WebSocket HMR. Перезапускать бинарник НЕ нужно.*

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
- **Первопричина**: Запущен `target/debug/slag-v2`, но локальный сервер Vite на `http://localhost:5173` не запущен или упал.
- **Решение**: Запустить `npm run dev` в фоне перед запуском debug-бинарника, ЛИБО запускать автономный `target/release/slag-v2`.

### Ошибка 2: «Port 5173 is in use, trying another one...»
- **Первопричина**: Предыдущий фоновый процесс Vite не был убит, и сервер перескочил на порт `5174`. Десктопное окно ищет `5173` и падает.
- **Решение**: В `vite.config.ts` зафиксирован `strictPort: true`. Убить зависший процесс Node (`fuser -k 5173/tcp` / `killall -9 node`) и перезапустить `pnpm dev`.

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
