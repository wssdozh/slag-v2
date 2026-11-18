// The paragraph a host may put into the system prompt: what this vault is, the order of calls,
// and the rules an agent keeps breaking — a schedule lives in fields, a finished task gets a
// status, and the disk is fresh.
//
// Deliberately not a list of tools: every tool already carries its own description and schema,
// and repeating them here only dilutes the paragraph. What lives here is what no single
// description can say: relationships between calls, cross-cutting field rules, and freshness.

/**
 * Server instructions, delivered on `initialize`. Kept short on purpose: hosts truncate long
 * blocks (Claude Code cuts at 4096 characters) and the protocol calls this a hint, so nothing
 * that protects data may depend on it.
 */
export const SERVER_INSTRUCTIONS = [
  'Личное хранилище SLAG: заметки, задачи и статьи одного человека, файлы .md на этом диске. Сервер открывает только это хранилище.',
  '',
  'Порядок работы: папку и теги бери из словаря — list_folders и list_tags, — и не заводи новый тег, если рядом уже есть синоним. Перед правкой читай get_note: он отдаёт всю карточку одним вызовом, повторные чтения не нужны. Поле folder у save_note папку не создаёт, для новой папки есть отдельный вызов. id искать не нужно: get_note, delete_note и read_attachment принимают заголовок, toggle_task — заголовок задачи; save_note ждёт id или имя файла из карточки.',
  '',
  'Расписание задачи живёт полями, а не текстом: срок — dueDate (YYYY-MM-DD), напоминание — reminder (ISO с часовым поясом), длительность — duration в минутах, повтор — recurrence. В content пиши то, что читает человек. Относительные даты («завтра», «в пятницу») разрешай по текущей дате и часовому поясу пользователя; если время не названо, не выдумывай его — уточни одной фразой.',
  '',
  'Выполненное отмечай статусом, а не словами: закончил задачу — save_note со status done или toggle_task; закрыл пункт чеклиста — тем же save_note через subtasks, а не галочкой в markdown. Записал итог в content, а статус оставил в todo — задача снова всплывёт в списке, и человеку придётся закрывать её руками.',
  '',
  'Данные читаются с диска при каждом вызове, между вызовами ничего не кешируется. Приложение может быть открыто: твоя правка появляется в его интерфейсе с задержкой в пару секунд, это не ошибка. Удаление отправляет запись в корзину, вернуть её может человек.',
].join('\n');
