// Prompt assembly for AI auto-tagging: what the vault is, which tags exist already, how to choose.
import type { SlagItemType } from '../../types';
import type { TagStyle } from './tags';

export interface TagUsage {
  tag: string;
  count: number;
}

export interface TaggingFolder {
  path: string;
  description?: string;
}

interface TaggingContext {
  folders: TaggingFolder[];
  currentFolder: string;
  inboxFolder: string;
  tags: TagUsage[];
  style: TagStyle;
  maxTags: number;
  allowNewTags: boolean;
  customRules?: string;
}

export interface DraftTaggingInput extends TaggingContext {
  content: string;
}

export interface TriageNote {
  id: string;
  type: SlagItemType;
  title: string;
  content: string;
  tags: string[];
}

export interface TriageTaggingInput extends TaggingContext {
  notes: TriageNote[];
}

export interface TaggingPrompt {
  systemPrompt: string;
  userPrompt: string;
}

/** The long tail of a tag dictionary is noise: the model needs the living vocabulary, not every typo. */
const TAG_DICTIONARY_LIMIT = 60;
const DRAFT_CONTENT_CHARS = 2000;
const TRIAGE_CONTENT_CHARS = 350;

const TYPE_LABEL: Record<SlagItemType, string> = {
  note: 'заметка',
  task: 'задача',
  article: 'статья',
};

const EXAMPLES = `ПРИМЕРЫ
Запись: «синк падает, когда пропадает сеть: в логе сокет закрывается с кодом 1006».
  можно: ["синхронизация", "баги"] — общие темы, они повторятся и уже живут в хранилище.
  нельзя: ["1006", "сокет", "сеть-пропала"] — детали этой записи, их найдёт поиск по тексту.

Запись: «в композере прыгает курсор после вставки картинки, похоже на лишний ререндер».
  можно: ["композер", "баги"] — композер это часть проекта, тема устойчивая.
  нельзя: ["курсор", "ререндер", "картинка"] — слова из текста, а не темы.

Запись: «попробовал новый шрифт в заголовках, стало читаемее».
  можно: ["дизайн", "типографика"] — темы уровня проекта, вернутся в следующих записях.
  нельзя: ["шрифт", "заголовки", "стало-читаемее"] — деталь и фраза из текста.`;

const FORBIDDEN_TAGS = `ЗАПРЕЩЕНО В ТЕГАХ
- типы сущностей: «заметка», «таска», «задача», «статья», «файл», «аудио», «фото»;
- слова-филлеры: «важное», «разное», «прочее», «интересное»;
- одноразовые имена и узкие детали: названия кнопок, переменных, файлов, номера ошибок;
- термины, которые и так находятся поиском по тексту;
- один смысл в двух формах («синк» и «синхронизация», «ui» и «интерфейс»).`;

/** Most used first, so the dictionary reads as "what the vault is actually about". */
export function sortTagsByUsage(tags: TagUsage[]): TagUsage[] {
  return [...tags].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'ru'));
}

function describeFolder(folder?: TaggingFolder): string {
  const description = folder?.description?.trim();
  return description ? ` — ${description}` : '';
}

function folderTree(context: TaggingContext): string {
  if (context.folders.length === 0) {
    return '(папок пока нет — проект не задан)';
  }
  const sorted = [...context.folders].sort((a, b) => a.path.localeCompare(b.path, 'ru'));
  return sorted
    .map((folder) => {
      const depth = Math.max(0, folder.path.split('/').length - 1);
      const indent = '  '.repeat(depth);
      const current = folder.path === context.currentFolder ? '  ← текущая папка' : '';
      return `${indent}- ${folder.path}${describeFolder(folder)}${current}`;
    })
    .join('\n');
}

/** Current folder plus its ancestors: that is what tells the model "project X, subproject Y of it". */
function currentFolderContext(context: TaggingContext): string {
  if (context.currentFolder === context.inboxFolder) {
    return `ТЕКУЩАЯ ПАПКА: "${context.currentFolder}" — записи ещё не разобраны, проект не задан: папку выбирай по описаниям.`;
  }
  const byPath = new Map(context.folders.map((folder) => [folder.path, folder]));
  const segments = context.currentFolder.split('/');
  const lines = [`ТЕКУЩАЯ ПАПКА: "${context.currentFolder}"${describeFolder(byPath.get(context.currentFolder))}`];
  for (let depth = segments.length - 1; depth > 0; depth--) {
    const parentPath = segments.slice(0, depth).join('/');
    const parent = byPath.get(parentPath);
    if (parent) {
      lines.push(`ВЫШЕ В ДЕРЕВЕ: "${parentPath}"${describeFolder(parent)}`);
    }
  }
  return lines.join('\n');
}

function tagDictionary(tags: TagUsage[]): string {
  if (tags.length === 0) {
    return '(словарь пуст: тегов в хранилище ещё нет, первый тег создаёшь ты)';
  }
  const sorted = sortTagsByUsage(tags);
  const shown = sorted.slice(0, TAG_DICTIONARY_LIMIT);
  const lines = shown.map((entry) => `- ${entry.tag} (${entry.count})`);
  const hidden = sorted.length - shown.length;
  if (hidden > 0) {
    lines.push(`- …и ещё ${hidden} редких тегов: они тоже допустимы`);
  }
  return lines.join('\n');
}

function tagStyleLine(style: TagStyle): string {
  return style === 'kebab-case'
    ? 'kebab-case: строчные буквы, составные слова через дефис ("ui-ux"), без "#".'
    : 'строчные буквы, без "#" и пробелов; однословная тема — одним словом ("дизайн").';
}

function folderStep(context: TaggingContext): string {
  if (context.folders.length === 0) {
    return `2. Папку не выбирай: папок в контексте нет — верни targetFolder "${context.currentFolder}".`;
  }
  return `2. Выбери папку: targetFolder — ровно один path из дерева.
   - Текущая папка не «${context.inboxFolder}»: она приоритетна, пока запись ей не противоречит.
   - Текущая папка «${context.inboxFolder}»: выбирай по смыслу описаний; если ничего явно не подходит, оставь «${context.inboxFolder}».`;
}

function taggingProcedure(context: TaggingContext): string {
  const newTagClause = context.allowNewTags
    ? 'Не больше одного нового тега на запись.'
    : 'Новые теги выключены в настройках: бери строго из словаря, иначе пустой массив.';
  return `ПРОЦЕДУРА — иди по шагам, не перескакивай
1. Классифицируй: что это за запись (мысль, баг, решение, план, ссылка), к какому проекту и подпроекту она относится по дереву папок, встречалась ли такая тема в хранилище — словарь и частоты показывают, что уже живо.
${folderStep(context)}
3. Выбери тег: сначала точное совпадение со словарём (другая форма того же слова — тот же тег: «синк» и «синхронизация»), затем ближайший по смыслу тег оттуда же. Существующий тег сильнее нового всегда.
4. Новый тег — только если темы в словаре нет и тема устойчивая: повторится в других записях, а не живёт в этой одной. Имя — общее понятие уровня категории или проекта («синхронизация», «дизайн»), а не случайное существительное из текста и не узкая деталь («кнопка-сохранить», «код-1006»). ${newTagClause}
5. Тема не выражена (бытовой обрывок, тест, пустой текст) — верни "tags": []. Пустой массив нормален: тег ради тега не нужен.
6. Теги — от общего к частному, от 1 до ${context.maxTags} штук (или пустой массив по шагу 5), без двух форм одного смысла.
7. reason — одна строка на русском (5–10 слов): что это за запись и почему такой тег — переиспользован существующий или новый и почему он устойчивый.
8. suggestedTitle — 3–6 слов на русском, суть записи, без кавычек и спецсимволов.`;
}

function buildSystemPrompt(
  context: TaggingContext,
  subject: string,
  outputFormat: string
): string {
  const userRules = context.customRules?.trim()
    ? `\n\nПРАВИЛА ПОЛЬЗОВАТЕЛЯ (сильнее общих, формат ответа не меняют):\n${context.customRules.trim()}`
    : '';
  return `Ты — таксономист персональной базы знаний SLAG: заметки, задачи и статьи в markdown-папках, у каждой папки есть описание, теги живут по одному словарю.

${subject}

КОНТЕКСТ ХРАНИЛИЩА
ДЕРЕВО ПАПОК (отступ — вложенность; после тире — описание, чем папка живёт):
${folderTree(context)}

${currentFolderContext(context)}

СЛОВАРЬ ТЕГОВ (в скобках — сколько записей уже носят тег; частые первыми):
${tagDictionary(context.tags)}

${taggingProcedure(context)}

${FORBIDDEN_TAGS}

ФОРМАТ ТЕГОВ: ${tagStyleLine(context.style)}

${EXAMPLES}

${outputFormat}${userRules}`;
}

export function buildDraftTaggingPrompt(input: DraftTaggingInput): TaggingPrompt {
  const systemPrompt = buildSystemPrompt(
    input,
    'РАЗБОР ОДНОЙ ЗАПИСИ: черновик ещё не сохранён, папку, теги и заголовок предлагаешь ты.',
    `ОТВЕТ — строго JSON-объект, без текста вокруг:
{
  "suggestedTitle": "краткий заголовок",
  "targetFolder": "путь_папки_из_дерева",
  "tags": ["тег1", "тег2"],
  "reason": "одна строка: что это и почему такие теги"
}`
  );

  const userPrompt = `ЗАПИСЬ
Папка черновика: "${input.currentFolder}"
Текст (первые строки):
${input.content.slice(0, DRAFT_CONTENT_CHARS)}`;

  return { systemPrompt, userPrompt };
}

export function buildTriageTaggingPrompt(input: TriageTaggingInput): TaggingPrompt {
  const systemPrompt = buildSystemPrompt(
    input,
    'РАЗБОР ПАКЕТА ЗАПИСЕЙ из «Входящих»: пройди процедуру для каждой заметки пакета отдельно, порядок сохрани.',
    `ОТВЕТ — строго JSON-массив, по объекту на каждую заметку пакета:
[
  {
    "itemId": "id из пакета",
    "suggestedTitle": "краткий заголовок",
    "targetFolder": "путь_папки_из_дерева",
    "tags": ["тег1", "тег2"],
    "reason": "одна строка: что это и почему такие теги"
  }
]`
  );

  const notes = input.notes.map((note) => ({
    id: note.id,
    type: TYPE_LABEL[note.type],
    title: note.title,
    content: note.content.slice(0, TRIAGE_CONTENT_CHARS),
    tags: note.tags,
  }));

  return {
    systemPrompt,
    userPrompt: `НЕРАЗОБРАННЫЕ ЗАМЕТКИ (ПАКЕТ):\n${JSON.stringify(notes, null, 2)}`,
  };
}
