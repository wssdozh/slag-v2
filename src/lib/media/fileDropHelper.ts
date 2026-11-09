import type { SlagAttachment } from '../../types';
import { downscaleImageDataUrl } from './attachmentEnrichment';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'avif', 'bmp', 'svg'];
const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac', 'weba'];
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'm4v', 'webm', 'mkv'];

/** What the storage layer takes inline without turning into a memory problem. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/**
 * What kind of attachment a picked file is. Android's file picker (SAF) sometimes reports an
 * empty MIME, so the extension has to answer when the type does not.
 */
export function attachmentType(file: File): SlagAttachment['type'] {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (file.type.startsWith('image/') || IMAGE_EXTENSIONS.includes(ext)) return 'image';
  if (file.type.startsWith('audio/') || AUDIO_EXTENSIONS.includes(ext)) return 'audio';
  if (file.type.startsWith('video/') || VIDEO_EXTENSIONS.includes(ext)) return 'video';
  return 'file';
}

/**
 * The one place bytes become an attachment: picked files and gallery rows both land here, so the
 * naming, the image downscale and the disk path stay identical for every source.
 */
export async function attachmentFromDataUrl(source: {
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
  /** Callers that already know better than the MIME (a File does, a gallery row does not). */
  type?: SlagAttachment['type'];
}): Promise<SlagAttachment> {
  const id = 'att_' + Date.now() + Math.random().toString(36).slice(2, 6);
  const type: SlagAttachment['type'] = source.type
    ?? (source.mimeType.startsWith('image/')
      ? 'image'
      : source.mimeType.startsWith('audio/')
        ? 'audio'
        : source.mimeType.startsWith('video/')
          ? 'video'
          : 'file');

  // Optimize image memory: downscale massive photos to 1440px max dimension
  const dataUrl = type === 'image' ? await downscaleImageDataUrl(source.dataUrl, 1440) : source.dataUrl;

  return {
    id,
    name: source.name,
    type,
    mimeType: source.mimeType || 'application/octet-stream',
    size: source.size,
    relativePath: `.attachments/${id}_${source.name}`,
    dataUrl,
  };
}

export async function processFileListToAttachments(fileList: FileList | File[]): Promise<SlagAttachment[]> {
  const files = Array.from(fileList);
  const attachments: SlagAttachment[] = [];

  for (const file of files) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    attachments.push(await attachmentFromDataUrl({
      name: file.name,
      mimeType: file.type || '',
      size: file.size,
      dataUrl,
      type: attachmentType(file),
    }));
  }

  return attachments;
}
