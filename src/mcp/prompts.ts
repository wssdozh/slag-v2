// MCP prompts that walk an agent through triage, daily planning and review.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpVault } from './vault';

/**
 * The bot used to need one call for metadata and another for the body. It does not any more, and
 * the prompts say so: otherwise an agent burns a turn re-reading what it already has.
 */
const NOTE_CARD_HINT = 'get_note отдаёт всю карточку одним вызовом: тип, папку и её путь, теги, статус, приоритет, срок, даты, чеклист с вложенностью, markdown, связи и список вложений. Повторно читать заметку за метаданными не нужно. Содержимое вложения берётся вызовом read_attachment с note и filename: текст и транскрипт аудио приходят текстом, картинка — base64 с mime; список вложений с именами и путями уже есть в карточке.';

export function registerMcpPrompts(server: McpServer, _vault: McpVault): void {
  // 1. triage_inbox
  server.prompt(
    'triage_inbox',
    'ИИ-Триаж: просканировать папку «Входящие», сопоставить с описаниями папок и предложить распределение с тегами',
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Ты — ассистент персональной базы знаний SLAG.
Твоя задача — выполнить триаж папки «Входящие»:
1. Вызови list_folders, чтобы узнать доступные папки и их описания.
2. Вызови list_tags, чтобы свериться со словарем существующих тегов (Taxonomy First: используй имеющиеся теги и не создавай дубли-синонимы).
3. Вызови list_notes с folder: "Входящие": в строках уже видно, у каких записей есть вложения и сколько их.
4. Для каждой неразобранной записи проанализируй её суть и предложи, в какую папку её перенести (через save_note с id и новым folder), какие теги добавить и нужно ли назначить срок или приоритет.
5. Выведи понятный план пользователю.

${NOTE_CARD_HINT}`,
          },
        },
      ],
    })
  );

  // 2. daily_plan
  server.prompt(
    'daily_plan',
    'Утренний план: собрать задачи на сегодня, проверить просроченные дела и сформировать фокус дня',
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Ты — персональный продуктивный помощник SLAG.
Помоги спланировать день:
1. Вызови list_tasks с view: "today" (задачи на сегодня) и view: "overdue" (просроченные задачи).
2. Оцени приоритеты: выдели задачи с высоким приоритетом [HIGH].
3. Если есть просроченные задачи, предложи перенести их на сегодня или снять срок через save_note.
4. Сформируй четкий, лаконичный список действий на день, сгруппированный по блокам (Утро / День / Вечер) без лишней воды.

${NOTE_CARD_HINT}`,
          },
        },
      ],
    })
  );

  // 3. review_tasks
  server.prompt(
    'review_tasks',
    'Аудит задач: ревизия бэклога и крупных задач с предложением декомпозиции на подзадачи',
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Проведи ревизию задач в SLAG:
1. Вызови list_tasks с view: "backlog" и view: "upcoming".
2. Найди крупные или размытые задачи, у которых нет подзадач или конкретного срока.
3. Предложи декомпозицию для 2-3 ключевых задач на конкретные чек-боксы (subtasks) и сохранение через save_note.

${NOTE_CARD_HINT}`,
          },
        },
      ],
    })
  );
}
