// The album art stand-in: a live spectrum orb that settles once playback pauses.
import React, { useEffect, useRef } from 'react';
import type { AudioTrack } from '../../lib/media/audioHelper';
import { createSpectrumReader, ORB_SILENCE, type OrbFeatures } from '../../lib/media/audioSpectrum';
import { createOrbRenderer } from './liquidOrb';
import { prefersReducedMotion } from '../../lib/motion';

interface AudioCoverArtProps {
  track: AudioTrack | null;
  isPlaying: boolean;
  analyser: AnalyserNode | null;
}

/** The orb keeps moving this long after a pause so it settles into a calm shape. */
const PAUSE_SETTLE_MS = 700;

const IS_DEV = import.meta.env.DEV;

interface OrbDebug {
  time: number;
  frames: number;
  features: OrbFeatures;
}

type OrbDebugWindow = Window & { __orbDebug?: OrbDebug };

function publishDebug(debug: OrbDebug): void {
  if (!IS_DEV) return;
  (window as OrbDebugWindow).__orbDebug = debug;
}

const LiquidOrbCanvas: React.FC<{ isPlaying: boolean; analyser: AnalyserNode | null }> = ({
  isPlaying,
  analyser,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<ReturnType<typeof createOrbRenderer> | null>(null);
  const readerRef = useRef<ReturnType<typeof createSpectrumReader> | null>(null);
  const isPlayingRef = useRef(isPlaying);
  const reducedMotionRef = useRef(false);
  const timeRef = useRef(0);
  const framesRef = useRef(0);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // One context for the whole mount: play/pause must not recompile the shader.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = createOrbRenderer(canvas);
    rendererRef.current = renderer;
    reducedMotionRef.current = prefersReducedMotion();

    return () => {
      renderer?.dispose();
      rendererRef.current = null;
      if (IS_DEV) delete (window as OrbDebugWindow).__orbDebug;
    };
  }, []);

  // The reader keeps its smoothing state across pause/resume, otherwise the
  // bands would snap to zero instead of releasing.
  useEffect(() => {
    readerRef.current = analyser ? createSpectrumReader(analyser) : null;
    return () => {
      readerRef.current = null;
    };
  }, [analyser]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    const drawFrame = (time: number, dt: number, features: OrbFeatures) => {
      renderer.draw({ timeSeconds: time, dt, features });
      framesRef.current += 1;
      publishDebug({ time, frames: framesRef.current, features });
    };

    if (reducedMotionRef.current) {
      drawFrame(1, 0, ORB_SILENCE);
      return;
    }

    const settleUntil = isPlaying ? Number.POSITIVE_INFINITY : performance.now() + PAUSE_SETTLE_MS;
    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      if (document.hidden) {
        raf = 0;
        return;
      }
      // dt in seconds, clamped: a tab restored after minutes must not jump.
      const dt = Math.min(Math.max((now - last) / 1000, 0), 0.05);
      last = now;
      timeRef.current += dt;

      const reader = readerRef.current;
      const features = reader ? reader.read(dt, isPlayingRef.current) : ORB_SILENCE;
      drawFrame(timeRef.current, dt, features);

      if (!isPlayingRef.current && now >= settleUntil) {
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);

    const onVisibilityChange = () => {
      if (document.hidden || raf) return;
      if (!isPlayingRef.current && performance.now() >= settleUntil) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [isPlaying]);

  return <canvas ref={canvasRef} data-testid="chatgpt-orb-canvas" className="w-full h-full block" />;
};

export const AudioCoverArt: React.FC<AudioCoverArtProps> = ({ track, isPlaying, analyser }) => {
  // If track has an associated cover image (e.g. music note with photo)
  if (track?.coverUrl) {
    return (
      <div className="relative aspect-square w-52 h-52 sm:w-64 sm:h-64 rounded-3xl overflow-hidden border border-white/[0.08] shadow-2xl bg-surface flex items-center justify-center select-none">
        <img
          src={track.coverUrl}
          alt={track.name}
          className={`w-full h-full object-cover transition-transform duration-700 ease-out outline outline-1 -outline-offset-1 outline-white/10 ${
            isPlaying ? 'scale-105' : 'scale-100'
          }`}
        />
        <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-2xs font-mono tracking-wider text-zinc-300 uppercase">
          {track.format}
        </div>
      </div>
    );
  }

  // Smooth ChatGPT Voice Liquid Light Orb (Pure White into Soft Azure Blue)
  return (
    <div className="relative aspect-square w-64 h-64 sm:w-80 sm:h-80 flex items-center justify-center select-none">
      <LiquidOrbCanvas isPlaying={isPlaying} analyser={analyser} />
    </div>
  );
};
