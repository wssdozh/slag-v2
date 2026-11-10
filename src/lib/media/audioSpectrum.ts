/**
 * Features for the liquid orb: band envelopes, loudness and an onset envelope,
 * all filtered in seconds rather than frames so a 144 Hz display does not
 * animate twice as fast as a 60 Hz one.
 *
 * Magnitudes are linear and then compressed with `log1p`, not mapped from a
 * decibel window: decibels flatten every recording into the same 1/f slope, and
 * the orb stops showing the difference between a whisper and a shout.
 *
 * Band edges are frequencies, not hardcoded bin indices: the analyser sees the
 * AudioContext rate, and a 64-point FFT used to turn "bass" into 0–2.25 kHz.
 */

export interface OrbFeatures {
  volume: number;
  bass: number;
  mid: number;
  high: number;
  /** Spectral flux: how much new energy appeared since the previous frame. */
  flux: number;
  /** Same onset, released slowly: drives the expanding shockwave ring. */
  ring: number;
}

export interface SpectrumReader {
  /** `dt` is seconds; `active=false` damps everything down to rest. */
  read(dt: number, active: boolean): OrbFeatures;
  reset(): void;
}

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

const ENVELOPE = {
  volume: { attack: 0.025, release: 0.3 },
  bass: { attack: 0.03, release: 0.28 },
  mid: { attack: 0.04, release: 0.22 },
  high: { attack: 0.015, release: 0.12 },
  flux: { attack: 0.008, release: 0.14 },
  ring: { attack: 0.008, release: 0.45 },
} as const;

/** First frame after a tab wakes up can carry a huge dt; never integrate it. */
const MAX_STEP_S = 0.1;

const ZERO: OrbFeatures = { volume: 0, bass: 0, mid: 0, high: 0, flux: 0, ring: 0 };

interface BinRange {
  start: number;
  end: number;
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
  const start = Math.max(0, Math.floor(lowHz / hzPerBin));
  const end = Math.min(analyser.frequencyBinCount, Math.ceil(highHz / hzPerBin));
  return { start, end };
}

function bandMagnitude(data: Float32Array, range: BinRange): number {
  if (range.end <= range.start) return 0;

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

export function createSpectrumReader(analyser: AnalyserNode): SpectrumReader {
  const frequencyData = new Float32Array(analyser.frequencyBinCount);
  const timeData = new Float32Array(analyser.fftSize);
  const magnitudes = new Float32Array(analyser.frequencyBinCount);
  const previous = new Float32Array(analyser.frequencyBinCount);
  const bassRange = binRange(analyser, BAND_HZ.bass[0], BAND_HZ.bass[1]);
  const midRange = binRange(analyser, BAND_HZ.mid[0], BAND_HZ.mid[1]);
  const highRange = binRange(analyser, BAND_HZ.high[0], BAND_HZ.high[1]);

  let hasPrevious = false;
  let current: OrbFeatures = { ...ZERO };

  return {
    reset() {
      current = { ...ZERO };
      previous.fill(0);
      hasPrevious = false;
    },
    read(dt, active) {
      const step = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), MAX_STEP_S) : 0;
      let volume = 0;
      let bass = 0;
      let mid = 0;
      let high = 0;
      let flux = 0;

      if (active) {
        analyser.getFloatFrequencyData(frequencyData);
        analyser.getFloatTimeDomainData(timeData);

        for (let i = 0; i < magnitudes.length; i++) {
          magnitudes[i] = 10 ** (frequencyData[i] / 20);
        }

        volume = compress(rms(timeData));
        bass = compress(bandMagnitude(magnitudes, bassRange));
        mid = compress(bandMagnitude(magnitudes, midRange));
        high = compress(bandMagnitude(magnitudes, highRange));

        if (hasPrevious) {
          let positive = 0;
          let total = 0;
          for (let i = 0; i < magnitudes.length; i++) {
            const delta = magnitudes[i] - previous[i];
            if (delta > 0) positive += delta;
            total += magnitudes[i];
          }
          flux = total > 1e-6 ? clamp01(positive / total) : 0;
        }

        previous.set(magnitudes);
        hasPrevious = true;

        // A silent tail still jitters by a few LSBs; that is not an onset.
        if (volume < FLUX_GATE) flux = 0;
      }

      current = {
        volume: damp(current.volume, volume, ENVELOPE.volume.attack, ENVELOPE.volume.release, step),
        bass: damp(current.bass, bass, ENVELOPE.bass.attack, ENVELOPE.bass.release, step),
        mid: damp(current.mid, mid, ENVELOPE.mid.attack, ENVELOPE.mid.release, step),
        high: damp(current.high, high, ENVELOPE.high.attack, ENVELOPE.high.release, step),
        flux: damp(current.flux, flux, ENVELOPE.flux.attack, ENVELOPE.flux.release, step),
        ring: damp(current.ring, flux, ENVELOPE.ring.attack, ENVELOPE.ring.release, step),
      };
      return current;
    },
  };
}
