import { test, expect } from './support/selfhostFixture';

// Бандл пишется из снимка: пока он идёт на диск, человек успевает сохранить заметку. Старый код
// считал это фатальной ошибкой — бандл оставался pending, а на экране синка загоралась «Ошибка».
test('a note saved while the bundle persists is merged, not failed', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible({ timeout: 120_000 });

  const result = await page.evaluate(async () => {
    const { reconcileSyncedVault } = await import(/* @vite-ignore */ '/src/lib/storage/syncReconcile.ts');
    const { storage } = await import(/* @vite-ignore */ '/src/lib/sync/syncEngine.ts');
    const workspace = storage.getWorkspaceState();
    const build = (id: string, title: string, updatedAt: number) => ({
      id, type: 'note' as const, title, content: `${title} body`, folder: 'Входящие',
      tags: [], attachments: [], createdAt: 1, updatedAt,
    });
    const folderOf = (path: string) => ({ path, name: path, icon: 'folder' });

    const before = [build('a', 'Заметка А', 100), build('b', 'Заметка Б', 100)];

    // A local save lands mid-persist: the note is newer than the copy the bundle carries,
    // a brand-new note appeared, and one note was deleted from the trash side of the app.
    const localNow = [
      { ...build('a', 'Заметка А', 900), content: 'правка, которую нельзя потерять' },
      build('c', 'Заметка В', 950),
    ];
    const remote = [build('a', 'Заметка А', 150), build('b', 'Заметка Б', 150)];

    const merged = reconcileSyncedVault({
      base: { items: before, folders: [folderOf('Входящие')], workspace },
      current: { items: localNow, folders: [folderOf('Входящие')], workspace: { ...workspace, profile: { name: 'Мори' } } },
      incoming: {
        items: remote,
        folders: [folderOf('Входящие')],
        workspace: { ...workspace, profile: { name: 'Старое имя' } },
      },
    });

    // Nothing moved during the write: the remote snapshot is the answer.
    const quiet = reconcileSyncedVault({
      base: { items: before, folders: [folderOf('Входящие')], workspace },
      current: { items: before, folders: [folderOf('Входящие')], workspace },
      incoming: { items: remote, folders: [folderOf('Входящие'), folderOf('Проекты')], workspace: { ...workspace, profile: { name: 'Мори' } } },
    });

    return {
      drifted: merged.drifted,
      titles: merged.items.map((entry: { title: string }) => entry.title),
      keptLocalEdit: merged.items.find((entry: { id: string }) => entry.id === 'a')?.content,
      localWins: merged.localWins.map((entry: { id: string }) => entry.id),
      dropped: merged.dropped.map((entry: { id: string }) => entry.id),
      profile: merged.workspace.profile?.name,
      quietDrifted: quiet.drifted,
      quietTitles: quiet.items.map((entry: { title: string }) => entry.title),
      quietFolders: quiet.folders.map((entry: { path: string }) => entry.path),
      quietProfile: quiet.workspace.profile?.name,
    };
  });

  expect(result.drifted).toBe(true);
  // The local copy of "a" survives, "c" was created during the write, and "b" — deleted locally
  // while the bundle was on its way — is not resurrected by the older remote copy.
  expect(result.titles).toEqual(['Заметка А', 'Заметка В']);
  expect(result.keptLocalEdit).toBe('правка, которую нельзя потерять');
  expect(result.localWins).toEqual(['a']);
  // "b" was deleted locally while the bundle was on its way: the remote copy must not resurrect it.
  expect(result.dropped).toEqual(['b']);
  // The profile still arrives even though the write raced, and the local rename wins the field.
  expect(result.profile).toBe('Мори');
  expect(result.quietDrifted).toBe(false);
  expect(result.quietTitles).toEqual(['Заметка А', 'Заметка Б']);
  expect(result.quietFolders).toEqual(['Входящие', 'Проекты']);
});

test('a workspace change to one field only keeps the rest of the remote state', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible({ timeout: 120_000 });

  const result = await page.evaluate(async () => {
    const { reconcileSyncedVault } = await import(/* @vite-ignore */ '/src/lib/storage/syncReconcile.ts');
    const { storage } = await import(/* @vite-ignore */ '/src/lib/sync/syncEngine.ts');
    const workspace = storage.getWorkspaceState();

    const merged = reconcileSyncedVault({
      base: { items: [], folders: [], workspace: { ...workspace, currentFolder: 'Входящие' } },
      current: { items: [], folders: [], workspace: { ...workspace, currentFolder: 'Проекты' } },
      incoming: {
        items: [],
        folders: [],
        workspace: { ...workspace, currentFolder: 'Старое', profile: { name: 'Мори', avatar: 'data:image/jpeg;base64,A' } },
      },
    });

    return {
      currentFolder: merged.workspace.currentFolder,
      profileName: merged.workspace.profile?.name,
      profileAvatar: merged.workspace.profile?.avatar,
    };
  });

  // The folder the person switched to is theirs; the profile that arrived is the new state.
  expect(result).toEqual({
    currentFolder: 'Проекты',
    profileName: 'Мори',
    profileAvatar: 'data:image/jpeg;base64,A',
  });
});
