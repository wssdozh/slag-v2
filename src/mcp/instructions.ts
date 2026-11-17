// The paragraph a host may put into the system prompt: what this vault is, the order of calls,
// and the two rules an agent keeps breaking — a schedule lives in fields, and the disk is fresh.
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
  'Порядок работы: папку и теги бери из словаря — list_folders и list_tags, — и не заводи новый тег, если рядом уже есть синоним. Перед правкой читай get_note: он отдаёт всю карточку одним вызовом, повторные чтения не нужны. Поле folder у save_note папку не создаёт, для новой папки есть отдельный вызов.',
  '',
  'Расписание задачи живёт полями, а не текстом: срок — dueDate (YYYY-MM-DD), напоминание — reminder (ISO с часовым поясом), длительность — duration в минутах, повтор — recurrence. В content пиши то, что читает человек. Относительные даты («завтра», «в пятницу») разрешай по текущей дате и часовому поясу пользователя; если время не названо, не выдумывай его — уточни одной фразой.',
  '',
  'Данные читаются с диска при каждом вызове, между вызовами ничего не кешируется. Приложение может быть открыто: твоя правка появляется в его интерфейсе с задержкой в пару секунд, это не ошибка. Удаление отправляет запись в корзину, вернуть её может человек.',
].join('\n');
