# тихие часы как режим с тайм-пикером

- **цель**: экран «уведомления» без серых под-описаний; «тихие часы» — один тумблер «не беспокоить», а границы окна выбираются модалкой с двумя колёсами вместо двух текстовых полей.
- **трогаем**: `src/components/Settings/NotificationsSettingsTab.tsx`, `src/components/Settings/notifications/*` (QuietHoursGroup, SystemGroup, ContentGroup, ChannelGroup, PermissionsGroup, accessCopy), новый `src/components/UI/TimePicker.tsx`, `src/types/index.ts` (`NotifyPrefs.quietEnabled`), `src/lib/notify/prefs.ts`, `src/lib/notify/quiet.ts`, `e2e/settings_integrations.spec.ts`.
- **не трогаем**: `src/components/Modals/BaseModal.tsx` (его стилизует другая ветка — только импорт), `src-tauri/**`, ветку/пуш.
- **готово когда**: `npm run check` = `0 warnings and 0 errors`; `SLAG_E2E_PORT=6112 PLAYWRIGHT_WORKERS=1 npx playwright test e2e` зелёный; `test-results/screenshots/notify-quiet-{desktop,mobile}.png` с открытой модалкой.
- **уже выяснили**:
  - тихие часы живут в `NotifyPrefs` (`quietFrom`/`quietTo`), читаются `getNotifyPrefs()` и применяются `inQuietHours`/`shiftOutOfQuiet` — отдельного `useNotifyPrefs` в репозитории нет, поэтому режим добавлен полем `quietEnabled` туда же, где окно.
  - спека про уведомления одна: `e2e/settings_integrations.spec.ts` (второй проход по табам — `settings_consistency`).
  - на мобиле корень настроек — `motion-screen` с `translate`, то есть containing block для `fixed`: диалог поверх него обязан рендериться порталом (`BaseModal portal`).

---

после работы допиши: что оказалось не так, как думали, и что осталось.
