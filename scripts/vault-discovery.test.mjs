// The decision the start-up scan makes without a filesystem: which directories under `vaults/` are
// vaults the registry is missing. The rest of the scan reads the directory and writes the registry.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeDiscoveredVaults } from '../src/lib/storage/vaultDiscovery.ts';

const main = { id: 'default_vault', name: 'main', mode: 'tauri', isCurrent: true };
const work = { id: 'work', name: 'work', mode: 'tauri', isCurrent: false, syncId: 'vault_42' };

test('discovery: `main` is default_vault, not a second vault', () => {
  assert.deepEqual(mergeDiscoveredVaults([main], ['main']), [main]);
});

test('discovery: a directory the registry does not know becomes a vault at the end', () => {
  const merged = mergeDiscoveredVaults([main], ['main', 'projects']);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged[1], { id: 'projects', name: 'projects', mode: 'tauri', isCurrent: false });
  assert.deepEqual(merged[0], main, 'существующая запись не меняется');
});

test('discovery: a known vault is neither duplicated nor moved', () => {
  const merged = mergeDiscoveredVaults([main, work], ['work', 'main', 'work']);
  assert.deepEqual(merged, [main, work], 'порядок реестра, без дублей');
});

test('discovery: no directories is the registry as it was', () => {
  const stored = [main, work];
  assert.deepEqual(mergeDiscoveredVaults(stored, []), stored);
});

test('discovery: syncId and isCurrent of existing entries survive the merge', () => {
  const current = { id: 'old', name: 'Старое', mode: 'tauri', isCurrent: true, syncId: 'vault_seed' };
  const merged = mergeDiscoveredVaults([current], ['old', 'fresh']);
  assert.deepEqual(merged[0], current);
  assert.equal(merged[0].syncId, 'vault_seed');
  assert.equal(merged[0].isCurrent, true);
  assert.equal(merged[1].id, 'fresh');
});
