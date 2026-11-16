# B15: на строке с кареткой — сырой markdown вместо виджетов

- **цель**: в фокус-редакторе строка под кареткой показывает сырые `- `, `1. `, `- [ ]`, а остальные
  строки остаются оформленными (буллет `•`, чекбокс). Единая логика с композером: активная строка —
  сырой текст.
- **трогаем**: `patches/@atomic-editor__editor@0.6.2.patch`, `pnpm-workspace.yaml` (реестр патчей),
  `pnpm-lock.yaml`, e2e-тест 49 в `e2e/slag/editor.spec.ts`. В `src/` правок нет.
- **не трогаем**: `FullscreenEditor.tsx` целиком, `src/index.css`, `MarkdownRenderer` карточек.
- **готово когда**: `npm run check` зелёный; e2e 49 зелёный (сырой `- [ ]` под каретой, чекбокс на
  соседней строке); `pnpm install --frozen-lockfile` переприменяет патч без ошибок.
- **уже выяснили**: live-preview целиком в `@atomic-editor/editor@0.6.2` (`dist/inline-preview.js`);
  `HeaderMark` уважает `activeLines`, `ListMark` (503-594) и `TaskMarker` (634-653) — нет.

## Как чинится

Патч пакета через `pnpm patch @atomic-editor/editor@0.6.2` → правка
`dist/inline-preview.js` → `pnpm patch-commit <dir>`. В `ListMark` появился `isActiveLine`:
на активной строке не ставится replace-виджет (буллет / `- ` перед `[ ]`) и не прячется пробел у
ordered-маркера. В `TaskMarker` replace-чекбокс ставится только на неактивных строках; strike для
`[x]` остаётся. Структурный висячий отступ и `cm-atomic-task-done` не тронуты.

`pnpm patch-commit` сам положил реестр в `pnpm-workspace.yaml` (`patchedDependencies`) — это
канонический дом для настроек pnpm ≥10, в `package.json` `pnpm.patchedDependencies` больше не пишется.
`node_modules` — общий junction в основную копию, поэтому патч применился сразу ко всем worktree.

## Что оказалось не так, как думали

- `pnpm patch-commit` подчистил в `pnpm-lock.yaml` блок `optionalDependencies` у снимка
  `@atomic-editor/editor` — это сторонний шум pnpm 11, вернул руками, чтобы диff остался про патч.
- В e2e карточку простой заметки нельзя открыть в редакторе с клавиатуры/кликом по телу: кнопка
  «Открыть в фокус-редакторе» рендерится только для `type: 'article'` (`ItemCardActions`). Поэтому
  тест сидит статью.

## Что осталось

- Апстрим: issue в github.com/kenforthewin/atomic-editor; после релиза с фиксом патч можно снять.
