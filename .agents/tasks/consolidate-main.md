# консолидация клиентских веток в main

- **цель**: сохранить ancestry всех клиентских веток и интеграционные функции, подготовить проверенный коммит для lead.
- **трогаем**: конфликты landing-media, triage search/attachments/draft/mcp/mobile, node-http-ack, hero-nopanel, landing-blocks; ci main trigger.
- **не трогаем**: другие worktrees, stash, relay; не push и не dispatch.
- **готово когда**: все ветки merged, npm run check/build, target e2e 6 workers, sync/audio 1 worker, screenshot прочитан; исправления закоммичены.
- **уже выяснили**: исходный merge feat/landing-media имеет 9 конфликтов; cm composer, меню, настройки и audio из integration/improvements обязательны. lucide icons сохраняем.

## прогресс

- прочитаны инструкции src/components, CODE_MAP, BUILD и visual testing.
- разрешаю исходный merge, затем последовательные merges и адаптации.

## остаток

все merges, проверки и финальный sha впереди.
