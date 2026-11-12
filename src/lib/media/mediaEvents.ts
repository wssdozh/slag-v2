/**
 * One list of media-element events, bound and unbound in one move. A player that
 * forgets the `removeEventListener` side leaks its element; this keeps both sides
 * next to each other.
 */
interface MediaEventHandlers {
  onTimeUpdate?: () => void;
  onLoadedMetadata?: () => void;
  onError?: () => void;
  onEnded?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
}

export function bindMediaEvents(media: HTMLMediaElement, handlers: MediaEventHandlers): () => void {
  const bound: Array<[string, () => void]> = [];
  if (handlers.onTimeUpdate) bound.push(['timeupdate', handlers.onTimeUpdate]);
  if (handlers.onLoadedMetadata) bound.push(['loadedmetadata', handlers.onLoadedMetadata]);
  if (handlers.onError) bound.push(['error', handlers.onError]);
  if (handlers.onEnded) bound.push(['ended', handlers.onEnded]);
  if (handlers.onPlay) bound.push(['play', handlers.onPlay]);
  if (handlers.onPause) bound.push(['pause', handlers.onPause]);

  for (const [event, handler] of bound) media.addEventListener(event, handler);
  return () => {
    for (const [event, handler] of bound) media.removeEventListener(event, handler);
  };
}
