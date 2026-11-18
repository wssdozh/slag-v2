// The address book of the old profile: which key becomes a setting, which feeds a vault's
// `state.json`, and which is not worth carrying. `legacyProfile.ts` is pure above the import, so
// this file reads the split as is — the import itself needs Tauri and is not covered here.
import assert from 'node:assert/strict';
import test from 'node:test';
import { splitLegacyKeys } from '../src/lib/storage/legacyProfile.ts';

const key = (split, name) => split.vault.find((entry) => entry.key === name);

test('split: every known key lands at its own address', () => {
  const split = splitLegacyKeys([
    'slag_workspace_state_default_vault',
    'slag_drafts_default_vault',
    'slag_assistant_default_vault',
    'slag_memory_default_vault',
    'slag_fullscreen_draft_default_vault_item_1763443820000',
  ]);

  assert.deepEqual(key(split, 'slag_workspace_state_default_vault'), {
    key: 'slag_workspace_state_default_vault',
    vaultId: 'default_vault',
    section: 'workspace',
  });
  assert.equal(key(split, 'slag_drafts_default_vault').section, 'drafts');
  assert.equal(key(split, 'slag_assistant_default_vault').section, 'chat');
  assert.equal(key(split, 'slag_memory_default_vault').section, 'memory');
  assert.deepEqual(key(split, 'slag_fullscreen_draft_default_vault_item_1763443820000'), {
    key: 'slag_fullscreen_draft_default_vault_item_1763443820000',
    vaultId: 'default_vault',
    section: 'drafts',
  });
  assert.deepEqual(split.prefs, [], 'nothing from the vault ends up in settings.json');
  assert.deepEqual(split.drop, []);
});

test('split: the fullscreen prefix is not the composer prefix', () => {
  const split = splitLegacyKeys(['slag_drafts_default_vault', 'slag_fullscreen_draft_default_vault_item_1']);

  assert.equal(key(split, 'slag_drafts_default_vault').vaultId, 'default_vault');
  assert.equal(key(split, 'slag_fullscreen_draft_default_vault_item_1').vaultId, 'default_vault');
  assert.equal(split.vault.length, 2);
});

test('split: a generated vault id and an arbitrary one both come out whole', () => {
  const uuid = 'vault_8f14e45f-ceea-467a-9e4b-2b3f8f0e1234';
  const split = splitLegacyKeys([
    `slag_workspace_state_${uuid}`,
    `slag_drafts_${uuid}`,
    `slag_assistant_${uuid}`,
    `slag_memory_${uuid}`,
    `slag_fullscreen_draft_${uuid}_item_42`,
  ]);

  for (const entry of split.vault) assert.equal(entry.vaultId, uuid, entry.key);
  assert.equal(split.vault.length, 5);

  const named = splitLegacyKeys(['slag_workspace_state_vault_custom-1', 'slag_memory_vault_custom-1']);
  for (const entry of named.vault) assert.equal(entry.vaultId, 'vault_custom-1');
});

test('split: the sync keys go to the sync section, bare ones to the default vault', () => {
  const split = splitLegacyKeys([
    'slag_sync_config_v2_default_vault',
    'slag_sync_config_v2',
    'slag_sync_outbox_vault_8f14e45f-ceea-467a-9e4b-2b3f8f0e1234',
    'slag_sync_cursor_default_vault_room-1',
    'slag_sync_cursor_vault_8f14e45f-ceea-467a-9e4b-2b3f8f0e1234_room-1',
    'slag_sync_last_state_hash',
  ]);

  for (const entry of split.vault) assert.equal(entry.section, 'sync', entry.key);
  assert.equal(key(split, 'slag_sync_config_v2_default_vault').vaultId, 'default_vault');
  assert.equal(key(split, 'slag_sync_config_v2').vaultId, 'default_vault');
  assert.equal(
    key(split, 'slag_sync_outbox_vault_8f14e45f-ceea-467a-9e4b-2b3f8f0e1234').vaultId,
    'vault_8f14e45f-ceea-467a-9e4b-2b3f8f0e1234'
  );
  assert.equal(key(split, 'slag_sync_cursor_default_vault_room-1').vaultId, 'default_vault');
  assert.equal(
    key(split, 'slag_sync_cursor_vault_8f14e45f-ceea-467a-9e4b-2b3f8f0e1234_room-1').vaultId,
    'vault_8f14e45f-ceea-467a-9e4b-2b3f8f0e1234'
  );
  assert.equal(key(split, 'slag_sync_last_state_hash').vaultId, 'default_vault');
});

test('split: what the disk rebuilds, or the secret store owns, is dropped', () => {
  const split = splitLegacyKeys([
    'slag_items_default_vault',
    'slag_folders_default_vault',
    'slag_attachments_default_vault',
    'slag_trash_default_vault',
    'slag_account_device_v1:device-1',
    'slag_secure_v1:vault-seed:default_vault',
    'slag_account_session_v1',
  ]);

  assert.deepEqual(split.vault, []);
  assert.deepEqual(split.prefs, []);
  assert.deepEqual(split.drop, [
    'slag_items_default_vault',
    'slag_folders_default_vault',
    'slag_attachments_default_vault',
    'slag_trash_default_vault',
    'slag_account_device_v1:device-1',
    'slag_secure_v1:vault-seed:default_vault',
    'slag_account_session_v1',
  ]);
});

test('split: machine settings and unknown keys stay in prefs', () => {
  const split = splitLegacyKeys([
    'slag_sidebar_width_v2',
    'slag_ui_config_v2',
    'slag_ai_settings_v2',
    'slag_backup_settings_v2',
    'slag_current_vault_v2',
    'slag_vaults_v2',
    'theme',
    'some_setting_nobody_remembers',
  ]);

  assert.deepEqual(split.vault, []);
  assert.deepEqual(split.drop, []);
  assert.deepEqual(split.prefs, [
    'slag_sidebar_width_v2',
    'slag_ui_config_v2',
    'slag_ai_settings_v2',
    'slag_backup_settings_v2',
    'slag_current_vault_v2',
    'slag_vaults_v2',
    'theme',
    'some_setting_nobody_remembers',
  ]);
});

test('split: no key is lost and none is counted twice', () => {
  const keys = [
    'slag_workspace_state_default_vault',
    'slag_drafts_default_vault',
    'slag_memory_default_vault',
    'slag_fullscreen_draft_default_vault_item_1',
    'slag_items_default_vault',
    'slag_sync_config_v2_default_vault',
    'slag_sidebar_width_v2',
    'theme',
  ];
  const split = splitLegacyKeys(keys);

  const addresses = [...split.prefs, ...split.drop, ...split.vault.map((entry) => entry.key)];
  assert.deepEqual(addresses.sort(), [...keys].sort());
  assert.equal(new Set(addresses).size, keys.length);
});

test('split: an empty profile is an empty split', () => {
  assert.deepEqual(splitLegacyKeys([]), { prefs: [], vault: [], drop: [] });
});
