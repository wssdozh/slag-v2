import type { SlagAttachment } from '../../types';
import { downscaleImageDataUrl } from './attachmentEnrichment';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'avif', 'bmp', 'svg'];
const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac', 'weba'];
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'm4v', 'webm', 'mkv'];

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

export async function processFileListToAttachments(fileList: FileList | File[]): Promise<SlagAttachment[]> {
  const files = Array.from(fileList);
  const attachments: SlagAttachment[] = [];

  for (const file of files) {
    const rawDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const id = 'att_' + Date.now() + Math.random().toString(36).slice(2, 6);
    const type = attachmentType(file);

    // Optimize image memory: downscale massive photos to 1440px max dimension
    const dataUrl = type === 'image'
      ? await downscaleImageDataUrl(rawDataUrl, 1440)
      : rawDataUrl;

    attachments.push({
      id,
      name: file.name,
      type,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      relativePath: `.attachments/${id}_${file.name}`,
      dataUrl,
    });
  }

  return attachments;
}
