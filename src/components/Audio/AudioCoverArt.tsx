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
 * Avatar Bioluminescent Fluid Orb (Domain-Warped Volumetric Liquid Shader)
 * - Continuous living core (NO black holes, NO fan petals, NO hard geometric cutoffs)
 * - Shimmering gelatinous caustics & organic fluid turbulence (Perlin/Simplex FBM)
 * - Two-color palette: Pure White core luminescence into Soft Azure Blue (#38bdf8)
 * - Soft ethereal bloom fading naturally into the player's dark background
 */
const fragmentShaderSource = `
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform float uAudioVolume;
varying vec2 vUv;

// 2D Rotation
mat2 rot(float a) {
    float c = cos(a);
    float s = sin(a);
    return mat2(c, -s, s, c);
}

// Hash function
vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

// Simplex / Gradient Noise
float snoise(vec2 p) {
    const float K1 = 0.366025404; // (sqrt(3)-1)/2;
    const float K2 = 0.211324865; // (3-sqrt(3))/6;

    vec2 i = floor(p + (p.x + p.y) * K1);
    vec2 a = p - i + (i.x + i.y) * K2;
    vec2 o = (a.x > a.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec2 b = a - o + K2;
    vec2 c = a - 1.0 + 2.0 * K2;

    vec3 h = max(0.5 - vec3(dot(a, a), dot(b, b), dot(c, c)), 0.0);
    vec3 n = h * h * h * h * vec3(dot(a, hash2(i)), dot(b, hash2(i + o)), dot(c, hash2(i + 1.0)));

    return dot(n, vec3(70.0));
}

// Fractal Brownian Motion (Smooth volumetric liquid layers)
float fbm(vec2 p) {
    float f = 0.0;
    mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
    f += 0.5000 * snoise(p); p = m * p;
    f += 0.2500 * snoise(p); p = m * p;
    f += 0.1250 * snoise(p); p = m * p;
    f += 0.0625 * snoise(p);
    return f;
}

void main() {
    // Aspect-ratio corrected coordinates centered at (0, 0)
    vec2 p = vUv;
    float dist = length(p);

    // Audio-reactive fluid dynamics
    float vol = uAudioVolume;
    float t = uTime * 0.7;

    // Organic domain warping (simulating zero-gravity liquid flow / jellyfish bell)
    vec2 q = vec2(
        fbm(p + vec2(0.0, t * 0.2)),
        fbm(p + vec2(5.2, 1.3) + vec2(t * 0.15, 0.0))
    );

    vec2 r = vec2(
        fbm(p + 3.0 * q + vec2(1.7, 9.2) + vec2(0.0, t * 0.25)),
        fbm(p + 3.0 * q + vec2(8.3, 2.8) - vec2(t * 0.2, 0.0))
    );

    // Living turbulent field
    float fluid = fbm(p + 2.4 * r + t * 0.3);

    // Soft organic jellyfish boundary with breathing pulsation
    float breath = sin(uTime * 1.5) * 0.04 + vol * 0.12;
    float baseRadius = 0.52 + breath;
    float distortedRadius = baseRadius + fluid * (0.16 + vol * 0.14);

    // Multi-layer gelatinous density
    float innerCore = smoothstep(distortedRadius * 0.45, 0.0, dist);
    float midBody   = smoothstep(distortedRadius, distortedRadius * 0.2, dist);
    float outerAura = smoothstep(distortedRadius + 0.35 + vol * 0.25, distortedRadius * 0.3, dist);

    // Caustics & bioluminescent veins inside the medusa
    float caustics = pow(max(0.0, fluid + 0.25), 2.8) * midBody;

    // Palette: Pure White core -> Soft Luminous Azure Blue -> Deep Marine Void
    vec3 colDeep    = vec3(0.03, 0.04, 0.06);     // Dark backdrop
    vec3 colAzure   = vec3(0.05, 0.55, 0.95);     // Rich soft azure (#0ea5e9)
    vec3 colCyan    = vec3(0.22, 0.74, 0.97);     // Radiant cyan (#38bdf8)
    vec3 colLight   = vec3(0.73, 0.90, 0.99);     // Pale azure shimmer (#bae6fd)
    vec3 colWhite   = vec3(1.0, 1.0, 1.0);        // Pure bioluminescent white

    // Color synthesis across layers
    vec3 finalColor = vec3(0.0);

    // Ambient floating halo
    finalColor += colAzure * outerAura * (0.45 + vol * 0.4);

    // Translucent gelatinous membrane
    finalColor = mix(finalColor, colCyan, midBody * 0.85);

    // Internal fluid veins & caustics
    finalColor += colLight * caustics * (1.2 + vol * 0.8);

    // Radiant solid living nucleus (NO hole in the center!)
    finalColor = mix(finalColor, colWhite, innerCore * (0.95 + vol * 0.05));

    // Specular photon highlight at the very heart
    float heartDot = smoothstep(0.12 + vol * 0.06, 0.0, dist);
    finalColor = mix(finalColor, colWhite, heartDot);

    // Soft feathered outer alpha for seamless floating without square bounds
    float alpha = clamp(outerAura * 0.7 + midBody * 0.6 + innerCore * 0.5, 0.0, 1.0);

    gl_FragColor = vec4(finalColor * alpha, alpha);
}
`;

/**
 * Avatar Fluid Orb Canvas Component
 */
const AvatarFluidOrbCanvas: React.FC<{
  isPlaying: boolean;
  audioRef?: React.RefObject<HTMLAudioElement | null>;
}> = ({ isPlaying, audioRef }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const audioSourceConnected = useRef<boolean>(false);

  // Setup Web Audio Analyser if supported
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
      analyserRef.current = null;
      dataArrayRef.current = null;
    }

    return () => {};
  }, [audioRef]);

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

    // Quad geometry
    const quadVertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

    const aPosLoc = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(aPosLoc);
    gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

    const uTimeLoc = gl.getUniformLocation(program, 'uTime');
    const uVolLoc = gl.getUniformLocation(program, 'uAudioVolume');
    const uResLoc = gl.getUniformLocation(program, 'uResolution');

    let animationId: number;
    let time = 0;
    let curVol = 0;

    const render = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const displayW = Math.floor(canvas.clientWidth * dpr);
      const displayH = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== displayW || canvas.height !== displayH) {
        canvas.width = displayW;
        canvas.height = displayH;
        gl.viewport(0, 0, displayW, displayH);
      }

      // Read audio energy
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

      const targetEnergy = isPlaying
        ? (currentEnergy > 0.05 ? currentEnergy : 0.45 + Math.sin(time * 2.2) * 0.22)
        : 0.08;
      curVol += (targetEnergy - curVol) * 0.1;

      // Time progression
      const speed = isPlaying ? 0.02 + curVol * 0.025 : 0.009;
      time += speed;

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.uniform1f(uTimeLoc, time);
      gl.uniform1f(uVolLoc, curVol);
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
      data-testid="avatar-fluid-orb-canvas"
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

  // Avatar Bioluminescent Fluid Orb (Pure White into Soft Azure Blue)
  // Continuous living core, organic gelatinous caustics, floating on dark player canvas
  return (
    <div
      className={`relative aspect-square w-52 h-52 sm:w-64 sm:h-64 flex items-center justify-center select-none ${className}`}
    >
      <AvatarFluidOrbCanvas isPlaying={isPlaying} audioRef={audioRef} />
    </div>
  );
};
