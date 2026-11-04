# 47–50 — личный кабинет: safe area и аппаратный Back

[← оглавление](../README.md) · [исходная рекомендация](../47-account-page-screen.md)

**до:** [47](<../../test-results/screenshots/audit/47_account_page_screen.png>) · [48](<../../test-results/screenshots/audit/48_back_from_account.png>) · [49](<../../test-results/screenshots/audit/49_back_to_app.png>) — заголовок и «Открыть приложение» нарисованы поверх часов, back оставляет на том же экране.

**после:** ![кабинет](<shots/47-after.png>) ![возврат по back](<shots/50-after.png>)

## что изменено

1. `src/lib/navigation.ts` — один переход между страницами через `history.pushState` + `popstate`. Им пользуются настройки, лендинг и кабинет. Раньше три места делали `window.location.search = …`, что перезагружало WebView и обнуляло стек — после этого back некуда было возвращаться.
2. `AccountCabinet` — верхний inset через `max(var(--sat), 1rem)`, нижний через `var(--sab)`; кнопка возврата получила нормальную зону нажатия. «Открыть приложение» идёт назад по истории, а при прямом запуске страницы — на корень через `replaceState`, чтобы back не возвращал в кабинет по кругу.

## проверка

- заголовок кабинета на y=46 CSS px при `--sat: 40px` — ниже системных значков (CDP + скриншот).
- `adb shell input keyevent 4` из кабинета: URL вернулся к корню, кабинет исчез, приложение на месте.
