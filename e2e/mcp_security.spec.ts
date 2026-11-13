import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpVault } from '../src/mcp/vault';
import { registerMcpTools } from '../src/mcp/tools';
import { registerMcpResources } from '../src/mcp/resources';
import { registerMcpPrompts } from '../src/mcp/prompts';

// The MCP server is a local file-writing surface: a tool argument must never
// be able to escape the vault directory (SecLists File-Names traversal cases).
test.describe('MCP vault path confinement', () => {
  const testVaultDir = path.resolve('.tmp/test-mcp-security-vault');
  const outsideEscape = path.resolve(testVaultDir, '../../escape');
  let client: Client;
  let server: McpServer;
  let vault: McpVault;

  test.beforeAll(async () => {
    await fs.rm(testVaultDir, { recursive: true, force: true });
    await fs.rm(outsideEscape, { recursive: true, force: true });
    await fs.mkdir(testVaultDir, { recursive: true });

    vault = new McpVault(testVaultDir);
    await vault.init();

    server = new McpServer({ name: 'slag-security-test', version: '1.0.0' });
    registerMcpTools(server, vault);
    registerMcpResources(server, vault);
    registerMcpPrompts(server, vault);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'security-test-client', version: '1.0.0' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  test.afterAll(async () => {
    await client.close();
    await server.close();
    await fs.rm(testVaultDir, { recursive: true, force: true });
    await fs.rm(outsideEscape, { recursive: true, force: true });
  });

  test('save_note rejects traversal, absolute paths, NUL and overlong folders', async () => {
    const folders = [
      '../../escape',
      '..\\escape',
      '/tmp/escape',
      'C:\\escape',
      'a/../../b',
      'a/./b',
      '\0',
      'a'.repeat(300),
    ];

    for (const folder of folders) {
      const res = await client.callTool({
        name: 'save_note',
        arguments: { title: `escape ${folder.slice(0, 12)}`, content: 'x', folder },
      });
      expect(res.isError, `folder ${JSON.stringify(folder)}`).toBe(true);
    }

    expect(existsSync(outsideEscape)).toBe(false);
    expect(existsSync(path.resolve(testVaultDir, 'escape'))).toBe(false);
  });

  test('create_folder rejects the same traversal inputs', async () => {
    for (const folder of ['../../escape', '..\\escape', '/tmp/escape', 'C:\\escape', '\0']) {
      const res = await client.callTool({
        name: 'create_folder',
        arguments: { path: folder },
      });
      expect(res.isError, `path ${JSON.stringify(folder)}`).toBe(true);
    }
    expect(existsSync(outsideEscape)).toBe(false);
  });

  test('legitimate nested folders still work and stay inside the vault', async () => {
    const res = await client.callTool({
      name: 'save_note',
      arguments: {
        title: 'nested note',
        content: 'inside',
        folder: 'Проекты/Дизайн',
        tags: ['security'],
      },
    });
    expect(res.isError).toBeFalsy();

    const created = path.join(testVaultDir, 'Проекты', 'Дизайн', 'nested note.md');
    expect(existsSync(created)).toBe(true);
    const text = await fs.readFile(created, 'utf-8');
    expect(text).toContain('inside');
  });
});
