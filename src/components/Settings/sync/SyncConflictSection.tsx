import { SettingsGroup, SettingsRow } from '../SettingsUI';
import { itemTitle, reviewKey, type ReviewEntry } from './helpers';

export function SyncConflictSection({ title, groups, onCompare }: {
  title: string; groups: ReviewEntry[][]; onCompare: (entries: ReviewEntry[]) => void;
}) {
  if (!groups.length) return null;
  return <SettingsGroup title={title}>
    {groups.map((entries) => {
      const [entry] = entries;
      const description = entry.folderGroup ? `Записей и дерево: ${entries.length}`
        : entry.reviewKind === 'legacy' ? 'Правка из старой очереди — исходная версия неизвестна'
        : entry.reviewKind === 'review' ? 'Исходную версию или историю не удалось подтвердить'
        : `Нужен выбор · ревизия релея ${entry.currentRevision}`;
      return <SettingsRow key={reviewKey(entry)} label={entry.folderGroup ? 'Папочная операция' : itemTitle(entry)} description={description}
        right={<button type="button" className="min-h-10 rounded px-3 text-xs hover:bg-tint-6 focus-visible:bg-tint-8"
          onClick={() => onCompare(entries)}>Сравнить</button>} />;
    })}
  </SettingsGroup>;
}
