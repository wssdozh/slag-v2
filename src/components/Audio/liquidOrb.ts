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

// One liquid blob: an elastic radius with two harmonics. Returns
// (coverage, radius, distance) so the caller can shade its own gradient.
vec3 orb(vec2 p, vec2 center, float base, float soft,
         float amp1, float phase1, float freq1,
         float amp2, float phase2, float freq2) {
    vec2 d = p - center;
    float r = length(d);
    float ang = atan(d.y, d.x);
    float radius = base + amp1 * cos(ang * freq1 + phase1) + amp2 * sin(ang * freq2 + phase2);
    return vec3(1.0 - smoothstep(radius - soft, radius + soft, r), radius, r);
}

void main() {
    vec2 p = vUv;
    float t = uTime;

    // Three objects, not three coatings on one silhouette. The centers are
    // far enough apart (relative to their radii) that the back and middle orbs
    // peek out as crescents instead of reading as concentric rings.
    vec2 centerBack = vec2(-0.14, 0.09)
                    + 0.035 * vec2(sin(t * 0.17), cos(t * 0.13))
                    + vec2(uVolume * 0.020, uBass * 0.010);
    vec2 centerMid = vec2(0.10, -0.05)
                   + 0.030 * vec2(sin(t * 0.23 + 1.3), cos(t * 0.19 + 0.7))
                   + vec2(-uBass * 0.012, 0.0);
    vec2 centerFront = vec2(0.26, 0.15)
                     + 0.025 * vec2(sin(t * 0.31 + 2.7), cos(t * 0.27 + 1.9))
                     + vec2(uFlux * 0.030, uMid * 0.015);

    float breath = sin(t * 1.1) * 0.012;

    // Back: loudness only, slow swell and drift.
    vec3 back = orb(p, centerBack,
        0.56 + breath + uVolume * 0.08 + uBass * 0.03, 0.050,
        0.030 + uVolume * 0.020, t * 0.18, 2.0,
        0.020, t * 0.13 + 0.8, 3.0);

    // Middle: bass sets the size, mids bend the contour, counter-drifts.
    vec3 mid = orb(p, centerMid,
        0.40 + uBass * 0.08 + uVolume * 0.03, 0.040,
        0.028 + uMid * 0.045, t * 0.42 + 0.5, 2.0,
        0.022 + uBass * 0.040, t * 0.51 - 0.3, 3.0);

    // Front: small and hot, snaps with loudness and jumps on onsets.
    vec3 front = orb(p, centerFront,
        0.19 + uMid * 0.04 + uVolume * 0.03 + uFlux * 0.04, 0.045,
        0.012 + uHigh * 0.020, t * 0.90, 4.0,
        0.010 + uMid * 0.015, t * 1.07 + 1.1, 2.0);

    // Palette is the visualisation gradient, not layout tokens.
    vec3 colBack = mix(vec3(0.16, 0.55, 0.92), vec3(0.02, 0.24, 0.58),
                       smoothstep(0.0, 1.0, clamp(back.z / back.y, 0.0, 1.0)));
    vec3 colMid = mix(vec3(0.55, 0.93, 1.0), vec3(0.14, 0.58, 0.94),
                      smoothstep(0.0, 1.0, clamp(mid.z / mid.y, 0.0, 1.0)));
    vec3 colFront = mix(vec3(1.0), vec3(0.45, 0.88, 1.0),
                        smoothstep(0.0, 1.0, clamp(front.z / front.y, 0.0, 1.0)));

    // Highs shimmer on the middle rim: the cheapest way to show consonants.
    colMid += vec3(0.40, 0.90, 1.0)
            * smoothstep(mid.y - 0.12, mid.y - 0.02, mid.z)
            * (0.15 + uHigh * 0.35);

    float aBack = back.x * 0.95;
    float aMid = mid.x * 0.88;
    float aFront = front.x;

    // Premultiplied stack, back to front. The slight translucency is what lets
    // the silhouette underneath read as a second object instead of a halo.
    vec3 color = colBack * aBack;
    float alpha = aBack;
    color = colMid * aMid + color * (1.0 - aMid);
    alpha = aMid + alpha * (1.0 - aMid);
    color = colFront * aFront + color * (1.0 - aFront);
    alpha = aFront + alpha * (1.0 - aFront);

    // Onset shockwave leaves the middle orb and expands while it fades.
    float ringRadius = 0.52 + (1.0 - uRing) * 0.30;
    float ring = (1.0 - smoothstep(0.0, 0.014, abs(length(p - centerMid) - ringRadius))) * uRing * uRing * 1.5;
    color += vec3(0.50, 0.90, 1.0) * ring;
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
