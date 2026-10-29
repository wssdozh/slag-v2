import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpVault } from '../src/mcp/vault';
import { registerMcpTools } from '../src/mcp/tools';
import { registerMcpResources } from '../src/mcp/resources';
import { registerMcpPrompts } from '../src/mcp/prompts';

test.describe('SLAG v2 — Model Context Protocol (MCP) Server', () => {
  const testVaultDir = path.resolve('.tmp/test-mcp-vault');
  let client: Client;
  let server: McpServer;
  let vault: McpVault;

  test.beforeAll(async () => {
    // Clean and initialize isolated vault
    await fs.rm(testVaultDir, { recursive: true, force: true });
    await fs.mkdir(testVaultDir, { recursive: true });

    vault = new McpVault(testVaultDir);
    await vault.init();

    server = new McpServer({
      name: 'slag-notes-test',
      version: '1.0.0',
    });

    registerMcpTools(server, vault);
    registerMcpResources(server, vault);
    registerMcpPrompts(server, vault);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client({ name: 'test-client', version: '1.0.0' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  test.afterAll(async () => {
    await client.close();
    await server.close();
    await fs.rm(testVaultDir, { recursive: true, force: true });
  });

  test('1. Discovers registered MCP Tools, Resources, and Prompts', async () => {
    // 1.1 Tools
    const toolsResult = await client.listTools();
    const toolNames = toolsResult.tools.map(t => t.name);
    expect(toolNames).toContain('save_note');
    expect(toolNames).toContain('get_note');
    expect(toolNames).toContain('search_notes');
    expect(toolNames).toContain('list_notes');
    expect(toolNames).toContain('delete_note');
    expect(toolNames).toContain('list_tasks');
    expect(toolNames).toContain('toggle_task');
    expect(toolNames).toContain('list_folders');
    expect(toolNames).toContain('create_folder');
    expect(toolNames).toContain('list_tags');
    expect(toolNames).toContain('get_vault_stats');

    // 1.2 Resources
    const resourcesResult = await client.listResources();
    const resourceUris = resourcesResult.resources.map(r => r.uri);
    expect(resourceUris).toContain('slag://folders');
    expect(resourceUris).toContain('slag://tasks/pending');
    expect(resourceUris).toContain('slag://tags');
    expect(resourceUris).toContain('slag://vault/stats');

    // 1.3 Prompts
    const promptsResult = await client.listPrompts();
    const promptNames = promptsResult.prompts.map(p => p.name);
    expect(promptNames).toContain('triage_inbox');
    expect(promptNames).toContain('daily_plan');
    expect(promptNames).toContain('review_tasks');
  });

  test('2. Universal save_note creates a new note and writes Obsidian-compatible Markdown to disk', async () => {
    const res = await client.callTool({
      name: 'save_note',
      arguments: {
        title: 'Архитектура ядра MCP',
        content: 'Спецификация интеграции протокола MCP в SLAG v2.',
        folder: 'Входящие',
        tags: ['mcp', 'architecture'],
        type: 'note',
      },
    });

    expect(res.isError).toBeFalsy();
    const textContent = (res.content as any[])[0]?.text || '';
    expect(textContent).toContain('Архитектура ядра MCP');
    expect(textContent).toContain('успешно создана');

    // Verify physical file on disk
    const expectedFile = path.join(vault.config.notesDir, 'Входящие', 'Архитектура ядра MCP.md');
    expect(existsSync(expectedFile)).toBe(true);

    const fileContent = await fs.readFile(expectedFile, 'utf-8');
    expect(fileContent).toContain('title: Архитектура ядра MCP');
    expect(fileContent).toContain('- mcp');
    expect(fileContent).toContain('- architecture');
    expect(fileContent).toContain('Спецификация интеграции протокола MCP в SLAG v2.');
  });

  test('3. search_notes finds the created note by query and tags', async () => {
    const res = await client.callTool({
      name: 'search_notes',
      arguments: {
        query: 'интеграции протокола',
      },
    });

    expect(res.isError).toBeFalsy();
    const text = (res.content as any[])[0]?.text || '';
    expect(text).toContain('Архитектура ядра MCP');
    expect(text).toContain('#mcp');
  });

  test('4. get_note reads raw Markdown and structured content by title or filename', async () => {
    const res = await client.callTool({
      name: 'get_note',
      arguments: {
        idOrTitle: 'Архитектура ядра MCP',
      },
    });

    expect(res.isError).toBeFalsy();
    const text = (res.content as any[])[0]?.text || '';
    expect(text).toContain('---');
    expect(text).toContain('title: Архитектура ядра MCP');
    expect(text).toContain('Спецификация интеграции протокола MCP в SLAG v2.');
  });

  test('5. save_note with id updates note into a scheduled task with subtasks without duplicating', async () => {
    // 5.1 Find ID
    const match = await vault.findNote('Архитектура ядра MCP');
    expect(match).not.toBeNull();
    const noteId = match!.item.id;

    // 5.2 Update
    const updateRes = await client.callTool({
      name: 'save_note',
      arguments: {
        id: noteId,
        type: 'task',
        priority: 'high',
        dueDate: '2026-10-25',
        subtasks: ['Написать types.ts', 'Реализовать vault.ts'],
      },
    });

    expect(updateRes.isError).toBeFalsy();
    const text = (updateRes.content as any[])[0]?.text || '';
    expect(text).toContain('успешно обновлена');
    expect(text).toContain('HIGH');

    // Verify task on disk
    const updatedMatch = await vault.findNote(noteId);
    expect(updatedMatch?.item.type).toBe('task');
    expect(updatedMatch?.item.priority).toBe('high');
    expect(updatedMatch?.item.dueDate).toBe('2026-10-25');
    expect(updatedMatch?.item.subtasks?.length).toBe(2);
  });

  test('6. list_tasks, toggle_task, and task progress work seamlessly', async () => {
    const listRes = await client.callTool({
      name: 'list_tasks',
      arguments: {
        view: 'all',
      },
    });

    expect(listRes.isError).toBeFalsy();
    const listText = (listRes.content as any[])[0]?.text || '';
    expect(listText).toContain('Архитектура ядра MCP');
    expect(listText).toContain('HIGH');
    expect(listText).toContain('Чеклист: 0/2');

    // Toggle subtask 0
    const toggleSubtaskRes = await client.callTool({
      name: 'toggle_task',
      arguments: {
        id: 'Архитектура ядра MCP',
        subtaskId: 'st_0',
      },
    });
    expect(toggleSubtaskRes.isError).toBeFalsy();
    const toggleText = (toggleSubtaskRes.content as any[])[0]?.text || '';
    expect(toggleText).toContain('- [x] Написать types.ts');

    // Toggle main task status to done
    const toggleStatusRes = await client.callTool({
      name: 'toggle_task',
      arguments: {
        id: 'Архитектура ядра MCP',
        status: 'done',
      },
    });
    expect(toggleStatusRes.isError).toBeFalsy();
    expect((toggleStatusRes.content as any[])[0]?.text).toContain('DONE');
  });

  test('7. create_folder updates folder hierarchy and state.json', async () => {
    const folderRes = await client.callTool({
      name: 'create_folder',
      arguments: {
        path: 'Проекты/MCP',
        description: 'Все документы и спецификации по MCP интеграции',
        icon: 'Cpu',
      },
    });

    expect(folderRes.isError).toBeFalsy();
    expect((folderRes.content as any[])[0]?.text).toContain('успешно зарегистрирована');

    const folders = await vault.getFolders();
    const created = folders.find(f => f.path === 'Проекты/MCP');
    expect(created).toBeDefined();
    expect(created?.description).toBe('Все документы и спецификации по MCP интеграции');
  });

  test('8. delete_note safely moves note to .trash/ (Obsidian Local-First contract)', async () => {
    const delRes = await client.callTool({
      name: 'delete_note',
      arguments: {
        idOrTitle: 'Архитектура ядра MCP',
      },
    });

    expect(delRes.isError).toBeFalsy();
    expect((delRes.content as any[])[0]?.text).toContain('.trash');

    // Verify it is gone from notes/ and now in .trash/
    const oldPath = path.join(vault.config.notesDir, 'Входящие', 'Архитектура ядра MCP.md');
    const trashPath = path.join(vault.config.trashDir, 'Архитектура ядра MCP.md');

    expect(existsSync(oldPath)).toBe(false);
    expect(existsSync(trashPath)).toBe(true);
  });

  test('9. Resources and Prompts return structured data', async () => {
    // Read folders resource
    const foldersResource = await client.readResource({ uri: 'slag://folders' });
    const foldersData = JSON.parse(foldersResource.contents[0].text as string);
    expect(Array.isArray(foldersData)).toBe(true);
    expect(foldersData.some((f: any) => f.path === 'Входящие')).toBe(true);

    // Read stats resource
    const statsResource = await client.readResource({ uri: 'slag://vault/stats' });
    const statsData = JSON.parse(statsResource.contents[0].text as string);
    expect(typeof statsData.totalItems).toBe('number');

    // Get prompt
    const prompt = await client.getPrompt({ name: 'daily_plan' });
    expect(prompt.messages.length).toBeGreaterThan(0);
    expect(prompt.messages[0].content.text).toContain('list_tasks');
  });

  test('10. Live Stdio Subprocess communication test', async () => {
    const liveVaultDir = path.resolve('.tmp/live-stdio-vault');
    await fs.mkdir(liveVaultDir, { recursive: true });

    try {
      const stdioTransport = new StdioClientTransport({
        command: 'node',
        args: [path.resolve('dist/mcp/index.js'), '--vault', liveVaultDir],
      });

      const liveClient = new Client({ name: 'live-stdio-client', version: '1.0.0' });
      await liveClient.connect(stdioTransport);

      const tools = await liveClient.listTools();
      expect(tools.tools.length).toBe(11);

      const saveRes = await liveClient.callTool({
        name: 'save_note',
        arguments: {
          title: 'Живая мысль через Stdio',
          content: 'Проверка вызова внешнего процесса по stdio.',
          folder: 'Входящие',
          tags: ['live-stdio'],
        },
      });

      expect(saveRes.isError).toBeFalsy();
      const text = (saveRes.content as any[])[0]?.text || '';
      expect(text).toContain('Живая мысль через Stdio');

      await liveClient.close();
    } finally {
      await fs.rm(liveVaultDir, { recursive: true, force: true });
    }
  });

  test('11. Realtime Assistant UI Interaction with save_item action card', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Switch to Assistant tab
    const assistantTab = page.locator('.dv-tab, .dockview-tab').filter({ hasText: 'Ассистент' }).first();
    await assistantTab.click();

    const textarea = page.locator('textarea[placeholder*="Спросите"]').first();
    await expect(textarea).toBeVisible();

    // Ask to save task
    await textarea.fill('создай таску Написать документацию MCP на завтра');
    await textarea.press('Enter');

    // Verify card appeared
    const taskCard = page.locator('text=Написать документацию MCP').first();
    await expect(taskCard).toBeVisible({ timeout: 10000 });

    const planBtn = page.locator('button', { hasText: /Запланировать|Сохранить|Применить/ }).first();
    await expect(planBtn).toBeVisible();

    // Take screenshot for visual verification
    await page.screenshot({
      path: 'test-results/screenshots/assistant-mcp-save-item-live.png',
      fullPage: false,
    });

    // Click confirm
    await planBtn.click();
    await expect(page.locator('text=сохранена').or(page.locator('text=Обновлено')).first()).toBeVisible({ timeout: 5000 });
  });
});
