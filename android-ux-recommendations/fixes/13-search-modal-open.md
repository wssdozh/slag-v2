# 13б — поиск: статус тасок, символ Enter и подсказка

[← оглавление](../README.md) · [исходная рекомендация](../13-search-modal-open.md)

**до:** [скриншот аудита](<../../test-results/screenshots/audit/13_search_modal_open.png>)

**после:** ![13б — поиск: статус тасок, символ Enter и подсказка](<shots/13-after.png>)

## что изменено и исправлено

1. **Правдивая иконка таски:** вместо статической желтой галочки `CheckSquare` отображается реальный статус — незавершённые таски показывают нейтральный круг `Circle`, завершённые — зелёную `CheckCircle2`.
2. **Скрытие знака Enter на тач-экранах:** глиф `CornerDownLeft` (`↵`) скрыт при сенсорном вводе (`hidden [@media(pointer:fine)]:block`).
3. **Компактный placeholder:** «Поиск по заметкам» целиком помещается на экране, задан `enterKeyHint="search"`.

## проверка

В тесте `search_test.cjs`: `isTodo: true, isDone: false`, `cornerVisible: false`.

**десктоп:** На десктопе при точном указателе (`pointer: fine`) символ Enter сохранён.
