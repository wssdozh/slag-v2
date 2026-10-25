import React, { useEffect, useRef } from 'react';

interface VoiceOrbProps {
  analyser: AnalyserNode | null;
  size?: number;
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

    // Dynamic deformation harmonics (Pure smooth liquid droplet modes)
    float t = uTime * 1.2;
    
    // Mode 2: Elliptical stretch
    float m2 = sin(angle * 2.0 + t * 0.9) * (0.04 + uMid * 0.16);
    // Mode 3: Triangular fluid sway
    float m3 = cos(angle * 3.0 - t * 0.7) * (0.03 + uBass * 0.20);
    // Mode 4: Soft quad pulsation
    float m4 = sin(angle * 4.0 + t * 0.5) * (0.015 + uHigh * 0.12);
    // Mode 1: Floating dipole drift
    float m1 = cos(angle - t * 0.6) * (0.02 + uVolume * 0.14);

    // Smooth elastic radius (base + breathing + audio swell + modes)
    float baseR = 0.53 + sin(uTime * 1.5) * 0.015 + uBass * 0.18;
    float blobRadius = baseR + m1 + m2 + m3 + m4;

    // Outer soft edge mask with buttery antialiasing
    float edgeSoftness = 0.06 + uVolume * 0.05;
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
    float coreGlow = smoothstep(0.42 + uHigh * 0.30, 0.0, dist) * (0.75 + uVolume * 0.7);
    liquidColor = mix(liquidColor, colWhite, clamp(coreGlow, 0.0, 1.0));

    // Delicate translucent surface sheen (liquid glass feel)
    float rimLight = smoothstep(blobRadius - 0.15, blobRadius - 0.01, dist) * (0.35 + uMid * 0.4);
    liquidColor += colCyan * rimLight;

    gl_FragColor = vec4(liquidColor * alpha, alpha);
}
`;

export const VoiceOrb: React.FC<VoiceOrbProps> = ({ analyser, size = 72, className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  useEffect(() => {
    if (analyser) {
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
    }
  }, [analyser]);

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
      const displayW = Math.floor(size * dpr);
      const displayH = Math.floor(size * dpr);
      if (canvas.width !== displayW || canvas.height !== displayH) {
        canvas.width = displayW;
        canvas.height = displayH;
        gl.viewport(0, 0, displayW, displayH);
      }

      let targetBass = 0;
      let targetMid = 0;
      let targetHigh = 0;
      let targetVol = 0;

      if (analyser) {
        if (!dataArrayRef.current || dataArrayRef.current.length !== analyser.frequencyBinCount) {
          dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
        }
        const ctx = analyser.context as unknown as { state?: string; resume?: () => Promise<void> };
        if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
          ctx.resume().catch(() => {});
        }
      }

      if (analyser && dataArrayRef.current) {
        try {
          analyser.getByteFrequencyData(dataArrayRef.current);
          const data = dataArrayRef.current;
          const len = data.length;

          // Low bins (0..3): Bass & voice fundamentals
          let sumBass = 0;
          const bassCount = Math.max(1, Math.min(4, len));
          for (let i = 0; i < bassCount; i++) sumBass += data[i];
          targetBass = Math.min(1.0, (sumBass / (bassCount * 255)) * 2.2);

          // Mid bins (4..14): Voice formants and speech clarity
          let sumMid = 0;
          const midEnd = Math.min(15, len);
          const midCount = Math.max(1, midEnd - bassCount);
          for (let i = bassCount; i < midEnd; i++) sumMid += data[i];
          targetMid = Math.min(1.0, (sumMid / (midCount * 255)) * 2.4);

          // High bins (15..end): Consonants, breath, transients
          let sumHigh = 0;
          const highCount = Math.max(1, len - midEnd);
          for (let i = midEnd; i < len; i++) sumHigh += data[i];
          targetHigh = Math.min(1.0, (sumHigh / (highCount * 255)) * 2.5);

          targetVol = Math.min(1.0, (targetBass * 0.45 + targetMid * 0.35 + targetHigh * 0.20) * 1.5);
        } catch {
          targetVol = 0;
        }
      }

      // Natural organic breathing if voice input is quiet
      if (targetVol < 0.03) {
        targetBass = 0.08 + Math.sin(time * 2.0) * 0.04;
        targetMid = 0.05 + Math.cos(time * 1.5) * 0.02;
        targetHigh = 0.03 + Math.sin(time * 2.8) * 0.015;
        targetVol = 0.05;
      }

      // Smooth fluid inertia interpolation (responsive yet buttery)
      curVol += (targetVol - curVol) * 0.20;
      curBass += (targetBass - curBass) * 0.22;
      curMid += (targetMid - curMid) * 0.20;
      curHigh += (targetHigh - curHigh) * 0.24;

      // Time progression
      const speed = 0.014 + curVol * 0.03;
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
  }, [analyser, size]);

  return (
    <div
      style={{ width: `${size}px`, height: `${size}px` }}
      className={`relative flex items-center justify-center shrink-0 pointer-events-none ${className}`}
    >
      <canvas
        ref={canvasRef}
        data-testid="voice-orb-canvas"
        style={{ width: `${size}px`, height: `${size}px` }}
        className="block"
      />
    </div>
  );
};
