import React, { useEffect, useRef } from 'react';
import type { AudioTrack } from '../../lib/audioHelper';

interface AudioCoverArtProps {
  track: AudioTrack | null;
  isPlaying: boolean;
  audioRef?: React.RefObject<HTMLAudioElement | null>;
  className?: string;
}

interface Spore {
  x: number;
  y: number;
  baseAngle: number;
  dist: number;
  speed: number;
  size: number;
  alpha: number;
  phase: number;
}

/**
 * Avatar Bioluminescent Jellyfish Visualizer (Living Ethereal Organism)
 * - Solid luminous heart in the center (NO black hole / void)
 * - Translucent, shimmering gelatinous membranes (iridescent caustics)
 * - Silky flowing bioluminescent filaments & floating avatar spores
 * - Two-color palette: Pure White energy into Soft Azure Blue (#38bdf8 / #7dd3fc)
 * - Seamlessly floating on player canvas without tile background
 */
const AvatarBioluminescentJellyfishCanvas: React.FC<{
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

    // Floating bioluminescent spores (like Avatar Woodsprites / deep sea embers)
    const sporeCount = 20;
    const spores: Spore[] = Array.from({ length: sporeCount }, (_, i) => ({
      x: 0,
      y: 0,
      baseAngle: (i / sporeCount) * Math.PI * 2,
      dist: 50 + Math.random() * 65,
      speed: 0.005 + Math.random() * 0.01,
      size: 1 + Math.random() * 1.6,
      alpha: 0.3 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2,
    }));

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;
      const cx = width / 2;
      const cy = height / 2;
      const maxRadius = Math.min(width, height) * 0.44;

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
        ? (currentEnergy > 0.05 ? currentEnergy : 0.45 + Math.sin(time * 2.6) * 0.25)
        : 0.06;
      smoothedVolume += (targetEnergy - smoothedVolume) * 0.09;

      // Breathing cycle: contraction and expansion of the jellyfish bell
      const pulseSpeed = isPlaying ? 0.024 + smoothedVolume * 0.03 : 0.01;
      time += pulseSpeed;
      const breath = Math.sin(time * 1.8); // -1 to 1

      // Clear with full transparency so it floats organically on dark player background
      ctx.clearRect(0, 0, width, height);

      // 1. Ethereal ambient halo (soft bioluminescent aura)
      const haloRadius = maxRadius * (1.05 + smoothedVolume * 0.35);
      const haloGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloRadius);
      const auraAlpha = isPlaying ? 0.32 + smoothedVolume * 0.35 : 0.12;
      haloGrad.addColorStop(0, `rgba(56, 189, 248, ${(auraAlpha * 0.6).toFixed(3)})`);
      haloGrad.addColorStop(0.45, `rgba(14, 165, 233, ${(auraAlpha * 0.3).toFixed(3)})`);
      haloGrad.addColorStop(1, 'rgba(14, 165, 233, 0)');

      ctx.save();
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, haloRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 2. Floating Bioluminescent Avatar Spores (Woodsprites)
      ctx.save();
      for (const spore of spores) {
        spore.baseAngle += spore.speed * (isPlaying ? 1.5 : 0.7);
        const currentDist = spore.dist * (1 + breath * 0.12 + smoothedVolume * 0.25);
        const sx = cx + Math.cos(spore.baseAngle) * currentDist;
        const sy = cy + Math.sin(spore.baseAngle) * currentDist + Math.sin(time + spore.phase) * 6;

        const currentAlpha = spore.alpha * (0.6 + Math.sin(time * 2 + spore.phase) * 0.4);
        ctx.fillStyle = `rgba(255, 255, 255, ${currentAlpha.toFixed(3)})`;
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(sx, sy, spore.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // 3. Silky Outer Bioluminescent Filaments (Jellyfish Tendrils / Ethereal Feathers)
      // 28 fine silky lines weaving in zero-gravity water currents
      const filamentCount = 28;
      const segments = 90;

      for (let f = 0; f < filamentCount; f++) {
        const u = f / (filamentCount - 1); // 0 to 1
        const layerR = maxRadius * (0.42 + u * 0.5 + breath * 0.08 * (1 - u * 0.5));
        const amp = (8 + smoothedVolume * 22) * Math.sin(u * Math.PI) ** 0.8;

        ctx.save();
        ctx.beginPath();

        for (let i = 0; i <= segments; i++) {
          const theta = (i / segments) * Math.PI * 2;
          // Fluid organic ripples mimicking gelatinous movement
          const w1 = Math.sin(theta * 4 + time * 1.5 + u * 2.8) * 0.55;
          const w2 = Math.cos(theta * 6 - time * 1.1 - u * 2.1) * 0.32;
          const w3 = Math.sin(theta * 8 + time * 0.8 + u * 3.5) * 0.13;
          const harmonic = w1 + w2 + w3;

          const r = Math.max(15, layerR + harmonic * amp);
          const px = cx + Math.cos(theta) * r;
          const py = cy + Math.sin(theta) * r;

          if (i === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.closePath();

        // Shimmering color: pure white crest lines near core, fading to soft azure filaments
        const alpha = (0.2 + (1 - u) * 0.55 + smoothedVolume * 0.25).toFixed(3);
        if (u < 0.2) {
          ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
          ctx.lineWidth = 1.4;
          ctx.shadowColor = '#38bdf8';
          ctx.shadowBlur = isPlaying ? 10 + smoothedVolume * 10 : 4;
        } else {
          ctx.strokeStyle = `rgba(56, 189, 248, ${(Number(alpha) * 0.7).toFixed(3)})`;
          ctx.lineWidth = 1.0;
          ctx.shadowBlur = 0;
        }

        ctx.stroke();
        ctx.restore();
      }

      // 4. Multi-layered Translucent Gelatinous Bell (The Jellyfish Body - Filled & Shimmering)
      // 4 overlapping undulating translucent domes (caustics effect)
      const domeCount = 4;
      for (let d = domeCount - 1; d >= 0; d--) {
        const du = d / (domeCount - 1);
        const domeR = maxRadius * (0.32 + du * 0.35 + breath * 0.1);
        const domeAmp = (6 + smoothedVolume * 14) * (0.6 + du * 0.4);

        ctx.save();
        ctx.beginPath();
        for (let i = 0; i <= segments; i++) {
          const theta = (i / segments) * Math.PI * 2;
          const wobble =
            Math.sin(theta * 3 + time * 1.8 + d * 1.2) * 0.55 +
            Math.cos(theta * 5 - time * 1.4 - d * 0.8) * 0.45;
          const r = Math.max(20, domeR + wobble * domeAmp);
          const px = cx + Math.cos(theta) * r;
          const py = cy + Math.sin(theta) * r;

          if (i === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.closePath();

        // Gelatinous iridescent gradient fill
        const domeGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, domeR * 1.15);
        const fillAlpha = isPlaying ? 0.22 + smoothedVolume * 0.25 : 0.12;
        domeGrad.addColorStop(0, `rgba(224, 242, 254, ${(fillAlpha * 0.9).toFixed(3)})`);
        domeGrad.addColorStop(0.4, `rgba(56, 189, 248, ${(fillAlpha * 0.65).toFixed(3)})`);
        domeGrad.addColorStop(0.85, `rgba(14, 165, 233, ${(fillAlpha * 0.25).toFixed(3)})`);
        domeGrad.addColorStop(1, 'rgba(14, 165, 233, 0)');

        ctx.fillStyle = domeGrad;
        ctx.fill();

        // Delicate glowing membrane border
        ctx.strokeStyle = `rgba(186, 230, 253, ${(0.4 + smoothedVolume * 0.4).toFixed(3)})`;
        ctx.lineWidth = 1.3;
        ctx.stroke();
        ctx.restore();
      }

      // 5. Living Luminous Heart / Nucleus (NO HOLE - Solid Radiant Core)
      // Pure White glowing energy center that pulses with sound
      const coreR = maxRadius * (0.18 + smoothedVolume * 0.12 + breath * 0.04);
      const coreWobbleAmp = 3 + smoothedVolume * 6;

      ctx.save();
      ctx.beginPath();
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        const w =
          Math.sin(theta * 2 + time * 2.2) * 0.6 +
          Math.sin(theta * 4 - time * 1.7) * 0.4;
        const r = coreR + w * coreWobbleAmp;
        const px = cx + Math.cos(theta) * r;
        const py = cy + Math.sin(theta) * r;

        if (i === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.closePath();

      // Radiant Core Gradient: Pure White -> Soft Azure
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 1.25);
      const heartWhite = isPlaying ? 0.98 : 0.85;
      const heartAzure = isPlaying ? 0.8 + smoothedVolume * 0.2 : 0.5;

      coreGrad.addColorStop(0, `rgba(255, 255, 255, ${heartWhite})`);
      coreGrad.addColorStop(0.25, `rgba(240, 249, 255, ${heartWhite})`);
      coreGrad.addColorStop(0.6, `rgba(125, 211, 252, ${heartAzure})`);
      coreGrad.addColorStop(0.9, `rgba(56, 189, 248, ${(heartAzure * 0.6).toFixed(3)})`);
      coreGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');

      ctx.fillStyle = coreGrad;
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = isPlaying ? 24 + smoothedVolume * 20 : 12;
      ctx.fill();

      // White inner photon burst highlight
      const centerBrightR = coreR * 0.35;
      const brightGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, centerBrightR);
      brightGrad.addColorStop(0, '#ffffff');
      brightGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = brightGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, centerBrightR, 0, Math.PI * 2);
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
      className="w-full h-full block"
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

  // Floating Bioluminescent Jellyfish Organism (Pure White into Soft Azure Blue)
  // Completely solid living center (no hole), iridescent shimmering membranes, floating without background podlozhka
  return (
    <div
      className={`relative aspect-square w-52 h-52 sm:w-64 sm:h-64 flex items-center justify-center select-none ${className}`}
    >
      <AvatarBioluminescentJellyfishCanvas isPlaying={isPlaying} audioRef={audioRef} />
    </div>
  );
};
