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
 * ChatGPT Voice Orb GLSL Shader
 * - Smooth, meditative fractal ink drifting across a soft circular mask
 * - Pure White luminous core blooming into Soft Azure Blue (#38bdf8 / #7dd3fc)
 * - Continuous, living, organic volume (no center void, no fan petals, no flickering blades)
 * - Swells and swirls gently with voice/audio energy; calms down during silence
 */
const fragmentShaderSource = `
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform float uAudioVolume;
varying vec2 vUv;

// 2D Simplex / Gradient Noise
vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float snoise(vec2 p) {
    const float K1 = 0.366025404; // (sqrt(3)-1)/2
    const float K2 = 0.211324865; // (3-sqrt(3))/6

    vec2 i = floor(p + (p.x + p.y) * K1);
    vec2 a = p - i + (i.x + i.y) * K2;
    vec2 o = (a.x > a.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec2 b = a - o + K2;
    vec2 c = a - 1.0 + 2.0 * K2;

    vec3 h = max(0.5 - vec3(dot(a, a), dot(b, b), dot(c, c)), 0.0);
    vec3 n = h * h * h * h * vec3(dot(a, hash2(i)), dot(b, hash2(i + o)), dot(c, hash2(i + 1.0)));

    return dot(n, vec3(70.0));
}

// Fractal Brownian Motion (Simulating drifting smoke / ink in liquid)
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
    // Coordinate space centered at (0, 0)
    vec2 p = vUv;
    float dist = length(p);

    // Audio-reactive parameters
    float vol = uAudioVolume;
    float t = uTime * (0.6 + vol * 0.6);

    // Domain warping: simulates fluid ink curling and drifting inside the sphere
    vec2 q = vec2(
        fbm(p + vec2(0.0, t * 0.2)),
        fbm(p + vec2(4.3, 1.2) + vec2(t * 0.18, 0.0))
    );

    vec2 r = vec2(
        fbm(p + 2.8 * q + vec2(1.7, 9.2) + vec2(0.0, t * 0.25)),
        fbm(p + 2.8 * q + vec2(8.3, 2.8) - vec2(t * 0.22, 0.0))
    );

    // Dynamic swirling fluid field
    float fluid = fbm(p + 2.2 * r + t * 0.35);

    // Sphere radius with gentle organic breathing and voice swelling
    float breath = sin(uTime * 1.4) * 0.02 + vol * 0.08;
    float orbRadius = 0.68 + breath;

    // Edge softness for the circular mask (ChatGPT orb style)
    float mask = smoothstep(orbRadius, orbRadius - 0.08, dist);
    if (mask <= 0.001) {
        discard;
    }

    // Color definitions: Pure White into Soft Azure Blue (#38bdf8 / #7dd3fc)
    vec3 colAzureDark  = vec3(0.06, 0.38, 0.72); // Deep velvety azure edge
    vec3 colAzureMid   = vec3(0.22, 0.74, 0.97); // Soft radiant cyan/azure (#38bdf8)
    vec3 colAzureLight = vec3(0.73, 0.90, 0.99); // Ice azure glow (#bae6fd)
    vec3 colWhite      = vec3(1.0, 1.0, 1.0);    // Pure white blooming ink

    // Mix color based on distance and fluid swirl
    float inkDensity = (fluid * 0.5 + 0.5); // 0 to 1
    float radialFalloff = clamp(1.0 - (dist / orbRadius), 0.0, 1.0);

    // Ink distribution: white bursts in the active zones, azure in the body
    float whiteMix = pow(inkDensity, 1.8) * pow(radialFalloff, 0.75) * (0.85 + vol * 0.4);
    whiteMix = clamp(whiteMix, 0.0, 1.0);

    // Ambient body gradient
    vec3 bodyColor = mix(colAzureDark, colAzureMid, pow(radialFalloff, 0.8));
    bodyColor = mix(bodyColor, colAzureLight, inkDensity * 0.6);

    // Final color with blooming white ink
    vec3 finalColor = mix(bodyColor, colWhite, whiteMix);

    // Extra center luminescence so the heart is always softly glowing and living
    float centerGlow = smoothstep(0.4, 0.0, dist) * (0.4 + vol * 0.3);
    finalColor = mix(finalColor, colWhite, centerGlow);

    // Soft antialiased circular edge
    gl_FragColor = vec4(finalColor * mask, mask);
}
`;

/**
 * ChatGPT Voice Orb Canvas Component
 */
const ChatGPTOrbCanvas: React.FC<{
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

    // Quad geometry covering [-1, 1]
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

      // Read audio energy from Web Audio API
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

      // Smooth volume interpolation
      const targetEnergy = isPlaying
        ? (currentEnergy > 0.05 ? currentEnergy : 0.45 + Math.sin(time * 2.2) * 0.22)
        : 0.06;
      curVol += (targetEnergy - curVol) * 0.1;

      // Time progression (calm and smooth)
      const speed = isPlaying ? 0.016 + curVol * 0.02 : 0.007;
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

  // ChatGPT Voice Orb (Pure White into Soft Azure Blue)
  // Continuous living fluid ink, soft circular mask, floating on dark player canvas
  return (
    <div
      className={`relative aspect-square w-52 h-52 sm:w-64 sm:h-64 flex items-center justify-center select-none ${className}`}
    >
      <ChatGPTOrbCanvas isPlaying={isPlaying} audioRef={audioRef} />
    </div>
  );
};
