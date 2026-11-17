# mcp: параметры расписания задач

- **цель**: mcp принимает и сохраняет duration/recurrence/date, частичная правка не теряет тип, папку и расписание.
- **трогаем**: src/mcp/types.ts, src/mcp/vault.ts, src/mcp/tools.ts, e2e/mcp_server.spec.ts.
- **не трогаем**: доменные типы, serializer, зависимости, реальные заметки; watcher/ui только читаем. build запрещён.
- **готово когда**: scoped mcp regression и npm run check зелёные; conventional commit в fix/triage-mcp.
- **уже выяснили**: serializer уже поддерживает recurrence/duration; get_note и pending resource их возвращают. write schema не поддерживает их, а defaults type/folder ломают частичные обновления.

---

исправлено: схема save_note принимает и валидирует duration/recurrence и существующую dueDate, reminder требует ISO datetime с часовым поясом; null снимает расписание. omitted type/folder сохраняются при patch, неизвестный id больше не создаёт дубль. ответы save/list/search показывают расписание. доменные типы и serializer не менялись.

проверки: 10 mcp in-memory тестов + 3 path confinement теста; npm run check — 0 warnings/errors. stdio bundled server и desktop/native не проверялись: build запрещён.

неожиданность: проблема не в чтении recurrence — get_note/pending resource уже работали; критический дефект оказался в defaults type/folder при patch. watcher отсутствует; initTauriFs memoized, refreshData читает cache. syncCurrentVaultFs не годится для polling: пустой диск восстанавливает старые заметки. вне-scope исправление передано lead, здесь не выполняется.
