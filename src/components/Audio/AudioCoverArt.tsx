import React, { useEffect, useRef } from 'react';
import type { AudioTrack } from '../../lib/audioHelper';

interface AudioCoverArtProps {
  track: AudioTrack | null;
  isPlaying: boolean;
  audioRef?: React.RefObject<HTMLAudioElement | null>;
  className?: string;
}

interface Ripple {
  progress: number; // 0 to 1
  speed: number;
  strength: number;
}

/**
 * Generative Circular Ocean Wave / Fluid Orb ("Моя волна" style, but oceanic & soft)
 * Two-color palette: Pure White into Soft Azure Blue (#38bdf8 / #7dd3fc)
 * Radiates outwards from center as circular water waves without rays or inner labels.
 */
const CircularOceanWaveCanvas: React.FC<{
  isPlaying: boolean;
  audioRef?: React.RefObject<HTMLAudioElement | null>;
}> = ({ isPlaying, audioRef }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const audioSourceConnected = useRef<boolean>(false);

  // Setup Web Audio Analyser if supported and safe
  useEffect(() => {
    if (!audioRef?.current) return;
    const audioElement = audioRef.current;

    let audioCtx: AudioContext | null = null;
    let sourceNode: MediaElementAudioSourceNode | null = null;

    try {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass && !audioSourceConnected.current) {
        audioCtx = new AudioCtxClass();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.8;

        sourceNode = audioCtx.createMediaElementSource(audioElement);
        sourceNode.connect(analyser);
        analyser.connect(audioCtx.destination);

        analyserRef.current = analyser;
        dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
        audioSourceConnected.current = true;
      }
    } catch {
      // In case of browser autoplay / CORS restriction on file URL,
      // fallback smoothly to procedural audio-driven physics
      analyserRef.current = null;
      dataArrayRef.current = null;
    }

    return () => {
      // Keep connection intact
    };
  }, [audioRef]);

  // Main Canvas render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let time = 0;
    let smoothedVolume = 0;

    // Expanding concentric ripples (rings born at center and expanding outwards)
    const ripples: Ripple[] = [
      { progress: 0.1, speed: 0.004, strength: 1 },
      { progress: 0.35, speed: 0.004, strength: 0.9 },
      { progress: 0.6, speed: 0.004, strength: 0.8 },
      { progress: 0.85, speed: 0.004, strength: 0.7 },
    ];

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;
      const cx = width / 2;
      const cy = height / 2;
      const maxRadius = Math.min(width, height) * 0.48;

      // Read audio energy if analyser is available
      let currentEnergy = 0;
      if (isPlaying && analyserRef.current && dataArrayRef.current) {
        try {
          analyserRef.current.getByteFrequencyData(dataArrayRef.current);
          let sum = 0;
          for (let i = 0; i < dataArrayRef.current.length; i++) {
            sum += dataArrayRef.current[i];
          }
          currentEnergy = sum / (dataArrayRef.current.length * 255);
        } catch {
          currentEnergy = 0;
        }
      }

      // Smooth energy with damping
      const targetEnergy = isPlaying
        ? (currentEnergy > 0.05 ? currentEnergy : 0.45 + Math.sin(time * 2.2) * 0.25)
        : 0.06;
      smoothedVolume += (targetEnergy - smoothedVolume) * 0.08;

      // Time progression (faster and more active on playback)
      time += isPlaying ? 0.025 + smoothedVolume * 0.025 : 0.01;

      // Dark sea background clear
      ctx.fillStyle = '#080a0f';
      ctx.fillRect(0, 0, width, height);

      // 1. Soft Ambient Fluid Glow Behind Core (fading out smoothly)
      const glowRadius = maxRadius * (0.6 + smoothedVolume * 0.45);
      const ambientGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
      const azureAlpha = isPlaying ? 0.28 + smoothedVolume * 0.35 : 0.12;
      ambientGlow.addColorStop(0, `rgba(56, 189, 248, ${azureAlpha.toFixed(3)})`);
      ambientGlow.addColorStop(0.5, `rgba(14, 165, 233, ${(azureAlpha * 0.4).toFixed(3)})`);
      ambientGlow.addColorStop(1, 'rgba(8, 10, 15, 0)');

      ctx.fillStyle = ambientGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
      ctx.fill();

      // 2. Expanding Concentric Ripple Waves (Water Surface Waves)
      // Born from center, undulating smoothly and expanding to the edges
      const rippleExpansionSpeed = isPlaying ? 0.005 + smoothedVolume * 0.005 : 0.002;

      for (const ripple of ripples) {
        ripple.progress += rippleExpansionSpeed;
        if (ripple.progress > 1) {
          ripple.progress = 0;
          ripple.strength = 0.6 + Math.random() * 0.4;
        }

        const r = maxRadius * (0.15 + ripple.progress * 0.85);
        const fade = Math.sin(ripple.progress * Math.PI); // Fades in at center, fades out at boundary
        const waveUndulation = (6 + smoothedVolume * 14) * (1 - ripple.progress * 0.4);

        ctx.save();
        ctx.beginPath();

        // Sample closed organic fluid contour in polar coordinates (60 steps)
        const segments = 64;
        for (let i = 0; i <= segments; i++) {
          const angle = (i / segments) * Math.PI * 2;
          // Organic fluid harmonic wobble: soft water tension without sharp spikes
          const wobble =
            Math.sin(angle * 3 + time * 1.5 + ripple.progress * 4) * 0.6 +
            Math.cos(angle * 4 - time * 1.2) * 0.4;
          const currentR = Math.max(4, r + wobble * waveUndulation);

          const px = cx + Math.cos(angle) * currentR;
          const py = cy + Math.sin(angle) * currentR;

          if (i === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.closePath();

        // Soft azure fluid fill between waves
        const ringAlpha = (fade * (0.08 + smoothedVolume * 0.16) * ripple.strength).toFixed(3);
        ctx.fillStyle = `rgba(56, 189, 248, ${ringAlpha})`;
        ctx.fill();

        // White crest line with soft azure bloom
        const crestAlpha = (fade * (0.4 + smoothedVolume * 0.55) * ripple.strength).toFixed(3);
        ctx.strokeStyle = `rgba(255, 255, 255, ${crestAlpha})`;
        ctx.lineWidth = 1.2 + (1 - ripple.progress) * 0.8;

        if (isPlaying) {
          ctx.shadowColor = 'rgba(56, 189, 248, 0.85)';
          ctx.shadowBlur = 6 + smoothedVolume * 10;
        } else {
          ctx.shadowBlur = 0;
        }

        ctx.stroke();
        ctx.restore();
      }

      // 3. Central Fluid Core / Water Droplet (White center -> Azure perimeter)
      // Breathes and undulates like liquid water
      const coreBaseR = maxRadius * (0.2 + smoothedVolume * 0.14);
      const coreUndulation = 4 + smoothedVolume * 8;

      ctx.save();
      ctx.beginPath();
      const coreSegments = 48;
      for (let i = 0; i <= coreSegments; i++) {
        const angle = (i / coreSegments) * Math.PI * 2;
        const wobble =
          Math.sin(angle * 2 + time * 2) * 0.55 +
          Math.sin(angle * 4 - time * 1.6) * 0.45;
        const currentR = coreBaseR + wobble * coreUndulation;
        const px = cx + Math.cos(angle) * currentR;
        const py = cy + Math.sin(angle) * currentR;

        if (i === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.closePath();

      // Central water droplet gradient: Pure White core -> Soft Azure
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreBaseR * 1.3);
      const coreWhiteAlpha = isPlaying ? 0.95 : 0.75;
      const coreAzureAlpha = isPlaying ? 0.75 + smoothedVolume * 0.25 : 0.4;
      coreGrad.addColorStop(0, `rgba(255, 255, 255, ${coreWhiteAlpha})`);
      coreGrad.addColorStop(0.35, `rgba(186, 230, 253, ${coreAzureAlpha})`);
      coreGrad.addColorStop(0.7, `rgba(56, 189, 248, ${(coreAzureAlpha * 0.6).toFixed(3)})`);
      coreGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');

      ctx.fillStyle = coreGrad;
      ctx.fill();

      // Delicate bright white center specular highlight
      const highlightR = coreBaseR * 0.25;
      const highlightGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, highlightR);
      highlightGrad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
      highlightGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = highlightGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, highlightR, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      animationId = requestAnimationFrame(render);
    };

    // Auto-resize canvas for sharp High-DPI rendering
    const resizeObserver = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.resetTransform();
        ctx.scale(dpr, dpr);
      }
    });

    resizeObserver.observe(canvas);
    animationId = requestAnimationFrame(render);

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(animationId);
    };
  }, [isPlaying]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="ocean-waves-canvas"
      className="w-full h-full block rounded-3xl"
    />
  );
};

export const AudioCoverArt: React.FC<AudioCoverArtProps> = ({
  track,
  isPlaying,
  audioRef,
  className = '',
}) => {
  // If track has an associated cover image (e.g. music note with photo)
  if (track?.coverUrl) {
    return (
      <div
        className={`relative aspect-square w-52 h-52 sm:w-64 sm:h-64 rounded-3xl overflow-hidden border border-white/[0.08] shadow-2xl bg-[#131316] flex items-center justify-center select-none ${className}`}
      >
        <img
          src={track.coverUrl}
          alt={track.name}
          className={`w-full h-full object-cover transition-transform duration-700 ease-out outline outline-1 -outline-offset-1 outline-white/10 ${
            isPlaying ? 'scale-105' : 'scale-100'
          }`}
        />
        <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[9px] font-mono tracking-wider text-zinc-300 uppercase">
          {track.format}
        </div>
      </div>
    );
  }

  // Generative Circular Ocean Wave / Water Ripple (Pure White to Soft Azure Blue)
  // Completely clean without text, badges or labels inside
  return (
    <div
      className={`relative aspect-square w-52 h-52 sm:w-64 sm:h-64 rounded-3xl bg-[#080a0f] border border-white/[0.08] border-t-white/[0.14] shadow-2xl overflow-hidden select-none ${className}`}
    >
      <CircularOceanWaveCanvas isPlaying={isPlaying} audioRef={audioRef} />
    </div>
  );
};
