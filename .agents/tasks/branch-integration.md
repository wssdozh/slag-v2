# Аудит незалитых веток SLAG

База: `origin/main` на `71244956`; основной checkout и незакоммиченные копии не менялись. Сравнивались локальные heads и `origin/*`: ancestry, `--cherry-pick` и актуальное содержимое для переработанных патчей. `relay/*` — другой репозиторий.

| Группа | Решение |
|---|---|
| `feat/android-background-sync`, `diag/android-background-sync`, `fix/search-result-navigation` | Готовая первая группа, PR #2. Рабочие ветки Android уже перенесены в feature; старый `23964bfa` не накладывать поверх проверенного исправления поиска. |
| `fix/mcp-registry-status` | Уникальная функция, адаптировать к более новым гарантиям `main` в `integrate/mcp-status`; не заменять защищённую запись и признаки восстановления кодом с прежней базы. |
| `test-sync-resilience`, `fix/sync-health-release`, `fix/registry-cutover`, `audit-sync-*` | Потомки одной линии. Проверять поздний `57ea2465` целиком с Android, не сливать нижестоящие ветки повторно. `test-sync-native-faults` и `test-sync-relay-offline` имеют отдельные тестовые реализации того же класса сценариев; поздняя ветка уже добавляет seeded fault-тесты и offline smoke в CI. |
| `perf/visible-media`, `ux/pull-search-*`, `perf/registry-update-probe` | Основные изменения уже перенесены или переработаны (`90df003e`, `5eb832c6`/`2a3d73a7`, `9644c2a7`/`bb7589c0`); отличия диагностических тестов и старой ленты не основание мержить ветки целиком. |
| `fix-task-feed-rollover`, `release-task-feed-master`, `feat/folder-picker-desktop` | Актуальный код содержит переносы (`c0566ee4`, `ce02992a`, `124c158f`, `d54bda4e`, `ffa99307`); старый вариант настольной раскладки не переносить поверх новых Dockview-компонентов без отдельной проверки UX. |
| `fix/sync-health-recovery` и `fix/sync-health-qa` | Есть самостоятельные Windows preflight и расширенные тесты. Windows preflight: 15/15 старых тестов прошли на итоговой базе, но синтетический vault с `protectedSync: true`, метаданными поколения и устаревшим плоским журналом получил ложный `PASS`. Не сливать до чтения защищённого поколения либо явного отказа при его наличии. Обзор и конфликтный UI (`fix/sync-health-report`, `fix/sync-health-review-ui`, `fix/sync-health-merge`) имеют отдельные версии, не накладывать повторно поверх более поздней интеграции без сравнения. |
| `staging/*`, `perf/native-vault`, `perf/device-sync`, `test/vault-recovery-smoke`, `scratch/*`, `wip/*`, stash | Прототипы, стенды, отдельные тестовые варианты и отложенный предпросмотр. Не включать автоматически. |
| Незакоммиченный root и прочие рабочие копии | Оставить на месте. В root большинство cutover-правок уже имеют коммит `686bbd8d`, но есть локальные заметки/скиллы. Отдельно остались незакоммиченный pinned-preview, диагностика ленты, тестовые стенды и черновики восстановления. |
