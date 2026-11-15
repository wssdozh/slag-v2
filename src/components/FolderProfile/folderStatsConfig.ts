// The single list of folder counters, labels and the Russian record count.
import type { IconName } from '../UI/icons/icons';
import type { FolderMediaData } from '../RightPanel/useFolderMedia';

export type FolderStatKey = 'notes' | 'tasks' | 'articles' | 'media' | 'audio' | 'links';

export interface FolderStatDefinition {
  key: FolderStatKey;
  label: string;
  icon: IconName;
  count: (mediaData: FolderMediaData) => number;
}

/**
 * One list of labels for all three containers. The panel used to say
 * "Фото / Медиа" and "Голосовые" while the modal said "Медиа" and "Аудио".
 */
export const FOLDER_STATS: FolderStatDefinition[] = [
  { key: 'notes', label: 'Заметки', icon: 'entity.note', count: data => data.notesCount },
  { key: 'tasks', label: 'Таски', icon: 'entity.task', count: data => data.tasksCount },
  { key: 'articles', label: 'Статьи', icon: 'entity.article', count: data => data.articlesCount },
  { key: 'media', label: 'Медиа', icon: 'entity.image', count: data => data.allImages.length },
  { key: 'audio', label: 'Аудио', icon: 'media.microphone', count: data => data.allAudio.length },
  { key: 'links', label: 'Ссылки', icon: 'entity.link', count: data => data.allLinks.length },
];

export function recordCountLabel(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} записей`;
  if (mod10 === 1) return `${count} запись`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} записи`;
  return `${count} записей`;
}
