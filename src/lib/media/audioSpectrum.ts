/**
 * Spectrum for the liquid orb: three bands plus loudness, all smoothed in
 * seconds rather than frames, so a 144 Hz display does not animate twice as
 * fast as a 60 Hz one.
 *
 * The band edges are frequencies, not hardcoded bin indices: the analyser sees
 * the AudioContext rate, and a 64-point FFT used to turn "bass" into 0–2.25 kHz
 * and "highs" into a band the voice never reaches.
 */

export interface OrbBands {
  volume: number;
  bass: number;
  mid: number;
  high: number;
}

export interface SpectrumReader {
  /** `dt` is seconds; `active=false` damps everything down to rest. */
  read(dt: number, active: boolean): OrbBands;
  reset(): void;
}

export const ORB_FFT_SIZE = 2048;

const BAND_HZ = {
  bass: [30, 250],
  mid: [250, 4_000],
  high: [4_000, 12_000],
} as const;

/** Voice notes sit around -26 dBFS RMS; this window leaves headroom for a shout. */
const FLOOR_DB = -60;
const CEIL_DB = -12;

const VOLUME_ATTACK_S = 0.03;
const VOLUME_RELEASE_S = 0.25;
const BAND_ATTACK_S = 0.045;
const BAND_RELEASE_S = 0.22;

/** First frame after a tab wakes up can carry a huge dt; never integrate it. */
const MAX_STEP_S = 0.1;

const ZERO: OrbBands = { volume: 0, bass: 0, mid: 0, high: 0 };

interface BinRange {
  start: number;
  end: number;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function toLevel(db: number): number {
  if (!Number.isFinite(db)) return 0;
  return clamp01((db - FLOOR_DB) / (CEIL_DB - FLOOR_DB));
}

function damp(current: number, target: number, tau: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-dt / tau));
}

function binRange(analyser: AnalyserNode, lowHz: number, highHz: number): BinRange {
  const hzPerBin = analyser.context.sampleRate / analyser.fftSize;
  const start = Math.max(0, Math.floor(lowHz / hzPerBin));
  const end = Math.min(analyser.frequencyBinCount, Math.ceil(highHz / hzPerBin));
  return { start, end };
}

function bandLevel(data: Float32Array, range: BinRange): number {
  const count = range.end - range.start;
  if (count <= 0) return 0;

  // Average power, not average decibels: dB is logarithmic and a plain mean
  // over it underweights whichever bins actually carry the energy.
  let power = 0;
  for (let i = range.start; i < range.end; i++) {
    power += 10 ** (data[i] / 10);
  }
  power /= count;
  return toLevel(10 * Math.log10(power + 1e-12));
}

function timeDomainLevel(data: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i] * data[i];
  }
  const rms = Math.sqrt(sum / data.length);
  return toLevel(20 * Math.log10(rms + 1e-9));
}

export function createSpectrumReader(analyser: AnalyserNode): SpectrumReader {
  const frequencyData = new Float32Array(analyser.frequencyBinCount);
  const timeData = new Float32Array(analyser.fftSize);
  const bassRange = binRange(analyser, BAND_HZ.bass[0], BAND_HZ.bass[1]);
  const midRange = binRange(analyser, BAND_HZ.mid[0], BAND_HZ.mid[1]);
  const highRange = binRange(analyser, BAND_HZ.high[0], BAND_HZ.high[1]);

  let current: OrbBands = { ...ZERO };

  return {
    reset() {
      current = { ...ZERO };
    },
    read(dt, active) {
      const step = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), MAX_STEP_S) : 0;
      let volume = 0;
      let bass = 0;
      let mid = 0;
      let high = 0;

      if (active) {
        analyser.getFloatFrequencyData(frequencyData);
        analyser.getFloatTimeDomainData(timeData);
        volume = timeDomainLevel(timeData);
        bass = bandLevel(frequencyData, bassRange);
        mid = bandLevel(frequencyData, midRange);
        high = bandLevel(frequencyData, highRange);
      }

      current = {
        volume: damp(current.volume, volume, volume > current.volume ? VOLUME_ATTACK_S : VOLUME_RELEASE_S, step),
        bass: damp(current.bass, bass, bass > current.bass ? BAND_ATTACK_S : BAND_RELEASE_S, step),
        mid: damp(current.mid, mid, mid > current.mid ? BAND_ATTACK_S : BAND_RELEASE_S, step),
        high: damp(current.high, high, high > current.high ? BAND_ATTACK_S : BAND_RELEASE_S, step),
      };
      return current;
    },
  };
}
