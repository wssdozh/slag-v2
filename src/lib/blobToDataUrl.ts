/**
 * A blob as a `data:` URL.
 *
 * Attachment bytes reach the sync bundle and the AI providers as base64, so both the storage
 * layer and the enrichment layer ask this one function instead of each holding its own
 * `FileReader` dance — the encoding belongs to the platform, not to either caller.
 */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
