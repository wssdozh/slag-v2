// One deadline for every provider call and the data-URL plumbing they all need.

/** A stalled socket must end as an error with a retry button, not a spinner that never stops. */
export const ENRICH_TIMEOUT_MS = 60_000;

export function enrichFetch(input: string, init: RequestInit = {}): Promise<Response> {
  return fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(ENRICH_TIMEOUT_MS) });
}

/** Converts a base64 / blob data URL into a native Web Blob. */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return await res.blob();
}

/** Extracts up to maxBytes of text content from a text/file data URL. */
export async function dataUrlToText(dataUrl: string, maxBytes: number = 8192): Promise<string> {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const slice = blob.slice(0, maxBytes);
    return await slice.text();
  } catch {
    return '';
  }
}
