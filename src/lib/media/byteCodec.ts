// Bytes to base64 and back without a Buffer, for crypto and file payloads in the browser.
export function bytesToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  // One `String.fromCharCode` per byte costs half a second on a six-megabyte attachment, and
  // every push does this with a file in hand. Slices keep the argument list short enough to call.
  const chunk = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunk) as unknown as number[]);
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/**
 * The bytes behind a `data:` URL, without a `fetch`.
 *
 * A webview answers `fetch(blob:…)` with a CSP error unless `blob:` is listed in `connect-src`,
 * and WebKitGTK reports that as a bare "Load failed". Decoding the payload directly keeps the
 * policy strict and makes the same code path work on Chromium and WebKit.
 */
export function dataUrlToBytes(value: string): { bytes: Uint8Array; mimeType: string } | undefined {
  if (!value.startsWith('data:')) return undefined;
  const marker = value.indexOf(',');
  if (marker < 0) return undefined;
  const header = value.slice(5, marker);
  if (!header.endsWith(';base64')) return undefined;
  try {
    return { bytes: base64ToBytes(value.slice(marker + 1)), mimeType: header.slice(0, -7) };
  } catch {
    return undefined;
  }
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
