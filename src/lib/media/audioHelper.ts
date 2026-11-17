// Builds the playable audio library from note attachments: format, duration, cover, voice.
import type { SlagItem, InboxMode } from '../../types';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { pauseAudio } from './audioSession';

export interface AudioTrack {
  id: string; // track unique id (itemId + attachmentId)
  attachmentId: string;
  relativePath: string;
  name: string;
  url: string;
  duration?: number;
  size?: number;
  waveform?: number[];
  mimeType: string;
  isVoice: boolean;
  format: string;
  coverUrl?: string;
  itemId: string;
  itemTitle: string;
  itemFolder: string;
  createdAt: number;
}

export type AudioScopeMode = 'active' | 'pinned';
export type AudioTypeFilter = 'voice' | 'file';

export function detectAudioFormat(filename: string, mimeType?: string): string {
  const ext = filename.split('.').pop()?.toUpperCase();
  if (ext && ext.length >= 2 && ext.length <= 4) {
    return ext;
  }
  if (mimeType) {
    if (mimeType.includes('webm')) return 'WEBM';
    if (mimeType.includes('mp3') || mimeType.includes('mpeg')) return 'MP3';
    if (mimeType.includes('wav')) return 'WAV';
    if (mimeType.includes('ogg')) return 'OGG';
    if (mimeType.includes('flac')) return 'FLAC';
    if (mimeType.includes('aac')) return 'AAC';
    if (mimeType.includes('m4a')) return 'M4A';
  }
  return 'AUDIO';
}

const AUDIO_EXT_RE = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm|mp4|3gp|amr)$/i;

/**
 * A track's filename is the only metadata a recording carries: `Artist - Title.ext`.
 * Splits it for the row header, and degrades to the plain name when there is no dash.
 */
export function splitAudioName(name: string): { title: string; author: string } {
  const clean = name.replace(AUDIO_EXT_RE, '').trim();
  const cut = clean.lastIndexOf(' - ');
  if (cut <= 0) return { title: clean, author: '' };
  const author = clean.slice(0, cut).trim();
  const title = clean.slice(cut + 3).trim();
  return author && title ? { title, author } : { title: clean, author: '' };
}

/** Recorders stamp `voice_11-30-52.webm`; that is a file id, not a track name. */
export function isRecordedAudioName(name: string): boolean {
  return /^(voice|square)_\d/i.test(name.trim());
}

/** One label for the feed row and the player header: who and what, never the extension. */
export function audioTrackLabel(name: string): { title: string; author: string; isRecorded: boolean } {
  return { ...splitAudioName(name), isRecorded: isRecordedAudioName(name) };
}

export interface ExtractAudioOptions {
  folderScope: string | null;
  typeFilters: AudioTypeFilter[];
  inboxMode?: InboxMode;
}

export function extractAudioTracks(
  items: SlagItem[],
  options: ExtractAudioOptions
): AudioTrack[] {
  const { folderScope, typeFilters, inboxMode } = options;
  const allowVoice = typeFilters.includes('voice');
  const allowFile = typeFilters.includes('file');

  const tracks: AudioTrack[] = [];

  items.forEach((item) => {
    // Folder filter matching canonical AppContext / Feed logic:
    // When target is 'ALL_FOLDERS', allow everything
    // When target is DEFAULT_INBOX_FOLDER, respect inboxMode ('all' = entire vault, 'unsorted' = only inbox, 'sorted' = everything else)
    // When target is a specific folder, include it and its nested subfolders
    const targetFolder = folderScope || DEFAULT_INBOX_FOLDER;
    let matchesFolder = false;

    if (targetFolder === 'ALL_FOLDERS') {
      matchesFolder = true;
    } else if (targetFolder === DEFAULT_INBOX_FOLDER) {
      const mode = inboxMode || 'all';
      if (mode === 'unsorted') {
        matchesFolder = (item.folder || DEFAULT_INBOX_FOLDER) === DEFAULT_INBOX_FOLDER;
      } else if (mode === 'all') {
        matchesFolder = true;
      } else if (mode === 'sorted') {
        matchesFolder = (item.folder || DEFAULT_INBOX_FOLDER) !== DEFAULT_INBOX_FOLDER;
      }
    } else {
      const itemFolder = item.folder || DEFAULT_INBOX_FOLDER;
      matchesFolder = itemFolder === targetFolder || itemFolder.startsWith(targetFolder + '/');
    }

    if (!matchesFolder) return;

    // Look for cover image in the same note
    const coverImage = item.attachments?.find(
      (att) => att.type === 'image' && att.dataUrl
    );

    (item.attachments || []).forEach((att) => {
      const isAudio = att.type === 'audio' || (att.mimeType || '').startsWith('audio/');
      if (!isAudio) return;

      const isVoice =
        att.name.startsWith('voice_') ||
        (att.mimeType || '').includes('webm') ||
        (att.name.toLowerCase().includes('voice') && !att.name.endsWith('.mp3'));

      if (isVoice && !allowVoice) return;
      if (!isVoice && !allowFile) return;

      const format = detectAudioFormat(att.name, att.mimeType);

      tracks.push({
        id: `${item.id}_${att.id}`,
        attachmentId: att.id,
        relativePath: att.relativePath,
        name: att.name,
        url: att.dataUrl || '',
        duration: att.duration,
        size: att.size,
        waveform: att.waveform,
        mimeType: att.mimeType || 'audio/webm',
        isVoice,
        format,
        coverUrl: coverImage?.dataUrl,
        itemId: item.id,
        itemTitle: item.title || 'Без названия',
        itemFolder: item.folder || DEFAULT_INBOX_FOLDER,
        createdAt: item.createdAt,
      });
    });
  });

  // Sort by date ascending (chronological playlist) so voice notes & tracks play in order
  tracks.sort((a, b) => a.createdAt - b.createdAt);

  return tracks;
}

/**
 * Capture-phase listener that pauses all other <audio> and <video> elements
 * whenever any audio begins playing in the DOM. The player's element lives in
 * audioSession, outside the document, so it is stopped explicitly.
 */
export function setupAudioCollisionGuard(): () => void {
  const onPlayCapture = (e: Event) => {
    const target = e.target;
    if (!(target instanceof HTMLMediaElement)) return;

    pauseAudio();
    const allMedia = document.querySelectorAll<HTMLMediaElement>('audio, video');
    allMedia.forEach((media) => {
      if (media !== target && !media.paused) {
        media.pause();
      }
    });
  };

  window.addEventListener('play', onPlayCapture, true);
  return () => {
    window.removeEventListener('play', onPlayCapture, true);
  };
}

export function formatAudioDuration(secs?: number): string {
  if (secs === undefined || isNaN(secs) || secs < 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}
