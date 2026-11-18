// The registry the app keeps in `prefs`: what a stored list means, and what one write does to it.
// The reading and writing of the string belongs to `prefs`; here is the rule on top of the value,
// which is why this runs under plain node with no webview and no Tauri.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeVaultRegistry,
  removeVaultMeta,
  toVaultMeta,
  upsertVaultMeta,
} from '../src/lib/storage/vaultRegistryModel.ts';

const main = { id: 'default_vault', name: 'main', mode: 'tauri', isCurrent: true };
const work = { id: 'work', name: 'work', mode: 'tauri', isCurrent: false, syncId: 'vault_42' };

/** The read `getPrefJson` performs: parse, then the shape rule, then the caller's fallback. */
function readRegistry(raw) {
  if (!raw) return [];
  try {
    return normalizeVaultRegistry(JSON.parse(raw)) ?? [];
  } catch {
    return [];
  }
}

test('registry: a list reads back exactly as it was written', () => {
  const stored = [main, work];
  assert.deepEqual(readRegistry(JSON.stringify(stored)), stored);
});

test('registry: the default vault is not duplicated, and an upsert replaces it in place', () => {
  const doubled = normalizeVaultRegistry([main, main, { id: 'default_vault', name: 'main', mode: 'tauri' }]);
  assert.equal(doubled.length, 1);
  assert.deepEqual(doubled[0], main);

  const renamed = { ...main, name: 'Дом' };
  const next = upsertVaultMeta([main, work], renamed);
  assert.deepEqual(next, [renamed, work], 'запись осталась на своём месте');
});

test('registry: a broken or foreign value is the empty registry, not a throw', () => {
  assert.deepEqual(readRegistry('{broken'), []);
  assert.deepEqual(readRegistry('null'), []);
  assert.deepEqual(readRegistry('{"vaults":[]}'), [], 'объект вместо списка — не реестр');
  assert.equal(normalizeVaultRegistry({}), undefined, 'нет формы — пусть решает fallback');
  assert.deepEqual(normalizeVaultRegistry([null, 42, {}, { id: '' }]), [], 'мусор выброшен, id обязателен');
});

test('registry: the old default name migrates to `main`, a person\'s name is left alone', () => {
  const legacy = toVaultMeta({ id: 'default_vault', name: 'Основное хранилище (Vault)', mode: 'tauri' });
  assert.equal(legacy.name, 'main');
  const unnamed = toVaultMeta({ id: 'default_vault', mode: 'tauri' });
  assert.equal(unnamed.name, 'main');
  const named = toVaultMeta({ id: 'work', name: 'Работа', mode: 'tauri' });
  assert.equal(named.name, 'Работа');
});

test('registry: the current vault survives a rewrite of the list', () => {
  const current = toVaultMeta(JSON.parse(JSON.stringify(main)));
  assert.deepEqual(current, main, 'current читается как есть');

  // A write of one more vault touches the list only: current lives under its own key.
  const list = readRegistry(JSON.stringify([main, work]));
  const written = upsertVaultMeta(list, { id: 'projects', name: 'projects', mode: 'tauri', isCurrent: false });
  assert.deepEqual(readRegistry(JSON.stringify(written)).filter(v => v.isCurrent), [main]);
  assert.deepEqual(current, main, 'current не переписан списком');
});

test('registry: deleting one vault leaves the others and their fields alone', () => {
  const next = removeVaultMeta([main, work], 'work');
  assert.deepEqual(next, [main]);
  assert.deepEqual(removeVaultMeta([main], 'default_vault'), [], 'системный id список знает как любой другой');
});
