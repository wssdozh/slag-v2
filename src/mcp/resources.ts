// MCP resources: folder map, pending tasks and notes a client can read without a tool.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpVault } from './vault';

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** The one shape a JSON resource answer takes: the uri it was asked for, the value as text. */
function jsonResource(uri: URL, value: unknown) {
  return {
    contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(value, null, 2) }],
  };
}

/**
 * The SDK hands template variables over as they appear in the uri, so a Cyrillic file name
 * arrives percent-encoded. Some clients send it decoded already: a value without escapes
 * survives the same call, so decoding both is safe.
 */
function decodeResourceRef(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

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
      return jsonResource(uri, folders);
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
      return jsonResource(uri, open);
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
      return jsonResource(uri, tags);
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
      return jsonResource(uri, stats);
    }
  );

  // 5. One note as the same full card `get_note` returns, so a resource read is never partial.
  server.resource(
    'note',
    new ResourceTemplate('slag://notes/{id}', { list: undefined }),
    {
      description: 'Полная карточка заметки по её ID: метаданные, чеклист, markdown, связи и вложения',
      mimeType: 'application/json',
    },
    async (uri, { id }) => {
      try {
        const idStr = Array.isArray(id) ? id[0] : id;
        const card = await vault.getNoteCard(decodeResourceRef(String(idStr)));
        return jsonResource(uri, card);
      } catch (err) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/plain',
              text: `Ошибка чтения заметки: ${messageOf(err)}`,
            },
          ],
        };
      }
    }
  );

  // 6. Attachment bytes: the same limit and the same lookup as the read_attachment tool.
  server.resource(
    'attachment',
    new ResourceTemplate('slag://attachments/{note}/{file}', { list: undefined }),
    {
      description: 'Байты вложения заметки: картинка или файл приходят blob-ом с mime, текст — текстом',
      mimeType: 'application/octet-stream',
    },
    async (uri, { note, file }) => {
      const noteRef = Array.isArray(note) ? note[0] : note;
      const fileRef = Array.isArray(file) ? file[0] : file;
      try {
        const read = await vault.readAttachment(decodeResourceRef(String(noteRef)), decodeResourceRef(String(fileRef)));
        const mimeType = read.attachment.mimeType;

        if (read.payload.kind === 'text') {
          return {
            contents: [{ uri: uri.href, mimeType: 'text/plain', text: read.payload.text }],
          };
        }
        if (read.payload.kind === 'image' || read.payload.kind === 'binary') {
          return {
            contents: [{ uri: uri.href, mimeType: read.payload.mimeType, blob: read.payload.base64 }],
          };
        }
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'text/plain',
            text: read.payload.kind === 'no-bytes'
              ? `Байтов вложения «${read.attachment.name}» (${mimeType}) нет на этом диске: файл лежит только на другом устройстве.`
              : read.payload.kind === 'too-large'
                ? `Вложение «${read.attachment.name}» весит ${read.attachment.sizeHuman}, ресурс не отдаёт файлы такого размера. Возьмите его по пути из карточки заметки.`
                : `У вложения «${read.attachment.name}» нет транскрипта: аудио не распознано, текстом его не отдать.`,
          }],
        };
      } catch (err) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/plain',
              text: `Ошибка чтения вложения: ${messageOf(err)}`,
            },
          ],
        };
      }
    }
  );
}
