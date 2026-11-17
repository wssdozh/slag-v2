# консолидация клиентских веток в main

- **цель**: сохранить ancestry всех клиентских веток и интеграционные функции, подготовить проверенный коммит для lead.
- **трогаем**: конфликты landing-media, triage search/attachments/draft/mcp/mobile, node-http-ack, hero-nopanel, landing-blocks; ci main trigger.
- **не трогаем**: другие worktrees, stash, relay; не push и не dispatch.
- **готово когда**: все ветки merged, npm run check/build, target e2e 6 workers, sync/audio 1 worker, screenshot прочитан; исправления закоммичены.
- **уже выяснили**: исходный merge feat/landing-media имеет 9 конфликтов; cm composer, меню, настройки и audio из integration/improvements обязательны. lucide icons сохраняем.

## прогресс

- прочитаны инструкции src/components, CODE_MAP, BUILD и visual testing.
- merged с ancestry: integration/improvements, feat/landing-media (85e7f59), fix/triage-search, fix/triage-attachments, fix/triage-draft (c0fd529), fix/triage-mcp (b123283), fix/triage-mobile-layout, fix/node-http-ack, feat/hero-nopanel, feat/landing-blocks.
- промежуточный HEAD: 3b04d1928a479ac162b9d02f49907c74b340779a; parent подтвердил ancestry всех 10 refs.
- сохранены cm field, settings nested rail, интеграционные menus/audio; lucide registry получил недостающие ключи и расширенный folder picker.
- mcp schedule адаптирован к notePatch (null очищает, omission сохраняет) и noteCard (duration/recurrence); draft сохраняет cm field и localDraftStamp.
- pnpm install --frozen-lockfile: exit 0, +1 -1, atomic patch применён.
- npm run check: exit 0, 0 warnings/errors. npm run build: exit 0, предупреждения vite об ineffective dynamic import и deprecated inlineDynamicImports.
- npm run test:scripts: 34/34; добавлен nullable schedule regression для следующего прогона.
- full non-sync/audio: 400 tests / 6 workers выполняется на 5191; добавлен отдельный cm draft regression для следующего target прогона.
- ci.yml уже включает master и main; release trigger не менялся. push/dispatch не выполнялись.

## остаток

- full 400 non-sensitive tests: interrupted/incomplete, после turn boundary job unknown и playwright process отсутствовал; final pass/fail count не получен. не считать зелёным. известные failures: assistant/memory mock tools mismatch и undefined captured requests; folder strict locator >1; hardcoded localhost:5173 при runner 5191; settings selected class mismatch; device icons strict locator; mcp tool count 11 vs 12. baseline не доказан. targeted запуск очистил full error-context до сохранения, exact full ledger недоступен.
- targeted 28: 27 passed, 1 failed в новом cm draft test из-за DOM placeholder; assert адаптирован к .cm-line. product failure не выявлен. журнал .tmp/consolidate-target.log.
- scripts 35/35 после nullable schedule regression.
- ci subset + cm regression выполняется, затем sync/audio 1 worker.
- tracked docs screenshots от full восстановлены, не добавлены в коммит.
- ci subset + cm: 104 passed, 1 skipped, 4 failed / 109, 4.9m. failures: audio_orb reload ERR_ABORTED при 6 workers, editor Grab-to-Scroll timeout, feed kanban collapse, новый cm DOM placeholder assertion. evidence: .tmp/consolidate-ci.log и .tmp/consolidate-ci-results.
- cm regression переведён на EditorView.findFromDOM(...).state.doc.toString(): passed на 1 worker. audio_orb transient rerun passed на 1 worker; исходный ERR_ABORTED не воспроизвёлся.
- по решению lead reverted d7a4792 отдельным 3928422: восстановлен прежний default kanban materials dock в 3 product файлах; capture scripts сохранены. ancestry hero-nopanel сохраняется.
- после revert isolated feed Linear-style Kanban + editor Grab-to-Scroll: 2/2 passed на 1 worker, .tmp/consolidate-revert-target.log.
- полная sync/audio пачка не проверена из-за требования немедленного завершения. полный non-sensitive прогон не завершён; не считать всю suite зелёной. baseline остальных full failures не проверен.
- итоговые изменения кроме revert: только тестовые адаптации semantic selected state/device form-factor icons/read_attachment discovery, cm regression и nullable schedule unit regression.
- screenshot проверены: composer-desktop-unified, triage-task-keyboard и attachment-identity-editor. наложений нет, одинаковые имена вложений показывают разные картинки.
- финальный check/build и commit выполняются; push/dispatch не выполнялись.
