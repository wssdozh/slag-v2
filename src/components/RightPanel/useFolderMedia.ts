// Collects a folder's attachments, links and tags and resolves their bytes once.
import { useMemo } from 'react';
import type { SlagItem } from '../../types';
import type { LightboxImage } from '../UI/ImageLightbox';
import { useAttachmentSrcs } from '../../hooks/media/useAttachmentSrc';

export interface FolderMediaData {
  allImages: LightboxImage[];
  allAudio: Array<{
    id: string;
    name: string;
    url: string;
    extractedText?: string;
    summary?: string;
    enrichmentStatus?: 'idle' | 'processing' | 'ready' | 'error';
    enrichmentError?: string;
    itemId?: string;
  }>;
  allFiles: Array<{
    id: string;
    name: string;
    url: string;
    size: number;
    summary?: string;
    extractedText?: string;
  }>;
  allLinks: Array<{ text: string; url: string }>;
  folderTags: Set<string>;
  notesCount: number;
  tasksCount: number;
  articlesCount: number;
}

export function useFolderMedia(items: SlagItem[]): FolderMediaData {
  // Bytes live outside the note now, so the panel resolves them once for the whole folder.
  const attachments = useMemo(() => items.flatMap(i => i.attachments || []), [items]);
  const { srcs } = useAttachmentSrcs(attachments);

  return useMemo(() => {
    const allImages: LightboxImage[] = [];
    const allAudio: FolderMediaData['allAudio'] = [];
    const allFiles: FolderMediaData['allFiles'] = [];
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
        if (att.type === 'image') {
          allImages.push({
            id: att.id,
            name: att.name,
            url: srcs[att.id] ?? att.dataUrl ?? '',
            extractedText: att.extractedText,
            summary: att.summary,
            enrichmentStatus: att.enrichmentStatus,
            enrichmentError: att.enrichmentError,
            itemId: item.id,
          });
        } else if (att.type === 'audio') {
          allAudio.push({
            id: att.id,
            name: att.name,
            url: srcs[att.id] ?? att.dataUrl ?? '',
            extractedText: att.extractedText,
            summary: att.summary,
            enrichmentStatus: att.enrichmentStatus,
            enrichmentError: att.enrichmentError,
            itemId: item.id,
          });
        } else if (att.type === 'file') {
          allFiles.push({
            id: att.id,
            name: att.name,
            url: srcs[att.id] ?? att.dataUrl ?? '',
            size: att.size,
            summary: att.summary,
            extractedText: att.extractedText,
          });
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
  }, [items, srcs]);
}
