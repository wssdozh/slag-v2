# подразделы внутри вкладки «Хранилище & Бэкап»

- **цель**: разложить простыню из пяти групп на три подраздела с переключателем сверху: «хранилище», «бэкапы», «перенос». Переключение не теряет состояние, не пересчитывает занятое место и не запускает снимок/восстановление; выбранный подраздел запоминается на время сессии.
- **трогаем**: `src/components/Settings/VaultSettingsTab.tsx` (оболочка), новый `src/components/Settings/vault/` (секции, детали кольца), `e2e/backup_restore.spec.ts`, `e2e/confirm_dialog.spec.ts`, `e2e/settings_consistency.spec.ts`, новый `e2e/slag/vault_sections.spec.ts`.
- **не трогаем**: `src/components/Modals/SettingsModal.tsx` и `BaseModal.tsx` (их правит другая ветка), `SettingsUI.tsx` без нужды, `BaseModal`, `src-tauri/`, логику бэкапов и экспорта, testId.
- **готово когда**: `npm run check` печатает ровно `0 warnings and 0 errors`; `SLAG_E2E_PORT=6116 PLAYWRIGHT_WORKERS=1 npx playwright test e2e` по спекам про хранилище/бэкапы/настройки зелёный; `test-results/screenshots/sections-vault.png` и `sections-backups.png` на месте.
- **уже выяснили**: переключатель — `ResponsiveSegmented` + `segmentedVariants` (`variant="plain"`, иконки + подписи в полосе через `showLabelInExpanded`); вкладка в `SettingsModal` размонтируется при уходе на другую вкладку, поэтому память подраздела — модульная переменная, не storage; `hidden`-атрибут держит секции смонтированными (Tailwind preflight делает его `display:none !important`); спеки `backup_restore`/`confirm_dialog`/`settings_consistency` открывают группы сразу после клика по вкладке — им нужен явный клик по подразделу.

---

после работы допиши: что оказалось не так, как думали, и что осталось.
