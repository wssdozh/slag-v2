# Инструкция: Подключение и использование SLAG MCP

SLAG поставляется с готовым MCP-сервером (Model Context Protocol), позволяющим внешним ИИ-агентам (DeepSeek Harness, Claude Code, Cursor, Goose) управлять хранилищем заметок и задач через стандартный протокол JSON-RPC по stdio.

---

## 1. Сборка бинарника

Перед первым использованием соберите бандл сервера:

```bash
npm run build:mcp
```

Артефакт собирается в `dist/mcp/index.js`.

---

## 2. Подключение к клиентам

### DeepSeek Harness (DSH)
Добавьте секцию в профиль `~/.dsh/profiles/web/cordis.patch.yml`:

```yaml
- insert:
    - id: mcp-slag
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: slag
        transport: stdio
        command: node
        args:
          - /полный/путь/к/slag-v2/dist/mcp/index.js
          - --vault
          - /полный/путь/к/вашему/vault
```

### Claude Code CLI
Выполните команду в терминале:

```bash
claude mcp add slag -- node /полный/путь/к/slag-v2/dist/mcp/index.js --vault /полный/путь/к/вашему/vault
```

Или пропишите в `~/.claude.json`:

```json
{
  "mcpServers": {
    "slag": {
      "command": "node",
      "args": [
        "/полный/путь/к/slag-v2/dist/mcp/index.js",
        "--vault",
        "/полный/путь/к/вашему/vault"
      ]
    }
  }
}
```

### Cursor
Добавьте в `.cursor/mcp.json` (в корне проекта или глобально в `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "slag": {
      "command": "node",
      "args": [
        "/полный/путь/к/slag-v2/dist/mcp/index.js",
        "--vault",
        "/полный/путь/к/вашему/vault"
      ]
    }
  }
}
```

### Goose CLI
В файле `~/.config/goose/config.yaml`:

```yaml
extensions:
  slag:
    name: slag
    cmd: node
    args:
      - /полный/путь/к/slag-v2/dist/mcp/index.js
      - --vault
      - /полный/путь/к/вашему/vault
    type: stdio
```

---

## 3. Доступные инструменты (Tools)

| Инструмент | Аргументы | Назначение |
|------------|-----------|------------|
| `save_note` | `title`, `content`, `folder`, `type` (`note` \| `task` \| `article`), `tags`, `dueDate`, `priority`, `subtasks`, `id` | Создание или обновление заметки/задачи/статьи |
| `get_note` | `idOrTitle` | Чтение полного Markdown-содержимого с метаданными |
| `search_notes` | `query`, `folder`, `type`, `status`, `tag`, `limit` | Полнотекстовый поиск по содержимому и тегам |
| `list_notes` | `folder`, `type`, `tag`, `sortBy`, `limit` | Список заметок с фильтрами |
| `list_tasks` | `view` (`today` \| `upcoming` \| `overdue` \| `backlog` \| `completed` \| `all`), `folder` | Выборка задач по временным срезам |
| `toggle_task` | `id`, `subtaskId`, `status` (`todo` \| `done`) | Переключение статуса задачи или чекбокса подзадачи |
| `delete_note` | `idOrTitle` | Безопасное перемещение в корзину `.trash/` |
| `list_folders` | — | Дерево папок с описаниями назначения |
| `create_folder`| `path`, `description`, `icon` | Создание новой папки для классификации |
| `list_tags` | — | Частотный словарь существующих тегов |
| `get_vault_stats` | — | Сводная статистика по хранилищу |

---

## 4. Ресурсы и шаблоны (Resources)

- `slag://vault/stats` — мгновенный снимок состояния хранилища.
- `slag://vault/tags` — список тегов хранилища.
- `slag://note/{id}` — прямое чтение конкретного документа.
- `slag://today` — задачи на текущий день.
