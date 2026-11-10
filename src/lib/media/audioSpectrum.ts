/**
 * Features for the liquid orb.
 *
 * Magnitudes are linear and then compressed with `log1p`, not mapped from a
 * decibel window: decibels flatten every recording into the same 1/f slope, and
 * the orb stops showing the difference between a whisper and a shout.
 *
 * The slow axes are normalised against a rolling 30 s percentile window.
 * Without it a brickwalled master sits pinned at the top and the orb stops
 * reacting at all, while a quiet recording never lifts off the floor.
 *
 * `identity` is a cumulative median of the absolute axes: the character of the
 * track so far. A rolling window re-centres every 30 s and drags the hue around
 * the wheel, which reads as a carousel instead of as the song's mood.
 *
 * Band edges are frequencies, not bin indices: the analyser sees the
 * AudioContext rate, and a 64-point FFT used to turn "bass" into 0–2.25 kHz.
 */

export interface OrbFeatures {
  /** Raw band envelopes, 0..1, fed to the shader as is. */
  volume: number;
  bass: number;
  mid: number;
  high: number;
  flux: number;
  /** Transient accent that decays over ~0.2 s after an onset. */
  accent: number;
  /** Slow axes, normalised against the track so far. */
  energy: number;
  brightness: number;
  pace: number;
  punch: number;
  onset: number;
  flatness: number;
  rolloff: number;
  /** Character of the track (0..1) and of the current section (0..1). */
  identity: number;
  section: number;
}

export const ORB_SILENCE: OrbFeatures = {
  volume: 0,
  bass: 0,
  mid: 0,
  high: 0,
  flux: 0,
  accent: 0,
  energy: 0,
  brightness: 0,
  pace: 0,
  punch: 0,
  onset: 0,
  flatness: 0,
  rolloff: 0,
  identity: 0.5,
  section: 0.5,
};

export const ORB_FFT_SIZE = 2048;

const BAND_HZ = {
  bass: [30, 250],
  mid: [250, 4_000],
  high: [4_000, 12_000],
} as const;

/** Smaller c keeps more of the quiet end; 0.01 is the sweet spot for voice. */
const COMPRESSION = 0.01;
const LOG_CEIL = Math.log1p(1 / COMPRESSION);

/** Below this loudness the spectrum is noise, not an onset. */
const FLUX_GATE = 0.06;

const CENTROID_HZ = [120, 6_000] as const;
const ROLLOFF_HZ = [500, 12_000] as const;
const FLATNESS_HZ = [250, 8_000] as const;

const PACE_WINDOW_S = 3;
const PACE_FULL = 8;
const ACCENT_DECAY_S = 0.18;

const ENVELOPE = {
  volume: { attack: 0.025, release: 0.3 },
  bass: { attack: 0.03, release: 0.28 },
  mid: { attack: 0.04, release: 0.22 },
  high: { attack: 0.015, release: 0.12 },
  flux: { attack: 0.008, release: 0.14 },
  energy: { attack: 0.6, release: 2.5 },
  brightness: { attack: 0.2, release: 0.9 },
  pace: { attack: 0.4, release: 1.5 },
  punch: { attack: 0.05, release: 0.45 },
  flatness: { attack: 0.25, release: 0.8 },
  rolloff: { attack: 0.2, release: 0.8 },
  onset: { attack: 0.02, release: 0.2 },
} as const;

/** Slow axes that get normalised; the raw bands above never do. */
const SLOW_KEYS = ['energy', 'brightness', 'pace', 'punch', 'flatness', 'rolloff'] as const;
const NORMALISE_KEYS = [...SLOW_KEYS, 'onset'] as const;
type SlowKey = (typeof SLOW_KEYS)[number];
type NormaliseKey = (typeof NORMALISE_KEYS)[number];

/** Transients keep plain min-max: it is normal for them to sit low and spike. */
const TRANSIENT_KEYS: ReadonlySet<NormaliseKey> = new Set(['punch', 'onset']);

const NORMALISE_WINDOW_S = 30;
const NORMALISE_RATE = 20;
const NORMALISE_SAMPLES = NORMALISE_WINDOW_S * NORMALISE_RATE;
const IDENTITY_BINS = 256;

/** First frame after a tab wakes up can carry a huge dt; never integrate it. */
const MAX_STEP_S = 0.1;

interface BinRange {
  start: number;
  end: number;
}

interface Bounds {
  low: number;
  mid: number;
  high: number;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function compress(magnitude: number): number {
  if (!(magnitude > 0)) return 0;
  return clamp01(Math.log1p(magnitude / COMPRESSION) / LOG_CEIL);
}

function damp(current: number, target: number, attack: number, release: number, dt: number): number {
  const tau = target > current ? attack : release;
  return current + (target - current) * (1 - Math.exp(-dt / tau));
}

function binRange(analyser: AnalyserNode, lowHz: number, highHz: number): BinRange {
  const hzPerBin = analyser.context.sampleRate / analyser.fftSize;
  return {
    start: Math.max(0, Math.floor(lowHz / hzPerBin)),
    end: Math.min(analyser.frequencyBinCount, Math.ceil(highHz / hzPerBin)),
  };
}

function bandMagnitude(data: Float32Array, range: BinRange): number {
  // Sum of squares, not the mean: a tone lives in one bin of a ten-bin bass
  // band, and averaging would report a tenth of its real amplitude.
  let power = 0;
  for (let i = range.start; i < range.end; i++) power += data[i] * data[i];
  return Math.sqrt(power);
}

function rms(data: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / data.length);
}

/** Piecewise map through p5/p50/p95: 0 at the low end, 1 at the high one. */
function normalise(value: number, bounds: Bounds, transient: boolean): number {
  if (transient) return clamp01((value - bounds.low) / Math.max(bounds.high - bounds.low, 1e-3));
  const { low, mid, high } = bounds;
  if (value <= mid) return clamp01((0.5 * (value - low)) / Math.max(mid - low, 1e-3));
  return clamp01(0.5 + (0.5 * (value - mid)) / Math.max(high - mid, 1e-3));
}

function percentile(sorted: number[], ratio: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.round(ratio * (sorted.length - 1)))];
}

export function createSpectrumReader(analyser: AnalyserNode) {
  const bins = analyser.frequencyBinCount;
  const frequencyData = new Float32Array(bins);
  const timeData = new Float32Array(analyser.fftSize);
  const magnitudes = new Float32Array(bins);
  const previous = new Float32Array(bins);
  const bassRange = binRange(analyser, BAND_HZ.bass[0], BAND_HZ.bass[1]);
  const midRange = binRange(analyser, BAND_HZ.mid[0], BAND_HZ.mid[1]);
  const highRange = binRange(analyser, BAND_HZ.high[0], BAND_HZ.high[1]);
  const flatRange = binRange(analyser, FLATNESS_HZ[0], FLATNESS_HZ[1]);
  const hzPerBin = analyser.context.sampleRate / analyser.fftSize;
  const centroidLog = Math.log(CENTROID_HZ[1] / CENTROID_HZ[0]);
  const rolloffLog = Math.log(ROLLOFF_HZ[1] / ROLLOFF_HZ[0]);

  const history = new Map<NormaliseKey, number[]>(NORMALISE_KEYS.map((key) => [key, []]));
  const bounds = new Map<NormaliseKey, Bounds>(
    NORMALISE_KEYS.map((key) => [key, { low: 0, mid: 0.5, high: 1 }]),
  );
  const buckets = new Float64Array(IDENTITY_BINS);
  const slow = {} as Record<SlowKey, number>;
  const smooth = { volume: 0, bass: 0, mid: 0, high: 0, flux: 0 };
  const onsets: number[] = [];

  let hasPrevious = false;
  let time = 0;
  let lastOnset = -1;
  let slowFlux = 0;
  let accent = 0;
  let onsetLevel = 0;
  let identityCount = 0;
  let sampleTimer = 0;
  let recalcTimer = 0;
  let identity = ORB_SILENCE.identity;

  const clearSlow = () => {
    for (const key of SLOW_KEYS) slow[key] = 0;
    for (const key of Object.keys(smooth) as (keyof typeof smooth)[]) smooth[key] = 0;
  };
  clearSlow();

  /** Cumulative median via a histogram: converges and then stays put. */
  const trackIdentity = (value: number): number => {
    const bin = Math.min(IDENTITY_BINS - 1, Math.max(0, Math.floor(value * IDENTITY_BINS)));
    buckets[bin] += 1;
    identityCount += 1;
    const half = identityCount / 2;
    let seen = 0;
    for (let i = 0; i < IDENTITY_BINS; i++) {
      if (buckets[i] === 0) continue;
      if (seen + buckets[i] >= half) return (i + (half - seen) / buckets[i]) / IDENTITY_BINS;
      seen += buckets[i];
    }
    return value;
  };

  const recollect = () => {
    for (const key of NORMALISE_KEYS) {
      const sorted = [...history.get(key)!].sort((a, b) => a - b);
      bounds.set(key, {
        low: percentile(sorted, 0.05),
        mid: percentile(sorted, 0.5),
        high: percentile(sorted, 0.95),
      });
    }
  };

  return {
    reset() {
      previous.fill(0);
      buckets.fill(0);
      history.forEach((list) => (list.length = 0));
      clearSlow();
      onsets.length = 0;
      hasPrevious = false;
      time = 0;
      lastOnset = -1;
      slowFlux = 0;
      accent = 0;
      onsetLevel = 0;
      identityCount = 0;
      sampleTimer = 0;
      recalcTimer = 0;
      identity = ORB_SILENCE.identity;
    },

    read(dt: number, active: boolean): OrbFeatures {
      const step = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), MAX_STEP_S) : 0;
      time += step;

      let volume = 0;
      let bass = 0;
      let mid = 0;
      let high = 0;
      let flux = 0;

      if (active) {
        analyser.getFloatFrequencyData(frequencyData);
        analyser.getFloatTimeDomainData(timeData);

        let weighted = 0;
        let total = 0;
        let flatLog = 0;
        let flatSum = 0;
        for (let i = 0; i < bins; i++) {
          const magnitude = 10 ** (frequencyData[i] / 20);
          magnitudes[i] = magnitude;
          weighted += magnitude * i;
          total += magnitude;
          if (i >= flatRange.start && i < flatRange.end) {
            flatLog += Math.log(magnitude + 1e-9);
            flatSum += magnitude;
          }
        }

        volume = compress(rms(timeData));
        bass = compress(bandMagnitude(magnitudes, bassRange));
        mid = compress(bandMagnitude(magnitudes, midRange));
        high = compress(bandMagnitude(magnitudes, highRange));

        if (hasPrevious) {
          let positive = 0;
          for (let i = 0; i < bins; i++) {
            const delta = magnitudes[i] - previous[i];
            if (delta > 0) positive += delta;
          }
          flux = total > 1e-6 ? clamp01(positive / total) : 0;
        }
        previous.set(magnitudes);
        hasPrevious = true;

        // A silent tail still jitters by a few LSBs; that is not an onset.
        if (volume < FLUX_GATE) flux = 0;

        const centroidHz = total > 1e-9 ? (weighted / total) * hzPerBin : 0;
        const brightness = centroidHz > 1 ? Math.log(centroidHz / CENTROID_HZ[0]) / centroidLog : 0;

        let cumulative = 0;
        let rolloffBin = bins - 1;
        for (let i = 0; i < bins; i++) {
          cumulative += magnitudes[i];
          if (cumulative >= total * 0.85) {
            rolloffBin = i;
            break;
          }
        }
        const rolloffHz = Math.max(1, rolloffBin * hzPerBin);
        const flatCount = flatRange.end - flatRange.start;

        slow.energy = damp(slow.energy, volume, ENVELOPE.energy.attack, ENVELOPE.energy.release, step);
        slow.brightness = damp(
          slow.brightness,
          clamp01(brightness),
          ENVELOPE.brightness.attack,
          ENVELOPE.brightness.release,
          step,
        );
        slow.flatness = damp(
          slow.flatness,
          flatCount > 0 && flatSum > 1e-9 ? clamp01(Math.exp(flatLog / flatCount) / (flatSum / flatCount)) : 0,
          ENVELOPE.flatness.attack,
          ENVELOPE.flatness.release,
          step,
        );
        slow.rolloff = damp(
          slow.rolloff,
          clamp01(Math.log(rolloffHz / ROLLOFF_HZ[0]) / rolloffLog),
          ENVELOPE.rolloff.attack,
          ENVELOPE.rolloff.release,
          step,
        );

        // Onsets: a positive spectral jump above the gate, at most ~8 per second.
        slowFlux = damp(slowFlux, flux, 0.5, 1, step);
        const isOnset = flux > 0.22 && volume > 0.05 && time - lastOnset > 0.12;
        if (isOnset) {
          lastOnset = time;
          onsets.push(time);
          accent = 1;
        }
        onsetLevel = damp(
          onsetLevel,
          clamp01(flux / (slowFlux + 0.15)),
          ENVELOPE.onset.attack,
          ENVELOPE.onset.release,
          step,
        );

        while (onsets.length > 0 && time - onsets[0] > PACE_WINDOW_S) onsets.shift();
        slow.pace = damp(
          slow.pace,
          clamp01(onsets.length / PACE_WINDOW_S / PACE_FULL),
          ENVELOPE.pace.attack,
          ENVELOPE.pace.release,
          step,
        );

        const crest = volume / (slow.energy + 0.02);
        slow.punch = damp(
          slow.punch,
          clamp01((crest - 0.85) / 1.2),
          ENVELOPE.punch.attack,
          ENVELOPE.punch.release,
          step,
        );

        identity = trackIdentity(clamp01(0.5 * slow.energy + 0.3 * slow.brightness + 0.2 * slow.pace));

        sampleTimer += step;
        if (sampleTimer >= 1 / NORMALISE_RATE) {
          sampleTimer = 0;
          for (const key of NORMALISE_KEYS) {
            const list = history.get(key)!;
            list.push(key === 'onset' ? onsetLevel : slow[key as SlowKey]);
            if (list.length > NORMALISE_SAMPLES) list.shift();
          }
        }
        recalcTimer += step;
        if (recalcTimer >= 1) {
          recalcTimer = 0;
          recollect();
        }
      } else {
        for (const key of SLOW_KEYS) slow[key] = damp(slow[key], 0, 0.2, 0.6, step);
        onsetLevel = damp(onsetLevel, 0, 0.05, 0.2, step);
        onsets.length = 0;
        slowFlux = 0;
      }

      accent *= Math.exp(-step / ACCENT_DECAY_S);

      // Bands are damped here, not in the shader: the analyser updates at the
      // display rate, and an undamped band flickers frame to frame.
      smooth.volume = damp(smooth.volume, volume, ENVELOPE.volume.attack, ENVELOPE.volume.release, step);
      smooth.bass = damp(smooth.bass, bass, ENVELOPE.bass.attack, ENVELOPE.bass.release, step);
      smooth.mid = damp(smooth.mid, mid, ENVELOPE.mid.attack, ENVELOPE.mid.release, step);
      smooth.high = damp(smooth.high, high, ENVELOPE.high.attack, ENVELOPE.high.release, step);
      smooth.flux = damp(smooth.flux, flux, ENVELOPE.flux.attack, ENVELOPE.flux.release, step);

      const level = {} as Record<NormaliseKey, number>;
      for (const key of NORMALISE_KEYS) {
        const value = key === 'onset' ? onsetLevel : slow[key as SlowKey];
        level[key] = normalise(value, bounds.get(key)!, TRANSIENT_KEYS.has(key));
      }

      return {
        volume: smooth.volume,
        bass: smooth.bass,
        mid: smooth.mid,
        high: smooth.high,
        flux: smooth.flux,
        accent,
        energy: level.energy,
        brightness: level.brightness,
        pace: level.pace,
        punch: level.punch,
        onset: level.onset,
        flatness: level.flatness,
        rolloff: level.rolloff,
        identity,
        section: clamp01((0.5 * level.energy + 0.3 * level.brightness + 0.2 * level.pace - 0.35) / 0.6),
      };
    },
  };
}
