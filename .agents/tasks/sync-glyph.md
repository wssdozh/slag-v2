# Иконка синка по состояниям

## Цель

Сайдбар несёт состояние синка одной стрелкой и цветом. Цвет надо помнить, а стрелка одинакова и
для «всё хорошо», и для «офлайн», и для «копии разошлись». Нужен глиф на каждое состояние.

## Что трогаем

- `src/components/UI/icons/icons.ts` — `system.syncIdle` (Cloud), `system.syncOk` (CloudCheck),
  `system.syncOffline` (CloudOff), `system.syncDiverged` (CloudAlert), `system.syncError`
  (TriangleAlert); `system.sync` (RefreshCw) остаётся спиннером.
- `src/components/Sidebar/syncGlyph.ts` (новый) — состояние → глиф, класс, подпись.
- `src/components/Sidebar/Sidebar.tsx` — рисует глиф, `title`/`aria-label` из того же решения,
  `data-sync-state` для тестов.
- `e2e/slag/sync_glyph.spec.ts` — все пять состояний плюс расхождение.

## Критерий готовности

`npm run check` 0/0, `npm run build`, зелёный `sync_glyph`, на скриншоте красное облако с
восклицательным знаком при `connected + report`.

## Что оказалось не так

- «Подключено» и «согласны» — разные вещи. Пока сверка смотрит в комнату с одной строкой на
  комнату, `report` почти недостижим, и `CloudAlert` будет редким гостем. Глиф честен, данные —
  нет. Это отдельная задача про манифест на устройство.
- Тест ловит расхождение подстановкой `syncEngine.status.manifest` — реального расхождения
  на живой машине не требуется.
