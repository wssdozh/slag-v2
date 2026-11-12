/**
 * An id cut down for reading: the head, an ellipsis, the tail.
 */
export function shortId(id: string): string {
  return id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id;
}
