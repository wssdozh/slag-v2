# провайдеры по ролям: connections + roles

- **цель**: вместо `provider: groq|kie|gemini` — список подключений (`baseUrl` + ключ + модели, включая кастомный OpenAI-совместимый endpoint вроде cpa на netcup) и три роли `chat`/`vision`/`stt`, каждая выбирает своё подключение.
- **трогаем**: `src/types/index.ts`, `src/lib/ai/connections/*` (новое), `src/lib/ai/aiClient.ts`, `src/lib/ai/aiService.ts`, `src/lib/ai/orchestrator.ts` (re-export), `src/lib/media/attachmentEnrichment.ts` + `src/lib/media/enrichment/*` (новое), `src/components/Settings/ai/*` (новое), `src/components/Settings/AiSettingsTab.tsx`, `src/components/Feed/assistant/AssistantComposer.tsx`, `src/context/hooks/useAssistant.ts`, `src/context/AppContext.tsx`, `src/lib/ai/adapters/openAiAdapter.ts`, `src/lib/ai/fallback/{dialog,search}.ts`, `src/lib/ai/appGuide.ts`, e2e-спеки AI настроек.
- **не трогаем**: `relay/server.py`, `src/components/Admin/**`, `src/lib/sync/**`, `src/mcp/**`, `src-tauri/**`, формат хранения ключей (остаются в localStorage, как было).
- **готово когда**: `npm run check`, `npm run build`, обновлённые e2e + новый `e2e/ai_connections_roles.spec.ts` зелёные; в настройках добавляется cpa-подключение и назначается на роли; скриншот `test-results/screenshots/ai_connections_roles.png`.
- **уже выяснили**:
  - `AiSettings` плоская, `resolveAiTarget` — единственная точка ветвления по провайдеру; `attachmentEnrichment` хардкодит groq/gemini/relay и не знает о ролях.
  - `kieBaseUrl` уже позволял подсунуть cpa, но протокол выбирался по имени модели — костыль, не повторяем.
  - CLIProxyAPI (cpa) — OpenAI-совместимый прокси: `/v1/chat/completions`, key в `Authorization: Bearer`; `/audio/transcriptions` нет → `stt` через cpa не поедет; vision зависит от модели.
  - ключ localStorage остаётся `slag_ai_settings_v2` (не `v3`), миграция — на чтении.
  - e2e `media_relay.spec.ts` и `ai_subscription_relay.spec.ts` передают частичные настройки (`{ sourceMode: 'subscription' }`), normalize обязан это терпеть.
  - `resolveKieEndpoint` остаётся публичным (экспорт из `aiClient`/`aiService`), его проверяет e2e test 26.

---

## после работы

что оказалось не так, как думали:

- **частичные настройки в e2e.** `media_relay.spec.ts` и `ai_subscription_relay.spec.ts` передают `{ sourceMode: 'subscription' }` без `connections`. Старый код это терпел, новый `mediaChain` падал на `settings.connections`. Починил не `?? []` в каждом месте, а нормализацией на публичной границе `enrichAttachment` / `canEnrichAttachments` — заодно закрыло legacy-объекты, которые ещё могут лежать в памяти до нормализации.
- **Select держит options в DOM во время exit-анимации** (`usePresence`). Из-за этого в e2e `getByRole('option')` ловил strict-mode violation: список «Добавить» ещё не ушёл, а список ролей уже открылся. В тестах ждём `toHaveCount(0)` после выбора, а не `waitForTimeout`.
- **dev-прокси Groq.** Старый `getGroqApiUrl` подменял `api.groq.com` на `/api/groq` только в dev — при переходе на общий openai-транспорт это потерялось бы. Вернул точечно в `enrichment/openAi.ts` (`transportUrl`), остальные провайдеры не трогаются.
- **первый запуск без ключей.** Если `DEFAULT_AI_SETTINGS.connections` пустой, после ввода ключа роли остаются `null`, и ассистент молчит, хотя ключ есть. Поэтому дефолт несёт groq-коннект с пустым ключом и все три роли на нём — паритет со старым поведением.
- **legacy `model`** переносится только в чат-роль выбранного провайдера; vision/stt получают дефолты пресета, а не старую чат-модель.

что осталось (follow-up, вне этого захода):

- каталог моделей через `GET /v1/models` и кнопка «Проверить подключение» (особенно полезно для CPA/CORS);
- шифрование ключей подключений (сейчас — localStorage, как было);
- `stt` через CPA невозможен: у CLIProxyAPI нет `/audio/transcriptions`, UI это честно показывает (роль не предлагает custom/responses/anthropic).

