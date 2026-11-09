import { AI_LIMITS } from '../../config';

export interface EncodedImage {
  dataUrl: string;
  byteLength: number;
  mimeType: string;
}

export interface ImageEncodeOptions {
  maxDim: number;
  quality: number;
  format: 'image/webp' | 'image/jpeg';
}

/** What an attachment keeps on disk: large enough to stay a photo, small enough to sync. */
export const STORED_IMAGE_MAX_DIM = 2048;
export const STORED_IMAGE_QUALITY = 0.82;

/** Re-encoding these through a canvas throws away what made them worth attaching. */
export const UNCOMPRESSIBLE_IMAGE_TYPES = new Set(['image/gif', 'image/svg+xml']);

/**
 * Bytes behind a data URL, without decoding it back into memory: base64 carries 3 bytes
 * per 4 characters, minus the tail padding.
 */
export function dataUrlByteLength(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return 0;
  const base64 = dataUrl.slice(comma + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = dataUrl;
  });
}

/**
 * One canvas re-encoder for both the attachment pipeline and the AI payload path.
 * Returns `null` when the format cannot be decoded or the browser silently produced another
 * format; callers keep the original bytes instead of guessing.
 */
export async function encodeImage(
  dataUrl: string,
  { maxDim, quality, format }: ImageEncodeOptions,
): Promise<EncodedImage | null> {
  if (typeof window === 'undefined' || !dataUrl.startsWith('data:image')) return null;

  const image = await loadImage(dataUrl);
  if (!image) return null;

  const scale = Math.min(1, maxDim / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(image, 0, 0, width, height);

  const encoded = canvas.toDataURL(format, quality);
  if (!encoded.startsWith(`data:${format}`)) return null;

  return { dataUrl: encoded, byteLength: dataUrlByteLength(encoded), mimeType: format };
}

/**
 * The AI path's budget: the same images, squeezed until the request fits. Kept apart from the
 * stored-attachment budget so tuning one never silently degrades the other.
 */
export async function downscaleImageDataUrl(
  dataUrl: string,
  maxDim: number = AI_LIMITS.IMAGE_DOWNSCALE_MAX_DIM,
): Promise<string> {
  const encoded = await encodeImage(dataUrl, {
    maxDim,
    quality: AI_LIMITS.IMAGE_JPEG_QUALITY,
    format: 'image/jpeg',
  });
  if (!encoded) return dataUrl;
  return encoded.byteLength < dataUrlByteLength(dataUrl) ? encoded.dataUrl : dataUrl;
}
