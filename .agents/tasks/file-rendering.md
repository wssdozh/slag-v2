# file-rendering: ![[file]] как вложение, а не битая картинка

- **цель**: `![[name]]` в ленте и в полноэкранном редакторе рендерится как вложение (превью картинки или чип файла), а не как `<img src="wiki:...">` и не как сырой текст; WikiLink `[[Title]]` работает как раньше.
- **трогаем**: `src/lib/text/attachmentEmbed.ts` (новый, разбор токена и резолв по имени), `src/components/UI/MarkdownRenderer.tsx`, `src/components/Feed/ItemCard.tsx`, `src/components/Editor/fullscreen/attachmentEmbeds.ts` (новый, CM6-плагин), `src/components/Editor/FullscreenEditor.tsx`, `src/components/Editor/AttachmentStrip.tsx`.
- **не трогаем**: формат вставки `![[name]]` в `useEditorAttachments.ts`, `docs/CODE_MAP.md`, `ItemSubtasks` (проброс пропсов туда не нужен), `node_modules`.
- **готово когда**: `npm run check` чистый; `npx playwright test e2e/slag/file_rendering.spec.ts` зелёный — чип в ленте, нет `img[src^="wiki:"]`, wiki-ссылка жива, рейл вложений ниже редактора и свёрнут, токен в CM6 заменён виджетом.
- **уже выяснили**: `@atomic-editor/editor` не включает `wikiLinks` по умолчанию, но принимает `extensions` (захватываются на монтировании) — поэтому депсы плагина живут в мутабельном объекте, а `version` бумпается из эффекта с `view.dispatch({})`; `useAttachmentSrcs` не кладёт `dataUrl` в `srcs`, поэтому `src = srcs[id] ?? attachment.dataUrl`.

---

после работы:

- виджет в CM6 без `Prec.highest` не появлялся: плагин `inlinePreview` из `@atomic-editor/editor` вешает свои `Decoration.replace` на те же символы и, как более раннее расширение, перебивал наш replace — строка оставалась пустой. Обёртка `Prec.highest` на плагине решает.
- в виджете нельзя хранить `embed.from`: это смещение внутри строки, а не позиция в документе. Клик уводил курсор в начало дока и токен не раскрывался; абсолютную позицию считает `buildDecorations` и передаёт в виджет.
- линтер (react-hooks/refs + immutability) не дал держать deps в `useRef` и мутировать его из эффекта. Массив расширений и deps-объект лежат в `useState`-инициализаторах (стабильны на весь монтирование), а поля пишет `syncAttachmentEmbedDeps` из `attachmentEmbeds.ts` — для линтера это уже не мутация значения из хука.
- `useAttachmentSrcs` не кладёт `dataUrl` в `srcs`, так что фолбэк на `attachment.dataUrl` обязателен и в ленте, и в редакторе.
- рейл по умолчанию свёрнут, при добавлении файлов `handleAttachmentsAdded` его раскрывает — старый сценарий `views.spec.ts` (28) на «Вставить в текст» остался зелёным.
