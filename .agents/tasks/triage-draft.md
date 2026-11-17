# передача черновика из композера в редактор

- **цель**: после expand → редактирования → save исходный черновик не остаётся; cancel сохраняет данные и вложения.
- **трогаем**: Composer.tsx (snapshot владельца), useFullscreenDraft.ts (conditional consume/restore), useComposerDraft.ts (пауза autosave), fullscreen/composerDraftOwner.ts (внутренний WeakMap), e2e/triage_draft.spec.ts.
- **не трогаем**: чужая грязная основная копия, модели и контракты, attachment internals, поиск, реальные заметки.
- **готово когда**: воспроизводящий e2e на порту 5323 с одним worker и screenshot; npm run check; conventional commit без build/merge/push.
- **уже выяснили**: fullscreen удалял draft по равенству текста и папке назначения; parser и редактура меняют текст, а исходный slot принадлежит activeFolder.

---

выяснилось: передавать владение удалением на expand нельзя — persisted draft нужен при crash. вместо этого snapshot хранит vault, slot и полное нормализованное содержимое; очистка только после saveItem и только при неизменном slot. StrictMode simulated unmount вызывает sync-back на mount: restore обновляет собственный snapshot, но не трогает более свежий slot. pending composer autosave при открытом редакторе остановлен. identity SlagItem сохраняется через AppContext и cachedItem. после reload WeakMap намеренно исчезает: консервативно не удаляет неизвестный draft. существующий saveItem синхронный контракт не даёт ждать фактический disk flush.
