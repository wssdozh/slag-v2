# время в мете таски и подсветка распарсенного в композере

- **цель**: карточка таски показывает время из `reminder` (`13 ноя · 17:42`), тело сохраняется без спарсенной даты/времени/приоритета, а в композере распознанное подсвечивается в тексте
- **трогаем**: `src/lib/time/dateUtils.ts`, `src/lib/time/todoistTaskParser.ts`, `src/components/Feed/ItemCard.tsx`, `src/components/Feed/BaseComposer.tsx`, `src/components/Feed/Composer.tsx`, `src/components/Feed/composer/composerFields.ts`, `src/components/Feed/composer/composerHighlights.ts` (новый), `src/index.css`, `e2e/slag/views.spec.ts`
- **не трогаем**: `KanbanCard.tsx` (там сырой `YYYY-MM-DD`, отдельная задача), `src/lib/notify.ts` (свой формат для уведомлений с quiet hours), уже сохранённые заметки (миграции нет — чистка тела только на новом вводе)
- **готово когда**: `npm run check` чистый; в `e2e/slag/views.spec.ts` проверки: `.composer-mirror .text-mention` содержит «завтра в 18:00» и `#groceries`, после Enter тело карточки без даты, мета содержит `18:00`; `npx playwright test e2e/slag/views.spec.ts e2e/composer_layout.spec.ts e2e/slag/feed.spec.ts` зелёные
- **уже выяснили**:
  - `reminder` бывает ISO-моментом и голым `HH:MM` — оба вида уже разбирает `getTaskTimeSlot`
  - chrono-индексы нельзя использовать для подсветки: парсер вырезает приоритет/повтор/длительность до chrono, позиции в исходной строке другие — ищем `rawMatchedDateText` по `indexOf`
  - `@Папка` уже подсвечивается зеркалом в `BaseComposer`, но через один диапазон; та же техника масштабируется в массив
  - прозрачные глифы textarea ломают нативное выделение — нужен `::selection` с непрозрачным цветом

---

## что оказалось не так, как думали

- `formatDueDateLabel` печатает «13 ноя.» с точкой (`toLocaleDateString` ru-RU), а в карточке была своя подпись без точки — поэтому `formatDueStamp` держит собственный массив коротких месяцев, а не переиспользует лейбл.
- полный `npm run check` в этом дереве красный не из-за задачи: `NotificationsSettingsTab.tsx` и `src/lib/sync/account.ts` содержат незакоммиченные правки другой работы (`setAssistantForRoutes`, `AssistantAnswerResult`). мои файлы tsc проходит, `oxlint` по затронутым зонам — 0 ошибок, `vite build` собирается.
- первый прогон `feed.spec` дал 3 падения на `toHaveAttribute` — это был занятый порт после предыдущего прогона (`ERR_CONNECTION_REFUSED` в логе), на свободном порту 20/20 зелёные.

## что осталось

- `KanbanCard` всё ещё печатает сырой `2026-11-13` — отдельная задача на `formatDueStamp`.
- первая строка задачи теряет markdown-заголовок `# `: `cleanText` снимает префикс, как и раньше делал `cleanTitle`. для таски это ожидаемо, для статьи ветка не тронута.

