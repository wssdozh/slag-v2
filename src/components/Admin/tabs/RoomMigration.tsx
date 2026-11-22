import { useState } from 'react';
import { BaseModal } from '../../Modals/BaseModal';
import type { AdminRoom, RoomMigrationAction } from '../useAdminData';

const LIMIT = 16 * 1024 * 1024;
const button = 'min-h-9 rounded-md px-3 py-2 text-xs text-fg-primary hover:bg-surface-hover disabled:opacity-40';

export function RoomMigration({ room, onAction, disabled }: {
  room: AdminRoom;
  onAction: (roomId: string, action: RoomMigrationAction, body: object) => Promise<void>;
  disabled: boolean;
}) {
  const [action, setAction] = useState<RoomMigrationAction>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [seed, setSeed] = useState<Record<string, unknown>>();
  const status = room.noteStatus;
  const generation = status?.generation;
  const label = status?.mode === 'registry' ? `Реестр · поколение ${generation}`
    : status?.mode === 'frozen' ? `Подготовка · поколение ${generation}`
      : status?.mode === 'legacy' ? 'Старый протокол' : 'Версия синхронизации неизвестна';
  const open = (next: RoomMigrationAction) => { setError(''); setSeed(undefined); setAction(next); };
  const close = () => { if (!busy) { setAction(undefined); setSeed(undefined); } };
  const run = async () => {
    if (!action || busy || (action === 'note-activate' && !seed)) return;
    setError('');
    setBusy(true);
    try {
      await onAction(room.roomId, action, action === 'note-activate' ? { generation, confirmRoom: room.roomId, seed } : { generation });
      setAction(undefined);
      setSeed(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось выполнить действие');
    } finally { setBusy(false); }
  };
  const readSeed = async (file: File | undefined) => {
    setSeed(undefined);
    setError('');
    if (!file) return;
    setBusy(true);
    try {
      const tooLarge = 'Пакет превышает 16 МиБ с учётом запроса. Используйте операторский инструмент.';
      if (file.size > LIMIT) throw new Error(tooLarge);
      const parsed: unknown = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Нужен зашифрованный пакет реестра');
      const value = parsed as Record<string, unknown>;
      if (value.room !== room.roomId || value.generation !== generation || !Array.isArray(value.ops) || !Array.isArray(value.writers)) {
        throw new Error('Пакет не для этой комнаты или поколения либо не содержит списка писателей.');
      }
      const keysOnly = (entry: unknown, keys: string[]) => Boolean(entry && typeof entry === 'object' && !Array.isArray(entry)
        && Object.keys(entry).every((key) => keys.includes(key)));
      if (!keysOnly(value, ['room', 'generation', 'ops', 'writers', 'folderTreeId', 'atomicGroups', 'sharedRecords', 'registryMedia', 'media'])
        || !value.ops.every((op: { sealed?: unknown }) => keysOnly(op, ['opId', 'noteId', 'kind', 'baseRevision', 'sealed', 'mediaIds'])
          && keysOnly(op.sealed, ['iv', 'ciphertext']))
        || ('media' in value && (!Array.isArray(value.media) || !value.media.every((blob: unknown) => keysOnly(blob, ['id', 'ciphertext']))))) {
        throw new Error('В пакете есть поля вне формата зашифрованного реестра. Пакет не отправлен.');
      }
      if (JSON.stringify(value.writers) !== JSON.stringify(room.noteWriters?.map(({ id }) => id))) {
        throw new Error('Писатели в пакете не совпадают со списком комнаты.');
      }
      if (new Blob([JSON.stringify({ generation, confirmRoom: room.roomId, seed: value })]).size > LIMIT) throw new Error(tooLarge);
      setSeed(value);
    } catch (err) { setError(err instanceof SyntaxError ? 'Пакет не удалось прочитать как JSON' : err instanceof Error ? err.message : 'Не удалось прочитать пакет'); }
    finally { setBusy(false); }
  };
  const validAction = action === 'note-freeze' ? status?.mode === 'legacy' : status?.mode === 'frozen';
  const title = action === 'note-freeze' ? 'Подготовить переход' : action === 'note-thaw' ? 'Отменить подготовку' : 'Включить реестр';
  return (
    <div className="flex flex-wrap items-center gap-x-2">
      <span className="text-fg-secondary">{label}</span>
      {room.noteMigration && status?.mode === 'legacy' && <button className={button} disabled={disabled || busy} onClick={() => open('note-freeze')}>Подготовить переход</button>}
      {room.noteMigration && status?.mode === 'frozen' && <>
        <button className={button} disabled={disabled || busy} onClick={() => open('note-activate')}>Загрузить пакет</button>
        <button className={button} disabled={disabled || busy} onClick={() => open('note-thaw')}>Отменить подготовку</button>
      </>}
      <BaseModal isOpen={Boolean(action)} portal onClose={close} title={title} maxWidth="max-w-lg" footer={(
        <button className={button} disabled={busy || !validAction || (action === 'note-activate' && !seed)} onClick={() => void run()}>
          {busy ? 'Выполняется…' : title}
        </button>
      )}>
        <div className="flex flex-col gap-3 p-4 text-sm">
          <p className="break-all text-fg-secondary">Комната: <code>{room.roomId}</code>{action !== 'note-freeze' && ` · поколение ${generation}`}</p>
          {action === 'note-freeze' && <p>Старый протокол перестанет принимать изменения. До активации можно отменить подготовку.</p>}
          {action === 'note-thaw' && <p>Старый протокол снова начнёт принимать изменения. Этот пакет больше нельзя будет активировать.</p>}
          {action === 'note-activate' && <>
            <p>Остановите редактирование. Сохраните свежие локальные снимки всех писателей и подготовьте зашифрованный пакет после сверки. Не загружайте снимки или ключи.</p>
            <details open><summary>Устройства с правом записи ({room.noteWriters?.length ?? 0})</summary>
              <ul className="space-y-1 break-all text-fg-secondary">{room.noteWriters?.map(({ id, name }) => <li key={id}>{name} · <code>{id}</code></li>)}</ul>
            </details>
            <label className="flex flex-col gap-1">Зашифрованный пакет (JSON)<input type="file" accept=".json,application/json" disabled={busy || !validAction} onChange={(event) => void readSeed(event.currentTarget.files?.[0])} /></label>
            {seed && <p>Записей реестра: {(seed.ops as unknown[]).length}. Блоков вложений: {Array.isArray(seed.media) ? seed.media.length : 0}.<br />
              Возможности: {[seed.folderTreeId && 'дерево папок', seed.atomicGroups && 'атомарные папочные операции', seed.registryMedia && 'медиа в реестре', seed.sharedRecords && 'общие записи'].filter(Boolean).join(', ') || 'только заметки'}.<br />
              После включения возврата к старому протоколу нет.</p>}
          </>}
          {!validAction && <p role="status">Состояние комнаты обновилось: {label}.</p>}
          {error && <p role="alert" className="text-danger">{error}</p>}
        </div>
      </BaseModal>
    </div>
  );
}
