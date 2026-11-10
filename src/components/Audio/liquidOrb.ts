import { logger } from '../../lib/logger';

/**
 * Liquid orb shader and its WebGL plumbing.
 *
 * Motion is a sum of radial harmonics with fixed angular speeds, so a louder
 * syllable changes the silhouette but never the speed at which it turns.
 * `uTime` is plain seconds since mount: the old loop advanced it per frame and
 * scaled the step by volume, which made the orb spin 2.4x faster on a 144 Hz
 * display and stutter on every stressed syllable.
 */

const log = logger.scope('MEDIA');

const VERTEX_SOURCE = `
attribute vec2 aPosition;
varying vec2 vUv;

void main() {
  vUv = aPosition;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FRAGMENT_SOURCE = `
precision highp float;

uniform float uTime;
uniform float uVolume;
uniform float uBass;
uniform float uMid;
uniform float uHigh;
varying vec2 vUv;

void main() {
    vec2 p = vUv;
    float dist = length(p);
    float angle = atan(p.y, p.x);

    float t = uTime;
    float breath = sin(uTime * 1.3) * 0.012;

    // Radial harmonics. Amplitudes swell with the matching band, phases stay
    // tied to the clock so the shape never jerks when the volume jumps.
    float m1 = cos(angle - t * 0.45) * (0.015 + uVolume * 0.03);
    float m2 = sin(angle * 2.0 + t * 0.7) * (0.025 + uMid * 0.06);
    float m3 = cos(angle * 3.0 - t * 0.55) * (0.018 + uBass * 0.05);
    float m4 = sin(angle * 4.0 + t * 0.33) * (0.010 + uHigh * 0.025);

    // Ceiling keeps the loudest frame inside the quad instead of flat-clipping
    // against the canvas edge.
    float blobRadius = min(0.56 + breath + uBass * 0.10 + m1 + m2 + m3 + m4, 0.94);

    float alpha = 1.0 - smoothstep(blobRadius - 0.045, blobRadius + 0.045, dist);
    if (alpha <= 0.004) {
        discard;
    }

    // Palette is the visualisation gradient, not layout tokens.
    vec3 colWhite = vec3(1.0, 1.0, 1.0);
    vec3 colCyan = vec3(0.404, 0.910, 0.976);    // #67e8f9
    vec3 colAzure = vec3(0.220, 0.741, 0.973);   // #38bdf8
    vec3 colDeepBlue = vec3(0.008, 0.518, 0.780); // #0284c7

    float normalizedDist = clamp(dist / blobRadius, 0.0, 1.0);
    vec3 liquidColor = mix(colWhite, colCyan, smoothstep(0.0, 0.35, normalizedDist));
    liquidColor = mix(liquidColor, colAzure, smoothstep(0.35, 0.75, normalizedDist));
    liquidColor = mix(liquidColor, colDeepBlue, smoothstep(0.75, 1.0, normalizedDist));

    // White core breathes with loudness and widens on consonants.
    float coreGlow = (1.0 - smoothstep(0.0, 0.46 + uHigh * 0.18, dist)) * (0.8 + uVolume * 0.35);
    liquidColor = mix(liquidColor, colWhite, clamp(coreGlow, 0.0, 1.0));

    float rimLight = smoothstep(blobRadius - 0.16, blobRadius - 0.02, dist) * (0.3 + uMid * 0.35);
    liquidColor += colCyan * rimLight;

    gl_FragColor = vec4(liquidColor * alpha, alpha);
}
`;

export interface OrbFrame {
  timeSeconds: number;
  volume: number;
  bass: number;
  mid: number;
  high: number;
}

export interface OrbRenderer {
  draw(frame: OrbFrame): void;
  dispose(): void;
}

export function createOrbRenderer(canvas: HTMLCanvasElement): OrbRenderer | null {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true });
  if (!gl) {
    log.warn('WebGL is unavailable, the liquid orb stays disabled');
    return null;
  }

  const compile = (type: number, source: string): WebGLShader | null => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      log.error(
        `Liquid orb ${type === gl.VERTEX_SHADER ? 'vertex' : 'fragment'} shader failed: ${
          gl.getShaderInfoLog(shader) ?? 'no info log'
        }`,
      );
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };

  const vertexShader = compile(gl.VERTEX_SHADER, VERTEX_SOURCE);
  const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAGMENT_SOURCE);
  if (!vertexShader || !fragmentShader) {
    if (vertexShader) gl.deleteShader(vertexShader);
    if (fragmentShader) gl.deleteShader(fragmentShader);
    return null;
  }

  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    return null;
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    log.error('Liquid orb program failed to link', gl.getProgramInfoLog(program) ?? 'unknown');
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    return null;
  }
  gl.useProgram(program);

  const quadVertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

  const positionLocation = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  const timeLocation = gl.getUniformLocation(program, 'uTime');
  const volumeLocation = gl.getUniformLocation(program, 'uVolume');
  const bassLocation = gl.getUniformLocation(program, 'uBass');
  const midLocation = gl.getUniformLocation(program, 'uMid');
  const highLocation = gl.getUniformLocation(program, 'uHigh');

  let width = 0;
  let height = 0;

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const nextWidth = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const nextHeight = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (nextWidth === width && nextHeight === height) return;
    width = nextWidth;
    height = nextHeight;
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
  };

  return {
    draw(frame) {
      resize();
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(timeLocation, frame.timeSeconds);
      gl.uniform1f(volumeLocation, frame.volume);
      gl.uniform1f(bassLocation, frame.bass);
      gl.uniform1f(midLocation, frame.mid);
      gl.uniform1f(highLocation, frame.high);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
    dispose() {
      gl.deleteBuffer(positionBuffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      // No `WEBGL_lose_context` here: StrictMode (and any remount on the same
      // canvas node) hands back the very same context, and a lost context
      // accepts shaders only to fail them with an empty info log.
    },
  };
}
