# компактный мобильный композер и заполненный медиапикер

- **цель**: task-композер не съедает viewport при клавиатуре; галерея занимает доступное место до footer.
- **трогаем**: BaseComposer.tsx, ComposerTaskControls.tsx, собственный e2e; lead отдельно разрешил точечный resize cap в UI/SheetPanel.tsx.
- **не трогаем**: Composer.tsx, draft/editor hooks, native api, тему, index.css и конфиги; реальные заметки только читаем.
- **готово когда**: измерения на узком/низком viewport, picker обе высоты/скролл, reduced-motion, npm run check, e2e на 5324 с одним worker, screenshot; без build.
- **уже выяснили**: baseline 688bcf3; task controls цельной группой переносятся под type. picker появился c4d5f67; 178eb90 перевёл sheet на transform и max-height body. «обратно» не задаёт конкретный старый вариант — откат функций не обоснован.

---

после работы: корень picker не в MediaGrid — SheetPanel сохранял max-height с низкого viewport после закрытия клавиатуры. воспроизведение: 480 → 844px оставляло 283.93px пустоты. существующий applyBodyCap теперь вызывается и в resize update (разрешено lead). task controls разрешены переноситься по отдельности; на узких телефонах подпись типа уступает место его существующей иконке/aria-label. высота task composer 130 → 92px при 390×480; длинный textarea ограничен 25dvh. native api/функции picker не менялись. проверки: npm run check — 0 errors/warnings; 10 targeted picker/layout tests и 9 existing mobile sheet/gesture tests — passed, port 5324, workers=1. screenshots в test-results/screenshots/triage-*.png прочитаны. browser emulation не равна проверке на android; build запрещён запросом и не запускался.
