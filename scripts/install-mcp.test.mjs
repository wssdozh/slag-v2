// The installer edits other people's config files, so the merging rules get a check of their own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeJsonConfig, mergeDshProfile, verifyWritten } from './install-mcp.mjs';
import { parse as parseYaml } from 'yaml';

test('json config keeps foreign servers and replaces ours', () => {
  const existing = JSON.stringify({ mcpServers: { other: { command: 'x' }, slag: { command: 'old' } }, theme: 'dark' });
  const merged = mergeJsonConfig(existing, '/vault');
  assert.equal(merged.theme, 'dark');
  assert.equal(merged.mcpServers.other.command, 'x');
  assert.equal(merged.mcpServers.slag.command, 'node');
  assert.deepEqual(merged.mcpServers.slag.args.slice(1), ['--vault', '/vault']);
});

test('json config starts from nothing', () => {
  const merged = mergeJsonConfig('', '/vault');
  assert.equal(merged.mcpServers.slag.args[2], '/vault');
});

test('dsh profile appends once and updates in place', () => {
  const first = mergeDshProfile('- insert:\n    - id: mcp-fetchira\n      name: x\n', '/vault-a');
  assert.match(first, /mcp-fetchira/);
  assert.match(first, /--vault\n          - '\/vault-a'/);

  const second = mergeDshProfile(first, '/vault-b');
  assert.equal(second.match(/id: mcp-slag/g).length, 1);
  assert.match(second, /vault-b/);
  assert.doesNotMatch(second, /vault-a/);
  assert.match(second, /mcp-fetchira/);
});

test('dsh profile without an insert list still gets a valid one', () => {
  const merged = mergeDshProfile('', '/vault');
  assert.match(merged, /^- insert:\n {4}- id: mcp-slag/m);
});

test('a windows path survives the yaml round-trip unchanged', () => {
  const windowsVault = 'C:\\Users\\morii\\AppData\\Roaming\\com.slag.notes\\vaults\\main\\notes';
  const merged = mergeDshProfile('', windowsVault);
  const parsed = parseYaml(merged);
  const args = parsed[0].insert[0].config.args;
  assert.equal(args[1], '--vault');
  assert.equal(args[2], windowsVault);
  assert.equal(verifyWritten('dsh', merged, windowsVault), null);
});

test('verify catches a config whose paths came out mangled', () => {
  const vault = 'C:\\vault';
  const good = mergeDshProfile('', vault);
  // What a bad escaper writes: the YAML string keeps a literal doubled backslash.
  const broken = good.replace("'C:\\vault'", "'C:\\\\vault'");
  assert.notEqual(broken, good);
  assert.match(verifyWritten('dsh', broken, vault), /разъехались/);
  const brokenJson = `${JSON.stringify({ mcpServers: { slag: { command: 'node', args: ['x'] } } })}\n`;
  assert.match(verifyWritten('claude', brokenJson, vault), /разъехались/);
});
