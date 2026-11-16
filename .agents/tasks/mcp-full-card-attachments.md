# mcp: полная карточка заметки и чтение вложений

- **цель**: `get_note` и `slag://notes/{id}` отдают всю картину одним вызовом (заголовок, тип, папка и путь, теги, статус, приоритет, срок, даты, чеклист с вложенностью, markdown, связи, вложения с путями и url). появляется `read_attachment`, который читает байты вложения с лимитом. `list_notes`/`search_notes`/`list_tasks` показывают число вложений.
- **трогаем**: `src/mcp/{noteCard,notePatch,attachments}.ts` (новые), `src/mcp/{types,vault,tools,resources,prompts}.ts`, `docs/mcp-guide.md`, `scripts/mcp-*.test.mjs` (новые), `package.json` (`test:scripts`).
- **не трогаем**: `src/lib/**` (только читаем существующие парсеры и `resolveAttachmentByName`), UI, протокол синка, `src-tauri/`. имя инструмента `get_note`, его параметр `idOrTitle` и имена остальных инструментов остаются прежними.
- **готово когда**: `npm run check` → `0 warnings and 0 errors`, `npx vite build --config config/vite.mcp.config.ts` зелёный, `npm run test:scripts` зелёный (новые тесты на карточку и на патч).
- **уже выяснили**:
  - вложения лежат в `<vault>/.attachments/`; имя на диске — последний сегмент `relativePath` (`<id>_<name>` из `fileDropHelper`), но у headless-ноды схема `<id>-<basename>`. поэтому ищем кандидатов и, если не сошлось, один suffix-скан каталога.
  - MCP SDK 1.32 умеет `image`/`audio` content и `blob` в resource contents — байты можно отдавать нативно, без самодельного base64-в-тексте.
  - `node v24` стрипает типы, а `erasableSyntaxOnly` в tsconfig уже включён. значит чистая карточка с одними `import type` импортируется тестом прямо как `.ts`, без сборки.
  - `parseSubtasksFromContent` теряет вложенность (плоский список). карточка считает depth сама, по ведущим пробелам.

---

## после работы

- **баг в `save_note` (вне изначального скоупа, починен этим же коммитом)**: zod-схема ставила `type: .default('note')` и `folder: .default('Входящие')`, поэтому обновление по `id` било как полная замена дефолтами — задача превращалась в заметку, статус/приоритет/срок выпадали из frontmatter, папка уезжала во «Входящие». теперь дефолты применяются только при создании, а обновление идёт через `applyNotePatch` (меняет лишь переданные поля).
- схема ответа `get_note` менялась (был голый markdown, стала карточка + markdown в конце) — поэтому обновлены `docs/mcp-guide.md` и промпты, как того требует задача.
