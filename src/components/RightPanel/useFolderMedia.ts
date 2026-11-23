// Collects a folder's attachments, links and tags; the bytes stay with the tile that shows them.
import { useMemo } from 'react';
import type { SlagAttachment, SlagItem } from '../../types';
import type { LightboxImage } from '../UI/ImageLightbox';

/** One entry of the panel: metadata, the note it came from, and the attachment the tile resolves. */
export interface FolderMediaImage extends LightboxImage {
  /** Where the bytes live. The tile asks for them only once it is about to be seen. */
  attachment: SlagAttachment;
}

export interface FolderMediaAudio {
  id: string;
  name: string;
  /** Only bytes that arrived inline; the row resolves the rest when its tab is open. */
  url: string;
  extractedText?: string;
  summary?: string;
  enrichmentStatus?: 'idle' | 'processing' | 'ready' | 'error';
  enrichmentError?: string;
  itemId?: string;
  attachment: SlagAttachment;
}

export interface FolderMediaFile {
  id: string;
  name: string;
  url: string;
  size: number;
  summary?: string;
  extractedText?: string;
  attachment: SlagAttachment;
}

export interface FolderMediaData {
  allImages: FolderMediaImage[];
  allAudio: FolderMediaAudio[];
  allFiles: FolderMediaFile[];
  allLinks: Array<{ text: string; url: string }>;
  folderTags: Set<string>;
  notesCount: number;
  tasksCount: number;
  articlesCount: number;
}

/**
 * The folder's media as a list, not as bytes. Every entry keeps its attachment, so the tile that
 * shows it resolves the file itself — the panel used to resolve the whole folder on mount, which
 * cost the bytes of every photo in a folder for the handful visible in a narrow dock column.
 */
export function useFolderMedia(items: SlagItem[]): FolderMediaData {
  return useMemo(() => {
    const allImages: FolderMediaImage[] = [];
    const allAudio: FolderMediaAudio[] = [];
    const allFiles: FolderMediaFile[] = [];
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
            url: att.dataUrl ?? '',
            extractedText: att.extractedText,
            summary: att.summary,
            enrichmentStatus: att.enrichmentStatus,
            enrichmentError: att.enrichmentError,
            itemId: item.id,
            // The viewer resolves an empty url through the note it came from.
            sourceItem: item,
            attachment: att,
          });
        } else if (att.type === 'audio') {
          allAudio.push({
            id: att.id,
            name: att.name,
            url: att.dataUrl ?? '',
            extractedText: att.extractedText,
            summary: att.summary,
            enrichmentStatus: att.enrichmentStatus,
            enrichmentError: att.enrichmentError,
            itemId: item.id,
            attachment: att,
          });
        } else if (att.type === 'file') {
          allFiles.push({
            id: att.id,
            name: att.name,
            url: att.dataUrl ?? '',
            size: att.size,
            summary: att.summary,
            extractedText: att.extractedText,
            attachment: att,
          });
        }
      });

      const markdownLinks = Array.from(item.content.matchAll(/\[(.*?)\]\((https?:\/\/[^\s)]+)\)/g));
      markdownLinks.forEach(m => {
        allLinks.push({ text: m[1] || m[2], url: m[2] });
      });

      const bareUrls = Array.from(item.content.matchAll(/(?<![([])(https?:\/\/[^\s<)]+)/g));
      bareUrls.forEach(m => {
        if (!allLinks.some(l => l.url === m[1])) {
          allLinks.push({ text: m[1], url: m[1] });
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
