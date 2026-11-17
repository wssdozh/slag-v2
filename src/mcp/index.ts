#!/usr/bin/env node
// Stdio entry point of the MCP server that exposes one vault to external AI clients.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { McpVault } from './vault';
import { SERVER_INSTRUCTIONS } from './instructions';
import { registerMcpTools } from './tools';
import { registerMcpResources } from './resources';
import { registerMcpPrompts } from './prompts';

function parseCliArgs(): { vaultPath?: string } {
  const args = process.argv.slice(2);
  let vaultPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--vault' || args[i] === '-v') {
      vaultPath = args[i + 1];
      i++;
    } else if (args[i].startsWith('--vault=')) {
      vaultPath = args[i].slice('--vault='.length);
    }
  }

  return { vaultPath };
}

export async function startMcpServer(): Promise<{ server: McpServer; vault: McpVault }> {
  const { vaultPath } = parseCliArgs();
  const vault = new McpVault(vaultPath);

  // Informative start message ONLY to stderr (never to stdout, to avoid corrupting JSON-RPC)
  console.error(`[SLAG MCP] Initializing vault at: ${vault.config.notesDir}`);
  await vault.init();

  const server = new McpServer(
    {
      name: 'slag-notes',
      version: '1.0.0',
    },
    { instructions: SERVER_INSTRUCTIONS }
  );

  registerMcpTools(server, vault);
  registerMcpResources(server, vault);
  registerMcpPrompts(server, vault);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[SLAG MCP] Server successfully connected via Stdio transport.');
  return { server, vault };
}

// Auto-run if executed as script
const scriptPath = (process.argv[1] || '').replace(/\\/g, '/');
if (scriptPath && (scriptPath.endsWith('/mcp/index.js') || scriptPath.endsWith('/mcp/index.ts') || scriptPath.endsWith('/dist/mcp/index.js') || scriptPath.endsWith('mcp.js'))) {
  startMcpServer().catch((err) => {
    console.error('[SLAG MCP] Fatal startup error:', err);
    process.exit(1);
  });
}
