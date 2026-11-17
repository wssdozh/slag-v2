# аудит веток — 2026-11-17

## выполнено позже (по прямому разрешению пользователя)

- собрана ветка `integration/consolidate-main` от `6f54dc2`; все 10 клиентских refs вошли merge-коммитами с сохранением ancestry: integration/improvements, feat/landing-media, 5 triage-фиксов, fix/node-http-ack, feat/hero-nopanel, feat/landing-blocks.
- конфликты 9 файлов разрешены вручную: сохранены cm-композер, nested settings rail, menus/audio интеграции и новый lucide-реестр.
- `d7a4792` (kanban без materials dock) отменён отдельным `3928422`: это был продуктовый дефолт, сделанный ради съёмок, и он ломал `feed.spec`. capture-скрипты остались.
- финальный кандидат `0c40335`, 137 коммитов поверх прежней main.
- проверено: frozen install с atomic-editor patch, check 0/0, build, scripts 35/35, targeted 28 (27 + исправленный cm), ci-subset с последующими изолированными повторами всех 4 падений, 12 mcp/stdio + cm повторно lead'ом.
- полный 400-тестовый прогон **incomplete** (job утрачен после завершения хода агента) и полная sync/audio пачка **unverified** — это не объявляется зелёным.
- `main` отправлен: `b636dec..0c40335`, push обошёл 2 required status checks (админский bypass).
- ci на main: run [44039809160](https://github.com/wssdozh/slag-v2/actions/runs/44039809160) — success (check, rust-linux, e2e).
- dev-релиз: run [44039848432](https://github.com/wssdozh/slag-v2/actions/runs/44039848432) — success, опубликован [v0.2.5-dev.16](https://github.com/wssdozh/slag-v2/releases/tag/v0.2.5-dev.16) с apk, exe, nsis-установщиком и latest.json. linux/arch пропущены штатно для канала dev.
- ветки, worktrees, stash и грязная основная копия **не удалялись**.

## исходный аудит

после `git fetch origin`. изначально пользователь выбрал **только аудит**: тогда никаких merge, cherry-pick, reset, удаления веток/worktrees и push не выполнялось.

## главная находка

- default remote: `origin/main`, коммит `b636dec`.
- локальной `main` нет. `master`/`origin/master` стоят на `de03b40`, на 17 коммитов позади `origin/main`.
- `fix/slag-bugs-integration` / origin одноимённой ветки: `6f54dc2`, **107 коммитов впереди origin/main, 0 позади**. её tip включает main; продвижение main до этого tip возможно fast-forward, но проверки установленной интеграции ещё нужны.
- текущая основная копия: `feat/landing-media` = `688bcf3`, 16 коммитов впереди origin/main. относительно баг-интеграции расходится: **93 только в интеграции / 2 только в landing-media**. эти два — миграции иконок tabler → lucide.
- свежие triage ветки основаны на landing-media, а не на полном актуальном наборе баг-интеграции. их отдельные зелёные тесты не доказывают совместимость с интеграцией, особенно composer и mcp.

## уже включены в баг-интеграцию (ancestry)

повторно мержить не нужно:

- `feat/ai-tagging`
- `feat/composer-field-adapter`, `feat/composer-cm-field`
- `feat/mcp-attachments`, `feat/modals-search`, `feat/profile-hero`
- `feat/settings-devices`, `feat/settings-notify`, `feat/settings-sections`, `feat/settings-sync`, `feat/settings-updates`
- `fix/b15-editor-rawline`, `fix/b16-subtask-autoclose`, `fix/b17-status-reactivity`, `fix/b18-sync-race-profile`, `fix/b19-context-menu`, `fix/b20-profile-guard`
- `refactor/module-layout` совпадает с origin/main и также уже включена.
- `origin/fix/android-ux-audit` — предок интеграции, уникальных коммитов нет.

это означает «включены в интеграцию», **не «уже в main»**. main до сих пор без этих 107 последующих коммитов.

## отдельные уникальные изменения

| ветка | tip | что отдельно от баг-интеграции | действие после разрешения |
|---|---|---|---|
| feat/landing-media | 688bcf3 | 50ac116, 688bcf3: tabler затем lucide | сравнить конечный icon registry и зависимости; включить актуальный lucide без отката остальной интеграции |
| fix/triage-search | 864ce11 | синхронизация пула общего индекса, сериализация sync+query | перенести фикс/тест, повторить на полной интеграции |
| fix/triage-attachments | a9491f0 | однозначность id/path и порядок legacy одноимённых embeds | перенести, проверить с прежними mcp attachment/card changes |
| fix/triage-draft | 91f53cd | ownership черновика, conditional consume, cancel/newer draft | адаптировать к уже code mirror-композеру интеграции, не выбирать whole-file ours/theirs |
| fix/triage-mcp | ce13596 | schedules write contract и сохранение omitted fields | совместить с notePatch/noteCard из старой интеграции; не заменять ими весь tools/vault |
| fix/triage-mobile-layout | b0c1657 | task controls 130→92px, sheet cap resize | перенести и перепроверить обе ветви textarea/code mirror |
| fix/node-http-ack | fdaddc4 | 1 уникальный коммит, receive-only ack через HTTP | проверить transport/syncSocket и синк-регрессию на 1 worker |
| feat/hero-nopanel | 625fabe | 5 уникальных коммитов: 4 capture-сценария и d7a4792 поведение kanban без materials dock | отделить продуктовый выбор от съёмок; не смешивать автоматически |
| feat/landing-blocks | 181c9db | 1 уникальный commit: static markup/css четырёх экранов | отдельно оценить актуальность экспорта; **не входит ни в landing-media, ни в баг-интеграцию** |
| integration/improvements | ad1901f | 4 уникальных merge-коммита, но нет уникальных non-merge и git cherry пуст | не мержить вслепую: merge-resolution diff ещё может отличаться |

важная поправка к промежуточному сообщению: предположение «landing-blocks уже есть в landing-истории» **неверно**. ancestry exit 1 и git cherry `+181c9db` подтвердили, что экспорт остался отдельно.

## старые/чужие линии

- `feat/animations`, `refactor/decomposition`, `wip/r18-1`, `wip/r18-2` — предки master, уникальных коммитов относительно него нет. возможные кандидаты на архивирование позже, **сейчас не удалены**.
- `relay-extract-20261114` относится к истории отдельного slag-relay: remote relay/main, не смешивать с клиентом slag-v2.

## незакоммиченное и stash

- основная копия: изменён `src/components/Editor/useFullscreenDraft.ts`; неотслеживаемые `.agents/reports/`, `.agents/tasks/rust-core-boundary.md`, `.agents/tasks/slag-bugfix-goal.md`.
- worktree hero-nopanel: неотслеживаемые `video-out-1200/`, `video-out-story2/`.
- stash@{0}: `On feat/modals-search: modals-search wip 2`. содержимое в этом аудите не раскрывалось и stash не применялся.
- остальные перечисленные worktrees чистые после завершения мобильного агента.

ни stash, ни незакоммиченное нельзя молча считать мусором или уже перенесённой работой.

## безопасный порядок будущего слияния

1. отдельный чистый consolidation worktree от **6f54dc2**; не переключать грязную основную копию.
2. включить два icon-коммита landing-media, вручную разрешить только реальные конфликты; сохранить старые багфиксы/релизный pipeline.
3. по одному перенести пять triage фиксов с адаптацией к актуальному composer/mcp. никаких whole-file `ours/theirs`.
4. проверить receive-only HTTP ack; включать после sync regression.
5. решить судьбу hero kanban и static exports отдельно, stash/грязную правку проверить отдельно.
6. `npm run check`, `npm run build`; обычные e2e **6 workers**, sync/audio **1 worker**; UI screenshots, native Android build при изменениях src-tauri, device test если устройство есть.
7. показать точный состав кандидата и оставшиеся хвосты. только после разрешения fast-forward main; push отдельным разрешённым действием.
8. лишь после подтверждения main и сохранности wip — архивировать/удалять merged ветки/worktrees. junction node_modules сначала снимать отдельно.

## состояние проверки свежих фиксов

поиск/вложения/черновик/mcp: оркестратор независимо выполнил check+build всех четырёх веток, 7 UI/search e2e и 14 mcp/security включая stdio — зелёные. мобильная: агент сообщил check, 10 picker/layout + 9 sheet/gesture + повтор 2 новой регрессии зелёные; оркестратор затем независимо подтвердил check 0/0, build exit 0 и 8 picker/layout e2e passed (лимит 6 workers, реально 2 по числу файлов). общий полный suite и объединённый кандидат не проверены, поскольку объединения не было.
