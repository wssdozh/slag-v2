// The one player: its element, its Web Audio graph and its state live outside every
// view, so a tab switch cannot pause the track or leave the orb without a spectrum.
import { logger } from '../logger/logger';
import { ORB_FFT_SIZE } from './audioSpectrum';
import type { AudioTrack } from './audioHelper';

const log = logger.scope('MEDIA');

export const PLAYBACK_SPEEDS = [1, 1.25, 1.5, 2] as const;
// Nothing in the panel exposes a volume slider: a constant, not state.
const VOLUME = 1;

export interface AudioSessionSnapshot {
  currentTrack: AudioTrack | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  speedIndex: number;
  isLoop: boolean;
  isShuffle: boolean;
  isMuted: boolean;
  isScrubbing: boolean;
  analyser: AnalyserNode | null;
}

const INITIAL: AudioSessionSnapshot = {
  currentTrack: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  speedIndex: 0,
  isLoop: false,
  isShuffle: false,
  isMuted: false,
  isScrubbing: false,
  analyser: null,
};

let snapshot: AudioSessionSnapshot = INITIAL;
const listeners = new Set<() => void>();

let element: HTMLAudioElement | null = null;
/** The queue the panel last showed: next/previous must survive an unmounted panel. */
let queue: AudioTrack[] = [];
/** The source the element carries, so the same url is never assigned twice. */
let loadedUrl: string | null = null;
let graphState: 'idle' | 'trying' | 'ready' | 'failed' = 'idle';

function emit(patch: Partial<AudioSessionSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

export function subscribeAudioSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAudioSessionSnapshot(): AudioSessionSnapshot {
  return snapshot;
}

/** The document's media elements no longer include this one: the collision guard
 *  cannot see it, so the same rule is enforced from this side. */
function pauseDocumentMedia(): void {
  document.querySelectorAll<HTMLMediaElement>('audio, video').forEach((media) => {
    if (!media.paused) media.pause();
  });
}

function attachAnalyser(audio: HTMLAudioElement): void {
  if (graphState !== 'idle') return;
  const AudioContextCtor = window.AudioContext;
  if (!AudioContextCtor) {
    log.warn('Web Audio is unavailable, the liquid orb will stay idle');
    return;
  }

  graphState = 'trying';
  let context: AudioContext;
  try {
    context = new AudioContextCtor();
  } catch (error) {
    graphState = 'idle';
    log.error('AudioContext creation failed', error);
    return;
  }

  void context
    .resume()
    .then(() => {
      if (context.state !== 'running') {
        log.warn(`AudioContext is "${context.state}", keeping the element on native output`);
        graphState = 'idle';
        return;
      }
      const node = context.createAnalyser();
      node.fftSize = ORB_FFT_SIZE;
      // Smoothing is done per second in audioSpectrum, not per analysis frame.
      node.smoothingTimeConstant = 0;
      node.minDecibels = -100;
      node.maxDecibels = 0;
      try {
        const source = context.createMediaElementSource(audio);
        source.connect(node);
        node.connect(context.destination);
      } catch (error) {
        graphState = 'failed';
        log.warn('The audio graph could not be built, the liquid orb will stay idle', error);
        return;
      }
      graphState = 'ready';
      emit({ analyser: node });
    })
    .catch((error: unknown) => {
      graphState = 'idle';
      log.warn('AudioContext resume was rejected, the liquid orb will stay idle', error);
    });
}

function pickShuffledIndex(currentIndex: number): number {
  const pick = Math.floor(Math.random() * (queue.length - 1));
  return currentIndex < 0 ? pick : pick >= currentIndex ? pick + 1 : pick;
}

function onEnded(): void {
  if (snapshot.isLoop) {
    const audio = element;
    if (!audio) return;
    audio.currentTime = 0;
    void audio.play().catch((error: unknown) => {
      log.warn(`Loop restart was refused: ${error instanceof Error ? error.name : String(error)}`);
    });
    return;
  }

  const currentIndex = queue.findIndex((track) => track.id === snapshot.currentTrack?.id);
  if (snapshot.isShuffle && queue.length > 1) {
    const next = queue[pickShuffledIndex(currentIndex)];
    emit({ currentTrack: next, currentTime: 0, duration: next.duration ?? 0, isPlaying: true });
    return;
  }
  if (currentIndex >= 0 && currentIndex < queue.length - 1) {
    const next = queue[currentIndex + 1];
    emit({ currentTrack: next, currentTime: 0, duration: next.duration ?? 0, isPlaying: true });
    return;
  }
  emit({ isPlaying: false, currentTime: 0 });
}

function ensureElement(): HTMLAudioElement {
  if (element) return element;

  const audio = new Audio();
  audio.preload = 'metadata';
  audio.volume = VOLUME;
  audio.playbackRate = PLAYBACK_SPEEDS[snapshot.speedIndex];

  audio.addEventListener('timeupdate', () => {
    if (!snapshot.isScrubbing) emit({ currentTime: audio.currentTime });
  });
  audio.addEventListener('loadedmetadata', () => {
    log.info(
      `Metadata: duration ${Number.isFinite(audio.duration) ? audio.duration.toFixed(1) : '?'}s, src ${audio.currentSrc.split(':')[0] || 'none'}`,
    );
    if (audio.duration && Number.isFinite(audio.duration)) {
      emit({ duration: audio.duration });
    } else if (snapshot.currentTrack?.duration) {
      emit({ duration: snapshot.currentTrack.duration });
    }
  });
  audio.addEventListener('ended', onEnded);
  audio.addEventListener('play', () => {
    log.info(`Play: "${snapshot.currentTrack?.name ?? 'none'}"`);
    pauseDocumentMedia();
    attachAnalyser(audio);
    emit({ isPlaying: true });
  });
  audio.addEventListener('pause', () => {
    log.debug(`Pause: "${snapshot.currentTrack?.name ?? 'none'}"`);
    emit({ isPlaying: false });
  });
  audio.addEventListener('error', () => {
    log.error(
      `Audio element error ${audio.error?.code ?? '?'}: "${snapshot.currentTrack?.name ?? 'none'}" (${audio.error?.message || 'no message'})`,
      { src: audio.currentSrc.slice(0, 60), networkState: audio.networkState, readyState: audio.readyState },
    );
  });

  element = audio;
  return audio;
}

export function setAudioQueue(tracks: AudioTrack[]): void {
  queue = tracks;
  const current = snapshot.currentTrack;
  if (!current) {
    const first = tracks[0];
    if (first) emit({ currentTrack: first, currentTime: 0, duration: first.duration ?? 0 });
    return;
  }
  // A filter can hide the playing track: keep playing it instead of swapping the source.
  const fresh = tracks.find((track) => track.id === current.id);
  if (fresh && fresh !== current) emit({ currentTrack: fresh });
}

/** Assigns the track's source; `false` means the element already carries it. */
export function loadAudioSource(url: string): boolean {
  if (loadedUrl === url) return false;
  const audio = ensureElement();
  loadedUrl = url;
  audio.src = url;
  if (snapshot.isPlaying) {
    void audio.play().catch((error: unknown) => {
      log.warn(`Resume after track change was refused: ${error instanceof Error ? error.name : String(error)}`);
    });
  }
  return true;
}

/** Drops the source of a track whose bytes never arrived; `false` means there was none. */
export function clearAudioSource(): boolean {
  const audio = element;
  if (!audio || loadedUrl === null) return false;
  loadedUrl = null;
  audio.pause();
  audio.removeAttribute('src');
  return true;
}

export function playAudio(): void {
  const track = snapshot.currentTrack;
  if (!track) return;
  void ensureElement()
    .play()
    .catch((error: unknown) => {
      log.warn(`Play was refused: ${error instanceof Error ? error.name : String(error)} ("${track.name}")`);
    });
}

export function pauseAudio(): void {
  if (element && !element.paused) element.pause();
}

export function cycleAudioSpeed(): void {
  const next = (snapshot.speedIndex + 1) % PLAYBACK_SPEEDS.length;
  emit({ speedIndex: next });
  if (element) element.playbackRate = PLAYBACK_SPEEDS[next];
}

export function toggleAudioMute(): void {
  const isMuted = !snapshot.isMuted;
  emit({ isMuted });
  if (element) element.volume = isMuted ? 0 : VOLUME;
}

export function toggleAudioLoop(): void {
  emit({ isLoop: !snapshot.isLoop });
}

export function toggleAudioShuffle(): void {
  emit({ isShuffle: !snapshot.isShuffle });
}

export function setAudioScrubbing(isScrubbing: boolean): void {
  emit({ isScrubbing });
}

export function skipAudioTime(delta: number): void {
  const audio = element;
  if (!audio) return;
  const duration = snapshot.duration || snapshot.currentTrack?.duration || 0;
  const next = Math.max(0, Math.min(duration, audio.currentTime + delta));
  audio.currentTime = next;
  emit({ currentTime: next });
}

export function seekAudioToFraction(fraction: number): void {
  const audio = element;
  if (!audio) return;
  const duration = snapshot.duration || snapshot.currentTrack?.duration || audio.duration || 0;
  const next = fraction * duration;
  audio.currentTime = next;
  emit({ currentTime: next });
}

function selectTrackAt(index: number): void {
  const track = queue[index];
  if (!track || track.id === snapshot.currentTrack?.id) return;
  emit({ currentTrack: track, currentTime: 0, duration: track.duration ?? 0 });
}

export function playAudioTrackAt(index: number): void {
  const track = queue[index];
  if (!track) return;
  if (track.id === snapshot.currentTrack?.id) {
    if (!snapshot.isPlaying) playAudio();
    return;
  }
  emit({ currentTrack: track, currentTime: 0, duration: track.duration ?? 0, isPlaying: true });
}

export function previousAudioTrack(): void {
  const audio = element;
  if (audio && audio.currentTime > 3) {
    audio.currentTime = 0;
    emit({ currentTime: 0 });
    return;
  }
  const currentIndex = queue.findIndex((track) => track.id === snapshot.currentTrack?.id);
  if (snapshot.isShuffle && queue.length > 1) {
    selectTrackAt(pickShuffledIndex(currentIndex));
    return;
  }
  if (currentIndex > 0) selectTrackAt(currentIndex - 1);
  else selectTrackAt(Math.max(0, queue.length - 1));
}

export function nextAudioTrack(): void {
  const currentIndex = queue.findIndex((track) => track.id === snapshot.currentTrack?.id);
  if (snapshot.isShuffle && queue.length > 1) {
    selectTrackAt(pickShuffledIndex(currentIndex));
    return;
  }
  if (currentIndex < queue.length - 1) selectTrackAt(currentIndex + 1);
  else selectTrackAt(0);
}
