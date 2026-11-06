# Полный аудит UI-элементов, модалок, видов, фильтров и анимаций в SLAG v2

> Составлен строго по коду (`src/components/`, `src/context/`, `src/styles/theme.css`). Без выдумок.

---

## 1. АНДРОИД / МОБИЛЬНЫЙ ИНТЕРФЕЙС (MOBILE)

### 1.1. Экраны и корневые переходы
| Элемент | Файл и строка | Вход сейчас | Выход сейчас | Что нужно сделать |
|---|---|---|---|---|
| **Корневой роутер вкладок** (Папки, Таски, ИИ, Настройки, Календарь, Плеер) | `src/components/Mobile/MobileShell.tsx:26-33` | View Transition `tab` (кросс-фейд рута `motion-swap-fade-in` 150ms). Без VT — мгновенный mount. | `motion-swap-fade-out` (150ms) по всему руту `html`. Мгновенный unmount в React. | Изолировать область `<main>` (`view-transition-name: mobile-screen`), чтобы нижний док и шапка не мигали при смене вкладок. Добавить направленный слайд влево/вправо по порядку табов. |
| **Иерархический переход в папку (drill-in)** | `src/components/Mobile/MobileFoldersView.tsx:158, 195` | `swapScreen('push')` -> `motion-swap-push-in` (сдвиг справа налево с 100%). | `motion-swap-push-out` (параллакс влево -18%). | Работает. Добавить физический свайп назад от левого края (edge swipe-to-back). |
| **Выход из папки назад к корню (drill-out)** | `src/components/Mobile/MobileFoldersView.tsx:234` | `swapScreen('pop')` -> `motion-swap-pop-in` (-18% -> 0). | `motion-swap-pop-out` (уход вправо 0 -> 100%). | Работает через View Transitions. |
| **Оверлей профиля папки** | `src/components/Mobile/MobileFolderInfoView.tsx:39` | `swapScreen('push')` при клике по заголовку папки. | `swapScreen('pop')` при нажатии «Назад». | Работает через View Transitions. Добавить свайп назад жестом. |
| **Переключатель представлений папки** (Лента / Канбан / Календарь) | `src/components/Mobile/MobileFoldersView.tsx:346-365` | Мгновенный тернарник `{feedViewMode === 'kanban' ? ... : ...}`. Без анимации. | **Мгновенный unmount** предыдущего вида в 1 кадр. | Мягкий cross-fade контента при смене режима. |

### 1.2. Нижняя плавающая панель (Floating Dock + FAB)
| Элемент | Файл и строка | Вход сейчас | Выход сейчас | Что нужно сделать |
|---|---|---|---|---|
| **Контейнер дока (скрытие при входе в папку/ассистент)** | `src/components/Mobile/MobileShell.tsx:36` (`{isFloatingDockVisible && <MobileFloatingDock />}`) | Мгновенный mount при возврате в корень. | **КРИТИЧЕСКИЙ ОБРЫВ:** мгновенный unmount без `usePresence`. При входе в папку док исчезает в 1 кадр. | Подключить `usePresence(isFloatingDockVisible)`: плавный съезд вниз (`translateY(24px) opacity-0`, 150ms) и всплытие обратно (200ms, `--ease-entrance`). |
| **Кнопки вкладок в доке** | `src/components/Mobile/MobileFloatingDock.tsx:66-87` | Мгновенная смена класса `bg-white/10` на кнопке. Эффект тапа `motion-press`. | Мгновенное снятие класса. **Скользящей пилюли нет.** | Скользящая анимированная пилюля (`translateX(...)` с `--ease-settle`), плавно перетекающая между иконками. |
| **Точка неразобранных заметок (Inbox Dot)** | `src/components/Mobile/MobileFloatingDock.tsx:79-84` | `{hasDot && <span .../>}` — монтируется мгновенно. | Мгновенный unmount при разборе всех заметок. | Анимация scale-in (0 -> 1) при появлении и scale-out при исчезновении. |
| **Круглая кнопка создания (FAB `+`)** | `src/components/Mobile/MobileFloatingDock.tsx:92-99` | Статична, класс `motion-press`. | Статична. | Микро-поворот плюсика при нажатии (`rotate-90`). |

### 1.3. Мобильные модалки, шторки и подменю
| Элемент | Файл и строка | Вход сейчас | Выход сейчас | Что нужно сделать |
|---|---|---|---|---|
| **Шторка действий над заметкой (MobileActionSheet)** | `src/components/UI/MobileActionSheet.tsx:45-80` | `usePresence` + `motion-fade` (подложка) + `motion-sheet` (панель снизу). Физический драг за ручку (`useSheetDrag`). | `usePresence` удерживает DOM. Выход 200мс (`--slag-motion-slow`) с `--ease-standard`. | Работает эталонно. Переключатель типа внутри снабдить скользящей пилюлей. |
| **Шторка выбора месяца в календаре** | `src/components/Mobile/MobileCalendarView.tsx:996-1030` | `motion-fade` (бэкдроп) + `motion-sheet` (панель). | **КРИТИЧЕСКИЙ ОБРЫВ:** `{isMonthPickerOpen && <div ...>}` без `usePresence`! При нажатии «Отмена» шторка моментально срезается в 0мс. | Внедрить `usePresence(isMonthPickerOpen)` + подключить `useSheetDrag` для свайпа вниз. |
| **Шторка переключения хранилищ** | `src/components/Vault/VaultSwitcherMenu.tsx:175-191` (в режиме `variant="sheet"`) | `motion-fade` + `motion-sheet`. | **КРИТИЧЕСКИЙ ОБРЫВ:** `if (!isOpen) return null;` без `usePresence`. При клике на фон или выборе хранилища шторка срезается мгновенно. | Внедрить `usePresence(isOpen)`: плавный уезд вниз и растворение бэкдропа. |
| **Полноэкранный мобильный поиск** | `src/components/Search/SearchModal.tsx:393-405` (`if (isMobile) { if (!isSearchOpen) return null; ... }`) | `motion-fade` через `@starting-style` + каскад результатов `motion-stagger`. | **КРИТИЧЕСКИЙ ОБРЫВ:** строка 395: `if (!isSearchOpen) return null;` — на мобилке мгновенно анмаунтится без анимации выхода. | Подключить `presence` (он уже вычислен в строке 438, но проигнорирован на мобилке). |
| **Поповер вида и фильтров папки (3 точки)** | `src/components/Modals/FolderViewModal.tsx:72, 127` | `motion-popover` через `@starting-style`. | **КРИТИЧЕСКИЙ ОБРЫВ:** строка 72: `if (!isFolderViewModalOpen) return null;`. При закрытии исчезает в 1 кадр. | На мобилке открывать как bottom sheet снизу экрана, либо добавить `usePresence`. |
| **Инлайн-поповер добавления задачи в сетку 3-Day** | `src/components/Mobile/MobileCalendarView.tsx:882-915` | `motion-popover`. | **Мгновенный unmount** `{addingTimeSlot && <div ...>}`. | Обернуть в `usePresence` для плавного fade-out. |

### 1.4. Мобильные фильтры, вкладки и списки
| Элемент | Файл и строка | Вход сейчас | Выход сейчас | Что нужно сделать |
|---|---|---|---|---|
| **Сегментированные вкладки статусов тасок** [К выполнению \| В работе \| Готово \| Бэклог] | `src/components/Mobile/MobileTasksView.tsx:145-169` | Смена класса `bg-white/10`. Жест свайпа (`useSwipeGesture`). | Мгновенная замена контента задач. **Скользящей пилюли нет.** | Скользящая пилюля между вкладками + плавный постраничный слайд списка задач. |
| **Переключатель [Таски \| Календарь] в шапке** | `src/components/Mobile/MobileTasksView.tsx:91-119` | Смена классов на кнопках. | **Мгновенный unmount** одного экрана и mount другого. | Добавить скользящую плашку и легкий кросс-фейд. |
| **Полоса 7 дней недели (Week Strip)** | `src/components/Mobile/MobileCalendarView.tsx:516-559` | Кнопки дней с `motion-press`. | Смена недели меняет массив дней без слайда. | Горизонтальный слайд недели при свайпе влево/вправо + скользящая рамка выбранного дня. |
| **Переключатель [Список \| 3 дня]** | `src/components/Mobile/MobileCalendarView.tsx:473-501` | Смена классов. | Мгновенная подмена верстки. | Скользящая плашка + cross-fade. |
| **Медиа-вкладки в профиле папки** [Фото \| Аудио \| Файлы \| Ссылки \| Теги] | `src/components/RightPanel/FolderMediaTabs.tsx:57-80` | Кнопки с `motion-press`. | Мгновенная замена сетки медиа. | Скользящая пилюля фона + fade-in контента вкладки. |
| **Лента подпапок (Subfolders ribbon)** | `src/components/Mobile/MobileFoldersView.tsx:317-342` | `{directSubfolders.length > 0 && <div ...>}` монтируется мгновенно. | Мгновенный unmount при переходе в папку без подпапок. | Анимация появления/схлопывания высоты полосы. |
| **Сортируемый список вкладок дока (Drag & Drop)** | `src/components/Mobile/MobileSettingsView.tsx:385-460` | Тач-драг строки. При драге меняется прозрачность. | Строки меняются местами скачком без анимации. | Добавить FLIP-анимацию сдвига соседних строк при перетаскивании. |
| **Карточки приглашений в хранилище** | `src/components/Mobile/MobileSettingsView.tsx:205-237` | Статичный рендер. | При принятии/отклонении — мгновенный unmount. | Плавное схлопывание карточки по высоте с fade-out. |

---

## 2. ДЕСКТОПНЫЙ ИНТЕРФЕЙС (DESKTOP)

### 2.1. Оконная система и рабочие панели
| Элемент | Файл и строка | Вход сейчас | Выход сейчас | Что нужно сделать |
|---|---|---|---|---|
| **Панели Dockview** (Лента, Канбан, Календарь, Ассистент, Инфо, Логи, Плеер) | `src/components/Workspace/WorkspaceShell.tsx:1310-1317` | Управляется `dockview-react`. Монтируются жестко. | `api.removePanel` — мгновенный unmount DOM-узлов. | Панели живут в своей библиотеке, но внутренний свитчер видов (`WorkspaceContentPanel:82-96`) переключается мгновенным тернарником — добавить cross-fade. |
| **Меню добавления вкладок `[+]` в шапке группы** | `src/components/Workspace/WorkspaceShell.tsx:381-411` | Класс `motion-popover` через `@starting-style`. | **КРИТИЧЕСКИЙ ОБРЫВ:** `{isOpen && <div ...>}`. При клике мимо, `Esc` или выборе панели — мгновенный unmount, исчезает со срезом в 1 кадр. | Подключить `usePresence(isOpen)` для плавного fade-out + scale(0.98). |
| **Индикатор зоны сброса вкладки (Drop preview)** | `src/components/Workspace/WorkspaceShell.tsx:1295-1307` | `{dropPreview && <div ...>}`. Анимируется только цвет: `duration-75`. | Мгновенный unmount при `setDropPreview(null)`. | Добавить fade-in/fade-out и плавный переход координат рамки. |

### 2.2. Сайдбар и дерево папок
| Элемент | Файл и строка | Вход сейчас | Выход сейчас | Что нужно сделать |
|---|---|---|---|---|
| **Аккордеоны подпапок в дереве** | `src/components/Sidebar/FolderTree.tsx:185-194, 232-236` | **Анимация отсутствует.** Шеврон меняется жестко `{isExpanded ? <ChevronDown /> : <ChevronRight />}`. Дети `{hasChildren && isExpanded && ...}` появляются мгновенно, сдвигая дерево рывком. | **Мгновенный unmount.** Блок подпапок исчезает, нижние папки резко подпрыгивают без анимации высоты. | 1) Единый шеврон с `transition-transform duration-200 rotate-90`.<br>2) Плавное раскрытие/схлопывание высоты через CSS Grid (`grid-template-rows: 0fr -> 1fr`). |
| **Дропдаун переключения хранилищ** | `src/components/Sidebar/Sidebar.tsx:122-144`, `VaultSwitcherMenu.tsx:193-210` | Шеврон поворачивается (`rotate-180`). Меню имеет `motion-popover`. | **ОБРЫВАЕТСЯ:** `if (!isOpen) return null;` в `VaultSwitcherMenu.tsx:53`. При клике мимо мгновенно исчезает. | Внедрить `usePresence(isOpen)` для десктопного дропдауна. |
| **Кнопка опций папки `[...]`** | `src/components/Sidebar/FolderTree.tsx:213-229` | По ховеру: `opacity-0 group-hover:opacity-100 transition-opacity`. | Плавное затухание по transition-opacity. | Работает корректно. |

### 2.3. Рабочие представления и боковые дроверы
| Элемент | Файл и строка | Вход сейчас | Выход сейчас | Что нужно сделать |
|---|---|---|---|---|
| **Боковая панель материалов TRIZ в Канбане** | `src/components/Views/KanbanBoard.tsx:233-235` | Строка 234: `${isKanbanMaterialsOpen ? 'w-60 sm:w-64 border-r' : 'w-0 border-r-0'}`. **Transition отсутствует полностью!** Ширина скачет с `w-0` на `w-64`. | **Мгновенный скачок `w-64 -> w-0`.** Колонки канбана дергаются влево. | Добавить контейнеру `transition-[width] duration-200 ease-out`. |
| **Поповер смены статуса задачи на карточке канбана** | `src/components/Views/KanbanBoard.tsx:471-496` | Чистый conditional render `{isMenuOpen && <div ...>}` без классов анимации. | Мгновенный unmount при сбросе id. | Добавить класс `motion-popover`, клик-аутсайд и фазовый выход. |
| **Боковой дровер просроченных задач в Календаре** | `src/components/Views/CalendarView.tsx:1486-1699` | **Анимация отсутствует.** `{isDrawerOpen && <div className="w-72 sm:w-80 ...">...</div>}`. Дровер моментально появляется, сжимая календарь. | **Мгновенный unmount.** При закрытии календарь скачком расширяется вправо. | Добавить плавное выдвижение (`transition-[width,transform] duration-200 ease-out`). |
| **Модалка расширенного дня в Календаре (месяц)** | `src/components/Views/CalendarView.tsx:1705-1827` | Бэкдроп имеет `motion-fade`. У карточки нет `motion-dialog`. | **Мгновенный unmount** `{expandedDayDateStr && <div ...>}` при клике на крестик или бэкдроп. | Добавить `usePresence` и `motion-dialog` (scale-down + fade-out). |
| **Переключатель [Неделя \| Месяц] в Календаре** | `src/components/Views/CalendarView.tsx:970-991` | Смена классов. | Мгновенный тернарник сетки. | Добавить скользящую плашку активного таба и кросс-фейд сетки. |
| **Правая панель инфо: редактирование описания** | `src/components/RightPanel/FolderInfoPanel.tsx:89-122` | Мгновенный условный рендер `{isEditingDescription ? <form> : <p>}`. | Мгновенная замена DOM-элементов. Высота дергается. | Добавить мягкий cross-fade или transition высоты. |
| **Правая панель инфо: вкладки медиа (десктоп)** | `src/components/RightPanel/FolderMediaTabs.tsx:82-107` | Подчеркивание `<span className="absolute bottom-[-1px] ... h-[2px]" />` монтируется на активной кнопке. | Перескакивает скачком без скольжения. Контент табов сменяется мгновенно. | Скользящий индикатор вкладки + легкий fade-in контента. |

### 2.4. Главное контекстное меню ПКМ и каскадные подменю
| Элемент | Файл и строка | Вход сейчас | Выход сейчас | Что нужно сделать |
|---|---|---|---|---|
| **Главное меню ContextMenu** (по ПКМ на карточке, папке, ленте) | `src/components/UI/ContextMenu.tsx:239-536` | `fixed z-50 motion-fade` + `motion-popover` через `@starting-style`. | **КРИТИЧЕСКИЙ ОБРЫВ:** строка 199: `if (!activeTarget) return null;`. При `closeContextMenu()` стейт сбрасывается в `null`, меню мгновенно уничтожается в 1 кадр. | Подключить `usePresence(isOpen)`, удерживать `activeTarget` до фазы `closed`, плавно растворять меню (`opacity 1 -> 0`, scale 1 -> 0.98 за 100-150мс). |
| **Подменю «Сменить тип»** | `src/components/UI/ContextMenu.tsx:539-601` | `motion-popover` через `@starting-style`. | **Мгновенный unmount** `{activeSubmenu === 'type' && ...}` при уходе курсора. | Добавить мягкий exit-fade переход (100мс). |
| **Подменю «Проводник / Ссылки»** | `src/components/UI/ContextMenu.tsx:604-693` | `motion-popover` через `@starting-style`. | Мгновенный unmount при уходе курсора. | Добавить мягкий exit-fade переход (100мс). |
| **Подменю «Дополнительно»** | `src/components/UI/ContextMenu.tsx:696-741` | `motion-popover` через `@starting-style`. | Мгновенный unmount при уходе курсора. | Добавить мягкий exit-fade переход (100мс). |

---

## 3. МОДАЛКИ И ОВЕРЛЕИ (ОБЩИЕ / СМЕШАННЫЕ)

### 3.1. Базовые модалки на BaseModal
*Компоненты:*
- `SettingsModal` (`src/components/Modals/SettingsModal.tsx`)
- `TriageModal` (`src/components/Modals/TriageModal.tsx`)
- `FolderModal` (`src/components/Modals/FolderModal.tsx`)
- `FolderInfoModal` (`src/components/Modals/FolderInfoModal.tsx`)
- `VaultModal` (`src/components/Modals/VaultModal.tsx`)
- `ComposerModal` (`src/components/Modals/ComposerModal.tsx`)
- `LogModal` (`src/components/Logs/LogModal.tsx`)

| Уровень | Вход сейчас | Выход сейчас | Проблемные зоны |
|---|---|---|---|
| **Сама оболочка модалки (BaseModal)** | Подложка `motion-fade` + диалог `motion-dialog` (scale 0.98 -> 1, opacity 0 -> 1 за 200мс). | `usePresence` удерживает DOM. Выход 150мс (`--slag-motion-base`) с `--ease-standard`. | На десктопе работает корректно. На мобилке `SettingsModal:1347` и `TriageModal:387` обходят `BaseModal` через `if (!isOpen) return null`, из-за чего **на мобилке их выход мгновенно обрывается**. |
| **Вкладки внутри SettingsModal** (`SettingsModal.tsx:293-397`) | Мгновенная смена класса `bg-white/10` на активной вкладке слева. | Контент вкладок (строки 402-1340) подменяется жестким `{activeTab === '...' && <...>}` без перехода. | Добавить скользящую плашку активной вкладки и легкий cross-fade содержимого настроек. |
| **Сегментированные переключатели в SettingsModal** («Подписка vs BYOK», «Скорость ИИ») | Мгновенная смена классов кнопок. | Статичный swap. | Скользящая пилюля фона. |
| **Режимы Просмотр / Редактирование в FolderInfoModal** (`FolderInfoModal.tsx:245-312`) | Мгновенный тернарник `{isEditMode ? <form> : <div>}`. | Мгновенная замена верстки с дерганием высоты. | Добавить cross-fade / height transition. |

### 3.2. Полноэкранный редактор (FullscreenEditor)
* **Файл:** `src/components/Editor/FullscreenEditor.tsx`
* **Вход:** FLIP-анимация `expandFromRect(origin, target)` через WAAPI `clipPath: inset(...)` — плавно вырастает из кликнутой карточки (200-280мс).
* **Выход:** **КРИТИЧЕСКИЙ ОБРЫВ.** Строка 1933: `if (!isFullscreenEditorOpen \|\| !selectedItem) return null;`. При закрытии (крестик, «Назад», Escape) редактор мгновенно уничтожается в 1 кадр! Обратного схлопывания в карточку нет, даже fade-out отсутствует.
* **Внутренние поповеры тулбара редактора:**
  - Дропдаун стилей текста `Aa` (строки 841–912)
  - Дропдаун списков `≡ ▾` (строки 916–980)
  - Дропдаун длительности задачи (строки 1310–1345)
  - Дропдаун повтора задачи (строки 1365–1405)
  - Календарь срока `DatePickerPopover` (строка 1268)
  - Мобильные тулбары форматирования, списков, ИИ (строки 1654–1845)
  - **Статус:** Все поповеры имеют вход `motion-popover`, но при закрытии **мгновенно исчезают без анимации выхода**.

### 3.3. Модалка сравнения изменений (DiffModal)
* **Файл:** `src/components/Modals/DiffModal.tsx:485-508`
* **Вход:** `motion-fade` через `@starting-style` (строка 177).
* **Выход:** **КРИТИЧЕСКИЙ ОБРЫВ.** В `AssistantChat.tsx:1228` рендерится как `{diffModalData && <DiffModal ... />}`. При закрытии стейт обнуляется в `null`, окно моментально срезается из дерева без затухания.

### 3.4. Просмотрщик картинок (ImageLightbox)
* **Файл:** `src/components/UI/ImageLightbox.tsx:29-530`
* **Оверлей просмотрщика:** обернут в `usePresence(isOpen)` с `motion-fade`. Вход и выход плавные.
* **Боковая панель OCR-текста (`isTextPanelOpen`, строки 396–480):**
  - Вход: `motion-fade`.
  - **Выход: мгновенный unmount** (`{isTextPanelOpen && <aside ...>}`) без анимации задвижения.
  - Что нужно: выезд/заезд панели справа (`translateX(100%) <-> translateX(0)`).

---

## 4. ИНЛАЙНОВЫЕ ЭЛЕМЕНТЫ, КОМПОЗЕР, КАРТОЧКИ И ФИЛЬТРЫ

### 4.1. Саджесты автодополнения в Композере
| Элемент | Файл и строка | Вход сейчас | Выход сейчас | Что нужно сделать |
|---|---|---|---|---|
| **Саджест слэш-команд (`/`)** | `src/components/Feed/SlashCommandMenu.tsx:51`, вызов `Composer.tsx:1481` | `.motion-popover` (fade-in 150мс). | **Мгновенный unmount** `{slashQuery !== null && <SlashCommandMenu .../>}` при выборе команды, пробеле или Escape. | Обернуть в `usePresence` для плавного fade-out (100мс). |
| **Саджест папок (`@`)** | `src/components/Feed/FolderSuggestionMenu.tsx:30`, оболочка `SuggestionMenuShell.tsx:29` | `.motion-popover` (fade-in 150мс). | **Мгновенный unmount** в `Composer.tsx:1469`. | Обернуть `SuggestionMenuShell` в `usePresence`. |
| **Саджест тегов (`#`)** | `src/components/Feed/TagSuggestionMenu.tsx:29`, оболочка `SuggestionMenuShell.tsx:29` | `.motion-popover` (fade-in 150мс). | **Мгновенный unmount** в `Composer.tsx:1515`. | Обернуть `SuggestionMenuShell` в `usePresence`. |
| **Саджест вики-ссылок (`[[`)** | `src/components/Feed/Composer.tsx:1491-1513` | `.motion-popover` (fade-in 150мс). | **Мгновенный unmount** при сбросе `wikiQuery`. | Обернуть `SuggestionMenuShell` в `usePresence`. |
| **Баннер подсказки фиксации войса/видео** | `src/components/Feed/Composer.tsx:1585-1589` | `.motion-popover` + `.animate-bounce`. | Мгновенный unmount при отпускании пальца. | Плавное затухание через `usePresence`. |

### 4.2. Поповеры и дропдауны параметров задачи в Композере
| Элемент | Файл и строка | Вход сейчас | Выход сейчас | Что нужно сделать |
|---|---|---|---|---|
| **Селектор типа записи** (Заметка / Таска / Статья) | `Composer.tsx:1610`, `MenuDropdown.tsx:156` | Портал в `document.body`, `.motion-popover`. | **Мгновенный unmount** (`portalContent = isOpen ? createPortal : null`). | Встроить `usePresence` внутрь базового `MenuDropdown.tsx`. |
| **Календарик дедлайна (DatePickerPopover)** | `ComposerTaskControls.tsx:64-78`, `DatePickerPopover.tsx:103` | `.motion-popover` через `@starting-style`. | **Мгновенный unmount** `{isDatePickerOpen && <DatePickerPopover .../>}` при клике на дату или Escape. | Внедрить `usePresence(isOpen)` внутрь `DatePickerPopover`. |
| **Дропдаун длительности задачи** (15, 30, 45, 60 мин) | `ComposerTaskControls.tsx:82-144`, `MenuDropdown.tsx` | `.motion-popover`. | **Мгновенный unmount** в `MenuDropdown`. | Решается через `usePresence` в `MenuDropdown.tsx`. |
| **Дропдаун повтора задачи** (каждый день/неделю) | `ComposerTaskControls.tsx:147-201`, `MenuDropdown.tsx` | `.motion-popover`. | **Мгновенный unmount** в `MenuDropdown`. | Решается через `usePresence` в `MenuDropdown.tsx`. |
| **Селектор приоритета задачи** | `ComposerTaskControls.tsx:205-250`, `Select.tsx:223` | Портал в `document.body`, `.motion-popover`. | **Мгновенный unmount** в `Select.tsx:211`. | Встроить `usePresence` внутрь базового `Select.tsx`. |

### 4.3. Карточка записи в ленте (ItemCard)
| Элемент | Файл и строка | Вход сейчас | Выход сейчас | Что нужно сделать |
|---|---|---|---|---|
| **Аккордеон подзадач** | `src/components/Feed/ItemCard.tsx:565-612` | Подзадачи мгновенно появляются через `{isSubtasksExpanded && ...}`. | **Мгновенный unmount.** Карточка и лента ниже резко прыгают вверх (layout jump). | Сделать плавный CSS-грид переход: `grid-template-rows: 0fr -> 1fr`, `overflow-hidden`, `transition-[grid-template-rows,opacity] duration-200 ease-out` + вращение шеврона `rotate-180`. |
| **Аккордеон OCR-текста на фото** | `src/components/Feed/ItemCard.tsx:733-737` | Текст появляется мгновенно без перехода. | **Мгновенный unmount**, резкий срез высоты карточки. | CSS grid-transition высоты (`0fr -> 1fr`) и `opacity`. |
| **Сворачивание/разворачивание тегов (`+N`)** | `src/components/Feed/ItemCard.tsx:882-894` | Мгновенная подмена массива чипсов. | Скачок верстки при скрытии. | Плавная анимация появления добавленных чипсов. |
| **Ховер-кнопки действий на десктопе** | `src/components/Feed/ItemCard.tsx:454-488` | `sm:w-0 sm:opacity-0 sm:group-hover:w-6 sm:group-hover:opacity-100`. | В `transition` указаны только `[color,background-color,opacity]`, поэтому ширина скачет рывком. | Добавить `width` в переход: `transition-[color,background-color,opacity,width] duration-150 ease-standard`. |
| **Отметка чекбокса задачи (TaskStatusMark)** | `src/components/UI/TaskStatusMark.tsx:32-47` | Штрих рисуется (`motion-check-draw` 200мс), кольцо садится (`motion-check-ring` 200мс). | Мгновенный сброс при снятии отметки. | Работает корректно. |

### 4.4. Верхние баннеры, фильтры и аудиоплеер
| Элемент | Файл и строка | Вход сейчас | Выход сейчас | Что нужно сделать |
|---|---|---|---|---|
| **Баннер закрепленных сообщений (PinnedBanner)** | `src/components/Feed/PinnedBanner.tsx:90-194` | Мгновенный рендер без анимации высоты. | **Мгновенный unmount** при откреплении последней записи. Лента резко подпрыгивает на 44px (`h-11`). | Анимировать уход через `usePresence` с плавным схлопыванием высоты (`grid: 1fr -> 0fr` и `opacity: 1 -> 0`), плавная смена текста при циклическом клике. |
| **Полоса активных фильтров (ActiveFilterBadges)** | `src/components/Feed/ActiveFilterBadges.tsx:56-180` | Мгновенное появление чипов. | **Мгновенный unmount** удаленного чипа, остальные резко прыгают. При удалении последнего — весь контейнер исчезает рывком. | Плавное схлопывание чипа по ширине (`width: auto -> 0`, `opacity: 1 -> 0`) и FLIP-анимация соседних чипов. |
| **Баннер ответа в композере (Reply Banner)** | `src/components/Feed/Composer.tsx:1362` | `.motion-fade` через `@starting-style`. | **Мгновенный unmount** при клике на крестик отмены. | Плавное схлопывание высоты через `usePresence`. |
| **Рекордеры войсов и видео-кружков** | `src/components/Feed/Composer.tsx:1529, 1537` | `.motion-fade`. | Мгновенный unmount при отмене/отправке. | Плавный fade-out. |
| **Дровер очереди треков в плеере (AudioPlaylistDrawer)** | `src/components/Audio/AudioPlaylistDrawer.tsx:58-256` | `.motion-fade`. | **Мгновенный unmount** (`if (!isOpen) return null`). | Добавить `usePresence(isOpen)` со сдвигом/фейдом. |
| **Поповеры выбора папки в аудиоплеере** | `AudioPanel.tsx:621-645`, `AudioPlaylistDrawer.tsx:117-138` | Чистый условный рендер без классов анимации. | Мгновенный unmount. | Добавить `.motion-popover` и плавный выход. |
| **Аккордеоны в ассистенте (рассуждения и поиск)** | `src/components/Feed/AssistantChat.tsx:657, 1050` | Мгновенный рендер `{expanded && ...}`. | Мгновенный unmount без анимации высоты. | Плавный grid-transition раскрытия высоты (`0fr -> 1fr`). |
