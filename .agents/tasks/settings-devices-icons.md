# настройки: иконки устройств, шестерёнка доступа и привязка из шапки

- **цель**: строка устройства показывает свою форму (телефон, ноутбук, пк, планшет, браузер, неизвестное); доступ к хранилищам открывается иконкой-шестерёнкой; в шапке «подключённых устройств» есть «+», который запускает тот же флоу привязки, что и нижняя кнопка.
- **трогаем**: `src/lib/sync/deviceKind.ts` (новый), `src/components/Settings/devices/DeviceIcon.tsx` (новый), `DeviceList.tsx`, `DevicePermissions.tsx`, `DeviceActions.tsx`, `DevicesSettingsTab.tsx`, `IntegrationsSettingsTab.tsx`, `src/components/UI/icons/icons.ts`, `e2e/settings_devices_icons.spec.ts` (новый), `e2e/settings_integrations.spec.ts`.
- **не трогаем**: `src/components/Modals/BaseModal.tsx` (другая ветка), `SettingsUI.tsx` (доп. проп не понадобился), синк-движок, релей.
- **готово когда**: `npm run check` — `0 warnings and 0 errors`; `SLAG_E2E_PORT=6113 PLAYWRIGHT_WORKERS=1 npx playwright test` по устройствам/интеграциям зелёный; `test-results/screenshots/devices-icons.png` и `integrations-gear.png` сняты; один коммит.
- **уже выяснили**:
  - у `AccountDevice`/`DeviceProfile` есть только `platform: 'desktop' | 'mobile' | 'web'`, без `os`/`type`; релей хранит `platform` свободной строкой, поэтому маппинг принимает алиасы (`phone`, `ipad`, `notebook`, `pc`, `browser`) и падает в `unknown`;
  - ноутбук и пк из одного `desktop` не различить; `desktop` → иконка монитора, `laptop`/`notebook`/`macbook` → ноутбук;
  - иконки `Tablet` в Iconoir нет — добавлена из lucide, который уже стоял в реестре для четырёх недостающих глифов;
  - попап доступа `fixed` внутри `.motion-dialog`/`.motion-screen` с `translate` и `overflow-hidden` обрезался до карточки настроек; лечится порталом в `document.body`, `BaseModal` для этого не нужен;
  - в `IntegrationsSettingsTab` на этой базе уже не галочка, а шестерёнка с тумблером (это осознанный дизайн из `.agents/tasks/settings-integrations-tab.md`), поэтому приведена к общему `IconButton` с `title`/`aria-label`; статус в списке не возвращён, чтобы не спорить с тем же дизайном.
- **после работы**: `sync_vault_isolation.spec.ts` падает и на базе без этих правок (закрытие настроек кликает первую кнопку — вкладку «Аккаунт»), к этой задаче отношения не имеет.
