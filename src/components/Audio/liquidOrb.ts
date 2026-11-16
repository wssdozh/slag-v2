// The canvas orb that breathes with the audio: blobs driven by spectrum features, no libraries.
import { logger } from '../../lib/logger/logger';
import type { OrbFeatures } from '../../lib/media/audioSpectrum';

/**
 * Liquid orb shader and its WebGL plumbing.
 *
 * Variant "pulse": three offset fields merged with a smooth max, so the outline
 * is a single surface instead of stacked discs, and the fill is one hue and its
 * tones instead of three hand-picked gradients.
 *
 * Parameters are derived from the features per frame, not set by hand: `shape`
 * (punch + energy) drives the deformation, `light` (brightness + punch) the
 * ridge and the seams, `pace` the speed. Everything then goes through a
 * deadband and a speed limit, otherwise a single stressed syllable throws the
 * geometry across half the range and it never looks like liquid.
 *
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

uniform float uTime, uVolume, uBass, uMid, uHigh, uFlux;
uniform float uRadiusBack, uRadiusMid, uRadiusFront;
uniform float uDeform, uSpeed, uLobes, uBreath, uEdge, uBlend, uMerge, uCrest, uNoise, uAudioMix;
uniform float uIdle, uIntensity, uWobble, uWarp;
uniform float uHue, uSat, uVal;
varying vec2 vUv;

float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
    return valueNoise(p) * 0.6 + valueNoise(p * 2.13 + 17.0) * 0.3 + valueNoise(p * 4.37 + 41.0) * 0.1;
}

// push skews the lobes themselves: the bass shifts their phase unevenly around
// the circle, so the shape depends on the sound and not only on its size.
float waveShape(float ang, float lobes, float phase, float speed, float lag, float push) {
    float a = cos(ang * lobes + phase + push) * sin(uWobble * speed + lag);
    float b = sin(ang * (lobes + 1.0) + phase * 1.7 + push) * sin(uWobble * speed * 1.7 + lag + 1.3);
    return a + 0.55 * b;
}

vec3 fieldLayer(vec2 p, vec2 center, float base, float lobes, float phase, float speed, float lag,
                float noiseSeed, float audioRadius, float audioDeform) {
    vec2 d = p - center;
    float r = length(d);
    float ang = atan(d.y, d.x);
    float amp = uIdle + uDeform * audioDeform * uIntensity * uAudioMix;
    float push = uWarp * uIntensity * audioDeform * sin(ang * 2.0 + uWobble * 0.4 + noiseSeed);
    float n = fbm(p * 2.6 + vec2(noiseSeed, noiseSeed * 1.7) + vec2(0.0, uTime * 0.18)) - 0.5;
    float radius = base * (1.0 + amp * waveShape(ang, lobes, phase, speed, lag, push)
                               + uBreath * sin(uTime * 0.9 + lag))
                 + n * uNoise * 2.0
                 + audioRadius * uIntensity * uAudioMix;
    float nd = clamp(r / max(radius, 1e-3), 0.0, 1.4);
    return vec3(radius - r, nd, smoothstep(0.60, 1.0, nd));
}

// One hue and its tones: the hue is fixed, only saturation and value move, so
// the shimmer stays monochrome.
vec3 hsv2rgb(float h, float s, float v) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(vec3(h / 360.0) + K.xyz) * 6.0 - K.www);
    return v * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), s);
}

vec3 tint(float sat, float val) {
    return hsv2rgb(uHue, clamp(sat, 0.0, 0.95), clamp(val, 0.0, 1.0));
}

float smoothMax3(float a, float b, float c, float k) {
    float ka = clamp(k * a, -30.0, 30.0);
    float kb = clamp(k * b, -30.0, 30.0);
    float kc = clamp(k * c, -30.0, 30.0);
    return log(exp(ka) + exp(kb) + exp(kc)) / k;
}

void main() {
    vec2 p = vUv;
    float t = uTime;

    vec2 centerBack = vec2(0.010 * sin(t * 0.17), 0.008 * cos(t * 0.13))
                    + vec2(uVolume * 0.006 * uAudioMix, 0.0);
    vec2 centerMid = vec2(-0.008 * sin(t * 0.23 + 1.3), 0.010 * cos(t * 0.19 + 0.7));
    vec2 centerFront = vec2(0.006 * sin(t * 0.31 + 2.7) + uFlux * 0.020 * uAudioMix,
                            0.006 * cos(t * 0.27 + 1.9));

    vec3 fb = fieldLayer(p, centerBack, uRadiusBack, uLobes, 0.0, 1.0, 0.0,
                         0.0, uVolume * 0.07, uVolume);
    vec3 fm = fieldLayer(p, centerMid, uRadiusMid, uLobes + 1.0, 0.55, 0.82, -1.1,
                         13.7, uBass * 0.06 + uVolume * 0.02, uBass);
    vec3 ff = fieldLayer(p, centerFront, uRadiusFront, uLobes, 1.10, 1.16, -2.2,
                         31.3, uMid * 0.04 + uVolume * 0.02 + uFlux * 0.03, uHigh * 0.7 + uMid * 0.3);

    float outer = smoothMax3(fb.x, fm.x, ff.x, uMerge);
    float alpha = smoothstep(-uEdge, uEdge, outer);

    // The zones do not average (in the middle all three fields are positive and
    // the mean would be grey mud): the upper layer simply covers the lower one,
    // but with a soft frame uBlend wide, so the border is a bleed, not a line.
    float aMid = smoothstep(-uBlend, uBlend, fm.x);
    float aFront = smoothstep(-uBlend, uBlend, ff.x);

    // Tones of one hue: back is dark and saturated, front almost white.
    vec3 colBack = tint(uSat, uVal * (0.50 - 0.10 * smoothstep(0.0, 1.0, fb.y)));
    vec3 colMid = tint(uSat * 0.82, uVal * (0.95 - 0.15 * smoothstep(0.0, 1.0, fm.y)));
    vec3 colFront = tint(uSat * 0.34, uVal * (1.0 - 0.05 * smoothstep(0.0, 1.0, ff.y)));

    colMid += tint(uSat * 0.6, uVal) * fm.z * (0.05 + uHigh * 0.25 * uAudioMix);

    // The ridge only sits on the inner seams: the outer rim is already one
    // shared surface and has no "edge of the layer above".
    colMid += tint(uSat * 0.55, uVal) * pow(fm.z, 1.3) * uCrest * 0.75;
    colFront += tint(uSat * 0.25, uVal) * pow(ff.z, 1.3) * uCrest * 0.9;

    vec3 color = mix(colBack, colMid, aMid);
    color = mix(color, colFront, aFront);

    if (alpha <= 0.004) {
        discard;
    }

    gl_FragColor = vec4(color * alpha, alpha);
}
`;

/** Base shape: the defaults the lab settled on. */
const BASE = {
  radiusBack: 0.62,
  radiusMid: 0.46,
  radiusFront: 0.3,
  deform: 0.3,
  speed: 0.65,
  lobes: 3,
  breath: 0.02,
  edge: 0.055,
  crest: 0.15,
  blend: 0.2,
  merge: 24,
  noise: 0.04,
  idle: 0.02,
  intensity: 1,
  warp: 0.9,
  audioMix: 1,
  sat: 0.78,
  val: 0.92,
} as const;

/** How much of the derived target wins over the base. */
const DEPTH = 0.85;

/** Character of the track (0..1) -> hue: calm mixes in blue, dense ones in red. */
const HUE_CALM = 205;
const HUE_DENSE = 10;
const HUE_FLOOR = 0.65;
const HUE_CEILING = 0.83;
/** A section nudges the hue this much either way; it never tours the wheel. */
const SECTION_SWING = 36;
/** The hue catches up in about a second: a change should read as a change. */
const HUE_TAU_S = 1;

const LIMITS = {
  deform: { deadband: 0.01, maxDelta: 0.6, min: 0, max: 1.2 },
  crest: { deadband: 0.01, maxDelta: 0.5, min: 0, max: 1 },
  blend: { deadband: 0.01, maxDelta: 0.5, min: 0.02, max: 0.4 },
  edge: { deadband: 0.002, maxDelta: 0.1, min: 0.02, max: 0.16 },
  merge: { deadband: 0.3, maxDelta: 6, min: 4, max: 40 },
  noise: { deadband: 0.005, maxDelta: 0.6, min: 0, max: 0.2 },
  warp: { deadband: 0.02, maxDelta: 0.8, min: 0, max: 2.5 },
  sat: { deadband: 0.005, maxDelta: 0.04, min: 0.3, max: 0.9 },
  val: { deadband: 0.005, maxDelta: 0.05, min: 0.5, max: 1 },
} as const;

type LimitedKey = keyof typeof LIMITS;

const UNIFORM_NAMES = [
  'uTime',
  'uVolume',
  'uBass',
  'uMid',
  'uHigh',
  'uFlux',
  'uRadiusBack',
  'uRadiusMid',
  'uRadiusFront',
  'uDeform',
  'uSpeed',
  'uLobes',
  'uBreath',
  'uEdge',
  'uBlend',
  'uMerge',
  'uCrest',
  'uNoise',
  'uAudioMix',
  'uIdle',
  'uIntensity',
  'uWobble',
  'uWarp',
  'uHue',
  'uSat',
  'uVal',
] as const;

type UniformName = (typeof UNIFORM_NAMES)[number];

export interface OrbFrame {
  timeSeconds: number;
  dt: number;
  features: OrbFeatures;
}

export function createOrbRenderer(canvas: HTMLCanvasElement) {
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

  const locations = new Map<UniformName, WebGLUniformLocation | null>(
    UNIFORM_NAMES.map((name) => [name, gl.getUniformLocation(program, name)]),
  );

  const limited: Partial<Record<LimitedKey, number>> = {};
  let hue: number | null = null;
  let wobble = 0;

  /** Deadband, speed limit and a hard range: a parameter must not jump. */
  const limit = (key: LimitedKey, target: number, dt: number): number => {
    const { deadband, maxDelta, min, max } = LIMITS[key];
    const clamped = Math.min(max, Math.max(min, target));
    const previous = limited[key] ?? clamped;
    const delta = clamped - previous;
    const next =
      Math.abs(delta) < deadband
        ? previous
        : previous + Math.sign(delta) * Math.min(maxDelta * dt, Math.abs(delta));
    limited[key] = next;
    return next;
  };

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.floor(canvas.clientWidth * dpr);
    const height = Math.floor(canvas.clientHeight * dpr);
    // An inactive dockview tab detaches the panel: it reports 0x0 for a while.
    // Keep the last good backing store instead of shrinking the orb to 1x1.
    if (width < 1 || height < 1) return;
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
  };

  return {
    draw({ timeSeconds, dt, features }: OrbFrame) {
      resize();

      const shape = 0.55 * features.punch + 0.45 * features.energy;
      const light = 0.5 * features.brightness + 0.5 * features.punch;
      const lift = 0.6 * features.brightness + 0.4 * features.rolloff;

      const target: Record<LimitedKey, number> = {
        deform: BASE.deform * (0.45 + 1.5 * shape) * (1 + 0.35 * features.accent * features.onset),
        warp: BASE.warp * (0.4 + 1.4 * shape),
        crest: BASE.crest * (0.3 + 2.4 * light) * (1 + 0.55 * features.accent * features.punch),
        blend: BASE.blend * (1.7 - light),
        edge: BASE.edge * (1.25 - 0.55 * light),
        noise: BASE.noise * (0.4 + 1.6 * features.flatness),
        merge: BASE.merge * (1.3 - 0.6 * shape),
        sat: 0.72 + 0.24 * features.energy,
        val: 0.68 + 0.3 * lift,
      };
      for (const key of Object.keys(target) as LimitedKey[]) {
        limited[key] = limit(key, BASE[key] + (target[key] - BASE[key]) * DEPTH, dt);
      }

      const speed = BASE.speed * (0.55 + 1.35 * features.pace);
      const character = Math.min(
        1,
        Math.max(0, (features.identity - HUE_FLOOR) / (HUE_CEILING - HUE_FLOOR)),
      );
      const hueTarget =
        HUE_CALM + (HUE_DENSE - HUE_CALM) * character + SECTION_SWING * (features.section - 0.5);
      if (hue === null) {
        hue = hueTarget;
      } else {
        const delta = ((((hueTarget - hue) % 360) + 540) % 360) - 180;
        hue = (((hue + delta * (1 - Math.exp(-dt / HUE_TAU_S))) % 360) + 360) % 360;
      }

      wobble += dt * speed * (0.5 + 1.5 * features.volume * BASE.audioMix);
      const hueValue = hue ?? HUE_CALM;

      const uniforms: Record<UniformName, number> = {
        uTime: timeSeconds,
        uVolume: features.volume,
        uBass: features.bass,
        uMid: features.mid,
        uHigh: features.high,
        uFlux: features.flux,
        uRadiusBack: BASE.radiusBack,
        uRadiusMid: BASE.radiusMid,
        uRadiusFront: BASE.radiusFront,
        uDeform: limited.deform ?? BASE.deform,
        uSpeed: speed,
        uLobes: BASE.lobes,
        uBreath: BASE.breath,
        uEdge: limited.edge ?? BASE.edge,
        uBlend: limited.blend ?? BASE.blend,
        uMerge: limited.merge ?? BASE.merge,
        uCrest: limited.crest ?? BASE.crest,
        uNoise: limited.noise ?? BASE.noise,
        uAudioMix: BASE.audioMix,
        uIdle: BASE.idle,
        uIntensity: BASE.intensity,
        uWobble: wobble,
        uWarp: limited.warp ?? BASE.warp,
        uHue: hueValue,
        uSat: limited.sat ?? BASE.sat,
        uVal: limited.val ?? BASE.val,
      };

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      for (const name of UNIFORM_NAMES) {
        const location = locations.get(name);
        if (location) gl.uniform1f(location, uniforms[name]);
      }
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
