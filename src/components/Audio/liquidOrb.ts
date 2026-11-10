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

    // Stacked on top of each other: the centers stay almost coincident, the
    // radii step down 0.62 -> 0.46 -> 0.30, so every layer leaves a ring of the
    // one below it. A dark groove at each boundary makes it read as separate
    // discs instead of a bullseye.
    vec2 centerBack = vec2(0.010 * sin(t * 0.17), 0.008 * cos(t * 0.13))
                    + vec2(uVolume * 0.006, 0.0);
    vec2 centerMid = vec2(-0.008 * sin(t * 0.23 + 1.3), 0.010 * cos(t * 0.19 + 0.7));
    vec2 centerFront = vec2(0.006 * sin(t * 0.31 + 2.7) + uFlux * 0.020,
                            0.006 * cos(t * 0.27 + 1.9));

    float breath = sin(t * 1.1) * 0.012;

    vec3 back = orb(p, centerBack,
        0.62 + breath + uVolume * 0.07, 0.055,
        0.060 + uVolume * 0.045, t * 0.23, 2.0,
        0.045 + uBass * 0.035, t * 0.17 + 0.8, 3.0);

    vec3 mid = orb(p, centerMid,
        0.46 + uBass * 0.06 + uVolume * 0.02, 0.045,
        0.055 + uMid * 0.070, t * 0.47 + 0.5, 2.0,
        0.050 + uBass * 0.070, t * 0.53 - 0.3, 3.0);

    vec3 front = orb(p, centerFront,
        0.30 + uMid * 0.04 + uVolume * 0.02 + uFlux * 0.03, 0.040,
        0.035 + uHigh * 0.030, t * 0.90, 4.0,
        0.030 + uMid * 0.035, t * 1.07 + 1.1, 3.0);

    // Same silhouettes, inflated, used only to darken the seam under the layer
    // that sits above.
    vec3 seamMid = orb(p, centerMid,
        0.46 + uBass * 0.06 + uVolume * 0.02 + 0.020, 0.024,
        0.055 + uMid * 0.070, t * 0.47 + 0.5, 2.0,
        0.050 + uBass * 0.070, t * 0.53 - 0.3, 3.0);

    vec3 seamFront = orb(p, centerFront,
        0.30 + uMid * 0.04 + uVolume * 0.02 + uFlux * 0.03 + 0.018, 0.022,
        0.035 + uHigh * 0.030, t * 0.90, 4.0,
        0.030 + uMid * 0.035, t * 1.07 + 1.1, 3.0);

    // Palette is the visualisation gradient, not layout tokens. Every disc runs
    // bright in the middle to dark at its rim, which is what gives the stack
    // depth without any lighting.
    float backNd = clamp(back.z / back.y, 0.0, 1.0);
    vec3 colBack = mix(vec3(0.20, 0.58, 0.98), vec3(0.03, 0.20, 0.55), smoothstep(0.0, 1.0, backNd));

    float midNd = clamp(mid.z / mid.y, 0.0, 1.0);
    vec3 colMid = mix(vec3(0.75, 0.98, 1.0), vec3(0.08, 0.50, 0.92), smoothstep(0.0, 1.0, midNd));

    float frontNd = clamp(front.z / front.y, 0.0, 1.0);
    vec3 colFront = mix(vec3(1.0), vec3(0.45, 0.88, 1.0), smoothstep(0.0, 1.0, frontNd));

    // Highs shimmer on the middle rim: the cheapest way to show consonants.
    colMid += vec3(0.40, 0.90, 1.0)
            * smoothstep(mid.y - 0.10, mid.y - 0.01, mid.z)
            * (0.06 + uHigh * 0.20);

    float aBack = back.x;
    float aMid = mid.x;
    float aFront = front.x;

    // Premultiplied stack, bottom to top, with a dark seam where the next disc
    // lands on the previous one.
    vec3 color = colBack * aBack;
    float alpha = aBack;
    color *= 1.0 - seamMid.x * 0.30;

    color = colMid * aMid + color * (1.0 - aMid);
    alpha = aMid + alpha * (1.0 - aMid);
    color *= 1.0 - seamFront.x * 0.30;

    color = colFront * aFront + color * (1.0 - aFront);
    alpha = aFront + alpha * (1.0 - aFront);

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
