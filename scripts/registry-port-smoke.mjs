// Run after npm run build. Both processes use only a temporary vault.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const dir = await mkdtemp(join(tmpdir(), 'slag-registry-port-'));
try {
  const notes = join(dir, 'notes');
  await mkdir(notes);
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve('dist/mcp/index.js'), '--vault', dir] });
  const client = new Client({ name: 'registry-port-smoke', version: '1' });
  try {
    await client.connect(transport);
    const created = await client.callTool({ name: 'save_note', arguments: { title: 'legacy fixture' } });
    assert.ok(!created.isError, JSON.stringify(created));
    // A marker appearing while MCP is already running must fence subsequent writes too.
    await writeFile(join(dir, 'note-registry.json'), '{}');
    const before = await readdir(notes);
    const read = await client.callTool({ name: 'get_note', arguments: { idOrTitle: 'legacy fixture' } });
    assert.ok(!read.isError, JSON.stringify(read));
    for (const [name, args] of [
      ['save_note', { title: 'cannot create' }], ['delete_note', { idOrTitle: 'legacy fixture' }],
      ['create_folder', { path: 'cannot-create' }], ['toggle_task', { id: 'legacy fixture' }],
    ]) {
      const result = await client.callTool({ name, arguments: args });
      assert.equal(result.isError, true, JSON.stringify(result));
      assert.match(JSON.stringify(result.content), /реестр синхронизации/);
    }
    const doctor = resolve('scripts/vault-doctor.mjs');
    const report = spawnSync(process.execPath, [doctor, dir, '--json'], { encoding: 'utf8' });
    assert.equal(report.status, 0, report.stderr);
    const repair = spawnSync(process.execPath, [doctor, dir, '--apply'], { encoding: 'utf8' });
    assert.equal(repair.status, 1, repair.stderr);
    assert.match(repair.stderr, /реестром синхронизации/);
    assert.deepEqual(await readdir(notes), before);
    const headless = spawnSync(process.execPath, [resolve('dist/node/index.js'), 'run'], {
      env: { ...process.env, SLAG_VAULT_DIR: dir }, encoding: 'utf8', timeout: 5_000,
    });
    assert.equal(headless.status, 1, headless.stderr);
    assert.match(headless.stderr, /cannot open an enrolled note registry vault/);
  } finally {
    await client.close();
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
