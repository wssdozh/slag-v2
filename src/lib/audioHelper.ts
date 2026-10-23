import type { SlagItem } from '../types';

export interface AudioTrack {
  id: string; // track unique id (itemId + attachmentId)
  attachmentId: string;
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

export interface ExtractAudioOptions {
  folderScope: string | null;
  scopeMode: AudioScopeMode;
  typeFilters: AudioTypeFilter[];
}

export function extractAudioTracks(
  items: SlagItem[],
  options: ExtractAudioOptions
): AudioTrack[] {
  const { folderScope, typeFilters } = options;
  const allowVoice = typeFilters.includes('voice');
  const allowFile = typeFilters.includes('file');

  const tracks: AudioTrack[] = [];

  items.forEach((item) => {
    // Folder filter:
    // If scopeMode is 'pinned', require exact folder match (or root if folderScope is null/empty)
    // If scopeMode is 'active', follow folderScope. If folderScope is empty/null, consider it "Входящие"
    const targetFolder = folderScope || 'Входящие';
    const matchesFolder =
      targetFolder === 'ALL_FOLDERS'
        ? true
        : (item.folder || 'Входящие') === targetFolder;

    if (!matchesFolder) return;

    // Look for cover image in the same note
    const coverImage = item.attachments?.find(
      (att) => att.type === 'image' && att.dataUrl
    );

    (item.attachments || []).forEach((att) => {
      if (att.type !== 'audio' || !att.dataUrl) return;

      const isVoice =
        att.name.startsWith('voice_') ||
        att.mimeType.includes('webm') ||
        (att.name.toLowerCase().includes('voice') && !att.name.endsWith('.mp3'));

      if (isVoice && !allowVoice) return;
      if (!isVoice && !allowFile) return;

      const format = detectAudioFormat(att.name, att.mimeType);

      tracks.push({
        id: `${item.id}_${att.id}`,
        attachmentId: att.id,
        name: att.name,
        url: att.dataUrl,
        duration: att.duration,
        size: att.size,
        waveform: att.waveform,
        mimeType: att.mimeType || 'audio/webm',
        isVoice,
        format,
        coverUrl: coverImage?.dataUrl,
        itemId: item.id,
        itemTitle: item.title || 'Без названия',
        itemFolder: item.folder || 'Входящие',
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
 * whenever any audio begins playing in the DOM.
 */
export function setupAudioCollisionGuard(): () => void {
  const onPlayCapture = (e: Event) => {
    const target = e.target;
    if (!(target instanceof HTMLMediaElement)) return;

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
