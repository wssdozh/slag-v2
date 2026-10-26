# BUILD.md — Регламент Сборки и Запуска SLAG v2

> Обязательное руководство для автономных ИИ-агентов и разработчиков.  
> Определяет, какую сборку запускать, когда пересобирать нативный Rust-слой, а когда ограничиться веб-бандлом.

---

## 1. Матрица Режимов Сборки

| Режим | Команда | Назначение | Время | Зависимость от портов |
|---|---|---|---|---|
| **Web Fast Check** | `npm run build`<br>`npm run lint` | Проверка TypeScript-типов, синтаксиса и сборки Vite. | ~2 сек | Нет |
| **E2E Testing** | `npx playwright test` | Прогон Playwright-тестов в headless Chromium (чистый View). | ~15–30 сек | Нет (Vite запускается тестом) |
| **Desktop Live (HMR)** | `npm run dev:desktop`<br>*(или `pnpm dev` + `target/debug/slag-v2.exe`)* | **Основной режим разработки**: живое обновление UI в нативном окне без перезапуска. | ~1 сек | Требует `localhost:5173` |
| **Standalone Release** | `npm run build:desktop`<br>*(или `cargo build --release`)* | **Автономный `.exe`**: файлы вшиты внутрь бинарника, работает оффлайн без Node.js. | ~1–3 мин | **Не использует порты** (0 сетевых зависимостей) |

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

В режиме разработки нативный десктопный бинарник `target/debug/slag-v2.exe` подключается к `http://localhost:5173`.

### Чек-лист запуска:
1. **Проверить свободность порта 5173**:
   ```powershell
   Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
   ```
2. **Если порт занят зомби-процессом Node**:
   ```powershell
   Stop-Process -Id (Get-NetTCPConnection -LocalPort 5173 -State Listen).OwningProcess -Force
   ```
3. **Запустить Vite dev-сервер в фоне**:
   ```powershell
   pnpm dev   # или npm run dev
   ```
4. **Убедиться, что старый экземпляр SLAG закрыт**:
   ```powershell
   Stop-Process -Name "slag-v2" -Force -ErrorAction SilentlyContinue
   ```
5. **Запустить debug-бинарник**:
   ```powershell
   Start-Process -FilePath "src-tauri\target\debug\slag-v2.exe"
   ```

*Примечание: Любые последующие правки в `src/**/*.tsx` и `src/**/*.css` подхватываются на лету через WebSocket HMR. Перезапускать бинарник НЕ нужно.*

---

## 4. Регламент Standalone Release (`.exe`)

Релизный бинарник `src-tauri/target/release/slag-v2.exe` полностью автономен:
- Все статические файлы (`dist/`) компилируются и вшиваются внутрь исполняемого файла.
- Протокол `tauri://localhost` обрабатывается локальным IPC Rust-рантайма.
- **Никаких открытых локальных портов, серверов Node.js или Edge-ошибок.**

### Сборка:
```powershell
npm run build:desktop
# либо вручную:
npm run build
& "$env:USERPROFILE\.cargo\bin\cargo.exe" build --release --manifest-path src-tauri/Cargo.toml
```

---

## 5. Типичные Ошибки и Решения (Troubleshooting)

### Ошибка 1: WebView2 «Hmmm... can't reach this page / localhost refused to connect»
- **Первопричина**: Запущен `target/debug/slag-v2.exe`, но локальный сервер Vite на `http://localhost:5173` не запущен или упал.
- **Решение**: Запустить `npm run dev` в фоне перед запуском debug-бинарника, ЛИБО запускать автономный `target/release/slag-v2.exe`.

### Ошибка 2: «Port 5173 is in use, trying another one...»
- **Первопричина**: Предыдущий фоновый процесс Vite не был убит, и сервер перескочил на порт `5174`. Десктопное окно ищет `5173` и падает.
- **Решение**: В `vite.config.ts` зафиксирован `strictPort: true`. Убить зависший процесс Node через `Get-NetTCPConnection` и перезапустить `pnpm dev`.

### Ошибка 3: «cargo: The term 'cargo' is not recognized»
- **Первопричина**: В текущей сессии PowerShell переменная `PATH` может не содержать каталог Rust.
- **Решение**: Использовать прямой путь: `& "$env:USERPROFILE\.cargo\bin\cargo.exe"`.
