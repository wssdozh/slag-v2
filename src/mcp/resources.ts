import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpVault } from './vault';

export function registerMcpResources(server: McpServer, vault: McpVault): void {
  // 1. Folders map resource
  server.resource(
    'folders',
    'slag://folders',
    {
      description: 'Карта папок хранилища SLAG с текстовыми описаниями для классификации ИИ',
      mimeType: 'application/json',
    },
    async (uri) => {
      const folders = await vault.getFolders();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(folders, null, 2),
          },
        ],
      };
    }
  );

  // 2. Pending tasks resource
  server.resource(
    'tasks-pending',
    'slag://tasks/pending',
    {
      description: 'Список всех открытых и незавершенных задач хранилища',
      mimeType: 'application/json',
    },
    async (uri) => {
      const tasks = await vault.listTasks('all');
      const open = tasks.filter(t => t.status !== 'done');
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(open, null, 2),
          },
        ],
      };
    }
  );

  // 3. Tags vocabulary resource
  server.resource(
    'tags',
    'slag://tags',
    {
      description: 'Словарь всех тегов хранилища с частотой использования',
      mimeType: 'application/json',
    },
    async (uri) => {
      const tags = await vault.listTags();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(tags, null, 2),
          },
        ],
      };
    }
  );

  // 4. Vault stats resource
  server.resource(
    'vault-stats',
    'slag://vault/stats',
    {
      description: 'Сводная статистика хранилища заметок SLAG',
      mimeType: 'application/json',
    },
    async (uri) => {
      const stats = await vault.getStats();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(stats, null, 2),
          },
        ],
      };
    }
  );

  // 5. Note direct reading resource by ID
  server.resource(
    'note',
    new ResourceTemplate('slag://notes/{id}', { list: undefined }),
    {
      description: 'Прямой доступ к содержимому заметки по её ID',
      mimeType: 'text/markdown',
    },
    async (uri, { id }) => {
      try {
        const idStr = Array.isArray(id) ? id[0] : id;
        const res = await vault.getNote(String(idStr));
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/markdown',
              text: res.rawMarkdown,
            },
          ],
        };
      } catch (err: any) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/plain',
              text: `Ошибка чтения заметки: ${err.message}`,
            },
          ],
        };
      }
    }
  );
}
