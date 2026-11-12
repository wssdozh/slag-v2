// The single list of folder counters, labels and the Russian record count.
import type { ComponentType } from 'react';
import { CheckSquare, FileText, Image as ImageIcon, Link as LinkIcon, Mic, StickyNote } from 'lucide-react';
import type { FolderMediaData } from '../RightPanel/useFolderMedia';

export type FolderStatKey = 'notes' | 'tasks' | 'articles' | 'media' | 'audio' | 'links';

export interface FolderStatDefinition {
  key: FolderStatKey;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  count: (mediaData: FolderMediaData) => number;
}

/**
 * One list of labels for all three containers. The panel used to say
 * "Фото / Медиа" and "Голосовые" while the modal said "Медиа" and "Аудио".
 */
export const FOLDER_STATS: FolderStatDefinition[] = [
  { key: 'notes', label: 'Заметки', Icon: StickyNote, count: data => data.notesCount },
  { key: 'tasks', label: 'Таски', Icon: CheckSquare, count: data => data.tasksCount },
  { key: 'articles', label: 'Статьи', Icon: FileText, count: data => data.articlesCount },
  { key: 'media', label: 'Медиа', Icon: ImageIcon, count: data => data.allImages.length },
  { key: 'audio', label: 'Аудио', Icon: Mic, count: data => data.allAudio.length },
  { key: 'links', label: 'Ссылки', Icon: LinkIcon, count: data => data.allLinks.length },
];

export function recordCountLabel(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} записей`;
  if (mod10 === 1) return `${count} запись`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} записи`;
  return `${count} записей`;
}
