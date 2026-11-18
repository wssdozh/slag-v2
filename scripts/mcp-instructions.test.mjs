// Guards the paragraph the MCP server hands a host on `initialize`. Three things rot silently:
// a tool gets renamed while the text keeps the old name, the text grows into a manual, and the
// built bundle stops shipping the field at all. All three are checked here without a browser.
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SERVER_INSTRUCTIONS } from '../src/mcp/instructions.ts';
import { SERVER_INFO } from '../src/mcp/serverInfo.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toolsSource = readFileSync(path.join(repoRoot, 'src', 'mcp', 'tools.ts'), 'utf8');

/** Names as they are registered: `server.tool(\n  'save_note',`. */
const toolNames = new Set([...toolsSource.matchAll(/server\.tool\(\s*'([a-z_]+)'/g)].map(match => match[1]));
const toolDescriptions = [...toolsSource.matchAll(/server\.tool\(\s*'[a-z_]+',\s*'((?:[^'\\]|\\.)*)'/g)].map(match => match[1]);

test('instructions: есть, короткие и не пустые', () => {
  assert.equal(typeof SERVER_INSTRUCTIONS, 'string');
  assert.ok(SERVER_INSTRUCTIONS.trim().length > 200, 'инструкции слишком короткие, чтобы что-то сказать');
  assert.ok(SERVER_INSTRUCTIONS.length <= 2200, `инструкции разрослись до ${SERVER_INSTRUCTIONS.length} символов`);
});

test('instructions: каждое упомянутое имя инструмента существует', () => {
  assert.ok(toolNames.size >= 10, 'не нашла имена инструментов в tools.ts');
  const mentioned = new Set([...SERVER_INSTRUCTIONS.matchAll(/\b([a-z]+(?:_[a-z]+)+)\b/g)].map(match => match[1]));
  const unknown = [...mentioned].filter(name => !toolNames.has(name));
  assert.deepEqual(unknown, [], `инструкции ссылаются на несуществующие инструменты: ${unknown.join(', ')}`);
});

test('instructions: не пересказывают описания инструментов', () => {
  const sentences = toolDescriptions
    .flatMap(description => description.split(/(?<=[.!?])\s+/))
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length >= 30);
  const repeated = sentences.filter(sentence => SERVER_INSTRUCTIONS.includes(sentence));
  assert.deepEqual(repeated, [], 'инструкции дословно повторяют описание тула');
});

test('serverInfo: сервер представляется', () => {
  assert.equal(SERVER_INFO.title, 'SLAG');
  assert.ok((SERVER_INFO.description ?? '').length > 20, 'описание пустое: хост покажет голое имя');
  assert.match(String(SERVER_INFO.websiteUrl), /^https:\/\//);
  const icon = SERVER_INFO.icons?.[0];
  assert.ok(icon, 'нет иконки');
  // A host reads neither the repo nor the disk: a path would render as a broken image.
  assert.match(icon.src, /^https:\/\//, 'иконка должна быть по url');
  assert.equal(icon.mimeType, 'image/png');
});

test('instructions: собранный сервер отдаёт их на initialize', { skip: staleBundleReason() }, async () => {
  const vaultPath = await mkdtemp(path.join(tmpdir(), 'slag-mcp-instructions-'));
  try {
    const bundle = path.join(repoRoot, 'dist', 'mcp', 'index.js');
    const child = spawn(process.execPath, [bundle, '--vault', vaultPath], { stdio: ['pipe', 'pipe', 'ignore'] });
    const reply = await firstMessage(child, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'instructions-test', version: '0' } },
    });
    child.kill();
    assert.equal(reply.result?.instructions, SERVER_INSTRUCTIONS);
    assert.equal(reply.result?.serverInfo?.title, SERVER_INFO.title);
    assert.ok(reply.result?.serverInfo?.description, 'сборка потеряла описание сервера');
    assert.ok(reply.result?.serverInfo?.icons?.length, 'сборка потеряла иконку сервера');
  } finally {
    await rm(vaultPath, { recursive: true, force: true });
  }
});

/** Why the bundle test cannot run: it is missing, or it predates the sources it should contain. */
function staleBundleReason() {
  const bundle = path.join(repoRoot, 'dist', 'mcp', 'index.js');
  if (!existsSync(bundle)) return 'нет сборки dist/mcp — npm run build:mcp';
  const builtAt = statSync(bundle).mtimeMs;
  const sources = readdirSync(path.join(repoRoot, 'src', 'mcp'))
    .filter(name => name.endsWith('.ts'))
    .map(name => statSync(path.join(repoRoot, 'src', 'mcp', name)).mtimeMs);
  return Math.max(...sources) > builtAt ? 'сборка старше исходников — npm run build:mcp' : false;
}

/** One JSON-RPC round trip: write the request, resolve on the first line that parses. */
function firstMessage(child, request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('MCP server не ответил на initialize')), 15_000);
    let buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const message = JSON.parse(line);
          clearTimeout(timer);
          resolve(message);
          return;
        } catch {
          // не JSON-RPC: таким строкам на stdout делать нечего, но падать из-за них не здесь
        }
      }
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.stdin.write(`${JSON.stringify(request)}\n`);
  });
}
