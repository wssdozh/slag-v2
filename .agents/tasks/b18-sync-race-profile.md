# синк: гонка при записи бандла и профиль, который не доезжал

- **цель**: ошибка «Local state changed while persisting sync» больше не всплывает на экран синка,
  а имя и аватар профиля приезжают на второе устройство.
- **трогаем**: `src/lib/storage/index.ts` (импорт синка), новый `src/lib/storage/syncReconcile.ts`,
  `src/lib/sync/syncEngine.ts` (staged import), `src/lib/sync/applyBundle.ts`,
  `src/components/Settings/ProfileCard.tsx`.
- **не трогаем**: `src/components/Feed/*`, фуллредактор, задачи, реактивность ленты — их правят
  другие ветки; протокол синка и формат бандла не меняются.
- **готово когда**: `npm run check` зелёный; `e2e/sync_persist_race.spec.ts` и
  `e2e/sync_profile_workspace.spec.ts` зелёные; `e2e/slag/feed.spec.ts` без новых падений.
- **уже выяснили**:
  - `Local state changed…` кидался в `importSyncedVaultData`, если во время записи бандла на диск
    локальный стейт успевал измениться. Там же рекурсивно переписывался локальный стейт, и бандл
    не ACK-ался: relay присылал его снова, гонка повторялась, на экране горела «Ошибка».
  - профиль лежал в `workspaceState` и уходил в `workspace`-канале бандла, но движок складывал
    staged workspace в буфер под полем `workspace`, а `importSyncedVaultData` читал
    `workspaceState`. Применялось ничего: ни профиль, ни остальной workspace с другого устройства.
  - `ProfileCard` читал хранилище один раз в `useState` и не перерисовывался после синка.

---

после работы: гонка теперь не ошибка, а трёхсторонний merge (стенд: `reconcileSyncedVault`),
бандл ACK-ается, локальная правка уходит на диск обратно. Профиль и остальной workspace
применяются (`workspaceState` в буфере). Осталось: `e2e/sync_attachment_transfer.spec.ts` и
`e2e/sync_vault_isolation.spec.ts` падают и на базе — чужое, не это; `e2e/slag/feed.spec.ts`
(тизер статьи, AI-чип) падает так же на базе.
