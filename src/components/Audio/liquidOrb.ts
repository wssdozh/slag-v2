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
uniform float uFlux;
uniform float uRing;
varying vec2 vUv;

void main() {
    vec2 p = vUv;
    float dist = length(p);
    float angle = atan(p.y, p.x);
    float t = uTime;

    // Palette is the visualisation gradient, not layout tokens.
    vec3 colWhite = vec3(1.0, 1.0, 1.0);
    vec3 colCyan = vec3(0.404, 0.910, 0.976);    // #67e8f9
    vec3 colAzure = vec3(0.220, 0.741, 0.973);   // #38bdf8
    vec3 colDeepBlue = vec3(0.008, 0.518, 0.780); // #0284c7

    // Layer 1 - aura: lagging glow, only loudness and a slow drift. It is added
    // after the body, so it reads as bloom around the silhouette instead of a
    // second disc behind it.
    float auraRadius = 0.78 + uVolume * 0.12 + uBass * 0.03 + sin(t * 0.21) * 0.015;
    float auraFalloff = 1.0 - smoothstep(auraRadius * 0.5, auraRadius, dist);
    float auraAlpha = auraFalloff * auraFalloff * (0.10 + uVolume * 0.30);
    vec3 auraColor = vec3(0.10, 0.55, 0.95);

    // Layer 2 - body: bass sets the size, mids bend the contour, volume drifts
    // the whole shape. Phases come from the clock, so loudness never speeds up
    // the rotation.
    float breath = sin(t * 1.3) * 0.008;
    float m1 = cos(angle - t * 0.45) * (0.012 + uVolume * 0.020);
    float m2 = sin(angle * 2.0 + t * 0.7) * (0.020 + uMid * 0.045);
    float m3 = cos(angle * 3.0 - t * 0.55) * (0.016 + uBass * 0.040);
    float m4 = sin(angle * 4.0 + t * 0.33) * (0.008 + uHigh * 0.020);
    float bodyRadius = min(0.54 + uBass * 0.09 + breath + m1 + m2 + m3 + m4, 0.90);
    float bodyAlpha = 1.0 - smoothstep(bodyRadius - 0.035, bodyRadius + 0.035, dist);

    float normalizedDist = clamp(dist / bodyRadius, 0.0, 1.0);
    vec3 bodyColor = mix(colWhite, colCyan, smoothstep(0.0, 0.35, normalizedDist));
    bodyColor = mix(bodyColor, colAzure, smoothstep(0.35, 0.75, normalizedDist));
    bodyColor = mix(bodyColor, colDeepBlue, smoothstep(0.75, 1.0, normalizedDist));

    // Highs live on the rim: shimmer is the cheapest way to show consonants.
    float rimLight = smoothstep(bodyRadius - 0.14, bodyRadius - 0.02, dist) * (0.25 + uHigh * 0.35);
    bodyColor += colCyan * rimLight;

    // Layer 3 - core: snaps with loudness and jumps on every onset.
    float coreRadius = 0.15 + uVolume * 0.09 + uFlux * 0.05;
    float coreAlpha = (1.0 - smoothstep(coreRadius - 0.05, coreRadius + 0.05, dist)) * 0.9;

    // Premultiplied compositing: body over, then the aura as added light, so a
    // quieter core does not swallow the glow around the silhouette.
    vec3 color = bodyColor * bodyAlpha;
    float alpha = bodyAlpha;
    color = colWhite * coreAlpha + color * (1.0 - coreAlpha);
    alpha = coreAlpha + alpha * (1.0 - coreAlpha);

    color += auraColor * auraAlpha * (1.0 - bodyAlpha);
    alpha = min(1.0, alpha + auraAlpha * (1.0 - bodyAlpha));

    // Onset shockwave: starts at the body edge and expands while the slow ring
    // envelope fades, so a drum reads as a hit instead of a blinking outline.
    float ringRadius = 0.55 + (1.0 - uRing) * 0.35;
    float ring = (1.0 - smoothstep(0.0, 0.012, abs(dist - ringRadius))) * uRing * uRing * 1.6;
    color += colCyan * ring;
    alpha = min(1.0, alpha + ring);

    if (alpha <= 0.004) {
        discard;
    }

    gl_FragColor = vec4(color, alpha);
}
`;

export interface OrbFrame {
  timeSeconds: number;
  volume: number;
  bass: number;
  mid: number;
  high: number;
  flux: number;
  ring: number;
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
  const fluxLocation = gl.getUniformLocation(program, 'uFlux');
  const ringLocation = gl.getUniformLocation(program, 'uRing');

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
      gl.uniform1f(fluxLocation, frame.flux);
      gl.uniform1f(ringLocation, frame.ring);
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
