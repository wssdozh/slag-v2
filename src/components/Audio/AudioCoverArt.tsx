import React, { useEffect, useRef } from 'react';
import type { AudioTrack } from '../../lib/audioHelper';

interface AudioCoverArtProps {
  track: AudioTrack | null;
  isPlaying: boolean;
  audioRef?: React.RefObject<HTMLAudioElement | null>;
  className?: string;
}

const vertexShaderSource = `
attribute vec2 aPosition;
varying vec2 vUv;

void main() {
  vUv = aPosition;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

/**
 * Authentic ChatGPT Advanced Voice Liquid Orb Shader
 * - Smooth, silky liquid light droplet (NO noisy ripple waves, NO grain)
 * - Elastic zero-gravity blob harmonics that deform gracefully with speech
 * - Soft volumetric gradient: Brilliant White core -> Pure Azure -> Sapphire aura
 * - Multi-band audio-reactive: Bass swells the body, Mids morph the contour, Highs ignite the white core
 */
const fragmentShaderSource = `
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform float uVolume;
uniform float uBass;
uniform float uMid;
uniform float uHigh;
varying vec2 vUv;

const float PI = 3.14159265358979323846;

void main() {
    vec2 p = vUv;
    float dist = length(p);
    float angle = atan(p.y, p.x);

    // Dynamic deformation harmonics (Pure smooth liquid droplet modes - NO noise wrinkles)
    float t = uTime * 1.2;
    
    // Mode 2: Elliptical stretch
    float m2 = sin(angle * 2.0 + t * 0.8) * (0.04 + uMid * 0.08);
    // Mode 3: Triangular fluid sway
    float m3 = cos(angle * 3.0 - t * 0.6) * (0.03 + uBass * 0.07);
    // Mode 4: Soft quad pulsation
    float m4 = sin(angle * 4.0 + t * 0.4) * (0.015 + uHigh * 0.04);
    // Mode 1: Floating dipole drift
    float m1 = cos(angle - t * 0.5) * (0.02 + uVolume * 0.04);

    // Smooth elastic radius (base + breathing + audio swell + modes)
    float baseR = 0.58 + sin(uTime * 1.5) * 0.015 + uBass * 0.12;
    float blobRadius = baseR + m1 + m2 + m3 + m4;

    // Outer soft edge mask with buttery antialiasing
    float edgeSoftness = 0.06 + uVolume * 0.04;
    float alpha = smoothstep(blobRadius + edgeSoftness, blobRadius - 0.02, dist);

    if (alpha <= 0.001) {
        discard;
    }

    // Color ramp: Pure White core -> Soft Azure Cyan -> Deep Cerulean Halo
    vec3 colWhite    = vec3(1.0, 1.0, 1.0);       // Incandescent heart
    vec3 colCyan     = vec3(0.42, 0.84, 0.99);   // Radiant bright cyan (#67e8f9)
    vec3 colAzure    = vec3(0.14, 0.60, 0.94);   // Soft azure blue (#38bdf8)
    vec3 colDeepBlue = vec3(0.02, 0.32, 0.68);   // Deep ocean cerulean (#0284c7)

    // Radial distance relative to dynamic blob radius
    float normalizedDist = clamp(dist / blobRadius, 0.0, 1.0);

    // Smooth interior liquid gradient
    vec3 liquidColor;
    if (normalizedDist < 0.35) {
        // Core to bright cyan transition
        float f = normalizedDist / 0.35;
        liquidColor = mix(colWhite, colCyan, smoothstep(0.0, 1.0, f));
    } else if (normalizedDist < 0.75) {
        // Bright cyan to azure body transition
        float f = (normalizedDist - 0.35) / 0.4;
        liquidColor = mix(colCyan, colAzure, smoothstep(0.0, 1.0, f));
    } else {
        // Azure body to deep blue rim transition
        float f = (normalizedDist - 0.75) / 0.25;
        liquidColor = mix(colAzure, colDeepBlue, smoothstep(0.0, 1.0, f));
    }

    // Core energy ignition: high frequencies and speech intensity burst the white light outward
    float coreGlow = smoothstep(0.45 + uHigh * 0.25, 0.0, dist) * (0.8 + uVolume * 0.4);
    liquidColor = mix(liquidColor, colWhite, clamp(coreGlow, 0.0, 1.0));

    // Delicate translucent surface sheen (liquid glass feel)
    float rimLight = smoothstep(blobRadius - 0.15, blobRadius - 0.01, dist) * (0.35 + uMid * 0.4);
    liquidColor += colCyan * rimLight;

    gl_FragColor = vec4(liquidColor * alpha, alpha);
}
`;

/**
 * ChatGPT Voice Liquid Orb Component
 */
const ChatGPTOrbCanvas: React.FC<{
  isPlaying: boolean;
  audioRef?: React.RefObject<HTMLAudioElement | null>;
}> = ({ isPlaying, audioRef }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const audioSourceConnected = useRef<boolean>(false);

  // Setup Web Audio Analyser and ensure AudioContext is active
  useEffect(() => {
    if (!audioRef?.current) return;
    const audioElement = audioRef.current;

    const initAudioGraph = () => {
      try {
        const AudioCtxClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

        if (AudioCtxClass && !audioCtxRef.current) {
          const audioCtx = new AudioCtxClass();
          audioCtxRef.current = audioCtx;

          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64;
          analyser.smoothingTimeConstant = 0.82;

          const sourceNode = audioCtx.createMediaElementSource(audioElement);
          sourceNode.connect(analyser);
          analyser.connect(audioCtx.destination);

          analyserRef.current = analyser;
          dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
          audioSourceConnected.current = true;
        }

        // Resume AudioContext if suspended
        if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
          audioCtxRef.current.resume().catch(() => {});
        }
      } catch {
        analyserRef.current = null;
        dataArrayRef.current = null;
      }
    };

    initAudioGraph();

    const handleUserInteraction = () => {
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
    };

    audioElement.addEventListener('play', handleUserInteraction);
    window.addEventListener('click', handleUserInteraction, { once: true });

    return () => {
      audioElement.removeEventListener('play', handleUserInteraction);
      window.removeEventListener('click', handleUserInteraction);
    };
  }, [audioRef]);

  // Ensure AudioContext resumes whenever playback starts
  useEffect(() => {
    if (isPlaying && audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
  }, [isPlaying]);

  // WebGL Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl =
      canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true }) ||
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);

    if (!gl) return;

    const compileShader = (type: number, src: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vs = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fs = compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    // Quad geometry covering [-1, 1]
    const quadVertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

    const aPosLoc = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(aPosLoc);
    gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

    const uTimeLoc = gl.getUniformLocation(program, 'uTime');
    const uVolLoc = gl.getUniformLocation(program, 'uVolume');
    const uBassLoc = gl.getUniformLocation(program, 'uBass');
    const uMidLoc = gl.getUniformLocation(program, 'uMid');
    const uHighLoc = gl.getUniformLocation(program, 'uHigh');
    const uResLoc = gl.getUniformLocation(program, 'uResolution');

    let animationId: number;
    let time = 0;
    let curVol = 0;
    let curBass = 0;
    let curMid = 0;
    let curHigh = 0;

    const render = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const displayW = Math.floor(canvas.clientWidth * dpr);
      const displayH = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== displayW || canvas.height !== displayH) {
        canvas.width = displayW;
        canvas.height = displayH;
        gl.viewport(0, 0, displayW, displayH);
      }

      // Read audio spectrum bands
      let targetBass = 0;
      let targetMid = 0;
      let targetHigh = 0;
      let targetVol = 0;

      if (isPlaying) {
        if (analyserRef.current && dataArrayRef.current) {
          try {
            analyserRef.current.getByteFrequencyData(dataArrayRef.current);
            const data = dataArrayRef.current;
            const len = data.length;

            // Low bins (0..3): Bass & voice fundamentals
            let sumBass = 0;
            const bassCount = Math.max(1, Math.min(4, len));
            for (let i = 0; i < bassCount; i++) sumBass += data[i];
            targetBass = sumBass / (bassCount * 255);

            // Mid bins (4..14): Voice formants and speech clarity
            let sumMid = 0;
            const midEnd = Math.min(15, len);
            const midCount = Math.max(1, midEnd - bassCount);
            for (let i = bassCount; i < midEnd; i++) sumMid += data[i];
            targetMid = sumMid / (midCount * 255);

            // High bins (15..end): Consonants, breath, transients
            let sumHigh = 0;
            const highCount = Math.max(1, len - midEnd);
            for (let i = midEnd; i < len; i++) sumHigh += data[i];
            targetHigh = sumHigh / (highCount * 255);

            targetVol = targetBass * 0.5 + targetMid * 0.35 + targetHigh * 0.15;
          } catch {
            targetVol = 0;
          }
        }

        // Natural fallback dynamic breathing if audio is silent
        if (targetVol < 0.03) {
          targetBass = 0.35 + Math.sin(time * 2.2) * 0.15;
          targetMid = 0.3 + Math.cos(time * 1.8) * 0.15;
          targetHigh = 0.25 + Math.sin(time * 3.1) * 0.1;
          targetVol = (targetBass + targetMid + targetHigh) / 3;
        }
      } else {
        // Gentle resting state
        targetBass = 0.05 + Math.sin(time * 1.2) * 0.03;
        targetMid = 0.04;
        targetHigh = 0.02;
        targetVol = 0.04;
      }

      // Smooth fluid inertia interpolation
      curVol += (targetVol - curVol) * 0.12;
      curBass += (targetBass - curBass) * 0.14;
      curMid += (targetMid - curMid) * 0.12;
      curHigh += (targetHigh - curHigh) * 0.16;

      // Time progression
      const speed = isPlaying ? 0.016 + curVol * 0.02 : 0.008;
      time += speed;

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.uniform1f(uTimeLoc, time);
      gl.uniform1f(uVolLoc, curVol);
      gl.uniform1f(uBassLoc, curBass);
      gl.uniform1f(uMidLoc, curMid);
      gl.uniform1f(uHighLoc, curHigh);
      gl.uniform2f(uResLoc, displayW, displayH);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      animationId = requestAnimationFrame(render);
    };

    animationId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationId);
      gl.deleteBuffer(posBuffer);
      gl.deleteProgram(program);
    };
  }, [isPlaying]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="chatgpt-orb-canvas"
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

  // Smooth ChatGPT Voice Liquid Light Orb (Pure White into Soft Azure Blue)
  // Scaled 1.3x for immersive presence in Now Playing view
  return (
    <div
      className={`relative aspect-square w-64 h-64 sm:w-80 sm:h-80 flex items-center justify-center select-none ${className}`}
    >
      <ChatGPTOrbCanvas isPlaying={isPlaying} audioRef={audioRef} />
    </div>
  );
};
