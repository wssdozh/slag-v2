// `slag://` links: the OS hands a URL to the app, this turns it into the note behind it.
import { invoke, isTauri } from '@tauri-apps/api/core';
import { logger } from '../logger/logger';

const deepLinkLog = logger.scope('APP');

/** The scheme the app answers to, and the only thing a link can point at: a note. */
const NOTE_LINK_PREFIX = 'slag://note';

/** Fired by the native side when a link arrives while the app is already running. */
export const OPEN_LINK_EVENT = 'slag://open-link';

/**
 * The note a link names: `slag://note?title=…` is what the relay builds for a telegram answer,
 * `slag://note/<title>` is what a person types, and an `id` key is accepted because the app
 * resolves a title, an id and a filename through the same cascade.
 */
export function parseNoteLink(url: string): string | null {
  const raw = (url || '').trim();
  if (!raw.toLowerCase().startsWith(NOTE_LINK_PREFIX)) return null;
  const rest = raw.slice(NOTE_LINK_PREFIX.length);
  if (rest.startsWith('?') || rest.startsWith('#') || rest.startsWith('/?')) {
    const query = new URLSearchParams(rest.replace(/^\/?\?/, ''));
    const target = (query.get('title') || query.get('id') || '').trim();
    return target || null;
  }
  try {
    const target = decodeURIComponent(rest.replace(/^\/+/, '')).trim();
    return target || null;
  } catch {
    // A link with broken percent-escapes is not a note: better nothing than a toast about it.
    return null;
  }
}

/**
 * Pulls the URL the native side is holding, if any.
 *
 * The URL is parked natively and pulled on demand instead of pushed through an event: the cold
 * start case (the link is what launched the app) has no listener yet, and one path for both
 * beats two that must not race.
 */
export async function takePendingNoteLink(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    const url = await invoke<string | null>('take_deep_link');
    return url ? parseNoteLink(url) : null;
  } catch (error) {
    deepLinkLog.warn('Could not read a pending deep link', { error: String(error) });
    return null;
  }
}

/** Tells the app that a link arrived while it was already running. */
export async function onDeepLinkOpened(handler: () => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { listen } = await import('@tauri-apps/api/event');
  return listen(OPEN_LINK_EVENT, () => handler());
}
