import { DiffModal } from '../../Modals/DiffModal';
import { LEGACY_CUTOVER } from '../../../lib/sync/notes/legacyCutover';
import { noteDifferences } from '../../../lib/sync/notes/merge';
import { RECOVERED_DISK, selectableNoteFields } from '../../../lib/sync/notes/review';
import { FOLDER_TREE_ID, isNoteItem } from '../../../lib/sync/notes/wire';
import { itemTitle } from './helpers';
import type { useSyncConflicts } from './useSyncConflicts';

const labels: Record<string, string> = {
  title: 'Заголовок', type: 'Тип', folder: 'Папка', tags: 'Теги', attachments: 'Вложения', status: 'Статус',
  priority: 'Приоритет', dueDate: 'Срок', reminder: 'Напоминание', duration: 'Длительность', recurrence: 'Повтор', streak: 'Серия',
  subtasks: 'Подзадачи', isPinned: 'Закрепление', isArchived: 'Архив', linkedItemIds: 'Связанные записи',
  content: 'Текст', customProps: 'Свойства Markdown', kanbanColumn: 'Колонка', summary: 'Краткое описание',
};
const reasons: Record<string, string> = {
  base: 'Исходная версия правки не подтверждена', lifecycle: 'Историю записи не удалось подтвердить',
  predecessor: 'Предыдущая локальная правка не принята',
  [LEGACY_CUTOVER]: 'Правка из старой очереди — исходная версия неизвестна',
  [RECOVERED_DISK]: 'Вариант сохранён из исходного хранилища',
};
function show(value: unknown) {
  return typeof value === 'string' ? value || 'Пусто' : value === undefined ? 'Не задано' : JSON.stringify(value);
}

export function SyncConflictReview({ model, readOnly }: { model: ReturnType<typeof useSyncConflicts>; readOnly: boolean }) {
  const { entries, close, refresh, changed, decision, setDecision, resolving, error, draft, setDraft, selected, setSelected, confirm } = model;
  const [entry] = entries;
  if (!entry) return null;
  const mine = entry.item, head = entry.currentItem;
  const pair = isNoteItem(mine) && isNoteItem(head) && !entry.folderGroup;
  const fields = pair ? selectableNoteFields(head, mine) : [];
  const selective = pair && mine.type === head.type;
  const canEdit = selective && !readOnly && !changed && !resolving && !decision;
  const folderFromArchive = entry.noteId === FOLDER_TREE_ID && entry.fields.includes(RECOVERED_DISK);
  const retryLabel = entry.folderGroup ? 'Повторить всю операцию' : selective ? 'Отправить выбранное'
    : entry.item === null ? 'Удалить запись' : entry.currentItem === null ? 'Отправить всю запись' : 'Заменить всю версию';
  const retryDisabled = readOnly || folderFromArchive || (selective && !selected.length && draft === undefined)
    || Boolean(entry.folderGroup && entries.some(({ currentItem }) => currentItem === null));
  const title = entry.reviewKind === 'legacy' ? 'Старая правка на проверку' : entry.reviewKind === 'review' ? 'Правка на проверку' : 'Конфликт синхронизации';
  const btn = 'min-h-9 rounded-md px-2 hover:bg-surface-hover focus-visible:bg-tint-8 disabled:opacity-40';
  return <DiffModal isOpen onClose={close} title={title} items={entries.map((member) => {
    const { item, currentItem, currentRevision } = member;
    const before = isNoteItem(currentItem) ? currentItem : undefined;
    const after = isNoteItem(item) ? item : undefined;
    const properties = before && after ? noteDifferences(before, after).filter((key) => key !== 'content').map((key) => ({
      label: labels[key] ?? key, oldValue: show((before as unknown as Record<string, unknown>)[key]),
      newValue: show((after as unknown as Record<string, unknown>)[key]),
    })) : [];
    const snapshot = (value: typeof item) => Array.isArray(value) ? value.map((folder) => JSON.stringify(folder)).join('\n')
      : value && 'shared' in value ? JSON.stringify(value.shared, null, 2) : '';
    const issue = member.fields.find((key) => Object.hasOwn(reasons, key));
    const conflicts = member.fields.filter((key) => Object.hasOwn(labels, key)).map((key) => labels[key]);
    const reason = issue ? reasons[issue] : conflicts.length ? `Не удалось объединить: ${conflicts.join(', ')}` : undefined;
    return { title: before?.title || after?.title || itemTitle(member), comparison: {
      before: before?.content ?? snapshot(currentItem), after: draft ?? after?.content ?? snapshot(item), properties,
      onEdit: canEdit && after ? (value: string) => setDraft(value === after.content ? undefined : value) : undefined,
      message: folderFromArchive ? 'Старое удаление папки не будет отправлено. При необходимости выполните его в актуальном дереве.'
        : !currentItem ? currentRevision ? 'Запись удалена на релее' : 'Версия релея недоступна' : !item ? 'Локальная операция: удалить запись' : reason,
    } };
  })} actions={
    <div className="flex flex-col gap-2 border-b border-subtle px-4 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        {changed && decision !== 'close' ? <>
          <span role="status">Версия изменилась. Сравнение обновлено.</span>
          <button type="button" className={btn} onClick={refresh}>Проверить новую версию</button>
        </> : decision ? <>
          <span>{decision === 'close' ? 'Закрыть без изменений? Несохранённый текст пропадёт.' : decision === 'keep' ? 'Убрать локальный вариант из списка?' : `${retryLabel} для просмотренной ревизии?`}</span>
          <button type="button" className={btn} disabled={resolving} onClick={() => void confirm(selective)}>Подтвердить</button>
          <button type="button" className={btn} disabled={resolving} onClick={() => setDecision(undefined)}>Отмена</button>
        </> : <>
          <button type="button" className={btn} disabled={resolving} onClick={() => setDecision('keep')}>Оставить версию релея</button>
          <button type="button" className={btn} disabled={retryDisabled || resolving} onClick={() => setDecision('retry')}>{retryLabel}</button>
        </>}
        {error && <span role="alert" className="text-danger">{error}</span>}
      </div>
      {fields.length > 0 && !changed && !readOnly && <fieldset disabled={resolving || Boolean(decision)} className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <legend className="mb-1 text-fg-secondary">Что взять из локальной правки</legend>
        {fields.map((field) => <label key={field} className="flex min-h-8 items-center gap-2">
          <input type="checkbox" checked={selected.includes(field)} onChange={({ currentTarget }) => {
            const checked = currentTarget.checked;
            setSelected((old) => checked ? [...old, field] : old.filter((key) => key !== field));
          }} />{labels[field] ?? field}
        </label>)}
      </fieldset>}
    </div>
  } />;
}
