import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { logger } from '../lib/logger';
import { ORB_FFT_SIZE } from '../lib/media/audioSpectrum';

const log = logger.scope('MEDIA');

type AudioContextCtor = typeof AudioContext;

/**
 * Owns the Web Audio graph for one `<audio>` element.
 *
 * It sits next to the element instead of inside the orb canvas because
 * `createMediaElementSource` may be called exactly once per element: the canvas
 * unmounts whenever a track with cover art is shown, and remounting it used to
 * throw, silently leaving the orb without a spectrum forever.
 *
 * The element is rerouted only after the context actually reaches `running`.
 * Routing through a suspended context is what turns playback into silence with
 * a playing UI, so a failed resume leaves the audio on its native output.
 */
export function useAudioAnalyser(audioRef: RefObject<HTMLAudioElement | null>): AnalyserNode | null {
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  useEffect(() => {
    const element = audioRef.current;
    if (!element) return;

    const Ctor: AudioContextCtor | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
    if (!Ctor) {
      log.warn('Web Audio is unavailable, the liquid orb will stay idle');
      return;
    }

    let context: AudioContext;
    try {
      context = new Ctor();
    } catch (error) {
      log.error('AudioContext creation failed', error);
      return;
    }

    let disposed = false;

    const attach = () => {
      if (disposed || sourceRef.current) return;
      void context
        .resume()
        .then(() => {
          if (disposed || sourceRef.current) return;
          if (context.state !== 'running') {
            log.warn(`AudioContext is "${context.state}", keeping the element on native output`);
            return;
          }
          const node = context.createAnalyser();
          node.fftSize = ORB_FFT_SIZE;
          // Smoothing is done per second in audioSpectrum, not per analysis frame.
          node.smoothingTimeConstant = 0;
          node.minDecibels = -90;
          node.maxDecibels = -10;
          const source = context.createMediaElementSource(element);
          source.connect(node);
          node.connect(context.destination);
          sourceRef.current = source;
          setAnalyser(node);
        })
        .catch((error: unknown) => {
          log.warn('AudioContext resume was rejected, the liquid orb will stay idle', error);
        });
    };

    element.addEventListener('play', attach);
    if (!element.paused) attach();

    return () => {
      disposed = true;
      element.removeEventListener('play', attach);
      const source = sourceRef.current;
      sourceRef.current = null;
      if (source) source.disconnect();
      if (context.state !== 'closed') {
        void context.close().catch((error: unknown) => log.warn('AudioContext close failed', error));
      }
    };
  }, [audioRef]);

  return analyser;
}
