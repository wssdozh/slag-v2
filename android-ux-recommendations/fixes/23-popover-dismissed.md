# 23 — уже лента, а не только закрытый popover

[← оглавление](../README.md) · [исходная рекомендация](../23-popover-dismissed.md)

**до:** [скриншот аудита](<../../test-results/screenshots/audit/23_popover_dismissed.png>)

**после:** ![23 — уже лента, а не только закрытый popover](<shots/20-single-save.png>)

## что изменено и исправлено

1. **LIFO-обработка Escape в capture-фазе:** в `FullscreenEditor` слушатель `keydown` переведён в capture-фазу (`window.addEventListener('keydown', handleKeyDown, true)`).
2. Если открыт мобильный поповер, обработчик редактора вызывает `e.stopPropagation()` и закрывает только поповер. Глобальный обработчик Back больше не схлопывает редактор одновременно с меню.

## проверка

Тест `lifo2.cjs`: первый Escape закрывает поповер (`editorAfter: 1`), второй Escape закрывает редактор (`afterSecond: 0`).

**десктоп:** На десктопе Escape при отсутствии поповеров закрывает редактор сразу.
