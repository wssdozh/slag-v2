# переезд иконочного реестра на tabler

- **цель**: 172 семантических ключа `ICONS` рисуются `@tabler/icons-react@3.52.0`, `iconoir-react` и `lucide-react` уходят из зависимостей; заполнение (filled) включается только как состояние, шкала размеров 12/14/16/20/24, штрих 2 (для 24px — 1.5).
- **трогаем**: `src/components/UI/icons/icons.ts`, `src/components/UI/icons/Icon.tsx`, вызовы `<Icon>` в `src/components/**`, `e2e/mobile_folder_header.spec.ts`, `e2e/typography_scale.spec.ts`, `docs/app-knowledge-base.ru.md`, `docs/specification.md`, `docs/project-map/00_MOC_Map_of_Content.md`, `docs/project-map/01_UI_UX_Interactions_Matrix.md`, `src/lib/ai/appGuide.ts`.
- **не трогаем**: контраст меты (`fg-muted` 3.41:1), фокус-ринги, светлую тему, app icon, кастомные маркеры статуса (`TaskStatusMark`, `KanbanStatusIcon`, `PriorityBadge`, прогресс-арки) — это геометрия, а не глифы.
- **готово когда**: `grep -rn "iconoir\|lucide" src e2e` даёт 0 импортов; в реестре 172 ключа; `npm run check` — две строки без warnings; `npm run build` собирается; зелёные `e2e/typography_scale.spec.ts`, `e2e/mobile_folder_header.spec.ts`, `e2e/motion.spec.ts`, `e2e/visual_comparison.spec.ts`.
- **уже выяснили**:
  - `@tabler/icons-react@3.52.0` рендерит классы `tabler-icon tabler-icon-<name>`, штрих задаётся пропом `stroke`, filled-глифы идут без штриха (`fill: currentColor`, `stroke: none`).
  - экспортов 6545, из них 1054 `…Filled`; список имён лежит в `.tmp/tabler-names.txt`.
  - имена не совпадают с iconoir: `lock-open`, `arrow-back-up`, `arrow-forward-up`, `arrows-shuffle`, `trending-up`, `square-check` (у `checkbox` filled нет).
  - заполнение объявляется только у 17 пар; у остальных ключей его в каталоге нет либо оно не нужно.
  - 13 мёртвых ключей (`action.moveUp`, `action.reveal`, `entity.archive`, `entity.attachmentMissing`, `time.agenda`, `status.unchecked`, `status.checked`, `status.success`, `status.locked`, `media.seekBack`, `system.panelFeed`, `system.windowMinimize`, `system.windowClose`).
  - `LEGACY_FOLDER_ICONS` остаётся таблицей старых строк (имена lucide) → новые ключи: миграция данных во фронтматтере не нужна.
  - два e2e-селектора цепляются за классы lucide (`.lucide-more-vertical`, `.lucide-x`) → перевести на `[data-icon="<ключ>"]`, который теперь ставит `Icon.tsx`.

---

после работы допиши: что оказалось не так, как думали, какие глифы остались без filled, что осталось.

## что оказалось не так

- `@tabler/icons-react` раздаёт `forwardRef`-объекты, а не функции: проверка `typeof entry === 'function'` в резолвере реестра уводила каждый bare-глиф в ветку `{ icon: entry }` с `entry.icon === undefined`. ловится только в рантайме, tsc молчит. резолвер теперь смотрит `'icon' in entry`.
- filled есть у 99 ключей, но объявлен 17: у `action.check` (галочка внутри чекбокса) пары нет вовсе, у `media.skipBack/skipForward` тоже — сплошные треугольники перемотки остались контуром.
- 14 мест вешали `fill-current` на outline-глиф. у tabler путь без `fill`, так что CSS-заливка превращала контур в кляксу; заменено на `variant="filled"`, где заливка была смыслом.
- `size="none"` (45) снимался не механически: 12 ушли в `xl`, 18 в `xs`, 5 в `md`, 10 в `sm`. из 100 `xs` на 12px остались 23 — галочки в 14px чекбоксах, пин/повтор/огонёк и микро-глифы в 10px-чипах: 14px туда физически не влезает, это ограничение контейнера, а не вкусовщина. политику дополнили: 12 разрешён ещё и глифу внутри контрола ≤16px.
- ключи реестра не переименовывались, иначе значения в `folders[].icon` на диске стали бы unknown. в `LEGACY_FOLDER_ICONS` не хватало двух строк (`Inbox`, `Code`) — существующие хранилища теряли иконку «Входящих».
- icon-пакет — один бочонок на 6545 компонентов. глубокие импорты `@tabler/icons-react/icons/*` пробовал: в dev это 164 отдельных запроса и медленнее, чем один пребандленный чанк. оставлен бочонок.
- холодный старт dev-сервера в этом окружении — 70–230 с независимо от иконочного пакета; отсюда 7 таймаутов `main` в playwright на прогреве. после прогрева страница поднимается за 6 с, 68 иконок на десктопе, 14 на мобиле, ошибок в консоли нет.

## что осталось

- `TaskStatusMark` / `KanbanStatusIcon` / `PriorityBadge` — ручная геометрия, не трогали.
- контраст `fg-muted` (3.41:1) и отсутствие `:focus-visible` — отдельные задачи.
- `attachmentEmbeds.ts` рисует скрепку html-строкой на сетке 16 (`w-3.5`), мимо реестра.
- `e2e/motion.spec.ts:353` («a closing dialog keeps its whole exit») красный не из-за иконок: `SettingsModal` рендерит `BaseModal` с `hideHeader`, шапка с кнопкой `aria-label="Закрыть"` не рендерится вовсе, поэтому `getByRole('button', { name: 'Закрыть' })` внутри диалога не находит ничего. ни `BaseModal`, ни спека в этой задаче не менялись; параметр `hideHeader` был и до переезда. чинится либо кнопкой закрытия в настройках, либо селектором по `data-testid`.



## после: переезд на lucide

по просьбе через день набор сменили на lucide 1.55. одна штриховая семья, filled-близнецов нет, поэтому `variant="filled"` теперь заливает тот же контур (`fill-current`), а не подменяет глиф. пять имён переименованы в самом пакете: `Trash2` → `Trash`, `Filter` → `ListFilter`, `History` → `ClockArrowLeft`, `Loader2` → `LoaderCircle`, `BarChart3` → `ChartBar`. реестр: 161 ключ, 147 импортов, без `pair()`.

