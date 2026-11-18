import type { SlagAttachment } from '../../types';
import {
  encodeImage,
  STORED_IMAGE_MAX_DIM,
  STORED_IMAGE_QUALITY,
  UNCOMPRESSIBLE_IMAGE_TYPES,
} from './imageCodec';
import { blobToDataUrl } from './blobToDataUrl';

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

/** `shot.png` → `shot.webp`; the stored file must say what it actually contains. */
function withExtension(name: string, extension: string): string {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return `${stem}.${extension}`;
}

/**
 * The one place bytes become an attachment: picked files and gallery rows both land here, so the
 * naming, the image squeeze and the disk path stay identical for every source.
 *
 * Compression is images-only by nature: a webview can decode and re-encode a bitmap, but it has
 * no video or audio encoder, so those types are copied byte for byte.
 */
export async function attachmentFromDataUrl(source: {
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
  /** Callers that already know better than the MIME (a File does, a gallery row does not). */
  type?: SlagAttachment['type'];
  /** The "не сжимать" toggle: store the original bytes, untouched. */
  compress?: boolean;
}): Promise<SlagAttachment> {
  const id = 'att_' + crypto.randomUUID();
  const type: SlagAttachment['type'] = source.type
    ?? (source.mimeType.startsWith('image/')
      ? 'image'
      : source.mimeType.startsWith('audio/')
        ? 'audio'
        : source.mimeType.startsWith('video/')
          ? 'video'
          : 'file');

  let name = source.name;
  let mimeType = source.mimeType || 'application/octet-stream';
  let size = source.size;
  let dataUrl = source.dataUrl;

  if ((source.compress ?? true) && type === 'image' && !UNCOMPRESSIBLE_IMAGE_TYPES.has(mimeType)) {
    const encoded = await encodeImage(dataUrl, {
      maxDim: STORED_IMAGE_MAX_DIM,
      quality: STORED_IMAGE_QUALITY,
      format: 'image/webp',
    });
    if (encoded) {
      dataUrl = encoded.dataUrl;
      mimeType = encoded.mimeType;
      size = encoded.byteLength;
      name = withExtension(name, 'webp');
    }
  }

  return {
    id,
    name,
    type,
    mimeType,
    size,
    relativePath: `.attachments/${id}_${name}`,
    dataUrl,
  };
}

export async function processFileListToAttachments(
  fileList: FileList | File[],
  compress = true,
): Promise<SlagAttachment[]> {
  const files = Array.from(fileList);
  const attachments: SlagAttachment[] = [];

  for (const file of files) {
    const dataUrl = await blobToDataUrl(file);

    attachments.push(await attachmentFromDataUrl({
      name: file.name,
      mimeType: file.type || '',
      size: file.size,
      dataUrl,
      type: attachmentType(file),
      compress,
    }));
  }

  return attachments;
}
