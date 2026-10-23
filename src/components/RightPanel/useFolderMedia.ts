import { useMemo } from 'react';
import type { SlagItem } from '../../types';

export interface FolderMediaData {
  allImages: Array<{ id: string; name: string; url: string }>;
  allAudio: Array<{ id: string; name: string; url: string }>;
  allFiles: Array<{ id: string; name: string; url: string; size: number }>;
  allLinks: Array<{ text: string; url: string }>;
  folderTags: Set<string>;
  notesCount: number;
  tasksCount: number;
  articlesCount: number;
}

export function useFolderMedia(items: SlagItem[]): FolderMediaData {
  return useMemo(() => {
    const allImages: Array<{ id: string; name: string; url: string }> = [];
    const allAudio: Array<{ id: string; name: string; url: string }> = [];
    const allFiles: Array<{ id: string; name: string; url: string; size: number }> = [];
    const allLinks: Array<{ text: string; url: string }> = [];
    const folderTags = new Set<string>();

    let notesCount = 0;
    let tasksCount = 0;
    let articlesCount = 0;

    items.forEach(item => {
      if (item.type === 'note') notesCount++;
      else if (item.type === 'task') tasksCount++;
      else if (item.type === 'article') articlesCount++;

      (item.tags || []).forEach(t => folderTags.add(t));

      (item.attachments || []).forEach(att => {
        if (att.type === 'image' && att.dataUrl) {
          allImages.push({ id: att.id, name: att.name, url: att.dataUrl });
        } else if (att.type === 'audio' && att.dataUrl) {
          allAudio.push({ id: att.id, name: att.name, url: att.dataUrl });
        } else if (att.type === 'file' && att.dataUrl) {
          allFiles.push({ id: att.id, name: att.name, url: att.dataUrl, size: att.size });
        }
      });

      const markdownLinks = Array.from(item.content.matchAll(/\[(.*?)\]\((https?:\/\/[^\s)]+)\)/g));
      markdownLinks.forEach(m => {
        allLinks.push({ text: m[1] || m[2], url: m[2] });
      });

      const bareUrls = Array.from(item.content.matchAll(/(?<![([])(https?:\/\/[^\s<)]+)/g));
      bareUrls.forEach(m => {
        const url = m[1];
        if (!allLinks.some(l => l.url === url)) {
          allLinks.push({ text: url, url });
        }
      });
    });

    return {
      allImages,
      allAudio,
      allFiles,
      allLinks,
      folderTags,
      notesCount,
      tasksCount,
      articlesCount,
    };
  }, [items]);
}
